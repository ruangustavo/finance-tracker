import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import type { RecurringDefinition as Def, Occurrence } from "../domain/recurring-definition.ts";
import { RecurringDefinition } from "../domain/recurring-definition.ts";
import { IsoDate } from "../values/iso-date.ts";

const period = (from: string, to: string) => ({ from: from as IsoDate, to: to as IsoDate });

function makeDef(overrides: Partial<Def>): Def {
  return {
    id: "def-1",
    type: "income",
    categoryId: null,
    amountCents: 1000,
    dayOfMonth: 10,
    startsOn: "2026-01-01",
    endsOn: null,
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const dates = (occurrences: readonly Occurrence[]): readonly string[] =>
  occurrences.map((o) => o.occurredOn);

describe("RecurringDefinition", () => {
  let db: DB;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
  });
  afterEach(async () => {
    await db.destroy();
  });

  describe("register", () => {
    it("records an open-ended recurring income (no category)", async () => {
      const result = await RecurringDefinition.register(db, {
        typeRaw: "income",
        amountRaw: "5000",
        dayRaw: "5",
      });
      assert.ok(result.ok);
      assert.equal(result.value.type, "income");
      assert.equal(result.value.categoryId, null);
      assert.equal(result.value.amountCents, 500000);
      assert.equal(result.value.dayOfMonth, 5);
      assert.equal(result.value.endsOn, null);
      assert.equal(result.value.startsOn, IsoDate.today());
    });

    it("records a recurring expense bound to a category", async () => {
      const result = await RecurringDefinition.register(db, {
        typeRaw: "expense",
        amountRaw: "1800",
        dayRaw: "10",
        categoryName: "moradia",
      });
      assert.ok(result.ok);
      assert.equal(result.value.type, "expense");
      assert.equal(result.value.categoryId, "cat-moradia");
    });

    it("records a recurring transfer (no category)", async () => {
      const result = await RecurringDefinition.register(db, {
        typeRaw: "transfer",
        amountRaw: "500",
        dayRaw: "5",
      });
      assert.ok(result.ok);
      assert.equal(result.value.type, "transfer");
      assert.equal(result.value.categoryId, null);
    });

    it("honours an explicit start date", async () => {
      const result = await RecurringDefinition.register(db, {
        typeRaw: "income",
        amountRaw: "5000",
        dayRaw: "5",
        startRaw: "2026-03-01",
      });
      assert.ok(result.ok);
      assert.equal(result.value.startsOn, "2026-03-01");
    });

    it("rejects a non-positive amount", async () => {
      const result = await RecurringDefinition.register(db, {
        typeRaw: "income",
        amountRaw: "0",
        dayRaw: "5",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidAmount");
    });

    it("rejects a day outside 1-28", async () => {
      const result = await RecurringDefinition.register(db, {
        typeRaw: "income",
        amountRaw: "5000",
        dayRaw: "30",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidAnchorDay");
    });

    it("rejects an invalid entry type", async () => {
      const result = await RecurringDefinition.register(db, {
        typeRaw: "nonsense",
        amountRaw: "5000",
        dayRaw: "5",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidEntryType");
    });

    it("requires a category for expenses", async () => {
      const result = await RecurringDefinition.register(db, {
        typeRaw: "expense",
        amountRaw: "1800",
        dayRaw: "10",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "CategoryRequired");
    });

    it("rejects an unknown category", async () => {
      const result = await RecurringDefinition.register(db, {
        typeRaw: "expense",
        amountRaw: "1800",
        dayRaw: "10",
        categoryName: "inexistente",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "UnknownCategory");
    });
  });

  describe("expand", () => {
    it("emits one occurrence per month on the day-of-month", () => {
      const def = makeDef({ dayOfMonth: 10, startsOn: "2026-01-01" });
      const occurrences = RecurringDefinition.expand(def, period("2026-01-01", "2026-03-31"));
      assert.deepEqual(dates(occurrences), ["2026-01-10", "2026-02-10", "2026-03-10"]);
    });

    it("skips occurrences before startsOn", () => {
      const def = makeDef({ dayOfMonth: 10, startsOn: "2026-02-15" });
      const occurrences = RecurringDefinition.expand(def, period("2026-01-01", "2026-04-30"));
      assert.deepEqual(dates(occurrences), ["2026-03-10", "2026-04-10"]);
    });

    it("skips occurrences after endsOn", () => {
      const def = makeDef({ dayOfMonth: 10, startsOn: "2026-01-01", endsOn: "2026-03-20" });
      const occurrences = RecurringDefinition.expand(def, period("2026-01-01", "2026-06-30"));
      assert.deepEqual(dates(occurrences), ["2026-01-10", "2026-02-10", "2026-03-10"]);
    });

    it("clips to a range narrower than the active window", () => {
      const def = makeDef({ dayOfMonth: 10, startsOn: "2026-01-01" });
      const occurrences = RecurringDefinition.expand(def, period("2026-03-05", "2026-04-09"));
      assert.deepEqual(dates(occurrences), ["2026-03-10"]);
    });
  });

  describe("occurrences", () => {
    it("merges definitions and sorts by date", async () => {
      await RecurringDefinition.register(db, {
        typeRaw: "income",
        amountRaw: "5000",
        dayRaw: "20",
        startRaw: "2026-01-01",
      });
      await RecurringDefinition.register(db, {
        typeRaw: "expense",
        amountRaw: "1800",
        dayRaw: "5",
        categoryName: "moradia",
        startRaw: "2026-01-01",
      });

      const occurrences = await RecurringDefinition.occurrences(
        db,
        period("2026-03-01", "2026-03-31"),
      );
      assert.deepEqual(dates(occurrences), ["2026-03-05", "2026-03-20"]);
    });
  });

  describe("edit (future-only)", () => {
    it("keeps past occurrences at the old value and applies new value going forward", async () => {
      const registered = await RecurringDefinition.register(db, {
        typeRaw: "income",
        amountRaw: "5000",
        dayRaw: "15",
        startRaw: "2000-01-01",
      });
      assert.ok(registered.ok);

      const edited = await RecurringDefinition.edit(db, {
        id: registered.value.id,
        amountRaw: "6000",
      });
      assert.ok(edited.ok);

      const today = IsoDate.today();
      assert.equal(edited.value.amountCents, 600000);
      assert.equal(edited.value.startsOn, IsoDate.addDays(today, 1));

      const original = await RecurringDefinition.getById(db, registered.value.id);
      assert.ok(original.ok);
      assert.equal(original.value.endsOn, today);

      const all = await RecurringDefinition.list(db);
      assert.equal(all.length, 2);

      const occurrences = await RecurringDefinition.occurrences(
        db,
        period("2000-01-01", "2100-01-01"),
      );
      const past = occurrences.filter((o) => o.occurredOn <= today);
      const future = occurrences.filter((o) => o.occurredOn > today);
      assert.ok(past.length > 0);
      assert.ok(future.length > 0);
      assert.ok(past.every((o) => o.amountCents === 500000));
      assert.ok(future.every((o) => o.amountCents === 600000));

      const distinctDates = new Set(occurrences.map((o) => o.occurredOn));
      assert.equal(distinctDates.size, occurrences.length);
    });
  });

  describe("cancel (future-only)", () => {
    it("stops occurrences after today but keeps earlier ones", async () => {
      const registered = await RecurringDefinition.register(db, {
        typeRaw: "income",
        amountRaw: "5000",
        dayRaw: "15",
        startRaw: "2000-01-01",
      });
      assert.ok(registered.ok);

      const cancelled = await RecurringDefinition.cancel(db, registered.value.id);
      assert.ok(cancelled.ok);

      const today = IsoDate.today();
      assert.equal(cancelled.value.endsOn, today);

      const occurrences = await RecurringDefinition.occurrences(
        db,
        period("2000-01-01", "2100-01-01"),
      );
      assert.ok(occurrences.length > 0);
      assert.ok(occurrences.every((o) => o.occurredOn <= today));
    });

    it("reports a missing definition", async () => {
      const result = await RecurringDefinition.cancel(db, "missing");
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "RecurringNotFound");
    });
  });
});
