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

export interface Database {
  categories: CategoriesTable;
  entries: EntriesTable;
  balance_anchors: BalanceAnchorsTable;
}

export type DB = Kysely<Database>;
