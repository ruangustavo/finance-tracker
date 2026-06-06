import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import { BalanceAnchor } from "../domain/balance-anchor.ts";
import type { EntryType, PaymentMethod } from "../domain/entry.ts";
import { RollingProjection } from "../domain/projection.ts";
import { RecurringDefinition } from "../domain/recurring-definition.ts";
import { IsoDate } from "../values/iso-date.ts";

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

const today = "2026-06-06" as IsoDate;

function pointAt(curve: RollingProjection["curve"], date: string): number {
  const point = curve.find((p) => p.date === date);
  assert.ok(point, `expected a curve point at ${date}`);
  return point.balanceCents;
}

describe("RollingProjection.compute", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it("fails when no anchor is set", async () => {
    const result = await RollingProjection.compute(db, {
      anchorDay: 5,
      today,
      cycles: 1,
      dailyBudgetCents: null,
    });
    assert.ok(!result.ok);
    assert.equal(result.error.kind, "NoAnchorSet");
  });

  it("projects a deterministic daily curve from anchor + recurring", async () => {
    await BalanceAnchor.set(db, { amountRaw: "3000", dateRaw: "2026-06-01" });
    await RecurringDefinition.register(db, {
      typeRaw: "expense",
      amountRaw: "1000",
      dayRaw: "10",
      categoryName: "moradia",
      startRaw: "2026-01-01",
    });

    const result = await RollingProjection.compute(db, {
      anchorDay: 5,
      today,
      cycles: 1,
      dailyBudgetCents: null,
    });
    assert.ok(result.ok);
    const { from, to, curve, cycleClose } = result.value;

    assert.equal(from, "2026-06-06");
    assert.equal(to, "2026-07-04"); // eve of next salary (anchorDay 5)
    assert.equal(curve[0]?.date, "2026-06-06");
    assert.equal(curve[0]?.balanceCents, 300000);
    assert.equal(pointAt(curve, "2026-06-09"), 300000);
    assert.equal(pointAt(curve, "2026-06-10"), 200000); // rent lands
    assert.equal(curve.at(-1)?.date, "2026-07-04");
    assert.equal(curve.at(-1)?.balanceCents, 200000);

    // one point per day: contiguous dates from `from` to `to`
    for (let i = 1; i < curve.length; i++) {
      assert.equal(curve[i]?.date, IsoDate.addDays(curve[i - 1]?.date as IsoDate, 1));
    }
    assert.equal(curve.at(-1)?.date, to);

    // cycle-close is the trough before the next salary
    assert.deepEqual(cycleClose, { date: "2026-06-10", balanceCents: 200000 });
  });

  it("extends the horizon over multiple cycles, repeating recurring", async () => {
    await BalanceAnchor.set(db, { amountRaw: "3000", dateRaw: "2026-06-01" });
    await RecurringDefinition.register(db, {
      typeRaw: "expense",
      amountRaw: "1000",
      dayRaw: "10",
      categoryName: "moradia",
      startRaw: "2026-01-01",
    });

    const result = await RollingProjection.compute(db, {
      anchorDay: 5,
      today,
      cycles: 2,
      dailyBudgetCents: null,
    });
    assert.ok(result.ok);
    const { to, curve, cycleClose } = result.value;

    assert.equal(to, "2026-08-04"); // current cycle end + 1 month
    assert.equal(pointAt(curve, "2026-06-10"), 200000); // first rent
    assert.equal(pointAt(curve, "2026-07-10"), 100000); // second rent
    assert.equal(curve.at(-1)?.balanceCents, 100000);
    // cycle-close still scoped to the current cycle (<= 2026-07-04)
    assert.deepEqual(cycleClose, { date: "2026-06-10", balanceCents: 200000 });
  });

  it("counts booked account entries without double-counting recurring", async () => {
    await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
    await insertEntry(db, {
      type: "expense",
      paymentMethod: "account",
      amountCents: 25000,
      occurredOn: "2026-06-08",
    });
    await RecurringDefinition.register(db, {
      typeRaw: "transfer", // investment on payday — subtracts, never an expense
      amountRaw: "200",
      dayRaw: "7",
      startRaw: "2026-01-01",
    });

    const result = await RollingProjection.compute(db, {
      anchorDay: 5,
      today,
      cycles: 1,
      dailyBudgetCents: null,
    });
    assert.ok(result.ok);
    const { curve } = result.value;

    assert.equal(pointAt(curve, "2026-06-06"), 100000);
    assert.equal(pointAt(curve, "2026-06-07"), 80000); // transfer -200
    assert.equal(pointAt(curve, "2026-06-08"), 55000); // expense -250
  });

  it("ignores credit-card entries (cash basis)", async () => {
    await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
    await insertEntry(db, {
      type: "expense",
      paymentMethod: "creditCard",
      amountCents: 40000,
      occurredOn: "2026-06-08",
    });

    const result = await RollingProjection.compute(db, {
      anchorDay: 5,
      today,
      cycles: 1,
      dailyBudgetCents: null,
    });
    assert.ok(result.ok);
    assert.equal(pointAt(result.value.curve, "2026-06-08"), 100000);
  });

  it("is stable against +/-1 day salary deposit variance", async () => {
    const run = async (salaryDate: string): Promise<RollingProjection> => {
      const scoped = Db.open(":memory:");
      await Db.migrate(scoped);
      await BalanceAnchor.set(scoped, { amountRaw: "3000", dateRaw: "2026-06-01" });
      await insertEntry(scoped, {
        type: "income",
        paymentMethod: "account",
        amountCents: 50000,
        occurredOn: salaryDate,
      });
      const result = await RollingProjection.compute(scoped, {
        anchorDay: 5,
        today,
        cycles: 1,
        dailyBudgetCents: null,
      });
      await scoped.destroy();
      assert.ok(result.ok);
      return result.value;
    };

    const early = await run("2026-06-04");
    const late = await run("2026-06-06");

    assert.equal(early.from, late.from);
    assert.equal(early.to, late.to);
    assert.deepEqual(early.cycleClose, late.cycleClose);
    assert.equal(early.curve.at(-1)?.balanceCents, late.curve.at(-1)?.balanceCents);
  });

  it("projects variable spend (pace) into future days of the curve", async () => {
    await BalanceAnchor.set(db, { amountRaw: "3000", dateRaw: "2026-06-01" });
    // prior window (2026-03-05..2026-06-04, 92 days): 9200 cents → priorDaily 100
    await insertEntry(db, {
      type: "expense",
      paymentMethod: "account",
      amountCents: 9200,
      occurredOn: "2026-04-10",
    });

    const result = await RollingProjection.compute(db, {
      anchorDay: 5,
      today,
      cycles: 1,
      dailyBudgetCents: null,
    });
    assert.ok(result.ok);
    const { curve, cycleClose, spendingPace } = result.value;

    // no current spend, no budget → effectivePrior = priorDaily = 100; w = 2/30
    // pace = round((28/30)*100) = 93
    assert.equal(spendingPace.priorDailyCents, 100);
    assert.equal(spendingPace.perDayCents, 93);

    // today is not reduced; every future day drops by exactly the pace
    assert.equal(pointAt(curve, "2026-06-06"), 300000);
    assert.equal(pointAt(curve, "2026-06-07"), 299907); // -93
    assert.equal(pointAt(curve, "2026-06-08"), 299814); // -93

    // monotonic decline → trough is the last day; 28 future days from 06-07..07-04
    assert.deepEqual(cycleClose, { date: "2026-07-04", balanceCents: 300000 - 93 * 28 });
  });
});
