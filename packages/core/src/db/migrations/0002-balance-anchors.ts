import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";
import type { Database } from "../schema.ts";

export const migration: Migration = {
  async up(db: Kysely<Database>): Promise<void> {
    await db.schema
      .createTable("balance_anchors")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("amount_cents", "integer", (col) => col.notNull())
      .addColumn("anchored_on", "text", (col) => col.notNull())
      .addColumn("created_at", "text", (col) => col.notNull())
      .execute();
  },
};
