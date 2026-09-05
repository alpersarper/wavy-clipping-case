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
  `src/app/api/trpc/` is tRPC's transport adapter, not a REST endpoint. Pages
  are client components calling `trpc.*.useQuery`; nothing touches the database
  from a component.
- **Drizzle wraps driver errors**, so a Postgres SQLSTATE lives on
  `error.cause`, not on the thrown error (see `isUniqueViolation`).
- **A typed `AppError` is a UI state, not a toast.** `appErrorFrom(error)`
  narrows the payload on the client; `BUDGET_EXCEEDED` in
  `src/components/review-queue.tsx` is the reference example. Adding a new
  `AppErrorCode` means adding the branch that renders it.
- **Forms resolve against the shared schemas.** `campaignFormSchema` and
  `submissionFormSchema` (`src/shared/schemas/`) reuse the very field rules the
  procedures validate with and differ only in parsing what the browser hands
  back. Never write a second copy of a rule in a component.

## Commands

`pnpm test` needs the compose Postgres up (`docker compose up -d`); it uses a
separate `wavy_test` database it creates on first run. `pnpm test:e2e`
(Playwright) needs the same container plus `pnpm exec playwright install
chromium`; it starts its own `next dev` on port 3100 against a third database,
`wavy_e2e`, and reseeds before every test — so never point it at `wavy`.
Migrations under `drizzle/` are generated with `pnpm db:generate` and are
committed on purpose — reviewers read them. `pnpm bootstrap` is the one-command
local start (note: `pnpm setup` would hit pnpm's own builtin, hence the name).
CI (`.github/workflows/ci.yml`) runs lint, typecheck and `pnpm test` only. See
[README.md](./README.md) for the full command table.

Production is Vercel + Neon at <https://wavy-clipping-case.vercel.app>, deployed
with `vercel deploy --prod` (no GitHub app integration). `vercel.json` pins
`framework: nextjs` — without it the project preset falls back to "Other" and
the deploy fails looking for a `public/` output directory. `DATABASE_URL` and
`AUTH_SECRET` are marked sensitive on the Vercel project, so `vercel env pull`
returns placeholders; the connection string comes from Neon instead. Migrate,
seed and ingest the hosted database by pointing the ordinary scripts at that
`DATABASE_URL` — see [NOTES.md](./NOTES.md#deployment).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
