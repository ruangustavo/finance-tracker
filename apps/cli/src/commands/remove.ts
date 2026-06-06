import { Entry } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { emit } from "../output.ts";

export const remove = defineCommand({
  meta: { name: "remove", description: "Remove an entry" },
  args: {
    id: { type: "string", required: true, description: "Entry id" },
  },
  async run({ args }) {
    const db = await openDb();
    try {
      emit(await Entry.remove(db, args.id));
    } finally {
      await db.destroy();
    }
  },
});
