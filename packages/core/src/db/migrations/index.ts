import type { Migration } from "kysely/migration";
import { migration as initialSchema } from "./0001-initial-schema.ts";

export const MIGRATIONS: Record<string, Migration> = {
  "0001-initial-schema": initialSchema,
};
