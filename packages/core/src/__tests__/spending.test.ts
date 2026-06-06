import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import { Entry } from "../domain/entry.ts";
import { Spending } from "../domain/spending.ts";
import type { IsoDate } from "../values/iso-date.ts";

const period = (from: string, to: string) => ({ from: from as IsoDate, to: to as IsoDate });

async function insertCreditCardExpense(
  db: DB,
  amountCents: number,
  occurredOn: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insertInto("entries")
    .values({
      id: randomUUID(),
      type: "expense",
      nature: "variable",
      payment_method: "creditCard",
      category_id: "cat-mercado",
      amount_cents: amountCents,
      occurred_on: occurredOn,
      description: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
}

describe("Spending.byCategory", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it("returns an empty report when there are no entries", async () => {
    const report = await Spending.byCategory(db, period("2026-06-05", "2026-07-04"));
    assert.equal(report.totalCents, 0);
    assert.deepEqual(report.byCategory, []);
    assert.equal(report.from, "2026-06-05");
    assert.equal(report.to, "2026-07-04");
  });

  it("sums multiple expenses in the same category into one row", async () => {
    await Entry.register(db, {
      amountRaw: "80.50",
      dateRaw: "2026-06-10",
      categoryName: "mercado",
    });
    await Entry.register(db, {
      amountRaw: "19.50",
      dateRaw: "2026-06-20",
      categoryName: "mercado",
    });
    const report = await Spending.byCategory(db, period("2026-06-05", "2026-07-04"));
    assert.equal(report.byCategory.length, 1);
    assert.deepEqual(report.byCategory[0], {
      categoryId: "cat-mercado",
      categoryName: "mercado",
      totalCents: 10000,
    });
    assert.equal(report.totalCents, 10000);
  });

  it("excludes entries outside the period and includes the boundary dates", async () => {
    await Entry.register(db, { amountRaw: "10", dateRaw: "2026-06-04", categoryName: "mercado" }); // before
    await Entry.register(db, { amountRaw: "20", dateRaw: "2026-06-05", categoryName: "mercado" }); // from
    await Entry.register(db, { amountRaw: "30", dateRaw: "2026-07-04", categoryName: "mercado" }); // to
    await Entry.register(db, { amountRaw: "40", dateRaw: "2026-07-05", categoryName: "mercado" }); // after
    const report = await Spending.byCategory(db, period("2026-06-05", "2026-07-04"));
    assert.equal(report.totalCents, 5000); // 20 + 30
  });

  it("orders categories by total descending and reconciles the grand total", async () => {
    await Entry.register(db, { amountRaw: "30", dateRaw: "2026-06-10", categoryName: "mercado" });
    await Entry.register(db, { amountRaw: "100", dateRaw: "2026-06-11", categoryName: "lazer" });
    await Entry.register(db, {
      amountRaw: "50",
      dateRaw: "2026-06-12",
      categoryName: "transporte",
    });
    const report = await Spending.byCategory(db, period("2026-06-05", "2026-07-04"));

    assert.deepEqual(
      report.byCategory.map((c) => c.categoryName),
      ["lazer", "transporte", "mercado"],
    );
    const summed = report.byCategory.reduce((acc, c) => acc + c.totalCents, 0);
    assert.equal(report.totalCents, summed);
    assert.equal(report.totalCents, 18000);
  });

  it("never lets income or transfers leak into the category report", async () => {
    await Entry.register(db, { amountRaw: "80", dateRaw: "2026-06-10", categoryName: "mercado" });
    await Entry.register(db, { typeRaw: "income", amountRaw: "5000", dateRaw: "2026-06-10" });
    await Entry.register(db, { typeRaw: "transfer", amountRaw: "1000", dateRaw: "2026-06-10" });
    const report = await Spending.byCategory(db, period("2026-06-05", "2026-07-04"));
    assert.equal(report.totalCents, 8000);
    assert.deepEqual(report.byCategory, [
      { categoryId: "cat-mercado", categoryName: "mercado", totalCents: 8000 },
    ]);
  });
});

describe("Spending.variableExpenseTotal", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it("returns 0 when there are no entries", async () => {
    assert.equal(await Spending.variableExpenseTotal(db, period("2026-06-05", "2026-07-04")), 0);
  });

  it("sums account expenses within the period, inclusive of boundaries", async () => {
    await Entry.register(db, { amountRaw: "10", dateRaw: "2026-06-04", categoryName: "mercado" }); // before
    await Entry.register(db, { amountRaw: "20", dateRaw: "2026-06-05", categoryName: "mercado" }); // from
    await Entry.register(db, { amountRaw: "30", dateRaw: "2026-07-04", categoryName: "mercado" }); // to
    await Entry.register(db, { amountRaw: "40", dateRaw: "2026-07-05", categoryName: "mercado" }); // after
    assert.equal(
      await Spending.variableExpenseTotal(db, period("2026-06-05", "2026-07-04")),
      5000, // 20 + 30
    );
  });

  it("excludes income, transfers, and credit-card expenses", async () => {
    await Entry.register(db, { amountRaw: "80", dateRaw: "2026-06-10", categoryName: "mercado" });
    await Entry.register(db, { typeRaw: "income", amountRaw: "5000", dateRaw: "2026-06-10" });
    await Entry.register(db, { typeRaw: "transfer", amountRaw: "1000", dateRaw: "2026-06-10" });
    await insertCreditCardExpense(db, 40000, "2026-06-10");
    assert.equal(
      await Spending.variableExpenseTotal(db, period("2026-06-05", "2026-07-04")),
      8000, // only the account expense
    );
  });
});
