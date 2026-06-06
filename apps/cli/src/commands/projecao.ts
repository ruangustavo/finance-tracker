import { BalanceStatus, IsoDate, Money, PayCycle, Result, RollingProjection } from "@chatter/core";
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
    dailyBudget: {
      type: "string",
      description: "Daily variable-spend budget in BRL (reference only; seeds cold-start pace)",
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
      let dailyBudgetCents: number | null = null;
      if (args.dailyBudget !== undefined) {
        const budget = Money.parse(args.dailyBudget);
        if (!budget.ok) {
          emit(budget);
          return;
        }
        dailyBudgetCents = budget.value.cents;
      }
      const projection = await RollingProjection.compute(db, {
        anchorDay: anchorDay.value,
        today: IsoDate.today(),
        cycles: cycles.value,
        dailyBudgetCents,
      });
      if (!projection.ok) {
        emit(projection);
        return;
      }
      const { curve, cycleClose, ...rest } = projection.value;
      emit(
        Result.ok({
          ...rest,
          curve: curve.map((point) => ({
            ...point,
            status: BalanceStatus.classify(point.balanceCents),
          })),
          cycleClose: { ...cycleClose, status: BalanceStatus.classify(cycleClose.balanceCents) },
        }),
      );
    } finally {
      await db.destroy();
    }
  },
});
