import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import { Category } from "../domain/category.ts";

describe("Category", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it("findByName resolves a seeded category", async () => {
    const result = await Category.findByName(db, "mercado");
    assert.ok(result.ok);
    assert.deepEqual(result.value, { id: "cat-mercado", name: "mercado" });
  });

  it("findByName returns UnknownCategory for an unseeded name", async () => {
    const result = await Category.findByName(db, "supermercado");
    assert.ok(!result.ok);
    assert.equal(result.error.kind, "UnknownCategory");
  });

  it("findByName returns UnknownCategory for an empty name", async () => {
    const result = await Category.findByName(db, "");
    assert.ok(!result.ok);
  });

  it("list returns the 8 seeded categories sorted by name", async () => {
    const categories = await Category.list(db);
    assert.deepEqual(
      categories.map((category) => category.name),
      [
        "assinaturas",
        "cuidados pessoais",
        "lazer",
        "mercado",
        "moradia",
        "restaurante",
        "saúde",
        "transporte",
      ],
    );
  });
});
