# wavy-clipping-case

A cut-down clipping marketplace: brands run paid campaigns, creators submit
short-form clips, admins review them, and creators are paid per 1,000 views up
to the campaign budget.

Stack: Next.js 15 (App Router), TypeScript strict, tRPC v11, Drizzle ORM on
Postgres, TailwindCSS + shadcn/ui, react-hook-form + Zod, Vitest.

## Setup

Requires Node 20+, pnpm 10+ and Docker.

```bash
pnpm install
cp .env.example .env          # works as-is against the compose Postgres
docker compose up -d          # Postgres on host port 5433
pnpm db:migrate               # apply the committed drizzle/ migrations
pnpm seed                     # 1 admin, 3 creators, 12 campaigns, 21 submissions
pnpm dev                      # http://localhost:3000
```

Pick a user from the switcher in the header to get a session; start with
`admin@wavy.test`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` | Next.js dev server / production build |
| `pnpm db:generate` | Generate a migration from `src/server/db/schema.ts` |
| `pnpm db:migrate` | Apply the committed migrations |
| `pnpm seed` | Deterministic, re-runnable seed data |
| `pnpm ingest [YYYY-MM-DD]` | Fake a daily metrics sync (idempotent per day) |
| `pnpm test` | Unit + integration tests |
| `pnpm test:unit` | Unit tests only (no database needed) |
| `pnpm typecheck` / `pnpm lint` | `tsc --noEmit` / ESLint |

## Tests

`pnpm test` needs the compose Postgres running. It uses a separate `wavy_test`
database on the same container and creates it on first run; `TEST_DATABASE_URL`
in `.env.example` points at it.

```bash
docker compose up -d
pnpm test
```

See [NOTES.md](./NOTES.md) for the design decisions, in particular how
concurrent approvals and the budget ceiling are handled.
