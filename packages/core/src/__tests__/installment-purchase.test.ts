import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { format, parse as parseDate, setDate, subMonths } from "date-fns";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import type {
  Installment,
  InstallmentPurchase as Purchase,
} from "../domain/installment-purchase.ts";
import { InstallmentPurchase } from "../domain/installment-purchase.ts";
import { IsoDate } from "../values/iso-date.ts";

const FORMAT = "yyyy-MM-dd";
const REFERENCE = new Date(0);

const period = (from: string, to: string) => ({ from: from as IsoDate, to: to as IsoDate });

function makePurchase(overrides: Partial<Purchase>): Purchase {
  return {
    id: "ip-1",
    categoryId: "cat-moradia",
    amountCents: 20000,
    count: 12,
    dayOfMonth: 10,
    firstChargeOn: "2026-01-10",
    startsOn: "2026-01-10",
    endsOn: null,
    paymentMethod: "account",
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const dates = (installments: readonly Installment[]): readonly string[] =>
  installments.map((i) => i.occurredOn);

describe("InstallmentPurchase", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  describe("register", () => {
    it("records an installment purchase bound to a category", async () => {
      const result = await InstallmentPurchase.register(db, {
        amountRaw: "200",
        countRaw: "12",
        categoryName: "moradia",
        startRaw: "2026-06-10",
      });
      assert.ok(result.ok);
      assert.equal(result.value.categoryId, "cat-moradia");
      assert.equal(result.value.amountCents, 20000);
      assert.equal(result.value.count, 12);
      assert.equal(result.value.dayOfMonth, 10);
      assert.equal(result.value.firstChargeOn, "2026-06-10");
      assert.equal(result.value.startsOn, "2026-06-10");
      assert.equal(result.value.endsOn, null);
      assert.equal(result.value.paymentMethod, "account");
    });

    it("derives the day-of-month from the start date when --day is omitted", async () => {
      const result = await InstallmentPurchase.register(db, {
        amountRaw: "200",
        countRaw: "6",
        categoryName: "moradia",
        startRaw: "2026-06-15",
      });
      assert.ok(result.ok);
      assert.equal(result.value.dayOfMonth, 15);
      assert.equal(result.value.firstChargeOn, "2026-06-15");
    });

    it("honours an explicit day, anchoring the first charge on or after the start", async () => {
      const result = await InstallmentPurchase.register(db, {
        amountRaw: "200",
        countRaw: "6",
        dayRaw: "5",
        categoryName: "moradia",
        startRaw: "2026-06-20",
      });
      assert.ok(result.ok);
      assert.equal(result.value.dayOfMonth, 5);
      // the 5th of June is before the start (20th), so installment #1 is the 5th of July
      assert.equal(result.value.firstChargeOn, "2026-07-05");
    });

    it("defaults the start date to today", async () => {
      const result = await InstallmentPurchase.register(db, {
        amountRaw: "200",
        countRaw: "6",
        categoryName: "moradia",
      });
      assert.ok(result.ok);
      assert.equal(result.value.firstChargeOn, IsoDate.today());
    });

    it("rejects a non-positive amount", async () => {
      const result = await InstallmentPurchase.register(db, {
        amountRaw: "0",
        countRaw: "12",
        categoryName: "moradia",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidAmount");
    });

    it("rejects a count below 1", async () => {
      const result = await InstallmentPurchase.register(db, {
        amountRaw: "200",
        countRaw: "0",
        categoryName: "moradia",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidCount");
    });

    it("rejects a non-numeric count", async () => {
      const result = await InstallmentPurchase.register(db, {
        amountRaw: "200",
        countRaw: "doze",
        categoryName: "moradia",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidCount");
    });

    it("rejects a day outside 1-28", async () => {
      const result = await InstallmentPurchase.register(db, {
        amountRaw: "200",
        countRaw: "12",
        dayRaw: "30",
        categoryName: "moradia",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidAnchorDay");
    });

    it("requires a category", async () => {
      const result = await InstallmentPurchase.register(db, {
        amountRaw: "200",
        countRaw: "12",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "CategoryRequired");
    });

    it("rejects an unknown category", async () => {
      const result = await InstallmentPurchase.register(db, {
        amountRaw: "200",
        countRaw: "12",
        categoryName: "inexistente",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "UnknownCategory");
    });
  });

  describe("expand", () => {
    it("emits exactly N monthly installments numbered index/total", () => {
      const purchase = makePurchase({ count: 12, dayOfMonth: 10, firstChargeOn: "2026-01-10" });
      const installments = InstallmentPurchase.expand(purchase, period("2026-01-01", "2027-12-31"));
      assert.equal(installments.length, 12);
      assert.equal(installments[0]?.occurredOn, "2026-01-10");
      assert.equal(installments[0]?.index, 1);
      assert.equal(installments[0]?.total, 12);
      assert.equal(installments.at(-1)?.occurredOn, "2026-12-10");
      assert.equal(installments.at(-1)?.index, 12);
      assert.deepEqual(
        installments.map((i) => i.index),
        Array.from({ length: 12 }, (_, k) => k + 1),
      );
    });

    it("clips to a range narrower than the span, keeping correct indices", () => {
      const purchase = makePurchase({ count: 12, dayOfMonth: 10, firstChargeOn: "2026-01-10" });
      const installments = InstallmentPurchase.expand(purchase, period("2026-03-05", "2026-04-30"));
      assert.deepEqual(dates(installments), ["2026-03-10", "2026-04-10"]);
      assert.deepEqual(
        installments.map((i) => i.index),
        [3, 4],
      );
    });

    it("never emits beyond the natural last installment", () => {
      const purchase = makePurchase({ count: 3, dayOfMonth: 10, firstChargeOn: "2026-01-10" });
      const installments = InstallmentPurchase.expand(purchase, period("2026-01-01", "2027-12-31"));
      assert.deepEqual(dates(installments), ["2026-01-10", "2026-02-10", "2026-03-10"]);
    });
  });

  describe("installments", () => {
    it("merges purchases and sorts by date", async () => {
      await InstallmentPurchase.register(db, {
        amountRaw: "200",
        countRaw: "3",
        dayRaw: "20",
        categoryName: "moradia",
        startRaw: "2026-01-20",
      });
      await InstallmentPurchase.register(db, {
        amountRaw: "100",
        countRaw: "3",
        dayRaw: "5",
        categoryName: "mercado",
        startRaw: "2026-01-05",
      });

      const installments = await InstallmentPurchase.installments(
        db,
        period("2026-03-01", "2026-03-31"),
      );
      assert.deepEqual(dates(installments), ["2026-03-05", "2026-03-20"]);
    });
  });

  describe("edit (remaining-only)", () => {
    it("keeps paid installments at the old amount and applies the new amount to the rest", async () => {
      const today = IsoDate.today();
      const start = format(setDate(subMonths(parseDate(today, FORMAT, REFERENCE), 3), 10), FORMAT);

      const registered = await InstallmentPurchase.register(db, {
        amountRaw: "200",
        countRaw: "8",
        categoryName: "moradia",
        startRaw: start,
      });
      assert.ok(registered.ok);

      const edited = await InstallmentPurchase.edit(db, {
        id: registered.value.id,
        amountRaw: "250",
      });
      assert.ok(edited.ok);
      assert.equal(edited.value.amountCents, 25000);
      assert.equal(edited.value.startsOn, IsoDate.addDays(today, 1));
      assert.equal(edited.value.firstChargeOn, registered.value.firstChargeOn);
      assert.equal(edited.value.count, 8);

      const original = await InstallmentPurchase.getById(db, registered.value.id);
      assert.ok(original.ok);
      assert.equal(original.value.endsOn, today);

      const installments = await InstallmentPurchase.installments(db, period(start, "2100-01-01"));

      // dates and count are untouched by the edit
      assert.equal(installments.length, 8);
      const distinctDates = new Set(installments.map((i) => i.occurredOn));
      assert.equal(distinctDates.size, installments.length);
      assert.deepEqual(
        installments.map((i) => i.index),
        Array.from({ length: 8 }, (_, k) => k + 1),
      );
      assert.ok(installments.every((i) => i.total === 8));

      const paid = installments.filter((i) => i.occurredOn <= today);
      const remaining = installments.filter((i) => i.occurredOn > today);
      assert.ok(paid.length > 0);
      assert.ok(remaining.length > 0);
      assert.ok(paid.every((i) => i.amountCents === 20000));
      assert.ok(remaining.every((i) => i.amountCents === 25000));
    });
  });

  describe("cancel (remaining-only)", () => {
    it("stops future installments but keeps the paid ones", async () => {
      const today = IsoDate.today();
      const start = format(setDate(subMonths(parseDate(today, FORMAT, REFERENCE), 3), 10), FORMAT);

      const registered = await InstallmentPurchase.register(db, {
        amountRaw: "200",
        countRaw: "8",
        categoryName: "moradia",
        startRaw: start,
      });
      assert.ok(registered.ok);

      const cancelled = await InstallmentPurchase.cancel(db, registered.value.id);
      assert.ok(cancelled.ok);
      assert.equal(cancelled.value.endsOn, today);

      const installments = await InstallmentPurchase.installments(db, period(start, "2100-01-01"));
      assert.ok(installments.length > 0);
      assert.ok(installments.every((i) => i.occurredOn <= today));
      // fewer than the original 8: the future ones are gone
      assert.ok(installments.length < 8);
    });

    it("reports a missing purchase", async () => {
      const result = await InstallmentPurchase.cancel(db, "missing");
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InstallmentPurchaseNotFound");
    });
  });
});
