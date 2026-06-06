## Commands

```bash
pnpm cli <subcommand>        # run the CLI (node apps/cli/src/main.ts)
pnpm typecheck               # tsc --noEmit across all workspaces
pnpm test                    # core test suite (node --test)
```

Run a single test file or filter by name (no test runner script — uses Node's built-in):

```bash
cd packages/core && node --test src/__tests__/money.test.ts
cd packages/core && node --test --test-name-pattern "rejects" src/__tests__/money.test.ts
```

## Domain language

`CONTEXT.md` is the **ubiquitous language** and is authoritative. Definitions are in Portuguese
(the domain's language); **code identifiers are English** per the PT⇄EN table at the top of that
file. Use those exact names — `Entry` (Lançamento), `Statement` (Fatura), `PayCycle` (Ciclo),
`BalanceAnchor` (Âncora), etc. Don't invent synonyms. Architectural decisions live in `docs/adr/`;
read the relevant ADR before reopening a settled decision (pay-cycle boundaries, cash-basis credit
cards, transfers-are-not-expenses, the no-LLM stance).
