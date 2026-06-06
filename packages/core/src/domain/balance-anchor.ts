import { randomUUID } from "node:crypto";
import type { Selectable } from "kysely";
import type { Database, DB } from "../db/schema.ts";
import { Result } from "../result.ts";
import type { InvalidDate } from "../values/iso-date.ts";
import { IsoDate } from "../values/iso-date.ts";
import type { InvalidAmount } from "../values/money.ts";
import { Money } from "../values/money.ts";

export type BalanceAnchor = Readonly<{
  id: string;
  amountCents: number;
  anchoredOn: string;
  createdAt: string;
}>;

export type SetAnchorInput = Readonly<{
  amountRaw: string;
  dateRaw: string;
}>;

export type SetAnchorError = InvalidAmount | InvalidDate;

function rowToAnchor(row: Selectable<Database["balance_anchors"]>): BalanceAnchor {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    anchoredOn: row.anchored_on,
    createdAt: row.created_at,
  };
}

export const BalanceAnchor = {
  async set(db: DB, input: SetAnchorInput): Promise<Result<BalanceAnchor, SetAnchorError>> {
    const money = Money.parseSigned(input.amountRaw);
    if (!money.ok) {
      return money;
    }

    const date = IsoDate.parse(input.dateRaw);
    if (!date.ok) {
      return date;
    }

    const anchor: BalanceAnchor = {
      id: randomUUID(),
      amountCents: money.value.cents,
      anchoredOn: date.value,
      createdAt: new Date().toISOString(),
    };

    await db
      .insertInto("balance_anchors")
      .values({
        id: anchor.id,
        amount_cents: anchor.amountCents,
        anchored_on: anchor.anchoredOn,
        created_at: anchor.createdAt,
      })
      .execute();

    return Result.ok(anchor);
  },

  async latest(db: DB): Promise<BalanceAnchor | undefined> {
    const row = await db
      .selectFrom("balance_anchors")
      .selectAll()
      .orderBy("anchored_on", "desc")
      .orderBy("created_at", "desc")
      .executeTakeFirst();
    return row === undefined ? undefined : rowToAnchor(row);
  },
} as const;
