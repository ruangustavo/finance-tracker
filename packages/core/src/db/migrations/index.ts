import type { Migration } from "kysely/migration";
import { migration as initialSchema } from "./0001-initial-schema.ts";
import { migration as balanceAnchors } from "./0002-balance-anchors.ts";
import { migration as recurringDefinitions } from "./0003-recurring-definitions.ts";
import { migration as installmentPurchases } from "./0004-installment-purchases.ts";

export const MIGRATIONS: Record<string, Migration> = {
  "0001-initial-schema": initialSchema,
  "0002-balance-anchors": balanceAnchors,
  "0003-recurring-definitions": recurringDefinitions,
  "0004-installment-purchases": installmentPurchases,
};
