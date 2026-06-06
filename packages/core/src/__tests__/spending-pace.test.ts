import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import { Entry } from "../domain/entry.ts";
import { SpendingPace } from "../domain/spending-pace.ts";
import type { IsoDate } from "../values/iso-date.ts";

async function expense(db: DB, amountRaw: string, dateRaw: string): Promise<void> {
  const result = await Entry.register(db, { amountRaw, dateRaw, categoryName: "mercado" });
  assert.ok(result.ok);
}

// current cycle for anchor 5 is 2026-06-05..2026-07-04 (length 30);
// the 3-cycle prior window is 2026-03-05..2026-06-04 (92 days).

describe("SpendingPace.compute", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it("anchors on prior cycles early in the cycle", async () => {
    // prior window: 18400 over 92 days = 200/day (two entries — proves window-day division)
    await expense(db, "100", "2026-04-10");
    await expense(db, "84", "2026-05-10");
    // current cycle: nothing spent yet

    const pace = await SpendingPace.compute(db, {
      anchorDay: 5,
      today: "2026-06-06" as IsoDate,
      dailyBudgetCents: null,
    });

    assert.equal(pace.priorDailyCents, 200);
    assert.equal(pace.currentDailyCents, 0);
    assert.ok(Math.abs(pace.weight - 2 / 30) < 1e-9);
    assert.equal(pace.perDayCents, 187); // (28/30)*200 ≈ 186.67
    assert.equal(pace.dailyBudgetCents, null);
  });

  it("migrates to current actuals late in the cycle", async () => {
    await expense(db, "100", "2026-04-10");
    await expense(db, "84", "2026-05-10"); // prior 200/day
    await expense(db, "50", "2026-06-10");
    await expense(db, "37", "2026-07-01"); // current: 8700 over 29 days = 300/day

    const pace = await SpendingPace.compute(db, {
      anchorDay: 5,
      today: "2026-07-03" as IsoDate,
      dailyBudgetCents: null,
    });

    assert.equal(pace.priorDailyCents, 200);
    assert.equal(pace.currentDailyCents, 300);
    assert.ok(Math.abs(pace.weight - 29 / 30) < 1e-9);
    assert.equal(pace.perDayCents, 297); // (1/30)*200 + (29/30)*300 ≈ 296.67
  });

  it("falls back to the daily budget as prior anchor on cold start", async () => {
    await expense(db, "60", "2026-06-06"); // current: 6000 over 2 days = 3000/day

    const pace = await SpendingPace.compute(db, {
      anchorDay: 5,
      today: "2026-06-06" as IsoDate,
      dailyBudgetCents: 5000,
    });

    assert.equal(pace.priorDailyCents, null);
    assert.equal(pace.currentDailyCents, 3000);
    assert.equal(pace.dailyBudgetCents, 5000);
    assert.equal(pace.perDayCents, 4867); // (28/30)*5000 + (2/30)*3000 ≈ 4866.67
  });

  it("uses current actuals when there is no prior history and no budget", async () => {
    await expense(db, "60", "2026-06-06"); // current: 3000/day

    const pace = await SpendingPace.compute(db, {
      anchorDay: 5,
      today: "2026-06-06" as IsoDate,
      dailyBudgetCents: null,
    });

    assert.equal(pace.priorDailyCents, null);
    assert.equal(pace.currentDailyCents, 3000);
    assert.equal(pace.perDayCents, 3000); // prior == current, blend is flat
  });
});
