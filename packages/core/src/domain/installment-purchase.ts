import { randomUUID } from "node:crypto";
import {
  addMonths,
  differenceInCalendarMonths,
  format,
  getDate,
  parse as parseDate,
  setDate,
} from "date-fns";
import type { Selectable } from "kysely";
import type { Database, DB } from "../db/schema.ts";
import { Result } from "../result.ts";
import type { InvalidDate } from "../values/iso-date.ts";
import { IsoDate } from "../values/iso-date.ts";
import type { InvalidAmount } from "../values/money.ts";
import { Money } from "../values/money.ts";
import type { InvalidAnchorDay } from "../values/pay-cycle.ts";
import { PayCycle } from "../values/pay-cycle.ts";
import type { UnknownCategory } from "./category.ts";
import { Category } from "./category.ts";
import type { UnknownCard } from "./credit-card.ts";
import { CreditCard } from "./credit-card.ts";
import type {
  CardNotAllowed,
  CardRequired,
  CategoryRequired,
  InvalidPaymentMethod,
  PaymentMethod as PaymentMethodT,
} from "./entry.ts";
import { PaymentMethod } from "./entry.ts";
import type { Period } from "./spending.ts";

export type InstallmentPurchase = Readonly<{
  id: string;
  categoryId: string;
  amountCents: number;
  count: number;
  dayOfMonth: number;
  firstChargeOn: string;
  startsOn: string;
  endsOn: string | null;
  paymentMethod: PaymentMethodT;
  cardId: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type Installment = Readonly<{
  purchaseId: string;
  index: number;
  total: number;
  categoryId: string;
  amountCents: number;
  occurredOn: string;
  paymentMethod: PaymentMethodT;
  cardId: string | null;
  description: string | null;
}>;

export type RegisterInput = Readonly<{
  amountRaw: string;
  countRaw: string;
  dayRaw?: string | undefined;
  categoryName?: string | undefined;
  startRaw?: string | undefined;
  paymentMethodRaw?: string | undefined;
  cardName?: string | undefined;
  description?: string | undefined;
}>;

export type EditInput = Readonly<{
  id: string;
  amountRaw?: string | undefined;
  categoryName?: string | undefined;
  description?: string | undefined;
}>;

export type InvalidCount = Readonly<{ kind: "InvalidCount"; raw: string }>;
export type InstallmentPurchaseNotFound = Readonly<{
  kind: "InstallmentPurchaseNotFound";
  id: string;
}>;

export type RegisterError =
  | InvalidAmount
  | InvalidCount
  | InvalidAnchorDay
  | InvalidDate
  | InvalidPaymentMethod
  | UnknownCategory
  | CategoryRequired
  | CardRequired
  | CardNotAllowed
  | UnknownCard;
export type EditError = RegisterError | InstallmentPurchaseNotFound;

const FORMAT = "yyyy-MM-dd";
const REFERENCE = new Date(0);

function parseCount(raw: string): Result<number, InvalidCount> {
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    return Result.err({ kind: "InvalidCount", raw });
  }
  return Result.ok(Number(raw));
}

