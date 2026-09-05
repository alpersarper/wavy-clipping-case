# wavy-clipping-case

A cut-down clipping marketplace: brands run paid campaigns, creators submit
short-form clips, admins review them, and creators are paid per 1,000 views up
to the campaign budget.

Stack: Next.js 15 (App Router), TypeScript strict, tRPC v11, Drizzle ORM on
Postgres, TailwindCSS + shadcn/ui, react-hook-form + Zod, Vitest + Playwright.

- **Live:** <https://wavy-clipping-case.vercel.app>
- **Design notes, and how concurrent approvals are handled:**
  [NOTES.md](./NOTES.md)
- **Run it locally:** `pnpm install && pnpm bootstrap && pnpm dev`

## Setup

Requires Node 20+, pnpm 10+ and Docker.

```bash
pnpm install && pnpm bootstrap && pnpm dev   # http://localhost:3000
```

`pnpm bootstrap` is the four steps below in one command. Run them one at a time
instead if you prefer:

```bash
cp .env.example .env          # works as-is against the compose Postgres
docker compose up -d          # Postgres on host port 5433
pnpm db:migrate               # apply the committed drizzle/ migrations
pnpm seed                     # 1 admin, 3 creators, 12 campaigns, 21 submissions
pnpm dev                      # http://localhost:3000
```

Pick a user from the switcher in the header to get a session; start with
`admin@wavy.test`. Admins get `/admin/campaigns`; creators get
`/creator/campaigns` and `/creator/submissions`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm bootstrap` | `.env`, compose Postgres, migrations and seed in one go |
| `pnpm dev` / `pnpm build` | Next.js dev server / production build |
| `pnpm db:generate` | Generate a migration from `src/server/db/schema.ts` |
| `pnpm db:migrate` | Apply the committed migrations |
| `pnpm seed` | Deterministic, re-runnable seed data |
| `pnpm ingest [YYYY-MM-DD]` | Fake a daily metrics sync (idempotent per day) |
| `pnpm test` | Unit + integration tests |
| `pnpm test:unit` | Unit tests only (no database needed) |
| `pnpm test:e2e` | Playwright end-to-end journeys against a dev server |
| `pnpm typecheck` / `pnpm lint` | `tsc --noEmit` / ESLint |

## Tests

`pnpm test` needs the compose Postgres running. It uses a separate `wavy_test`
database on the same container and creates it on first run; `TEST_DATABASE_URL`
in `.env.example` points at it.

```bash
docker compose up -d
pnpm test
```

### End to end

```bash
docker compose up -d
pnpm exec playwright install chromium   # once
pnpm test:e2e
```

Playwright starts its own `next dev` on port 3100 against `wavy_e2e`, a third
database on the same container, and reseeds before every test — so a run never
touches the database you are developing against, and nothing depends on the
order the tests happen to run in.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, typecheck and
`pnpm test` against a Postgres service container on every push and pull request.

## Deployment

Vercel plus a Neon Postgres, deployed with `vercel deploy --prod`;
`vercel.json` pins the framework preset and `DATABASE_URL` / `AUTH_SECRET` are
the only environment variables. Migrating and seeding the hosted database is the
same commands as local against the production connection string — see
[NOTES.md](./NOTES.md#deployment).

See [NOTES.md](./NOTES.md) for the design decisions, in particular how
concurrent approvals and the budget ceiling are handled.
