import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Migration } from "kysely/migration";
import type { Database } from "../schema.ts";

export const migration: Migration = {
  async up(db: Kysely<Database>): Promise<void> {
    await db.schema
      .createTable("recurring_definitions")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("type", "text", (col) =>
        col.notNull().check(sql`type in ('income', 'expense', 'transfer')`),
      )
      .addColumn("category_id", "text", (col) => col.references("categories.id"))
      .addColumn("amount_cents", "integer", (col) => col.notNull().check(sql`amount_cents > 0`))
      .addColumn("day_of_month", "integer", (col) =>
        col.notNull().check(sql`day_of_month between 1 and 28`),
      )
      .addColumn("starts_on", "text", (col) => col.notNull())
      .addColumn("ends_on", "text")
      .addColumn("description", "text")
      .addColumn("created_at", "text", (col) => col.notNull())
      .addColumn("updated_at", "text", (col) => col.notNull())
      .addCheckConstraint(
        "expense_requires_category",
        sql`type != 'expense' or category_id is not null`,
      )
      .execute();
  },
};
