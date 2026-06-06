import { BalanceAnchor, IsoDate } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit } from "../output.ts";

export const anchor = defineCommand({
  meta: { name: "anchor", description: "Set a balance anchor (reference balance at a date)" },
  args: {
    amount: {
      type: "string",
      alias: "a",
      required: true,
      description: 'Balance in BRL: "1500.75", "0" or "-250" (overdraft)',
    },
    date: { type: "string", alias: "d", description: "Date YYYY-MM-DD (default: today)" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      emit(
        await BalanceAnchor.set(db, {
          amountRaw: args.amount,
          dateRaw: args.date ?? IsoDate.today(),
        }),
      );
    } finally {
      await db.destroy();
    }
  },
});
