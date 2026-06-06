import { randomUUID } from "node:crypto";
import type { Selectable } from "kysely";
import type { Database, DB } from "../db/schema.ts";
import { Result } from "../result.ts";
import type { InvalidDate } from "../values/iso-date.ts";
import { IsoDate } from "../values/iso-date.ts";
import type { InvalidAmount } from "../values/money.ts";
import { Money } from "../values/money.ts";
import type { UnknownCategory } from "./category.ts";
import { Category } from "./category.ts";
import type { UnknownCard } from "./credit-card.ts";
import { CreditCard } from "./credit-card.ts";

export type EntryType = "income" | "expense" | "transfer";
export type Nature = "recurring" | "variable";
export type PaymentMethod = "account" | "creditCard";

const ENTRY_TYPES = ["income", "expense", "transfer"] as const;
const PAYMENT_METHODS = ["account", "creditCard"] as const;

export type InvalidEntryType = Readonly<{ kind: "InvalidEntryType"; raw: string }>;
export type InvalidPaymentMethod = Readonly<{ kind: "InvalidPaymentMethod"; raw: string }>;

export const EntryType = {
  parse(raw: string): Result<EntryType, InvalidEntryType> {
    const found = ENTRY_TYPES.find((t) => t === raw);
    return found === undefined ? Result.err({ kind: "InvalidEntryType", raw }) : Result.ok(found);
  },
} as const;

export const PaymentMethod = {
  parse(raw: string): Result<PaymentMethod, InvalidPaymentMethod> {
    const found = PAYMENT_METHODS.find((m) => m === raw);
    return found === undefined
      ? Result.err({ kind: "InvalidPaymentMethod", raw })
      : Result.ok(found);
  },
} as const;

export type Entry = Readonly<{
  id: string;
  type: EntryType;
  nature: Nature;
  paymentMethod: PaymentMethod;
  categoryId: string | null;
  cardId: string | null;
  amountCents: number;
  occurredOn: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type RegisterInput = Readonly<{
  typeRaw?: string | undefined;
  amountRaw: string;
  dateRaw: string;
  categoryName?: string | undefined;
  paymentMethodRaw?: string | undefined;
  cardName?: string | undefined;
  description?: string | undefined;
}>;

export type EditInput = Readonly<{
  id: string;
  amountRaw?: string | undefined;
  dateRaw?: string | undefined;
  categoryName?: string | undefined;
  description?: string | undefined;
}>;

export type EntryNotFound = Readonly<{
  kind: "EntryNotFound";
  id: string;
}>;

export type CategoryRequired = Readonly<{ kind: "CategoryRequired" }>;
export type CardRequired = Readonly<{ kind: "CardRequired" }>;
export type CardNotAllowed = Readonly<{ kind: "CardNotAllowed" }>;

export type RegisterError =
  | InvalidAmount
  | InvalidDate
  | UnknownCategory
  | InvalidEntryType
  | InvalidPaymentMethod
  | CategoryRequired
  | CardRequired
  | CardNotAllowed
  | UnknownCard;
export type EditError = RegisterError | EntryNotFound;
export type RemoveError = EntryNotFound;

function rowToEntry(row: Selectable<Database["entries"]>): Entry {
  return {
    id: row.id,
    type: row.type,
    nature: row.nature,
    paymentMethod: row.payment_method,
    categoryId: row.category_id,
    cardId: row.card_id,
    amountCents: row.amount_cents,
    occurredOn: row.occurred_on,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const Entry = {
  async register(db: DB, input: RegisterInput): Promise<Result<Entry, RegisterError>> {
    const type = EntryType.parse(input.typeRaw ?? "expense");
    if (!type.ok) {
      return type;
    }

    const money = Money.parse(input.amountRaw);
    if (!money.ok) {
      return money;
    }

    const date = IsoDate.parse(input.dateRaw);
    if (!date.ok) {
      return date;
    }

    const paymentMethod = PaymentMethod.parse(input.paymentMethodRaw ?? "account");
    if (!paymentMethod.ok) {
      return paymentMethod;
    }

    let categoryId: string | null = null;
    if (type.value === "expense") {
      if (input.categoryName === undefined) {
        return Result.err({ kind: "CategoryRequired" });
      }
      const category = await Category.findByName(db, input.categoryName);
      if (!category.ok) {
        return category;
      }
      categoryId = category.value.id;
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

    const now = new Date().toISOString();
    const entry: Entry = {
      id: randomUUID(),
      type: type.value,
      nature: "variable",
      paymentMethod: paymentMethod.value,
      categoryId,
      cardId,
      amountCents: money.value.cents,
      occurredOn: date.value,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await db
      .insertInto("entries")
      .values({
        id: entry.id,
        type: entry.type,
        nature: entry.nature,
        payment_method: entry.paymentMethod,
        category_id: entry.categoryId,
        card_id: entry.cardId,
        amount_cents: entry.amountCents,
        occurred_on: entry.occurredOn,
        description: entry.description,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
      })
      .execute();

    return Result.ok(entry);
  },

  async list(db: DB): Promise<readonly Entry[]> {
    const rows = await db
      .selectFrom("entries")
      .selectAll()
      .orderBy("occurred_on", "desc")
      .orderBy("created_at", "desc")
      .execute();
    return rows.map(rowToEntry);
  },

  async getById(db: DB, id: string): Promise<Result<Entry, EntryNotFound>> {
    const row = await db.selectFrom("entries").selectAll().where("id", "=", id).executeTakeFirst();
    if (row === undefined) {
      return Result.err({ kind: "EntryNotFound", id });
    }
    return Result.ok(rowToEntry(row));
  },

  async edit(db: DB, input: EditInput): Promise<Result<Entry, EditError>> {
    const existing = await Entry.getById(db, input.id);
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

    let occurredOn = existing.value.occurredOn;
    if (input.dateRaw !== undefined) {
      const date = IsoDate.parse(input.dateRaw);
      if (!date.ok) {
        return date;
      }
      occurredOn = date.value;
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
    const updatedAt = new Date().toISOString();

    await db
      .updateTable("entries")
      .set({
        amount_cents: amountCents,
        occurred_on: occurredOn,
        category_id: categoryId,
        description,
        updated_at: updatedAt,
      })
      .where("id", "=", input.id)
      .execute();

    return Result.ok({
      ...existing.value,
      amountCents,
      occurredOn,
      categoryId,
      description,
      updatedAt,
    });
  },

  async remove(db: DB, id: string): Promise<Result<Readonly<{ id: string }>, RemoveError>> {
    const existing = await Entry.getById(db, id);
    if (!existing.ok) {
      return existing;
    }
    await db.deleteFrom("entries").where("id", "=", id).execute();
    return Result.ok({ id });
  },
} as const;
