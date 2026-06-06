import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import { AffordabilityCheck } from "../domain/affordability-check.ts";
import { BalanceAnchor } from "../domain/balance-anchor.ts";
import { BalanceStatus } from "../domain/balance-status.ts";
import { RecurringDefinition } from "../domain/recurring-definition.ts";
import type { IsoDate } from "../values/iso-date.ts";

const today = "2026-06-06" as IsoDate;

const base = {
  anchorDay: 5,
  today,
  installments: null,
  floor: "tight" as BalanceStatus,
  dailyBudgetCents: null,
  horizonCycles: 12,
} as const;

describe("AffordabilityCheck.evaluate — à vista", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it("fails when no anchor is set", async () => {
    const result = await AffordabilityCheck.evaluate(db, { ...base, amountCents: 80_000 });
    assert.ok(!result.ok);
    assert.equal(result.error.kind, "NoAnchorSet");
  });

  it("reports 'already' when the purchase fits today without dropping the floor", async () => {
    await BalanceAnchor.set(db, { amountRaw: "3000", dateRaw: "2026-06-01" });
    const result = await AffordabilityCheck.evaluate(db, { ...base, amountCents: 80_000 });
    assert.ok(result.ok);
    assert.equal(result.value.mode, "cash");
    assert.ok(result.value.mode === "cash" && result.value.affordable);
    assert.equal(result.value.already, true);
    assert.equal(result.value.earliest, today);
    assert.equal(result.value.troughCents, 220_000);
    assert.equal(result.value.status, "healthy");
  });

  it("finds the earliest future date once a salary lifts the trough", async () => {
    await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
    await RecurringDefinition.register(db, {
      typeRaw: "income",
      amountRaw: "2000",
      dayRaw: "20",
      startRaw: "2026-06-01",
    });
    const result = await AffordabilityCheck.evaluate(db, { ...base, amountCents: 250_000 });
    assert.ok(result.ok);
    assert.ok(result.value.mode === "cash" && result.value.affordable);
    assert.equal(result.value.already, false);
    assert.equal(result.value.earliest, "2026-06-20");
    assert.equal(result.value.troughCents, 50_000);
    assert.equal(result.value.status, "tight");
  });

  it("is not affordable within the horizon for an oversized purchase", async () => {
    await BalanceAnchor.set(db, { amountRaw: "3000", dateRaw: "2026-06-01" });
    const result = await AffordabilityCheck.evaluate(db, { ...base, amountCents: 500_000 });
    assert.ok(result.ok);
    assert.ok(result.value.mode === "cash" && !result.value.affordable);
    assert.equal(result.value.floor, "tight");
    assert.ok(result.value.horizonEnd > today);
  });

  it("honours a stricter floor override", async () => {
    await BalanceAnchor.set(db, { amountRaw: "3000", dateRaw: "2026-06-01" });
    const lenient = await AffordabilityCheck.evaluate(db, { ...base, amountCents: 250_000 });
    assert.ok(lenient.ok && lenient.value.mode === "cash" && lenient.value.affordable);

    const strict = await AffordabilityCheck.evaluate(db, {
      ...base,
      amountCents: 250_000,
      floor: "comfortable",
    });
    assert.ok(strict.ok && strict.value.mode === "cash" && !strict.value.affordable);
  });
});

describe("AffordabilityCheck.evaluate — parcelado", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it("fits when the installments stay out of the red, splitting the remainder onto the last", async () => {
    await BalanceAnchor.set(db, { amountRaw: "3000", dateRaw: "2026-06-01" });
    const result = await AffordabilityCheck.evaluate(db, {
      ...base,
      amountCents: 100_000,
      installments: 3,
    });
    assert.ok(result.ok);
    assert.ok(result.value.mode === "installment");
    assert.equal(result.value.fits, true);
    assert.equal(result.value.count, 3);
    assert.equal(result.value.perInstallmentCents, 33_333);
    assert.deepEqual(
      result.value.charges.map((c) => c.date),
      ["2026-06-06", "2026-07-06", "2026-08-06"],
    );
    assert.equal(result.value.charges.at(-1)?.amountCents, 33_334);
    assert.equal(
      result.value.charges.reduce((sum, c) => sum + c.amountCents, 0),
      100_000,
    );
  });

  it("does not fit when the installments push the balance into the red", async () => {
    await BalanceAnchor.set(db, { amountRaw: "1000", dateRaw: "2026-06-01" });
    const result = await AffordabilityCheck.evaluate(db, {
      ...base,
      amountCents: 300_000,
      installments: 3,
    });
    assert.ok(result.ok);
    assert.ok(result.value.mode === "installment");
    assert.equal(result.value.fits, false);
    assert.ok(result.value.trough.balanceCents < 0);
    assert.ok(BalanceStatus.atLeast(result.value.status, "tight") === false);
  });
});

describe("BalanceStatus ordering + parsing", () => {
  it("ranks bands with atLeast", () => {
    assert.equal(BalanceStatus.atLeast("healthy", "tight"), true);
    assert.equal(BalanceStatus.atLeast("tight", "tight"), true);
    assert.equal(BalanceStatus.atLeast("negative", "tight"), false);
  });

  it("parses a band or rejects an unknown one", () => {
    const ok = BalanceStatus.parse("comfortable");
    assert.ok(ok.ok);
    assert.equal(ok.value, "comfortable");

    const bad = BalanceStatus.parse("bogus");
    assert.ok(!bad.ok);
    assert.equal(bad.error.kind, "InvalidStatus");
  });
});
