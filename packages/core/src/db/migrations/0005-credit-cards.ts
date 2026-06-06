import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Migration } from "kysely/migration";
import type { Database } from "../schema.ts";

export const migration: Migration = {
  async up(db: Kysely<Database>): Promise<void> {
    await db.schema
      .createTable("credit_cards")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("name", "text", (col) => col.notNull().unique())
      .addColumn("closing_day", "integer", (col) =>
        col.notNull().check(sql`closing_day between 1 and 28`),
      )
      .addColumn("due_day", "integer", (col) => col.notNull().check(sql`due_day between 1 and 28`))
      .addColumn("created_at", "text", (col) => col.notNull())
      .addColumn("updated_at", "text", (col) => col.notNull())
      .execute();

    await db.schema
      .alterTable("entries")
      .addColumn("card_id", "text", (col) => col.references("credit_cards.id"))
      .execute();

    // SQLite cannot alter a CHECK constraint, so rebuild installment_purchases to add
    // card_id and widen payment_method to allow 'creditCard'.
    await db.schema
      .createTable("installment_purchases_new")
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
        col.notNull().check(sql`payment_method in ('account', 'creditCard')`),
      )
      .addColumn("card_id", "text", (col) => col.references("credit_cards.id"))
      .addColumn("description", "text")
      .addColumn("created_at", "text", (col) => col.notNull())
      .addColumn("updated_at", "text", (col) => col.notNull())
      .execute();

    await sql`
      insert into installment_purchases_new
        (id, category_id, amount_cents, count, day_of_month, first_charge_on,
         starts_on, ends_on, payment_method, card_id, description, created_at, updated_at)
      select
        id, category_id, amount_cents, count, day_of_month, first_charge_on,
        starts_on, ends_on, payment_method, null, description, created_at, updated_at
      from installment_purchases
    `.execute(db);

    await db.schema.dropTable("installment_purchases").execute();
    await db.schema
      .alterTable("installment_purchases_new")
      .renameTo("installment_purchases")
      .execute();
  },
};
