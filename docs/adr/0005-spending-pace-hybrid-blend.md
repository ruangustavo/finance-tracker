# 5. SpendingPace blends prior cycles into current actuals, linearly by day

- Status: Accepted
- Date: 2026-06-06
- Deciders: Ruan

## Context

The `RollingProjection` only knew deterministic money: booked account `Entry`s and recurring
occurrences. Variable spend — the part that actually moves day to day — was not projected, so
the curve flatlined on days with no recorded entry and `CycleClose` understated how the cycle
really ends. `SpendingPace` (Ritmo de Gastos) fills that gap: a *descriptive* estimate of
variable spend per day, computed from real variable `Entry`s, that projects the variable line
into future days.

The hard part is what to anchor on early in the cycle, when the current cycle has only a day or
two of data. Pure current-cycle actuals swing wildly (one big grocery run on day 2 implies an
absurd monthly pace); pure prior-cycle averages ignore that this month is already running hot.
`CONTEXT.md` settles the intent — "ancora na média dos ciclos anteriores e migra pro
comportamento real do ciclo conforme os dias passam" — but the exact weighting, lookback, and
cold-start behaviour were left as an explicit HITL decision.

## Decision

`SpendingPace.compute` blends two daily rates:

- **`priorDaily`** = total account variable spend over the previous **3** complete pay cycles,
  divided by the **full number of calendar days** in that window (so zero-spend days correctly
  dilute the average). `null` when that window has no such spend.
- **`currentDaily`** = current-cycle account variable spend so far, divided by days elapsed.

The blend is **linear by days elapsed**:

```
w    = daysElapsed / cycleLength            # 0..1
pace = round((1 - w)·effectivePrior + w·currentDaily)
```

Early in the cycle `w → 0` (prior dominates); late `w → 1` (actuals dominate).

**Cold-start chain:** `effectivePrior = priorDaily ?? dailyBudgetCents ?? currentDaily`. With no
prior history, the user's `DailyBudget` seeds the anchor; with neither, the pace is just the
current actuals. A 3-cycle window that genuinely summed to zero is treated as "no history"
(`null`) — a degenerate case for a real user, and falling back to the budget/actuals is safer
than projecting a flat zero.

Only **variable account expenses** feed the pace and the curve (`type='expense'`,
`nature='variable'`, `payment_method='account'`), consistent with the cash-basis credit-card
decision (ADR 0002): credit-card spend hits the balance via its `Statement`, not via pace.

`DailyBudget` is configured with a `--daily-budget` flag on `projecao` and surfaced alongside
the pace. It is **reference only**: it never alters the projected curve except as the cold-start
prior anchor described above.

## Alternatives considered

- **Warm-up window then linear** (prior-only for the first K days, then ramp). Rejected for v1:
  adds a second tuning knob (K) for marginal benefit; the linear blend already keeps day-1 pace
  ~97% prior-anchored.
- **Data-volume weighting** (weight by number of current data points vs a typical count).
  Rejected: needs a "typical count" model and is harder to reason about than calendar days.
- **Pure current actuals from day 1.** Rejected: noisy and prone to wild early projections,
  exactly what anchoring on prior cycles is meant to prevent.

## Consequences

**Positive**
- The rolling projection now answers "do jeito que vou, fecho o mês como?" — the curve and
  `CycleClose` reflect projected variable spend, not just deterministic flows.
- Stable early-cycle behaviour; smoothly self-correcting as real data accrues.
- `DailyBudget` and `SpendingPace` coexist as `CONTEXT.md` intends: budget = "am I following my
  plan?", pace = "the way I'm going, how does the cycle close?".

**Negative**
- A single pace is applied across all projected cycles; future cycles get the current cycle's
  blended rate rather than their own. Acceptable for v1.
- A future-dated booked variable `Entry` would stack with projected pace on that day
  (double-count). Out of scope for v1 — variable entries are recorded as they happen.
- The 3-cycle lookback and the 5-band thresholds are not yet user-configurable (no settings
  store exists); `--daily-budget` is per-invocation, not persisted.

## Related

- `CONTEXT.md`: `SpendingPace` (Ritmo de Gastos), `DailyBudget` (Verba Diária), `RollingProjection`.
- ADR 0001 (`PayCycle`), ADR 0002 (cash-basis credit card).
- `packages/core/src/domain/spending-pace.ts`, `packages/core/src/domain/projection.ts`.
