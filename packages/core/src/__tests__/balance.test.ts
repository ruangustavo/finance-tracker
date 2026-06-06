import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import { Balance } from "../domain/balance.ts";
import { BalanceAnchor } from "../domain/balance-anchor.ts";
import type { EntryType, PaymentMethod } from "../domain/entry.ts";

type RawEntry = Readonly<{
  type: EntryType;
  paymentMethod: PaymentMethod;
  amountCents: number;
  occurredOn: string;
}>;

async function insertEntry(db: DB, entry: RawEntry): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insertInto("entries")
    .values({
      id: randomUUID(),
      type: entry.type,
      nature: "variable",
      payment_method: entry.paymentMethod,
      category_id: entry.type === "expense" ? "cat-mercado" : null,
      amount_cents: entry.amountCents,
      occurred_on: entry.occurredOn,
      description: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
}

describe("Balance.current", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it("fails when no anchor is set", async () => {
    const result = await Balance.current(db);
    assert.ok(!result.ok);
    assert.equal(result.error.kind, "NoAnchorSet");
  });

  it("equals the anchor when there are no entries after it", async () => {
    await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
    const result = await Balance.current(db);
    assert.ok(result.ok);
    assert.equal(result.value.cents, 100000);
  });

  it("subtracts an account expense dated after the anchor", async () => {
    await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
    await insertEntry(db, {
      type: "expense",
      paymentMethod: "account",
      amountCents: 25000,
      occurredOn: "2026-06-05",
    });
    const result = await Balance.current(db);
    assert.ok(result.ok);
    assert.equal(result.value.cents, 75000);
  });

  it("ignores entries on or before the anchor date", async () => {
    await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
    await insertEntry(db, {
      type: "expense",
      paymentMethod: "account",
      amountCents: 5000,
      occurredOn: "2026-05-31",
    });
    await insertEntry(db, {
      type: "expense",
      paymentMethod: "account",
      amountCents: 7000,
      occurredOn: "2026-06-01",
    });
    const result = await Balance.current(db);
    assert.ok(result.ok);
    assert.equal(result.value.cents, 100000);
  });

  it("counts only entries after the latest anchor when re-anchored", async () => {
    await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
    await insertEntry(db, {
      type: "expense",
      paymentMethod: "account",
      amountCents: 30000,
      occurredOn: "2026-06-05",
    });
    await BalanceAnchor.set(db, { amountRaw: "2000", dateRaw: "2026-06-10" });
    await insertEntry(db, {
      type: "expense",
      paymentMethod: "account",
      amountCents: 50000,
      occurredOn: "2026-06-12",
    });
    const result = await Balance.current(db);
    assert.ok(result.ok);
    assert.equal(result.value.cents, 150000);
  });

  it("ignores credit-card entries", async () => {
    await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
    await insertEntry(db, {
      type: "expense",
      paymentMethod: "creditCard",
      amountCents: 40000,
      occurredOn: "2026-06-05",
    });
    const result = await Balance.current(db);
    assert.ok(result.ok);
    assert.equal(result.value.cents, 100000);
  });

  it("adds account income and subtracts account transfers", async () => {
    await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
    await insertEntry(db, {
      type: "income",
      paymentMethod: "account",
      amountCents: 50000,
      occurredOn: "2026-06-05",
    });
    await insertEntry(db, {
      type: "transfer",
      paymentMethod: "account",
      amountCents: 20000,
      occurredOn: "2026-06-06",
    });
    const result = await Balance.current(db);
    assert.ok(result.ok);
    assert.equal(result.value.cents, 130000);
  });
});
