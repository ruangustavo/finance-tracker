import { Balance } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit } from "../output.ts";

export const balance = defineCommand({
  meta: {
    name: "balance",
    description: "Show the current balance (latest anchor + account entries)",
  },
  async run() {
    const db = await openDb();
    try {
      emit(await Balance.current(db));
    } finally {
      await db.destroy();
    }
  },
});
