import { Entry } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit, writeError } from "../output.ts";

export const edit = defineCommand({
  meta: { name: "edit", description: "Edit an entry" },
  args: {
    id: { type: "string", required: true, description: "Entry id" },
    amount: { type: "string", alias: "a", description: 'Amount in BRL: "80" or "80.50"' },
    date: { type: "string", alias: "d", description: "Date YYYY-MM-DD" },
    category: { type: "string", alias: "c", description: "Category name (must exist)" },
    description: { type: "string", description: "Free-text note" },
  },
  async run({ args }) {
    if (
      args.amount === undefined &&
      args.date === undefined &&
      args.category === undefined &&
      args.description === undefined
    ) {
      writeError({ kind: "NoFieldsToUpdate" });
      process.exitCode = 1;
      return;
    }
    const db = await openDb();
    try {
      emit(
        await Entry.edit(db, {
          id: args.id,
          amountRaw: args.amount,
          dateRaw: args.date,
          categoryName: args.category,
          description: args.description,
        }),
      );
    } finally {
      await db.destroy();
    }
  },
});
