import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { DB } from "@chatter/core";
import { Db } from "@chatter/core";

export async function openDb(): Promise<DB> {
  const url =
    process.env.DB_URL ?? `file:${join(homedir(), ".local", "share", "chatter", "finance.db")}`;
  if (url.startsWith("file:")) {
    await mkdir(dirname(url.slice("file:".length)), { recursive: true });
  }
  const db = Db.open(url);
  await Db.migrate(db);
  return db;
}
