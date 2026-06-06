import { Entry, IsoDate } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit } from "../output.ts";

export const register = defineCommand({
  meta: { name: "register", description: "Register an entry" },
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
    date: { type: "string", alias: "d", description: "Date YYYY-MM-DD (default: today)" },
    category: {
      type: "string",
      alias: "c",
      description: "Category name — required for expense (must exist)",
    },
    paymentMethod: {
      type: "string",
      default: "account",
      description: "Payment method: account | creditCard (default: account)",
    },
    card: {
      type: "string",
      description: "Credit-card name — required when paymentMethod=creditCard",
    },
    description: { type: "string", description: "Optional free-text note" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      emit(
        await Entry.register(db, {
          typeRaw: args.type,
          amountRaw: args.amount,
          dateRaw: args.date ?? IsoDate.today(),
          categoryName: args.category,
          paymentMethodRaw: args.paymentMethod,
          cardName: args.card,
          description: args.description,
        }),
      );
    } finally {
      await db.destroy();
    }
  },
});
