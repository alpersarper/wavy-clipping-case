# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

This is the Wavy Agency full-stack take-home. The brief it must satisfy is the
case spec; the design decisions and deliberate deviations are written up in
[NOTES.md](./NOTES.md) — read that before changing money logic.

## Sharp edges

- **Money is integer cents everywhere.** No floats, in the schema, the Zod
  schemas or the arithmetic. `src/shared/payout.ts` holds the pure math.
- **Approvals are the graded heart.** `src/server/services/approval.ts` runs in
  one transaction that locks the campaign row (`SELECT … FOR UPDATE`) before
  reading the budget. Lock order is always campaign → submission. Do not add a
  code path that writes an approval without that lock; the concurrency test in
  `tests/integration/concurrent-approvals.test.ts` catches it, but only because
  it forces the interleave via the `afterCampaignLock` hook.
- **Budget spent is a computed `SUM(approved_payout_cents)`,** not a stored
  counter, and the payout is frozen at approval. NOTES.md explains why.
- **All app data goes through tRPC.** The single route handler under
  `src/app/api/trpc/` is tRPC's transport adapter, not a REST endpoint.
- **Drizzle wraps driver errors**, so a Postgres SQLSTATE lives on
  `error.cause`, not on the thrown error (see `isUniqueViolation`).

## Commands

`pnpm test` needs the compose Postgres up (`docker compose up -d`); it uses a
separate `wavy_test` database it creates on first run. Migrations under
`drizzle/` are generated with `pnpm db:generate` and are committed on purpose —
reviewers read them. See [README.md](./README.md) for the full command table.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
