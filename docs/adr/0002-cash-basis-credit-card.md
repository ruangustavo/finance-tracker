# 2. Cash basis: credit-card spending hits the Balance on the statement due date

- Status: Accepted
- Date: 2026-06-06
- Deciders: Ruan

## Context

A large share of variable spending goes on credit cards. A card purchase happens on one
date but only leaves the checking account when the card statement (`Statement` / *fatura*)
is paid. We had to decide **when** a card purchase affects the projected `Balance`.

## Decision

Use a **cash basis** for the `Balance`. A card purchase is recorded as an `Expense` with
`PaymentMethod = creditCard`, carrying its own purchase date and `Category` — so it still
feeds category reporting and `SpendingPace`. But it does **not** reduce the `Balance` on the
purchase date. It accrues into the card's `Statement` (grouped by `closingDay`), and the
`Statement` reduces the `Balance` as a single cash event on its `dueDay`. The `Statement`
amount is **derived** from its purchases, never entered by hand. Card installments
(`InstallmentPurchase` on a card) flow through their respective statements.

## Alternatives considered

- **Accrual basis (*regime de competência*):** the purchase reduces `Balance` on the
  purchase date, and there is no separate statement cash event. Simpler and matches the old
  spreadsheet, but rejected — the user experiences the money as leaving *when he pays the
  bill*, and wants the `Balance` to track the real checking account.

## Consequences

**Positive**
- `Balance` tracks the real checking account: money leaves when the bill is paid.
- Category visibility is preserved — purchases are itemized even though the cash event is
  the `Statement` (this is the whole point of "where is my money going?").

**Negative**
- Requires modeling the statement cycle (`closingDay` / `dueDay`) to know *when* and *which*
  purchases hit the `Balance` — more than a single lump *fatura*.
- **Two time-bases coexist:** category/`SpendingPace` reporting is on the *purchase* date;
  cash/`Balance` is on the *due* date. Every report must be explicit about which basis it uses.
- **Double-counting hazard:** individual card purchases must never reduce the `Balance`
  directly — only the `Statement` does. This invariant must be enforced in `core`.

## Related

- `CONTEXT.md`: `CreditCard` (`closingDay`/`dueDay`), `Statement`, `PaymentMethod`, `Balance`,
  `SpendingPace`.
