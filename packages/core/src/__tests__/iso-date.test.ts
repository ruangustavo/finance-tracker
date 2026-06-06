import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IsoDate } from "../values/iso-date.ts";

describe("IsoDate.parse", () => {
  const accepts: readonly string[] = ["2026-06-05", "2024-02-29", "2000-01-01"];
  for (const raw of accepts) {
    it(`accepts ${raw}`, () => {
      const result = IsoDate.parse(raw);
      assert.ok(result.ok);
      assert.equal(result.value, raw);
    });
  }

  const rejects: readonly string[] = [
    "2023-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "26-06-05",
    "2026/06/05",
    "not-a-date",
    "",
  ];
  for (const raw of rejects) {
    it(`rejects ${JSON.stringify(raw)}`, () => {
      const result = IsoDate.parse(raw);
      assert.ok(!result.ok);
      assert.equal(result.error.kind, "InvalidDate");
    });
  }
});

describe("IsoDate.today", () => {
  it("returns a YYYY-MM-DD string", () => {
    assert.match(IsoDate.today(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("IsoDate.daysBetween", () => {
  const cases: ReadonlyArray<{ from: string; to: string; days: number }> = [
    { from: "2026-06-05", to: "2026-06-05", days: 0 },
    { from: "2026-06-05", to: "2026-06-06", days: 1 },
    { from: "2026-06-05", to: "2026-07-04", days: 29 },
    { from: "2026-06-06", to: "2026-06-05", days: -1 },
    { from: "2025-12-31", to: "2026-01-01", days: 1 },
  ];

  for (const { from, to, days } of cases) {
    it(`${from} → ${to} is ${days} days`, () => {
      assert.equal(IsoDate.daysBetween(from as IsoDate, to as IsoDate), days);
    });
  }
});
