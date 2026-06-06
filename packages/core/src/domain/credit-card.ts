import { randomUUID } from "node:crypto";
import { addMonths, format, getDate, parse as parseDate, setDate } from "date-fns";
import type { Selectable } from "kysely";
import type { Database, DB } from "../db/schema.ts";
import { Result } from "../result.ts";
import type { IsoDate } from "../values/iso-date.ts";
import type { InvalidAnchorDay } from "../values/pay-cycle.ts";
import { PayCycle } from "../values/pay-cycle.ts";

export type CreditCard = Readonly<{
  id: string;
  name: string;
  closingDay: number;
  dueDay: number;
  createdAt: string;
  updatedAt: string;
}>;

export type RegisterInput = Readonly<{
  name: string;
  closingDayRaw: string;
  dueDayRaw: string;
}>;

export type CardNameRequired = Readonly<{ kind: "CardNameRequired" }>;
export type DuplicateCard = Readonly<{ kind: "DuplicateCard"; name: string }>;
export type UnknownCard = Readonly<{ kind: "UnknownCard"; name: string }>;
export type CardNotFound = Readonly<{ kind: "CardNotFound"; id: string }>;

export type RegisterError = CardNameRequired | InvalidAnchorDay | DuplicateCard;

const FORMAT = "yyyy-MM-dd";
const REFERENCE = new Date(0);

function rowToCard(row: Selectable<Database["credit_cards"]>): CreditCard {
  return {
    id: row.id,
    name: row.name,
    closingDay: row.closing_day,
    dueDay: row.due_day,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const CreditCard = {
  async register(db: DB, input: RegisterInput): Promise<Result<CreditCard, RegisterError>> {
    const name = input.name.trim();
    if (name === "") {
      return Result.err({ kind: "CardNameRequired" });
    }

    const closingDay = PayCycle.parseAnchorDay(input.closingDayRaw);
    if (!closingDay.ok) {
      return closingDay;
    }

    const dueDay = PayCycle.parseAnchorDay(input.dueDayRaw);
    if (!dueDay.ok) {
      return dueDay;
    }

    const existing = await db
      .selectFrom("credit_cards")
      .select("id")
      .where("name", "=", name)
      .executeTakeFirst();
    if (existing !== undefined) {
      return Result.err({ kind: "DuplicateCard", name });
    }

    const now = new Date().toISOString();
    const card: CreditCard = {
      id: randomUUID(),
      name,
      closingDay: closingDay.value,
      dueDay: dueDay.value,
      createdAt: now,
      updatedAt: now,
    };

    await db
      .insertInto("credit_cards")
      .values({
        id: card.id,
        name: card.name,
        closing_day: card.closingDay,
        due_day: card.dueDay,
        created_at: card.createdAt,
        updated_at: card.updatedAt,
      })
      .execute();

    return Result.ok(card);
  },

  async list(db: DB): Promise<readonly CreditCard[]> {
    const rows = await db.selectFrom("credit_cards").selectAll().orderBy("name").execute();
    return rows.map(rowToCard);
  },

  async findByName(db: DB, name: string): Promise<Result<CreditCard, UnknownCard>> {
    const row = await db
      .selectFrom("credit_cards")
      .selectAll()
      .where("name", "=", name)
      .executeTakeFirst();
    if (row === undefined) {
      return Result.err({ kind: "UnknownCard", name });
    }
    return Result.ok(rowToCard(row));
  },

  async getById(db: DB, id: string): Promise<Result<CreditCard, CardNotFound>> {
    const row = await db
      .selectFrom("credit_cards")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (row === undefined) {
      return Result.err({ kind: "CardNotFound", id });
    }
    return Result.ok(rowToCard(row));
  },

  // The statement closing on or after a purchase date: the smallest closing date >= date.
  closeOnFor(card: CreditCard, date: IsoDate): IsoDate {
    const purchase = parseDate(date, FORMAT, REFERENCE);
    const sameMonth = setDate(purchase, card.closingDay);
    const closeOn =
      getDate(purchase) <= card.closingDay
        ? sameMonth
        : setDate(addMonths(purchase, 1), card.closingDay);
    return format(closeOn, FORMAT) as IsoDate;
  },

  // The due date for a statement: the first due-day strictly after the closing date.
  dueOnFor(card: CreditCard, closeOn: IsoDate): IsoDate {
    const close = parseDate(closeOn, FORMAT, REFERENCE);
    const sameMonth = setDate(close, card.dueDay);
    const dueOn =
      card.dueDay > card.closingDay ? sameMonth : setDate(addMonths(close, 1), card.dueDay);
    return format(dueOn, FORMAT) as IsoDate;
  },
} as const;
