import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Money } from "../values/money.ts";

describe("Money.parse", () => {
  const accepts: ReadonlyArray<[string, number]> = [
    ["80", 8000],
    ["80.5", 8050],
    ["80.50", 8050],
    ["0.01", 1],
    [" 80 ", 8000],
  ];
  for (const [raw, cents] of accepts) {
    it(`parses ${JSON.stringify(raw)} -> ${cents} cents`, () => {
      const result = Money.parse(raw);
      assert.ok(result.ok);
      assert.equal(result.value.cents, cents);
    });
  }

  const rejects: readonly string[] = ["0", "-80", "abc", "80.123", "", "1,50"];
  for (const raw of rejects) {
    it(`rejects ${JSON.stringify(raw)}`, () => {
      const result = Money.parse(raw);
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidAmount");
    });
  }
});

describe("Money.format", () => {
  const NBSP = " ";
  it("formats cents in Brazilian currency format", () => {
    assert.equal(Money.format({ cents: 8050 }), `R$${NBSP}80,50`);
    assert.equal(Money.format({ cents: 100 }), `R$${NBSP}1,00`);
    assert.equal(Money.format({ cents: 1 }), `R$${NBSP}0,01`);
    assert.equal(Money.format({ cents: 123456789 }), `R$${NBSP}1.234.567,89`);
  });
});
