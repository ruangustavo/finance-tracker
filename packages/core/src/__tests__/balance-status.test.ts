import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BalanceStatusThresholds, BalanceStatus as Status } from "../domain/balance-status.ts";
import { BalanceStatus } from "../domain/balance-status.ts";

describe("BalanceStatus.classify", () => {
  const cases: ReadonlyArray<[number, Status]> = [
    [1_000_000, "healthy"],
    [200_001, "healthy"],
    [200_000, "comfortable"],
    [100_001, "comfortable"],
    [100_000, "tight"],
    [1, "tight"],
    [0, "negative"],
    [-49_999, "negative"],
    [-50_000, "critical"],
    [-1_000_000, "critical"],
  ];

  for (const [cents, expected] of cases) {
    it(`classifies ${cents} as ${expected}`, () => {
      assert.equal(BalanceStatus.classify(cents), expected);
    });
  }

  it("honors custom thresholds", () => {
    const thresholds: BalanceStatusThresholds = {
      healthyCents: 1_000,
      comfortableCents: 500,
      tightCents: 0,
      negativeCents: -100,
    };
    assert.equal(BalanceStatus.classify(1_001, thresholds), "healthy");
    assert.equal(BalanceStatus.classify(1_000, thresholds), "comfortable");
    assert.equal(BalanceStatus.classify(0, thresholds), "negative");
    assert.equal(BalanceStatus.classify(-100, thresholds), "critical");
  });
});
