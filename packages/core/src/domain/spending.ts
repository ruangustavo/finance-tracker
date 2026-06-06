import type { DB } from "../db/schema.ts";
import type { IsoDate } from "../values/iso-date.ts";

export type SpendingByCategory = Readonly<{
  categoryId: string;
  categoryName: string;
  totalCents: number;
}>;

export type SpendingReport = Readonly<{
  from: IsoDate;
  to: IsoDate;
  totalCents: number;
  byCategory: readonly SpendingByCategory[];
}>;

export type Period = Readonly<{
  from: IsoDate;
  to: IsoDate;
}>;

export const Spending = {
  async byCategory(db: DB, period: Period): Promise<SpendingReport> {
    const rows = await db
      .selectFrom("entries")
      .innerJoin("categories", "categories.id", "entries.category_id")
      .select((eb) => [
        "categories.id as categoryId",
        "categories.name as categoryName",
        eb.fn.sum("entries.amount_cents").as("totalCents"),
      ])
      .where("entries.type", "=", "expense")
      .where("entries.occurred_on", ">=", period.from)
      .where("entries.occurred_on", "<=", period.to)
      .groupBy(["categories.id", "categories.name"])
      .execute();

    const byCategory: SpendingByCategory[] = rows
      .map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        totalCents: Number(row.totalCents),
      }))
      .sort((a, b) => b.totalCents - a.totalCents || a.categoryName.localeCompare(b.categoryName));

    const totalCents = byCategory.reduce((acc, c) => acc + c.totalCents, 0);

    return { from: period.from, to: period.to, totalCents, byCategory };
  },
} as const;
