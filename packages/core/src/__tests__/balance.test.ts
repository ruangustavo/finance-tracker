import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import { Balance } from "../domain/balance.ts";
import { BalanceAnchor } from "../domain/balance-anchor.ts";
import { CreditCard } from "../domain/credit-card.ts";
import type { EntryType, PaymentMethod } from "../domain/entry.ts";
import { Entry } from "../domain/entry.ts";
import type { IsoDate } from "../values/iso-date.ts";

const iso = (raw: string) => raw as IsoDate;

async function cardPurchase(db: DB, amount: string, date: string): Promise<void> {
  const result = await Entry.register(db, {
    amountRaw: amount,
    dateRaw: date,
    categoryName: "mercado",
    paymentMethodRaw: "creditCard",
    cardName: "nubank",
  });
  assert.ok(result.ok);
}

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

  it("reflects income and transfers registered through Entry.register", async () => {
    await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
    await Entry.register(db, { typeRaw: "income", amountRaw: "500", dateRaw: "2026-06-05" });
    await Entry.register(db, { typeRaw: "transfer", amountRaw: "200", dateRaw: "2026-06-05" });
    const result = await Balance.current(db);
    assert.ok(result.ok);
    assert.equal(result.value.cents, 130000); // 100000 + 50000 - 20000
  });

  describe("credit-card statements (cash basis)", () => {
    beforeEach(async () => {
      const card = await CreditCard.register(db, {
        name: "nubank",
        closingDayRaw: "28",
        dueDayRaw: "5",
      });
      assert.ok(card.ok);
    });

    it("does not change the balance on the purchase date", async () => {
      await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
      await cardPurchase(db, "100", "2026-06-10"); // statement due 2026-07-05
      const result = await Balance.current(db, iso("2026-06-15"));
      assert.ok(result.ok);
      assert.equal(result.value.cents, 100000);
    });

    it("does not subtract the statement before its due date", async () => {
      await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
      await cardPurchase(db, "100", "2026-06-10"); // due 2026-07-05
      const result = await Balance.current(db, iso("2026-07-04"));
      assert.ok(result.ok);
      assert.equal(result.value.cents, 100000);
    });

    it("subtracts the statement once, on its due date", async () => {
      await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
      await cardPurchase(db, "100", "2026-06-10");
      await cardPurchase(db, "50", "2026-06-20"); // same statement, due 2026-07-05
      const result = await Balance.current(db, iso("2026-07-05"));
      assert.ok(result.ok);
      // No double counting: 100000 − 15000 (statement), not also − the two card entries.
      assert.equal(result.value.cents, 85000);
    });
  });
});
