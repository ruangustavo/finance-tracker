# 4. Claude Code is the AI; the app is a deterministic CLI

- Status: Accepted
- Date: 2026-06-06
- Deciders: Ruan

## Context

Two hard requirements: register expenses *"using AI"*, and *"converse about my finances with
Claude Code"*. The user already works inside Claude Code. We had to decide **where the
natural-language understanding lives** — inside the app, or outside it.

## Decision

**Claude Code is the AI.** The application is a **deterministic, testable CLI** with clean
commands that emit JSON (via `--json`). All natural-language understanding lives **outside**
the app, in Claude Code, which translates the user's phrasing (*"gastei 80 no mercado"*,
*"quanto gastei em restaurante?"*) into CLI calls. The app embeds **no LLM**.

The CLI is the **single port**: all access — writes *and* reads — goes through it, never raw
SQL. Projection, `SpendingPace`, `Statement`, and `BalanceStatus` are **computed** by `core`
and not stored, so reading the database directly would bypass them and surface wrong numbers.
Business logic lives only in `core`; the CLI is thin.

## Alternatives considered

- **Embed an LLM in the app** (e.g., `add "gastei 80 no mercado"` calls an LLM API to parse).
  Rejected for v1: adds a provider dependency, an API key, per-request cost, and a parsing
  prompt to maintain — all unnecessary because the user already drives everything through
  Claude Code. It would only be needed for NL ingestion *without* Claude Code in the loop
  (e.g., a chat box in a future front-end).

## Consequences

**Positive**
- Both hard requirements are met from one place, with no LLM cost or dependency in the app.
- The app stays deterministic and unit-testable; the CLI doubles as the conversational backend.
- Single write path (CLI → `core`) keeps domain invariants enforced.

**Negative**
- Natural-language ingestion requires Claude Code (or another MCP/LLM front) in the loop; the
  bare app is not "AI" on its own.
- A future front-end chat or standalone NL entry would need a separate NL layer (an MCP server
  or an embedded LLM) added later.

## Related

- `CONTEXT.md`: the whole glossary (the CLI command surface mirrors these terms).
- ADRs: this is the architectural counterpart to the domain ADRs 0001–0003.
