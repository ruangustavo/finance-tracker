import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";

describe("Db.migrate", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it("seeds the categories table with 8 rows", async () => {
    const rows = await db.selectFrom("categories").selectAll().execute();
    assert.equal(rows.length, 8);
  });

  it("creates an empty entries table", async () => {
    const rows = await db.selectFrom("entries").selectAll().execute();
    assert.deepEqual(rows, []);
  });

  it("is idempotent when run twice", async () => {
    await Db.migrate(db);
    const rows = await db.selectFrom("categories").selectAll().execute();
    assert.equal(rows.length, 8);
  });
});
