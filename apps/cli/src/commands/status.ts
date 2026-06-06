import { BalanceStatus, IsoDate, PayCycle, Result, RollingProjection } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit } from "../output.ts";

export const status = defineCommand({
  meta: {
    name: "status",
    description: "Cycle-close balance status (color band) for the current pay cycle",
  },
  args: {
    anchorDay: { type: "string", default: "5", description: "Pay-cycle anchor day 1-28" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      const anchorDay = PayCycle.parseAnchorDay(args.anchorDay);
      if (!anchorDay.ok) {
        emit(anchorDay);
        return;
      }
      const projection = await RollingProjection.compute(db, {
        anchorDay: anchorDay.value,
        today: IsoDate.today(),
        cycles: 1,
        dailyBudgetCents: null,
      });
      if (!projection.ok) {
        emit(projection);
        return;
      }
      const { cycleClose } = projection.value;
      emit(
        Result.ok({
          date: cycleClose.date,
          balanceCents: cycleClose.balanceCents,
          status: BalanceStatus.classify(cycleClose.balanceCents),
        }),
      );
    } finally {
      await db.destroy();
    }
  },
});
