import type { Kysely } from "kysely";
import type { EntryType, Nature, PaymentMethod } from "../domain/entry.ts";

interface CategoriesTable {
  id: string;
  name: string;
}

interface EntriesTable {
  id: string;
  type: EntryType;
  nature: Nature;
  payment_method: PaymentMethod;
  category_id: string | null;
  amount_cents: number;
  occurred_on: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface BalanceAnchorsTable {
  id: string;
  amount_cents: number;
  anchored_on: string;
  created_at: string;
}

interface RecurringDefinitionsTable {
  id: string;
  type: EntryType;
  category_id: string | null;
  amount_cents: number;
  day_of_month: number;
  starts_on: string;
  ends_on: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface InstallmentPurchasesTable {
  id: string;
  category_id: string;
  amount_cents: number;
  count: number;
  day_of_month: number;
  first_charge_on: string;
  starts_on: string;
  ends_on: string | null;
  payment_method: "account";
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  categories: CategoriesTable;
  entries: EntriesTable;
  balance_anchors: BalanceAnchorsTable;
  recurring_definitions: RecurringDefinitionsTable;
  installment_purchases: InstallmentPurchasesTable;
}

export type DB = Kysely<Database>;
