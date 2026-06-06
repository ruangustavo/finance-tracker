import type { InvalidAnchorDay, Period } from "@chatter/core";
import { IsoDate, PayCycle, RecurringDefinition, Result } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit } from "../output.ts";

export type InvalidCount = Readonly<{ kind: "InvalidCount"; raw: string }>;
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
  meta: { name: "register", description: "Register a recurring definition" },
  args: {
    type: {
      type: "string",
      alias: "t",
      default: "expense",
      description: "Entry type: income | expense | transfer",
    },
    amount: {
      type: "string",
      alias: "a",
      required: true,
      description: 'Amount in BRL: "80" or "80.50"',
    },
    day: { type: "string", required: true, description: "Day of month 1-28" },
    category: {
      type: "string",
      alias: "c",
      description: "Category name — required for expense (must exist)",
    },
    start: { type: "string", description: "First eligible date YYYY-MM-DD (default: today)" },
    description: { type: "string", description: "Optional free-text note" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      emit(
        await RecurringDefinition.register(db, {
          typeRaw: args.type,
          amountRaw: args.amount,
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
  meta: { name: "list", description: "List recurring definitions" },
  async run() {
    const db = await openDb();
    try {
      emit(Result.ok(await RecurringDefinition.list(db)));
    } finally {
      await db.destroy();
    }
  },
});

const upcoming = defineCommand({
  meta: {
    name: "upcoming",
    description: "List upcoming occurrences over the next N days or cycles",
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
      emit(Result.ok(await RecurringDefinition.occurrences(db, range.value)));
    } finally {
      await db.destroy();
    }
  },
});

const edit = defineCommand({
  meta: {
    name: "edit",
    description: "Edit a recurring definition (affects future occurrences only)",
  },
  args: {
    id: { type: "string", required: true, description: "Recurring definition id" },
    amount: { type: "string", alias: "a", description: "New amount in BRL" },
    day: { type: "string", description: "New day of month 1-28" },
    category: { type: "string", alias: "c", description: "New category name" },
    description: { type: "string", description: "New free-text note" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      emit(
        await RecurringDefinition.edit(db, {
          id: args.id,
          amountRaw: args.amount,
          dayRaw: args.day,
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
  meta: { name: "cancel", description: "Cancel a recurring definition (stops future occurrences)" },
  args: {
    id: { type: "string", required: true, description: "Recurring definition id" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      emit(await RecurringDefinition.cancel(db, args.id));
    } finally {
      await db.destroy();
    }
  },
});

export const recurring = defineCommand({
  meta: { name: "recurring", description: "Recurring definitions (salary, rent, …)" },
  subCommands: { register, list, upcoming, edit, cancel },
});
