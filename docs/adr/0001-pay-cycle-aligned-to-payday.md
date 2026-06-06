# 1. Pay-cycle aligned to payday, not the calendar month

- Status: Accepted
- Date: 2026-06-06
- Deciders: Ruan

## Context

The user reasons about money as *"how much is left until I get paid again"*, not in
calendar months. The salary lands around day 5, but the exact day varies (±1, and may shift
for weekends/holidays). The cycle boundary drives `CycleClose` (the source of the status
colors) and all projections, so it has to be defined precisely.

## Decision

The system's unit of time is the **`PayCycle`**: from payday to the day before the next
payday. It is anchored to a **fixed nominal `anchorDay`** (default 5). The boundary does
**not** move when the actual deposit lands a day early or late — the real salary `Entry` is
recorded on its actual date, but the cycle boundary and projections use the nominal anchor.

## Alternatives considered

- **Calendar month (1st–end).** Rejected: the salary lands mid-month, so "how much is left"
  is unnatural, and the red that matters — running out *before the next paycheck* — is
  invisible when the boundary cuts across two pay periods.

## Consequences

**Positive**
- Matches the user's mental model. `CycleClose` is the trough right before the next salary,
  which is exactly the moment that should be colored.
- Stable boundaries (nominal anchor) mean projections don't wobble with deposit-day variance.

**Negative**
- "Month" in the system is **not** the calendar month. Reports and labels must be explicit
  (e.g., "cycle of June" = Jun 5 – Jul 4).
- External artifacts tied to the calendar month (some bills, the credit-card statement) will
  not align to the `PayCycle` and must be reconciled by date, not by "month".
- Assumes a reasonably regular payday. Highly irregular income would weaken the anchor.

## Related

- `CONTEXT.md`: `PayCycle` (`anchorDay`), `CycleClose`, `BalanceStatus`.
