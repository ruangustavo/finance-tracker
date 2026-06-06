import type { InvalidAnchorDay, InvalidDate, Period, SpendingReport } from "@chatter/core";
import { IsoDate, PayCycle, Result, Spending } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit } from "../output.ts";

export type IncompletePeriod = Readonly<{
  kind: "IncompletePeriod";
}>;

type PeriodError = InvalidDate | InvalidAnchorDay | IncompletePeriod;

function resolvePeriod(
  from: string | undefined,
  to: string | undefined,
  anchorDayRaw: string,
): Result<Period, PeriodError> {
  if (from !== undefined && to !== undefined) {
    const parsedFrom = IsoDate.parse(from);
    if (!parsedFrom.ok) {
      return parsedFrom;
    }
    const parsedTo = IsoDate.parse(to);
    if (!parsedTo.ok) {
      return parsedTo;
    }
    return Result.ok({ from: parsedFrom.value, to: parsedTo.value });
  }

  if (from !== undefined || to !== undefined) {
    return Result.err({ kind: "IncompletePeriod" });
  }

  const anchorDay = PayCycle.parseAnchorDay(anchorDayRaw);
  if (!anchorDay.ok) {
    return anchorDay;
  }
  return Result.ok(PayCycle.current(anchorDay.value, IsoDate.today()));
}

export const spending = defineCommand({
  meta: { name: "spending", description: "Expenses by category over a pay cycle or date range" },
  args: {
    from: { type: "string", description: "Start date YYYY-MM-DD (requires --to)" },
    to: { type: "string", description: "End date YYYY-MM-DD (requires --from)" },
    anchorDay: { type: "string", default: "5", description: "Pay-cycle anchor day 1-28" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      const period = resolvePeriod(args.from, args.to, args.anchorDay);
      if (!period.ok) {
        emit(period);
        return;
      }
      const report: SpendingReport = await Spending.byCategory(db, period.value);
      emit(Result.ok(report));
    } finally {
      await db.destroy();
    }
  },
});
