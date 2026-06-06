import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Db } from "../db/client.ts";
import type { DB } from "../db/schema.ts";
import type { CreditCard as CreditCardT } from "../domain/credit-card.ts";
import { CreditCard } from "../domain/credit-card.ts";
import { Entry } from "../domain/entry.ts";
import { InstallmentPurchase } from "../domain/installment-purchase.ts";
import { Statement } from "../domain/statement.ts";
import type { IsoDate } from "../values/iso-date.ts";

const iso = (raw: string) => raw as IsoDate;

async function cardPurchase(db: DB, card: string, amount: string, date: string): Promise<void> {
  const result = await Entry.register(db, {
    amountRaw: amount,
    dateRaw: date,
    categoryName: "mercado",
    paymentMethodRaw: "creditCard",
    cardName: card,
  });
  assert.ok(result.ok);
}

describe("Statement", () => {
  let db: DB;
  let card: CreditCardT;
  beforeEach(async () => {
    db = Db.open(":memory:");
    await Db.migrate(db);
    const registered = await CreditCard.register(db, {
      name: "nubank",
      closingDayRaw: "28",
      dueDayRaw: "5",
    });
    assert.ok(registered.ok);
    card = registered.value;
  });
  afterEach(async () => {
    await db.destroy();
  });

  describe("forCardAt", () => {
    it("derives the amount from the purchases in the closing window", async () => {
      await cardPurchase(db, "nubank", "100", "2026-06-10");
      await cardPurchase(db, "nubank", "50.50", "2026-06-20");
      // Next statement (after the 28th close) — must not leak in.
      await cardPurchase(db, "nubank", "999", "2026-06-29");
      // Previous statement (closes on the 28th of May) — must not leak in.
      await cardPurchase(db, "nubank", "777", "2026-05-20");

      const statement = await Statement.forCardAt(db, card, iso("2026-06-15"));

      assert.equal(statement.closeOn, "2026-06-28");
      assert.equal(statement.dueOn, "2026-07-05");
      assert.equal(statement.amountCents, 15050);
      assert.equal(statement.purchases.length, 2);
      assert.deepEqual(
        statement.purchases.map((p) => p.occurredOn),
        ["2026-06-10", "2026-06-20"],
      );
    });

    it("returns an empty statement when the window has no purchases", async () => {
      const statement = await Statement.forCardAt(db, card, iso("2026-06-15"));
      assert.equal(statement.amountCents, 0);
      assert.equal(statement.purchases.length, 0);
      assert.equal(statement.dueOn, "2026-07-05");
    });

    it("includes a card installment occurrence that falls in the window", async () => {
      const purchase = await InstallmentPurchase.register(db, {
        amountRaw: "300",
        countRaw: "3",
        dayRaw: "15",
        categoryName: "mercado",
        startRaw: "2026-06-15",
        paymentMethodRaw: "creditCard",
        cardName: "nubank",
      });
      assert.ok(purchase.ok);

      const statement = await Statement.forCardAt(db, card, iso("2026-06-15"));
      assert.equal(statement.amountCents, 30000);
      assert.equal(statement.purchases.length, 1);
      assert.equal(statement.purchases[0]?.source, "installment");
    });
  });

  describe("dueWithin", () => {
    it("keeps statements whose due date falls in the range", async () => {
      await cardPurchase(db, "nubank", "100", "2026-06-10"); // due 2026-07-05
      const within = await Statement.dueWithin(db, {
        from: iso("2026-07-01"),
        to: iso("2026-07-31"),
      });
      assert.equal(within.length, 1);
      assert.equal(within[0]?.dueOn, "2026-07-05");
      assert.equal(within[0]?.amountCents, 10000);
    });

    it("excludes statements due outside the range", async () => {
      await cardPurchase(db, "nubank", "100", "2026-06-10"); // due 2026-07-05
      const within = await Statement.dueWithin(db, {
        from: iso("2026-06-01"),
        to: iso("2026-06-30"),
      });
      assert.equal(within.length, 0);
    });

    it("groups two cards' purchases into separate statements", async () => {
      const other = await CreditCard.register(db, {
        name: "itau",
        closingDayRaw: "10",
        dueDayRaw: "20",
      });
      assert.ok(other.ok);
      await cardPurchase(db, "nubank", "100", "2026-06-10"); // due 2026-07-05
      await cardPurchase(db, "itau", "40", "2026-06-05"); // closes 06-10, due 2026-06-20

      const within = await Statement.dueWithin(db, {
        from: iso("2026-06-01"),
        to: iso("2026-07-31"),
      });
      assert.equal(within.length, 2);
      assert.deepEqual(
        within.map((s) => [s.cardName, s.dueOn, s.amountCents]),
        [
          ["itau", "2026-06-20", 4000],
          ["nubank", "2026-07-05", 10000],
        ],
      );
    });

    it("ignores account purchases", async () => {
      await Entry.register(db, {
        amountRaw: "100",
        dateRaw: "2026-06-10",
        categoryName: "mercado",
      });
      const within = await Statement.dueWithin(db, {
        from: iso("2026-06-01"),
        to: iso("2026-08-31"),
      });
      assert.equal(within.length, 0);
    });
  });
});
