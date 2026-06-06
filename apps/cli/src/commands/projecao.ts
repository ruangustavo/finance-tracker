import { IsoDate, PayCycle, Result, RollingProjection } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit } from "../output.ts";

export type InvalidCount = Readonly<{ kind: "InvalidCount"; raw: string }>;

function parseCount(raw: string): Result<number, InvalidCount> {
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    return Result.err({ kind: "InvalidCount", raw });
  }
  return Result.ok(Number(raw));
}

export const projecao = defineCommand({
  meta: {
    name: "projecao",
    description: "Project the balance curve to the cycle close and beyond",
  },
  args: {
    anchorDay: { type: "string", default: "5", description: "Pay-cycle anchor day 1-28" },
    cycles: {
      type: "string",
      default: "1",
      description: "Project N pay cycles ahead (default: 1)",
    },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      const anchorDay = PayCycle.parseAnchorDay(args.anchorDay);
      if (!anchorDay.ok) {
        emit(anchorDay);
        return;
      }
      const cycles = parseCount(args.cycles);
      if (!cycles.ok) {
        emit(cycles);
        return;
      }
      emit(
        await RollingProjection.compute(db, {
          anchorDay: anchorDay.value,
          today: IsoDate.today(),
          cycles: cycles.value,
        }),
      );
    } finally {
      await db.destroy();
    }
  },
});
