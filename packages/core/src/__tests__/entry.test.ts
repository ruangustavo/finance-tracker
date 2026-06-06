import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import { Entry } from "../domain/entry.ts";
import { IsoDate } from "../values/iso-date.ts";

const validExpense = {
  amountRaw: "80.50",
  dateRaw: "2026-06-05",
  categoryName: "mercado",
} as const;

describe("Entry", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  describe("register", () => {
    it("records a variable expense paid from the account", async () => {
      const result = await Entry.register(db, validExpense);
      assert.ok(result.ok);
      const entry = result.value;
      assert.equal(entry.type, "expense");
      assert.equal(entry.nature, "variable");
      assert.equal(entry.paymentMethod, "account");
      assert.equal(entry.categoryId, "cat-mercado");
      assert.equal(entry.amountCents, 8050);
      assert.equal(entry.occurredOn, "2026-06-05");
      assert.equal(entry.description, null);
      assert.match(entry.id, /^[0-9a-f-]{36}$/);
    });

    it("persists an optional description", async () => {
      const result = await Entry.register(db, { ...validExpense, description: "feira" });
      assert.ok(result.ok);
      assert.equal(result.value.description, "feira");
    });

    it("rejects an unknown category", async () => {
      const result = await Entry.register(db, { ...validExpense, categoryName: "supermercado" });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "UnknownCategory");
    });

    it("rejects an invalid amount", async () => {
      const result = await Entry.register(db, { ...validExpense, amountRaw: "abc" });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidAmount");
    });

    it("rejects a zero amount", async () => {
      const result = await Entry.register(db, { ...validExpense, amountRaw: "0" });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidAmount");
    });

    it("rejects an invalid date", async () => {
      const result = await Entry.register(db, { ...validExpense, dateRaw: "2026-02-30" });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidDate");
    });

    it("stores today's date when given IsoDate.today()", async () => {
      const today = IsoDate.today();
      const result = await Entry.register(db, { ...validExpense, dateRaw: today });
      assert.ok(result.ok);
      assert.equal(result.value.occurredOn, today);
    });
  });

  describe("list", () => {
    it("returns an empty array when there are no entries", async () => {
      assert.deepEqual(await Entry.list(db), []);
    });

    it("returns entries ordered by occurredOn descending", async () => {
      await Entry.register(db, { ...validExpense, dateRaw: "2026-06-01" });
      await Entry.register(db, { ...validExpense, dateRaw: "2026-06-10" });
      const entries = await Entry.list(db);
      assert.equal(entries.length, 2);
      assert.equal(entries[0]?.occurredOn, "2026-06-10");
      assert.equal(entries[1]?.occurredOn, "2026-06-01");
    });
  });

  describe("getById", () => {
    it("returns a stored entry", async () => {
      const created = await Entry.register(db, validExpense);
      assert.ok(created.ok);
      const found = await Entry.getById(db, created.value.id);
      assert.ok(found.ok);
      assert.deepEqual(found.value, created.value);
    });

    it("returns EntryNotFound for a missing id", async () => {
      const found = await Entry.getById(db, "missing");
      assert.ok(!found.ok);
      assert.equal(found.error.kind, "EntryNotFound");
    });
  });

  describe("edit", () => {
    it("updates the amount and bumps updatedAt", async () => {
      const created = await Entry.register(db, validExpense);
      assert.ok(created.ok);
      const edited = await Entry.edit(db, { id: created.value.id, amountRaw: "120" });
      assert.ok(edited.ok);
      assert.equal(edited.value.amountCents, 12000);
      assert.ok(edited.value.updatedAt >= created.value.createdAt);
    });

    it("updates the category", async () => {
      const created = await Entry.register(db, validExpense);
      assert.ok(created.ok);
      const edited = await Entry.edit(db, { id: created.value.id, categoryName: "restaurante" });
      assert.ok(edited.ok);
      assert.equal(edited.value.categoryId, "cat-restaurante");
    });

    it("rejects an unknown category", async () => {
      const created = await Entry.register(db, validExpense);
      assert.ok(created.ok);
      const edited = await Entry.edit(db, { id: created.value.id, categoryName: "supermercado" });
      assert.ok(!edited.ok);
      assert.equal(edited.error.kind, "UnknownCategory");
    });

    it("returns EntryNotFound for a missing id", async () => {
      const edited = await Entry.edit(db, { id: "missing", amountRaw: "10" });
      assert.ok(!edited.ok);
      assert.equal(edited.error.kind, "EntryNotFound");
    });
  });

  describe("remove", () => {
    it("deletes a stored entry", async () => {
      const created = await Entry.register(db, validExpense);
      assert.ok(created.ok);
      const removed = await Entry.remove(db, created.value.id);
      assert.ok(removed.ok);
      assert.equal(removed.value.id, created.value.id);
      assert.deepEqual(await Entry.list(db), []);
    });

    it("returns EntryNotFound for a missing id", async () => {
      const removed = await Entry.remove(db, "missing");
      assert.ok(!removed.ok);
      assert.equal(removed.error.kind, "EntryNotFound");
    });
  });
});