function rowToPurchase(row: Selectable<Database["installment_purchases"]>): InstallmentPurchase {
  return {
    id: row.id,
    categoryId: row.category_id,
    amountCents: row.amount_cents,
    count: row.count,
    dayOfMonth: row.day_of_month,
    firstChargeOn: row.first_charge_on,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    paymentMethod: row.payment_method,
    cardId: row.card_id,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insertPurchase(db: DB, purchase: InstallmentPurchase): Promise<void> {
  await db
    .insertInto("installment_purchases")
    .values({
      id: purchase.id,
      category_id: purchase.categoryId,
      amount_cents: purchase.amountCents,
      count: purchase.count,
      day_of_month: purchase.dayOfMonth,
      first_charge_on: purchase.firstChargeOn,
      starts_on: purchase.startsOn,
      ends_on: purchase.endsOn,
      payment_method: purchase.paymentMethod,
      card_id: purchase.cardId,
      description: purchase.description,
      created_at: purchase.createdAt,
      updated_at: purchase.updatedAt,
    })
    .execute();
}

export const InstallmentPurchase = {
  async register(
    db: DB,
    input: RegisterInput,
  ): Promise<Result<InstallmentPurchase, RegisterError>> {
    const money = Money.parse(input.amountRaw);
    if (!money.ok) {
      return money;
    }

    const count = parseCount(input.countRaw);
    if (!count.ok) {
      return count;
    }

    const startsOn = IsoDate.parse(input.startRaw ?? IsoDate.today());
    if (!startsOn.ok) {
      return startsOn;
    }

    const startDate = parseDate(startsOn.value, FORMAT, REFERENCE);
    const dayOfMonth = PayCycle.parseAnchorDay(input.dayRaw ?? String(getDate(startDate)));
    if (!dayOfMonth.ok) {
      return dayOfMonth;
    }

    if (input.categoryName === undefined) {
      return Result.err({ kind: "CategoryRequired" });
    }
    const category = await Category.findByName(db, input.categoryName);
    if (!category.ok) {
      return category;
    }

    const paymentMethod = PaymentMethod.parse(input.paymentMethodRaw ?? "account");
    if (!paymentMethod.ok) {
      return paymentMethod;
    }

    let cardId: string | null = null;
    if (paymentMethod.value === "creditCard") {
      if (input.cardName === undefined) {
        return Result.err({ kind: "CardRequired" });
      }
      const card = await CreditCard.findByName(db, input.cardName);
      if (!card.ok) {
        return card;
      }
      cardId = card.value.id;
    } else if (input.cardName !== undefined) {
      return Result.err({ kind: "CardNotAllowed" });
    }

    // The first installment is the first day-of-month on or after the start date.
    const sameMonthCharge = setDate(startDate, dayOfMonth.value);
    const firstChargeDate =
      sameMonthCharge >= startDate
        ? sameMonthCharge
        : setDate(addMonths(startDate, 1), dayOfMonth.value);
    const firstChargeOn = format(firstChargeDate, FORMAT);

    const now = new Date().toISOString();
    const purchase: InstallmentPurchase = {
      id: randomUUID(),
      categoryId: category.value.id,
      amountCents: money.value.cents,
      count: count.value,
      dayOfMonth: dayOfMonth.value,
      firstChargeOn,
      startsOn: firstChargeOn,
      endsOn: null,
      paymentMethod: paymentMethod.value,
      cardId,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await insertPurchase(db, purchase);

    return Result.ok(purchase);
  },

  expand(purchase: InstallmentPurchase, range: Period): readonly Installment[] {
    const installments: Installment[] = [];
    const firstChargeDate = parseDate(purchase.firstChargeOn, FORMAT, REFERENCE);
    const naturalLast = format(addMonths(firstChargeDate, purchase.count - 1), FORMAT);
    const last = parseDate(range.to, FORMAT, REFERENCE);
    let cursor = setDate(parseDate(range.from, FORMAT, REFERENCE), 1);

    while (cursor <= last) {
      const occurredOn = format(setDate(cursor, purchase.dayOfMonth), FORMAT);
      if (
        occurredOn >= range.from &&
        occurredOn <= range.to &&
        occurredOn >= purchase.startsOn &&
        occurredOn <= naturalLast &&
        (purchase.endsOn === null || occurredOn <= purchase.endsOn)
      ) {
        installments.push({
          purchaseId: purchase.id,
          index:
            differenceInCalendarMonths(parseDate(occurredOn, FORMAT, REFERENCE), firstChargeDate) +
            1,
          total: purchase.count,
          categoryId: purchase.categoryId,
          amountCents: purchase.amountCents,
          occurredOn,
          paymentMethod: purchase.paymentMethod,
          cardId: purchase.cardId,
          description: purchase.description,
        });
      }
      cursor = addMonths(cursor, 1);
    }

    return installments;
  },

  async installments(db: DB, range: Period): Promise<readonly Installment[]> {
    const purchases = await InstallmentPurchase.list(db);
    return purchases
      .flatMap((purchase) => InstallmentPurchase.expand(purchase, range))
      .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  },

  async list(db: DB): Promise<readonly InstallmentPurchase[]> {
    const rows = await db
      .selectFrom("installment_purchases")
      .selectAll()
      .orderBy("starts_on", "asc")
      .orderBy("created_at", "asc")
      .execute();
    return rows.map(rowToPurchase);
  },

  async getById(
    db: DB,
    id: string,
  ): Promise<Result<InstallmentPurchase, InstallmentPurchaseNotFound>> {
    const row = await db
      .selectFrom("installment_purchases")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (row === undefined) {
      return Result.err({ kind: "InstallmentPurchaseNotFound", id });
    }
    return Result.ok(rowToPurchase(row));
  },

  async edit(db: DB, input: EditInput): Promise<Result<InstallmentPurchase, EditError>> {
    const existing = await InstallmentPurchase.getById(db, input.id);
    if (!existing.ok) {
      return existing;
    }

    let amountCents = existing.value.amountCents;
    if (input.amountRaw !== undefined) {
      const money = Money.parse(input.amountRaw);
      if (!money.ok) {
        return money;
      }
      amountCents = money.value.cents;
    }

    let categoryId = existing.value.categoryId;
    if (input.categoryName !== undefined) {
      const category = await Category.findByName(db, input.categoryName);
      if (!category.ok) {
        return category;
      }
      categoryId = category.value.id;
    }

    const description =
      input.description !== undefined ? input.description : existing.value.description;

    const today = IsoDate.today();
    const now = new Date().toISOString();

    const successor: InstallmentPurchase = {
      id: randomUUID(),
      categoryId,
      amountCents,
      count: existing.value.count,
      dayOfMonth: existing.value.dayOfMonth,
      firstChargeOn: existing.value.firstChargeOn,
      startsOn: IsoDate.addDays(today, 1),
      endsOn: existing.value.endsOn,
      paymentMethod: existing.value.paymentMethod,
      cardId: existing.value.cardId,
      description,
      createdAt: now,
      updatedAt: now,
    };

    await db
      .updateTable("installment_purchases")
      .set({ ends_on: today, updated_at: now })
      .where("id", "=", input.id)
      .execute();

    await insertPurchase(db, successor);

    return Result.ok(successor);
  },

  async cancel(
    db: DB,
    id: string,
  ): Promise<Result<InstallmentPurchase, InstallmentPurchaseNotFound>> {
    const existing = await InstallmentPurchase.getById(db, id);
    if (!existing.ok) {
      return existing;
    }

    const today = IsoDate.today();
    const now = new Date().toISOString();

    await db
      .updateTable("installment_purchases")
      .set({ ends_on: today, updated_at: now })
      .where("id", "=", id)
      .execute();

    return Result.ok({ ...existing.value, endsOn: today, updatedAt: now });
  },
} as const;
