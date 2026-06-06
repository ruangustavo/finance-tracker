import type { DB } from "../db/schema.ts";
import { Result } from "../result.ts";
import { IsoDate } from "../values/iso-date.ts";
import type { NoAnchorSet } from "./balance.ts";
import { BalanceStatus } from "./balance-status.ts";
import type { ProjectionPoint } from "./projection.ts";
import { RollingProjection } from "./projection.ts";

export type Charge = Readonly<{ date: IsoDate; amountCents: number }>;

export type AffordabilityVerdict =
  | Readonly<{
      mode: "cash";
      affordable: true;
      already: boolean;
      earliest: IsoDate;
      troughCents: number;
      status: BalanceStatus;
      floor: BalanceStatus;
    }>
  | Readonly<{ mode: "cash"; affordable: false; floor: BalanceStatus; horizonEnd: IsoDate }>
  | Readonly<{
      mode: "installment";
      count: number;
      perInstallmentCents: number;
      charges: readonly Charge[];
      fits: boolean;
      trough: ProjectionPoint;
      status: BalanceStatus;
      floor: BalanceStatus;
    }>;

export type EvaluateInput = Readonly<{
  anchorDay: number;
  today: IsoDate;
  amountCents: number;
  installments: number | null;
  floor: BalanceStatus;
  dailyBudgetCents: number | null;
  horizonCycles: number;
}>;

export const AffordabilityCheck = {
  async evaluate(db: DB, input: EvaluateInput): Promise<Result<AffordabilityVerdict, NoAnchorSet>> {
    if (input.installments === null) {
      return evaluateCash(db, input);
    }
    return evaluateInstallment(db, input, input.installments);
  },
} as const;

async function evaluateCash(
  db: DB,
  input: EvaluateInput,
): Promise<Result<AffordabilityVerdict, NoAnchorSet>> {
  const projection = await RollingProjection.compute(db, {
    anchorDay: input.anchorDay,
    today: input.today,
    cycles: input.horizonCycles,
    dailyBudgetCents: input.dailyBudgetCents,
  });
  if (!projection.ok) {
    return projection;
  }

  const { curve } = projection.value;
  let suffixMin = Number.POSITIVE_INFINITY;
  const minFrom = new Map<IsoDate, number>();
  for (let i = curve.length - 1; i >= 0; i--) {
    const point = curve[i];
    if (point === undefined) continue;
    suffixMin = Math.min(suffixMin, point.balanceCents);
    minFrom.set(point.date, suffixMin);
  }

  for (const [index, point] of curve.entries()) {
    const troughCents = (minFrom.get(point.date) ?? point.balanceCents) - input.amountCents;
    const status = BalanceStatus.classify(troughCents);
    if (BalanceStatus.atLeast(status, input.floor)) {
      return Result.ok({
        mode: "cash",
        affordable: true,
        already: index === 0,
        earliest: point.date,
        troughCents,
        status,
        floor: input.floor,
      });
    }
  }

  return Result.ok({
    mode: "cash",
    affordable: false,
    floor: input.floor,
    horizonEnd: projection.value.to,
  });
}

async function evaluateInstallment(
  db: DB,
  input: EvaluateInput,
  count: number,
): Promise<Result<AffordabilityVerdict, NoAnchorSet>> {
  const perInstallmentCents = Math.round(input.amountCents / count);
  const charges: Charge[] = [];
  for (let k = 0; k < count; k++) {
    const last = k === count - 1;
    charges.push({
      date: IsoDate.addMonths(input.today, k),
      amountCents: last
        ? input.amountCents - perInstallmentCents * (count - 1)
        : perInstallmentCents,
    });
  }

  const projection = await RollingProjection.compute(db, {
    anchorDay: input.anchorDay,
    today: input.today,
    cycles: Math.max(input.horizonCycles, count + 1),
    dailyBudgetCents: input.dailyBudgetCents,
  });
  if (!projection.ok) {
    return projection;
  }

  let trough: ProjectionPoint | null = null;
  for (const point of projection.value.curve) {
    const reduction = charges
      .filter((charge) => charge.date <= point.date)
      .reduce((sum, charge) => sum + charge.amountCents, 0);
    const balanceCents = point.balanceCents - reduction;
    if (trough === null || balanceCents < trough.balanceCents) {
      trough = { date: point.date, balanceCents };
    }
  }
  if (trough === null) {
    trough = { date: input.today, balanceCents: 0 };
  }

  const status = BalanceStatus.classify(trough.balanceCents);
  return Result.ok({
    mode: "installment",
    count,
    perInstallmentCents,
    charges,
    fits: BalanceStatus.atLeast(status, input.floor),
    trough,
    status,
    floor: input.floor,
  });
}
