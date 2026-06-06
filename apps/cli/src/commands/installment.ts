import type { InvalidAnchorDay, Period } from "@chatter/core";
import { InstallmentPurchase, IsoDate, PayCycle, Result } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit } from "../output.ts";

type InvalidCount = Readonly<{ kind: "InvalidCount"; raw: string }>;
type RangeError = InvalidAnchorDay | InvalidCount;

function parseCount(raw: string): Result<number, InvalidCount> {
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    return Result.err({ kind: "InvalidCount", raw });
  }
  return Result.ok(Number(raw));
}

function resolveRange(
  daysRaw: string,
  cyclesRaw: string | undefined,
  anchorDayRaw: string,
): Result<Period, RangeError> {
  const today = IsoDate.today();
  if (cyclesRaw !== undefined) {
    const anchorDay = PayCycle.parseAnchorDay(anchorDayRaw);
    if (!anchorDay.ok) return anchorDay;
    const cycles = parseCount(cyclesRaw);
    if (!cycles.ok) return cycles;
    return Result.ok(PayCycle.upcoming(anchorDay.value, today, cycles.value));
  }

  const days = parseCount(daysRaw);
  if (!days.ok) return days;
  return Result.ok({ from: today, to: IsoDate.addDays(today, days.value) });
}

const register = defineCommand({
  meta: { name: "register", description: "Register an installment purchase (account / PIX)" },
  args: {
    amount: {
      type: "string",
      alias: "a",
      required: true,
      description: 'Amount per installment in BRL: "200" or "200.50"',
    },
    count: {
      type: "string",
      alias: "n",
      required: true,
      description: "Number of installments (N)",
    },
    category: {
      type: "string",
      alias: "c",
      required: true,
      description: "Category name (must exist)",
    },
    day: { type: "string", description: "Day of month 1-28 (default: the start date's day)" },
    start: { type: "string", description: "First installment date YYYY-MM-DD (default: today)" },
    description: { type: "string", description: "Optional free-text note" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      emit(
        await InstallmentPurchase.register(db, {
          amountRaw: args.amount,
          countRaw: args.count,
          dayRaw: args.day,
          categoryName: args.category,
          startRaw: args.start,
          description: args.description,
        }),
      );
    } finally {
      await db.destroy();
    }
  },
});

const list = defineCommand({
  meta: { name: "list", description: "List installment purchases" },
  async run() {
    const db = await openDb();
    try {
      emit(Result.ok(await InstallmentPurchase.list(db)));
    } finally {
      await db.destroy();
    }
  },
});

const upcoming = defineCommand({
  meta: {
    name: "upcoming",
    description: "List upcoming installments over the next N days or cycles",
  },
  args: {
    days: { type: "string", default: "30", description: "Look ahead N days (default: 30)" },
    cycles: { type: "string", description: "Look ahead N pay cycles (overrides --days)" },
    anchorDay: { type: "string", default: "5", description: "Pay-cycle anchor day 1-28" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      const range = resolveRange(args.days, args.cycles, args.anchorDay);
      if (!range.ok) {
        emit(range);
        return;
      }
      emit(Result.ok(await InstallmentPurchase.installments(db, range.value)));
    } finally {
      await db.destroy();
    }
  },
});

const edit = defineCommand({
  meta: {
    name: "edit",
    description: "Edit an installment purchase (affects remaining installments only)",
  },
  args: {
    id: { type: "string", required: true, description: "Installment purchase id" },
    amount: { type: "string", alias: "a", description: "New amount per installment in BRL" },
    category: { type: "string", alias: "c", description: "New category name" },
    description: { type: "string", description: "New free-text note" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      emit(
        await InstallmentPurchase.edit(db, {
          id: args.id,
          amountRaw: args.amount,
          categoryName: args.category,
          description: args.description,
        }),
      );
    } finally {
      await db.destroy();
    }
  },
});

const cancel = defineCommand({
  meta: {
    name: "cancel",
    description: "Cancel an installment purchase (stops remaining installments)",
  },
  args: {
    id: { type: "string", required: true, description: "Installment purchase id" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      emit(await InstallmentPurchase.cancel(db, args.id));
    } finally {
      await db.destroy();
    }
  },
});

export const installment = defineCommand({
  meta: { name: "installment", description: "Installment purchases (parceladas via account/PIX)" },
  subCommands: { register, list, upcoming, edit, cancel },
});
