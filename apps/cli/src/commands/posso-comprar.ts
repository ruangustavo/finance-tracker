import { AffordabilityCheck, BalanceStatus, IsoDate, Money, PayCycle, Result } from "@chatter/core";
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

export const possoComprar = defineCommand({
  meta: {
    name: "posso-comprar",
    description: "Simulate buying X against the projection: à vista (earliest date) or parcelado",
  },
  args: {
    valor: { type: "positional", description: "Purchase amount in BRL, e.g. 1200 or 89.90" },
    parcelado: {
      type: "string",
      description: "Split into N monthly installments (à vista if omitted)",
    },
    floor: {
      type: "string",
      default: "tight",
      description: "Lowest acceptable status band: critical|negative|tight|comfortable|healthy",
    },
    anchorDay: { type: "string", default: "5", description: "Pay-cycle anchor day 1-28" },
    cycles: {
      type: "string",
      default: "12",
      description: "Search horizon in pay cycles (default: 12)",
    },
    dailyBudget: {
      type: "string",
      description: "Daily variable-spend budget in BRL (reference only; seeds cold-start pace)",
    },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      const amount = Money.parse(args.valor ?? "");
      if (!amount.ok) {
        emit(amount);
        return;
      }
      let installments: number | null = null;
      if (args.parcelado !== undefined) {
        const count = parseCount(args.parcelado);
        if (!count.ok) {
          emit(count);
          return;
        }
        installments = count.value;
      }
      const floor = BalanceStatus.parse(args.floor);
      if (!floor.ok) {
        emit(floor);
        return;
      }
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
      emit(
        await AffordabilityCheck.evaluate(db, {
          anchorDay: anchorDay.value,
          today: IsoDate.today(),
          amountCents: amount.value.cents,
          installments,
          floor: floor.value,
          dailyBudgetCents,
          horizonCycles: cycles.value,
        }),
      );
    } finally {
      await db.destroy();
    }
  },
});
