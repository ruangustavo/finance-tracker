import { randomUUID } from "node:crypto";
import { addMonths, format, parse as parseDate, setDate } from "date-fns";
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
import type { CategoryRequired, EntryType as EntryTypeT, InvalidEntryType } from "./entry.ts";
import { EntryType } from "./entry.ts";
import type { Period } from "./spending.ts";

export type RecurringDefinition = Readonly<{
  id: string;
  type: EntryTypeT;
  categoryId: string | null;
  amountCents: number;
  dayOfMonth: number;
  startsOn: string;
  endsOn: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type Occurrence = Readonly<{
  definitionId: string;
  type: EntryTypeT;
  categoryId: string | null;
  amountCents: number;
  occurredOn: string;
  description: string | null;
}>;

export type RegisterInput = Readonly<{
  typeRaw?: string | undefined;
  amountRaw: string;
  dayRaw: string;
  categoryName?: string | undefined;
  startRaw?: string | undefined;
  description?: string | undefined;
}>;

export type EditInput = Readonly<{
  id: string;
  amountRaw?: string | undefined;
  dayRaw?: string | undefined;
  categoryName?: string | undefined;
  description?: string | undefined;
}>;

export type RecurringNotFound = Readonly<{ kind: "RecurringNotFound"; id: string }>;

export type RegisterError =
  | InvalidEntryType
  | InvalidAmount
  | InvalidAnchorDay
  | InvalidDate
  | UnknownCategory
  | CategoryRequired;
export type EditError = RegisterError | RecurringNotFound;

const FORMAT = "yyyy-MM-dd";
const REFERENCE = new Date(0);

function rowToDefinition(row: Selectable<Database["recurring_definitions"]>): RecurringDefinition {
  return {
    id: row.id,
    type: row.type,
    categoryId: row.category_id,
    amountCents: row.amount_cents,
    dayOfMonth: row.day_of_month,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveCategory(
  db: DB,
  type: EntryTypeT,
  categoryName: string | undefined,
): Promise<Result<string | null, UnknownCategory | CategoryRequired>> {
  if (type !== "expense") {
    return Result.ok(null);
  }
  if (categoryName === undefined) {
    return Result.err({ kind: "CategoryRequired" });
  }
  const category = await Category.findByName(db, categoryName);
  if (!category.ok) {
    return category;
  }
  return Result.ok(category.value.id);
}

export const RecurringDefinition = {
  async register(
    db: DB,
    input: RegisterInput,
  ): Promise<Result<RecurringDefinition, RegisterError>> {
    const type = EntryType.parse(input.typeRaw ?? "expense");
    if (!type.ok) {
      return type;
    }

    const money = Money.parse(input.amountRaw);
    if (!money.ok) {
      return money;
    }

    const dayOfMonth = PayCycle.parseAnchorDay(input.dayRaw);
    if (!dayOfMonth.ok) {
      return dayOfMonth;
    }

    const startsOn = IsoDate.parse(input.startRaw ?? IsoDate.today());
    if (!startsOn.ok) {
      return startsOn;
    }

    const categoryId = await resolveCategory(db, type.value, input.categoryName);
    if (!categoryId.ok) {
      return categoryId;
    }

    const now = new Date().toISOString();
    const definition: RecurringDefinition = {
      id: randomUUID(),
      type: type.value,
      categoryId: categoryId.value,
      amountCents: money.value.cents,
      dayOfMonth: dayOfMonth.value,
      startsOn: startsOn.value,
      endsOn: null,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await db
      .insertInto("recurring_definitions")
      .values({
        id: definition.id,
        type: definition.type,
        category_id: definition.categoryId,
        amount_cents: definition.amountCents,
        day_of_month: definition.dayOfMonth,
        starts_on: definition.startsOn,
        ends_on: definition.endsOn,
        description: definition.description,
        created_at: definition.createdAt,
        updated_at: definition.updatedAt,
      })
      .execute();

    return Result.ok(definition);
  },

  expand(definition: RecurringDefinition, range: Period): readonly Occurrence[] {
    const occurrences: Occurrence[] = [];
    const last = parseDate(range.to, FORMAT, REFERENCE);
    let cursor = setDate(parseDate(range.from, FORMAT, REFERENCE), 1);

    while (cursor <= last) {
      const occurredOn = format(setDate(cursor, definition.dayOfMonth), FORMAT);
      if (
        occurredOn >= range.from &&
        occurredOn <= range.to &&
        occurredOn >= definition.startsOn &&
        (definition.endsOn === null || occurredOn <= definition.endsOn)
      ) {
        occurrences.push({
          definitionId: definition.id,
          type: definition.type,
          categoryId: definition.categoryId,
          amountCents: definition.amountCents,
          occurredOn,
          description: definition.description,
        });
      }
      cursor = addMonths(cursor, 1);
    }

    return occurrences;
  },

  async occurrences(db: DB, range: Period): Promise<readonly Occurrence[]> {
    const definitions = await RecurringDefinition.list(db);
    return definitions
      .flatMap((definition) => RecurringDefinition.expand(definition, range))
      .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  },

  async list(db: DB): Promise<readonly RecurringDefinition[]> {
    const rows = await db
      .selectFrom("recurring_definitions")
      .selectAll()
      .orderBy("starts_on", "asc")
      .orderBy("created_at", "asc")
      .execute();
    return rows.map(rowToDefinition);
  },

  async getById(db: DB, id: string): Promise<Result<RecurringDefinition, RecurringNotFound>> {
    const row = await db
      .selectFrom("recurring_definitions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (row === undefined) {
      return Result.err({ kind: "RecurringNotFound", id });
    }
    return Result.ok(rowToDefinition(row));
  },

  async edit(db: DB, input: EditInput): Promise<Result<RecurringDefinition, EditError>> {
    const existing = await RecurringDefinition.getById(db, input.id);
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

    let dayOfMonth = existing.value.dayOfMonth;
    if (input.dayRaw !== undefined) {
      const parsedDay = PayCycle.parseAnchorDay(input.dayRaw);
      if (!parsedDay.ok) {
        return parsedDay;
      }
      dayOfMonth = parsedDay.value;
    }

    let categoryId = existing.value.categoryId;
    if (input.categoryName !== undefined) {
      const resolved = await resolveCategory(db, existing.value.type, input.categoryName);
      if (!resolved.ok) {
        return resolved;
      }
      categoryId = resolved.value;
    }

    const description =
      input.description !== undefined ? input.description : existing.value.description;

    const today = IsoDate.today();
    const successorStart = IsoDate.addDays(today, 1);
    const now = new Date().toISOString();

    const successor: RecurringDefinition = {
      id: randomUUID(),
      type: existing.value.type,
      categoryId,
      amountCents,
      dayOfMonth,
      startsOn: successorStart,
      endsOn: existing.value.endsOn,
      description,
      createdAt: now,
      updatedAt: now,
    };

    await db
      .updateTable("recurring_definitions")
      .set({ ends_on: today, updated_at: now })
      .where("id", "=", input.id)
      .execute();

    await db
      .insertInto("recurring_definitions")
      .values({
        id: successor.id,
        type: successor.type,
        category_id: successor.categoryId,
        amount_cents: successor.amountCents,
        day_of_month: successor.dayOfMonth,
        starts_on: successor.startsOn,
        ends_on: successor.endsOn,
        description: successor.description,
        created_at: successor.createdAt,
        updated_at: successor.updatedAt,
      })
      .execute();

    return Result.ok(successor);
  },

  async cancel(db: DB, id: string): Promise<Result<RecurringDefinition, RecurringNotFound>> {
    const existing = await RecurringDefinition.getById(db, id);
    if (!existing.ok) {
      return existing;
    }

    const today = IsoDate.today();
    const now = new Date().toISOString();

    await db
      .updateTable("recurring_definitions")
      .set({ ends_on: today, updated_at: now })
      .where("id", "=", id)
      .execute();

    return Result.ok({ ...existing.value, endsOn: today, updatedAt: now });
  },
} as const;
