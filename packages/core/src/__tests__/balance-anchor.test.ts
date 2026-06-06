import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import { BalanceAnchor } from "../domain/balance-anchor.ts";

describe("BalanceAnchor", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  describe("set", () => {
    it("records a value and a date", async () => {
      const result = await BalanceAnchor.set(db, { amountRaw: "1500.75", dateRaw: "2026-06-01" });
      assert.ok(result.ok);
      assert.equal(result.value.amountCents, 150075);
      assert.equal(result.value.anchoredOn, "2026-06-01");
      assert.match(result.value.id, /^[0-9a-f-]{36}$/);
    });

    it("accepts a zero balance", async () => {
      const result = await BalanceAnchor.set(db, { amountRaw: "0", dateRaw: "2026-06-01" });
      assert.ok(result.ok);
      assert.equal(result.value.amountCents, 0);
    });

    it("accepts a negative balance (overdraft)", async () => {
      const result = await BalanceAnchor.set(db, { amountRaw: "-250.50", dateRaw: "2026-06-01" });
      assert.ok(result.ok);
      assert.equal(result.value.amountCents, -25050);
    });

    it("rejects an invalid amount", async () => {
      const result = await BalanceAnchor.set(db, { amountRaw: "abc", dateRaw: "2026-06-01" });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidAmount");
    });

    it("rejects an invalid date", async () => {
      const result = await BalanceAnchor.set(db, { amountRaw: "100", dateRaw: "2026-02-30" });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidDate");
    });
  });

  describe("latest", () => {
    it("returns undefined when there is no anchor", async () => {
      assert.equal(await BalanceAnchor.latest(db), undefined);
    });

    it("returns the only anchor", async () => {
      await BalanceAnchor.set(db, { amountRaw: "100", dateRaw: "2026-06-01" });
      const latest = await BalanceAnchor.latest(db);
      assert.equal(latest?.amountCents, 10000);
      assert.equal(latest?.anchoredOn, "2026-06-01");
    });

    it("returns the anchor with the newest date, regardless of insertion order", async () => {
      await BalanceAnchor.set(db, { amountRaw: "300", dateRaw: "2026-06-10" });
      await BalanceAnchor.set(db, { amountRaw: "100", dateRaw: "2026-06-01" });
      const latest = await BalanceAnchor.latest(db);
      assert.equal(latest?.anchoredOn, "2026-06-10");
      assert.equal(latest?.amountCents, 30000);
    });
  });
});
