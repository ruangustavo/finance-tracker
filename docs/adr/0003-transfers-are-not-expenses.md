# 3. Transfers are a distinct movement type, not expenses

- Status: Accepted
- Date: 2026-06-06
- Deciders: Ruan

## Context

The user invests a fixed amount the moment the salary lands. That money leaves the checking
account — so it must reduce the spendable `Balance` — but it is **not spending**. It is the
user's own money moving to investments. The headline report ("where is my money going?")
must not count it as an expense, or it reports a lie on the very thing the system exists to
answer.

## Decision

Model money moving between the user's own accounts as a third `EntryType`: **`transfer`**,
alongside `income` and `expense`. A `transfer` reduces the source `Balance` but **never**
appears in expense/category reports — by construction, because reports filter on
`EntryType = expense`. The salary-time investment is a **recurring openEnded transfer**. In
v1 the destination is **untracked** (no invested-balance or returns tracking).

## Alternatives considered

- **Expense + "not-really-spending" flag.** Rejected: it pollutes spending reports *by
  default*, and forces every report to remember to filter the flag — a load-bearing boolean
  that invites the exact silent bug we are trying to avoid.
- **Net salary (don't model the investment at all; record the salary already net of it).**
  Rejected: loses the record that the user invests, and how much, with no path to surface it.

## Consequences

**Positive**
- "Where is my money going?" is correct *by construction* — no per-report flag to forget.
- Natural home for any future inter-account movement (savings, moving cash between accounts).
- Keeps a history of how much is invested per cycle, even without tracking the destination.

**Negative**
- One more variant in the `Entry` union; the projection must handle `transfer` (reduce the
  source `Balance`, no category impact).
- Destination is untracked in v1, so total invested / returns are not visible (deferred to a
  later version).

## Related

- `CONTEXT.md`: `EntryType` (`income`/`expense`/`transfer`), `Transfer`, `Balance`.
