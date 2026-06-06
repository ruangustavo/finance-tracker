import type { DB } from "../db/schema.ts";
import { IsoDate } from "../values/iso-date.ts";
import { PayCycle } from "../values/pay-cycle.ts";
import { Spending } from "./spending.ts";

export type SpendingPace = Readonly<{
  perDayCents: number;
  priorDailyCents: number | null;
  currentDailyCents: number;
  weight: number;
  dailyBudgetCents: number | null;
}>;

export type ComputeInput = Readonly<{
  anchorDay: number;
  today: IsoDate;
  dailyBudgetCents: number | null;
  priorCycles?: number;
}>;

const DEFAULT_PRIOR_CYCLES = 3;

export const SpendingPace = {
  async compute(db: DB, input: ComputeInput): Promise<SpendingPace> {
    const priorCycles = input.priorCycles ?? DEFAULT_PRIOR_CYCLES;
    const cycle = PayCycle.current(input.anchorDay, input.today);

    const daysElapsed = IsoDate.daysBetween(cycle.from, input.today) + 1;
    const cycleLength = IsoDate.daysBetween(cycle.from, cycle.to) + 1;
    const weight = daysElapsed / cycleLength;

    const currentTotal = await Spending.variableExpenseTotal(db, {
      from: cycle.from,
      to: input.today,
    });
    const currentDailyCents = Math.round(currentTotal / daysElapsed);

    const prior = PayCycle.priorWindow(input.anchorDay, input.today, priorCycles);
    const priorTotal = await Spending.variableExpenseTotal(db, prior);
    const daysInWindow = IsoDate.daysBetween(prior.from, prior.to) + 1;
    const priorDailyCents = priorTotal > 0 ? Math.round(priorTotal / daysInWindow) : null;

    const effectivePrior = priorDailyCents ?? input.dailyBudgetCents ?? currentDailyCents;
    const perDayCents = Math.round((1 - weight) * effectivePrior + weight * currentDailyCents);

    return {
      perDayCents,
      priorDailyCents,
      currentDailyCents,
      weight,
      dailyBudgetCents: input.dailyBudgetCents,
    };
  },
} as const;
