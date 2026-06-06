import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IsoDate } from "../values/iso-date.ts";
import { PayCycle } from "../values/pay-cycle.ts";

describe("PayCycle.current", () => {
  const cases: ReadonlyArray<{ today: string; anchorDay: number; from: string; to: string }> = [
    { today: "2026-06-06", anchorDay: 5, from: "2026-06-05", to: "2026-07-04" }, // after anchor
    { today: "2026-06-05", anchorDay: 5, from: "2026-06-05", to: "2026-07-04" }, // on anchor
    { today: "2026-06-03", anchorDay: 5, from: "2026-05-05", to: "2026-06-04" }, // before anchor
    { today: "2026-01-03", anchorDay: 5, from: "2025-12-05", to: "2026-01-04" }, // year boundary
    { today: "2026-02-15", anchorDay: 28, from: "2026-01-28", to: "2026-02-27" }, // short month
  ];

  for (const { today, anchorDay, from, to } of cases) {
    it(`${today} (anchor ${anchorDay}) → ${from}..${to}`, () => {
      const cycle = PayCycle.current(anchorDay, today as IsoDate);
      assert.equal(cycle.from, from);
      assert.equal(cycle.to, to);
    });
  }
});

describe("PayCycle.parseAnchorDay", () => {
  for (const raw of ["1", "5", "28"]) {
    it(`accepts ${raw}`, () => {
      const result = PayCycle.parseAnchorDay(raw);
      assert.ok(result.ok);
      assert.equal(result.value, Number(raw));
    });
  }

  for (const raw of ["0", "29", "31", "abc", "5.5", "-5", ""]) {
    it(`rejects ${JSON.stringify(raw)}`, () => {
      const result = PayCycle.parseAnchorDay(raw);
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidAnchorDay");
    });
  }
});
