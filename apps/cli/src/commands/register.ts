import { Entry, IsoDate } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit } from "../output.ts";

export const register = defineCommand({
  meta: { name: "register", description: "Register an entry" },
  args: {
    amount: {
      type: "string",
      alias: "a",
      required: true,
      description: 'Amount in BRL: "80" or "80.50"',
    },
    date: { type: "string", alias: "d", description: "Date YYYY-MM-DD (default: today)" },
    category: {
      type: "string",
      alias: "c",
      required: true,
      description: "Category name (must exist)",
    },
    description: { type: "string", description: "Optional free-text note" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      emit(
        await Entry.register(db, {
          amountRaw: args.amount,
          dateRaw: args.date ?? IsoDate.today(),
          categoryName: args.category,
          description: args.description,
        }),
      );
    } finally {
      await db.destroy();
    }
  },
});
