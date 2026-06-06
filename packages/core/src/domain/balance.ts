import { sql } from "kysely";
import type { DB } from "../db/schema.ts";
import { Result } from "../result.ts";
import { BalanceAnchor } from "./balance-anchor.ts";

export type Balance = Readonly<{ cents: number }>;

export type NoAnchorSet = Readonly<{ kind: "NoAnchorSet" }>;

export const Balance = {
  async current(db: DB): Promise<Result<Balance, NoAnchorSet>> {
    const anchor = await BalanceAnchor.latest(db);
    if (anchor === undefined) {
      return Result.err({ kind: "NoAnchorSet" });
    }

    const row = await db
      .selectFrom("entries")
      .select((eb) =>
        eb.fn
          .coalesce(
            sql<number>`sum(case when type = 'income' then amount_cents else -amount_cents end)`,
            sql<number>`0`,
          )
          .as("delta"),
      )
      .where("payment_method", "=", "account")
      .where("occurred_on", ">", anchor.anchoredOn)
      .executeTakeFirstOrThrow();

    return Result.ok({ cents: anchor.amountCents + row.delta });
  },
} as const;
