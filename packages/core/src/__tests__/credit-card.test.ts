import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import { CreditCard } from "../domain/credit-card.ts";
import type { IsoDate } from "../values/iso-date.ts";

const iso = (raw: string) => raw as IsoDate;

function makeCard(closingDay: number, dueDay: number): CreditCard {
  return {
    id: "card-1",
    name: "nubank",
    closingDay,
    dueDay,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("CreditCard", () => {
  describe("closeOnFor", () => {
    const card28 = makeCard(28, 5);
    const card10 = makeCard(10, 20);
    const cases: ReadonlyArray<{ card: CreditCard; date: string; expected: string }> = [
      { card: card28, date: "2026-06-10", expected: "2026-06-28" },
      { card: card28, date: "2026-06-28", expected: "2026-06-28" }, // on the closing day → this cycle
      { card: card28, date: "2026-06-29", expected: "2026-07-28" },
      { card: card28, date: "2026-07-01", expected: "2026-07-28" },
      { card: card10, date: "2026-06-05", expected: "2026-06-10" },
      { card: card10, date: "2026-06-10", expected: "2026-06-10" },
      { card: card10, date: "2026-06-11", expected: "2026-07-10" },
      { card: card28, date: "2026-12-30", expected: "2027-01-28" }, // year rollover
    ];
    for (const { card, date, expected } of cases) {
      it(`maps ${date} (closing ${card.closingDay}) to ${expected}`, () => {
        assert.equal(CreditCard.closeOnFor(card, iso(date)), expected);
      });
    }
  });

  describe("dueOnFor", () => {
    const cases: ReadonlyArray<{ card: CreditCard; closeOn: string; expected: string }> = [
      { card: makeCard(28, 5), closeOn: "2026-06-28", expected: "2026-07-05" }, // due < closing → next month
      { card: makeCard(10, 20), closeOn: "2026-06-10", expected: "2026-06-20" }, // due > closing → same month
      { card: makeCard(28, 28), closeOn: "2026-06-28", expected: "2026-07-28" }, // equal → next month
      { card: makeCard(28, 5), closeOn: "2026-12-28", expected: "2027-01-05" }, // year rollover
    ];
    for (const { card, closeOn, expected } of cases) {
      it(`maps close ${closeOn} (due ${card.dueDay}) to ${expected}`, () => {
        assert.equal(CreditCard.dueOnFor(card, iso(closeOn)), expected);
      });
    }
  });

  describe("register", () => {
    let db: DB;
    beforeEach(async () => {
      db = Db.open(":memory:");
      await Db.migrate(db);
    });
    afterEach(async () => {
      await db.destroy();
    });

    it("registers a card with closing and due days", async () => {
      const result = await CreditCard.register(db, {
        name: "nubank",
        closingDayRaw: "28",
        dueDayRaw: "5",
      });
      assert.ok(result.ok);
      assert.equal(result.value.name, "nubank");
      assert.equal(result.value.closingDay, 28);
      assert.equal(result.value.dueDay, 5);
      assert.match(result.value.id, /^[0-9a-f-]{36}$/);
    });

    it("rejects an empty name", async () => {
      const result = await CreditCard.register(db, {
        name: "   ",
        closingDayRaw: "28",
        dueDayRaw: "5",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "CardNameRequired");
    });

    it("rejects a closing day outside 1-28", async () => {
      const result = await CreditCard.register(db, {
        name: "nubank",
        closingDayRaw: "31",
        dueDayRaw: "5",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidAnchorDay");
    });

    it("rejects a duplicate card name", async () => {
      await CreditCard.register(db, { name: "nubank", closingDayRaw: "28", dueDayRaw: "5" });
      const result = await CreditCard.register(db, {
        name: "nubank",
        closingDayRaw: "10",
        dueDayRaw: "20",
      });
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "DuplicateCard");
    });

    it("finds a registered card by name", async () => {
      await CreditCard.register(db, { name: "nubank", closingDayRaw: "28", dueDayRaw: "5" });
      const found = await CreditCard.findByName(db, "nubank");
      assert.ok(found.ok);
      assert.equal(found.value.closingDay, 28);
    });

    it("reports an unknown card", async () => {
      const found = await CreditCard.findByName(db, "ghost");
      assert.ok(!found.ok);
      assert.equal(found.error.kind, "UnknownCard");
    });
  });
});
