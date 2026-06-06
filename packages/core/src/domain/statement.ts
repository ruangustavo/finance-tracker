import { format, parse as parseDate, subMonths } from "date-fns";
import type { DB } from "../db/schema.ts";
import { IsoDate } from "../values/iso-date.ts";
import type { CreditCard as CreditCardT } from "./credit-card.ts";
import { CreditCard } from "./credit-card.ts";
import { InstallmentPurchase } from "./installment-purchase.ts";
import type { Period } from "./spending.ts";

const FORMAT = "yyyy-MM-dd";
const REFERENCE = new Date(0);

export type StatementPurchase = Readonly<{
  source: "entry" | "installment";
  occurredOn: IsoDate;
  categoryId: string;
  amountCents: number;
  description: string | null;
}>;

export type Statement = Readonly<{
  cardId: string;
  cardName: string;
  closeOn: IsoDate;
  dueOn: IsoDate;
  amountCents: number;
  purchases: readonly StatementPurchase[];
}>;

type CardPurchase = Readonly<{ cardId: string; purchase: StatementPurchase }>;

function bySortKey(a: StatementPurchase, b: StatementPurchase): number {
  return a.occurredOn.localeCompare(b.occurredOn);
}

// All credit-card purchases (ad-hoc entries + card installment occurrences) within a window.
async function cardPurchasesWithin(db: DB, period: Period): Promise<readonly CardPurchase[]> {
  const purchases: CardPurchase[] = [];

  const entryRows = await db
    .selectFrom("entries")
    .select(["card_id", "category_id", "amount_cents", "occurred_on", "description"])
    .where("payment_method", "=", "creditCard")
    .where("occurred_on", ">=", period.from)
    .where("occurred_on", "<=", period.to)
    .execute();
  for (const row of entryRows) {
    if (row.card_id === null || row.category_id === null) {
      continue;
    }
    purchases.push({
      cardId: row.card_id,
      purchase: {
        source: "entry",
        occurredOn: row.occurred_on as IsoDate,
        categoryId: row.category_id,
        amountCents: row.amount_cents,
        description: row.description,
      },
    });
  }

  const installments = await InstallmentPurchase.installments(db, period);
  for (const installment of installments) {
    if (installment.paymentMethod !== "creditCard" || installment.cardId === null) {
      continue;
    }
    purchases.push({
      cardId: installment.cardId,
      purchase: {
        source: "installment",
        occurredOn: installment.occurredOn as IsoDate,
        categoryId: installment.categoryId,
        amountCents: installment.amountCents,
        description: installment.description,
      },
    });
  }

  return purchases;
}

function buildStatement(
  card: CreditCardT,
  closeOn: IsoDate,
  purchases: StatementPurchase[],
): Statement {
  return {
    cardId: card.id,
    cardName: card.name,
    closeOn,
    dueOn: CreditCard.dueOnFor(card, closeOn),
    amountCents: purchases.reduce((sum, p) => sum + p.amountCents, 0),
    purchases: [...purchases].sort(bySortKey),
  };
}

export const Statement = {
  // The statement whose closing window contains refDate (the open statement on that date).
  async forCardAt(db: DB, card: CreditCardT, refDate: IsoDate): Promise<Statement> {
    const closeOn = CreditCard.closeOnFor(card, refDate);
    const prevClose = format(
      subMonths(parseDate(closeOn, FORMAT, REFERENCE), 1),
      FORMAT,
    ) as IsoDate;
    const window: Period = { from: IsoDate.addDays(prevClose, 1), to: closeOn };

    const purchases = (await cardPurchasesWithin(db, window))
      .filter((p) => p.cardId === card.id)
      .map((p) => p.purchase);

    return buildStatement(card, closeOn, purchases);
  },

  // Every card's statements whose due date falls within range, derived from their purchases.
  async dueWithin(db: DB, range: Period): Promise<readonly Statement[]> {
    const cards = await CreditCard.list(db);
    const cardById = new Map(cards.map((card) => [card.id, card]));

    // A statement due within range closes within ~1 month of its due date, and its purchases
    // occur within ~1 further month — so nothing earlier than range.from − 2 months matters.
    const gatherFrom = format(
      subMonths(parseDate(range.from, FORMAT, REFERENCE), 2),
      FORMAT,
    ) as IsoDate;
    const all = await cardPurchasesWithin(db, { from: gatherFrom, to: range.to });

    const buckets = new Map<
      string,
      { card: CreditCardT; closeOn: IsoDate; purchases: StatementPurchase[] }
    >();
    for (const { cardId, purchase } of all) {
      const card = cardById.get(cardId);
      if (card === undefined) {
        continue;
      }
      const closeOn = CreditCard.closeOnFor(card, purchase.occurredOn);
      const dueOn = CreditCard.dueOnFor(card, closeOn);
      if (dueOn < range.from || dueOn > range.to) {
        continue;
      }
      const key = `${cardId}:${closeOn}`;
      const bucket = buckets.get(key);
      if (bucket === undefined) {
        buckets.set(key, { card, closeOn, purchases: [purchase] });
      } else {
        bucket.purchases.push(purchase);
      }
    }

    return [...buckets.values()]
      .map(({ card, closeOn, purchases }) => buildStatement(card, closeOn, purchases))
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.cardName.localeCompare(b.cardName));
  },
} as const;
