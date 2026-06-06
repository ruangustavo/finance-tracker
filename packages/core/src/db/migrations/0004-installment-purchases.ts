import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Migration } from "kysely/migration";
import type { Database } from "../schema.ts";

export const migration: Migration = {
  async up(db: Kysely<Database>): Promise<void> {
    await db.schema
      .createTable("installment_purchases")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("category_id", "text", (col) => col.notNull().references("categories.id"))
      .addColumn("amount_cents", "integer", (col) => col.notNull().check(sql`amount_cents > 0`))
      .addColumn("count", "integer", (col) => col.notNull().check(sql`"count" >= 1`))
      .addColumn("day_of_month", "integer", (col) =>
        col.notNull().check(sql`day_of_month between 1 and 28`),
      )
      .addColumn("first_charge_on", "text", (col) => col.notNull())
      .addColumn("starts_on", "text", (col) => col.notNull())
      .addColumn("ends_on", "text")
      .addColumn("payment_method", "text", (col) =>
        col.notNull().check(sql`payment_method = 'account'`),
      )
      .addColumn("description", "text")
      .addColumn("created_at", "text", (col) => col.notNull())
      .addColumn("updated_at", "text", (col) => col.notNull())
      .execute();
  },
};
