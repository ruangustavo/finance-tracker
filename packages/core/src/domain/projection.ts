import type { DB } from "../db/schema.ts";
import { Result } from "../result.ts";
import { IsoDate } from "../values/iso-date.ts";
import { PayCycle } from "../values/pay-cycle.ts";
import type { NoAnchorSet } from "./balance.ts";
import { BalanceAnchor } from "./balance-anchor.ts";
import type { EntryType } from "./entry.ts";
import { InstallmentPurchase } from "./installment-purchase.ts";
import { RecurringDefinition } from "./recurring-definition.ts";
import { SpendingPace } from "./spending-pace.ts";
import { Statement } from "./statement.ts";

export type ProjectionPoint = Readonly<{ date: IsoDate; balanceCents: number }>;

export type CycleClose = ProjectionPoint;

export type RollingProjection = Readonly<{
  from: IsoDate;
  to: IsoDate;
  curve: readonly ProjectionPoint[];
  cycleClose: CycleClose;
  spendingPace: SpendingPace;
}>;

export type ComputeInput = Readonly<{
  anchorDay: number;
  today: IsoDate;
  cycles: number;
  dailyBudgetCents: number | null;
}>;

function signedDelta(type: EntryType, amountCents: number): number {
  return type === "income" ? amountCents : -amountCents;
}

export const RollingProjection = {
  async compute(db: DB, input: ComputeInput): Promise<Result<RollingProjection, NoAnchorSet>> {
    const anchor = await BalanceAnchor.latest(db);
    if (anchor === undefined) {
      return Result.err({ kind: "NoAnchorSet" });
    }

    const currentCycle = PayCycle.current(input.anchorDay, input.today);
    const end = PayCycle.upcoming(input.anchorDay, input.today, input.cycles).to;
    const anchoredOn = anchor.anchoredOn as IsoDate;
    const curveStart = input.today > anchoredOn ? input.today : anchoredOn;

    const deltaByDate = new Map<string, number>();
    const add = (date: string, delta: number): void => {
      deltaByDate.set(date, (deltaByDate.get(date) ?? 0) + delta);
    };

    const entryRows = await db
      .selectFrom("entries")
      .select(["occurred_on", "type", "amount_cents"])
      .where("payment_method", "=", "account")
      .where("occurred_on", ">", anchor.anchoredOn)
      .where("occurred_on", "<=", end)
      .execute();
    for (const row of entryRows) {
      add(row.occurred_on, signedDelta(row.type, row.amount_cents));
    }

    const occurrences = await RecurringDefinition.occurrences(db, {
      from: IsoDate.addDays(anchoredOn, 1),
      to: end,
    });
    for (const occurrence of occurrences) {
      add(occurrence.occurredOn, signedDelta(occurrence.type, occurrence.amountCents));
    }

    const installments = await InstallmentPurchase.installments(db, {
      from: IsoDate.addDays(anchoredOn, 1),
      to: end,
    });
    for (const installment of installments) {
      // Card installments flow through their statements, not directly into the balance.
      if (installment.paymentMethod === "account") {
        add(installment.occurredOn, -installment.amountCents);
      }
    }

    // Card statements hit the balance as a single cash event on their due date (ADR 0002).
    const statements = await Statement.dueWithin(db, {
      from: IsoDate.addDays(anchoredOn, 1),
      to: end,
    });
    for (const statement of statements) {
      add(statement.dueOn, -statement.amountCents);
    }

    const spendingPace = await SpendingPace.compute(db, {
      anchorDay: input.anchorDay,
      today: input.today,
      dailyBudgetCents: input.dailyBudgetCents,
    });
    if (spendingPace.perDayCents !== 0) {
      for (
        let date = IsoDate.addDays(input.today, 1);
        date <= end;
        date = IsoDate.addDays(date, 1)
      ) {
        add(date, -spendingPace.perDayCents);
      }
    }

    const curve: ProjectionPoint[] = [];
    let running = anchor.amountCents;
    for (let date = anchoredOn; date <= end; date = IsoDate.addDays(date, 1)) {
      if (date > anchoredOn) {
        running += deltaByDate.get(date) ?? 0;
      }
      if (date >= curveStart) {
        curve.push({ date, balanceCents: running });
      }
    }

    return Result.ok({
      from: curveStart,
      to: end,
      curve,
      cycleClose: troughWithin(curve, currentCycle.to),
      spendingPace,
    });
  },
} as const;

function troughWithin(curve: readonly ProjectionPoint[], cycleEnd: IsoDate): CycleClose {
  const window = curve.filter((point) => point.date <= cycleEnd);
  const candidates = window.length > 0 ? window : curve;
  return candidates.reduce((lowest, point) =>
    point.balanceCents < lowest.balanceCents ? point : lowest,
  );
}
