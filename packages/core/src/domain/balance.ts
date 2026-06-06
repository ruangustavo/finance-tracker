import { sql } from "kysely";
import type { DB } from "../db/schema.ts";
import { Result } from "../result.ts";
import { IsoDate } from "../values/iso-date.ts";
import { BalanceAnchor } from "./balance-anchor.ts";
import { Statement } from "./statement.ts";

export type Balance = Readonly<{ cents: number }>;

export type NoAnchorSet = Readonly<{ kind: "NoAnchorSet" }>;

export const Balance = {
  async current(db: DB, today: IsoDate = IsoDate.today()): Promise<Result<Balance, NoAnchorSet>> {
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

    // Card statements that came due after the anchor are real cash outflows (ADR 0002).
    const anchoredOn = anchor.anchoredOn as IsoDate;
    const statements = await Statement.dueWithin(db, {
      from: IsoDate.addDays(anchoredOn, 1),
      to: today,
    });
    const statementsTotal = statements.reduce((sum, s) => sum + s.amountCents, 0);

    return Result.ok({ cents: anchor.amountCents + row.delta - statementsTotal });
  },
} as const;
