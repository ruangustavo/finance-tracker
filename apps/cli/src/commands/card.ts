import { CreditCard, Result } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit } from "../output.ts";

const register = defineCommand({
  meta: { name: "register", description: "Register a credit card" },
  args: {
    name: { type: "string", required: true, description: "Card name (unique)" },
    closingDay: {
      type: "string",
      required: true,
      description: "Statement closing day of month 1-28",
    },
    dueDay: { type: "string", required: true, description: "Statement due day of month 1-28" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      emit(
        await CreditCard.register(db, {
          name: args.name,
          closingDayRaw: args.closingDay,
          dueDayRaw: args.dueDay,
        }),
      );
    } finally {
      await db.destroy();
    }
  },
});

const list = defineCommand({
  meta: { name: "list", description: "List credit cards" },
  async run() {
    const db = await openDb();
    try {
      emit(Result.ok(await CreditCard.list(db)));
    } finally {
      await db.destroy();
    }
  },
});

export const card = defineCommand({
  meta: { name: "card", description: "Credit cards (closingDay/dueDay)" },
  subCommands: { register, list },
});
