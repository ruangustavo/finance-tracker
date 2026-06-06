import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Migration } from "kysely/migration";
import type { Database } from "../schema.ts";

const SEED_CATEGORIES: ReadonlyArray<{ id: string; name: string }> = [
  { id: "cat-mercado", name: "mercado" },
  { id: "cat-restaurante", name: "restaurante" },
  { id: "cat-transporte", name: "transporte" },
  { id: "cat-lazer", name: "lazer" },
  { id: "cat-saude", name: "saúde" },
  { id: "cat-cuidados-pessoais", name: "cuidados pessoais" },
  { id: "cat-assinaturas", name: "assinaturas" },
  { id: "cat-moradia", name: "moradia" },
];

export const migration: Migration = {
  async up(db: Kysely<Database>): Promise<void> {
    await db.schema
      .createTable("categories")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("name", "text", (col) => col.notNull().unique())
      .execute();

    await db.schema
      .createTable("entries")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("type", "text", (col) =>
        col.notNull().check(sql`type in ('income', 'expense', 'transfer')`),
      )
      .addColumn("nature", "text", (col) =>
        col.notNull().check(sql`nature in ('recurring', 'variable')`),
      )
      .addColumn("payment_method", "text", (col) =>
        col.notNull().check(sql`payment_method in ('account', 'creditCard')`),
      )
      .addColumn("category_id", "text", (col) => col.references("categories.id"))
      .addColumn("amount_cents", "integer", (col) => col.notNull().check(sql`amount_cents > 0`))
      .addColumn("occurred_on", "text", (col) => col.notNull())
      .addColumn("description", "text")
      .addColumn("created_at", "text", (col) => col.notNull())
      .addColumn("updated_at", "text", (col) => col.notNull())
      .addCheckConstraint(
        "expense_requires_category",
        sql`type != 'expense' or category_id is not null`,
      )
      .execute();

    await db
      .insertInto("categories")
      .values([...SEED_CATEGORIES])
      .execute();
  },
};
