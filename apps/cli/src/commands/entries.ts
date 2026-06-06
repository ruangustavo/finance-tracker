import { Entry } from "@chatter/core";
import { defineCommand } from "citty";
import { openDb } from "../db.ts";
import { writeJson } from "../output.ts";

export const entries = defineCommand({
  meta: { name: "entries", description: "List entries" },
  async run() {
    const db = await openDb();
    try {
      writeJson(await Entry.list(db));
    } finally {
      await db.destroy();
    }
  },
});
