# NOTES

## Setup

See [README.md](./README.md#setup). Short version, on a machine that is not mine:

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm seed
pnpm dev        # http://localhost:3000, pick a user in the header switcher
```

`pnpm test` needs the same container up. It uses a separate `wavy_test`
database and creates it on first run, so there is nothing extra to provision.

## Money model

Every amount is an integer number of cents, in the database, in the Zod schemas
and in the arithmetic. No float touches a payout.

Earnings for one submission are `floor(views / 1000) * payout_per_1k_views`,
priced from the most recent `submission_metric` row
(`src/shared/payout.ts`).

### Budget bookkeeping: computed sum, not a stored counter

**Chosen.** `submission.approved_payout_cents` stores the cents an approval
committed, and budget spent is `SUM(approved_payout_cents)` over the campaign's
`approved` and `paid` submissions. One source of truth, nothing to drift.

**Rejected: a `campaign.budget_spent_cents` counter.** It would make list views
cheaper, but it is a second copy of a number the ledger already answers, and a
counter that disagrees with its ledger is exactly the bug you cannot afford
here. The read it optimises does not exist in this app: budget spent is only
shown on the campaign overview, one campaign at a time. Every writer already
holds the campaign row lock, so the `SUM` is race-free without it.

**Rejected: recomputing spend live from current views.** That is,
`SUM(floor(latest_views / 1000) * rate)` over approved submissions, with no
frozen amount. It reads well until views keep growing after approval: spend
then climbs past `total_budget` with no approval involved, which breaks "a
campaign never pays out more than `total_budget`". It also makes the concurrency
requirement untestable, because at approval time each submission would cost
nothing yet.

So: **the payout is frozen at approval.** Later view growth does not change what
a campaign owes. A creator's "estimated earnings" stays a live estimate while
the submission is pending (`estimatedEarningsCents`), and becomes the committed
amount once approved (`approvedPayoutCents`). Both are returned, so the UI can
label them honestly.

### Zero budget, zero payout

- A submission worth 0 cents (fewer than 1,000 views, or no metric row yet) can
  be approved. It commits nothing, so it cannot break the ceiling. A campaign
  with `total_budget = 0` therefore still accepts approvals — it just never pays
  anything and never completes. That is the honest reading of "never pays out
  more than the budget": nothing is owed, so nothing is blocked.
- A campaign completes automatically when remaining budget hits **exactly zero**
  after an approval. A campaign with, say, 40 cents left is not completed: a
  cheap enough submission could still be paid from it.
- The over-budget check is `spent + amount > total_budget`. An approval that
  lands exactly on the budget succeeds; the cent past it fails.
- **Editing a campaign cannot lower `total_budget` below what is already
  committed** (`BUDGET_BELOW_COMMITTED`). The case does not ask for this, but
  without it an edit form is a way to retroactively break the one invariant the
  approval engine exists to hold. The edit takes the same campaign row lock as
  an approval, so an edit racing an approval sees that approval's spend.

## Concurrent approvals

**The requirement.** Two admins approve at the same moment against a budget that
covers one of them. Exactly one goes through. First come, first served.

**What I did.** `approveSubmission` (`src/server/services/approval.ts`) runs in a
single transaction that, in this fixed order:

1. `SELECT … FOR UPDATE` on the **campaign** row. Every writer that can move the
   budget queues here, so this is the serialisation point.
2. `SELECT … FOR UPDATE` on the **submission** row, so the same submission
   cannot be approved twice concurrently.
3. Re-reads `SUM(approved_payout_cents)` — under the lock, therefore after the
   previous winner has committed.
4. Prices the submission from its newest metric row.
5. Fails with a typed `BUDGET_EXCEEDED` error, or writes the approval and
   completes the campaign if nothing is left.

The lock order is always campaign → submission, and `rejectSubmission` takes a
strict subset of that set, so no pair of operations can deadlock.

Read Committed is enough here. The correctness does not come from the isolation
level but from the row lock: nobody reads the budget without holding it.

**Alternatives ruled out.**

- *`SERIALIZABLE` isolation.* Correct, but it turns the failure mode into a
  `40001` serialisation error that has to be caught and retried, and the retry
  loop would then have to distinguish "retry me" from "genuinely over budget".
  An explicit row lock says what it means and the losing caller gets a real
  answer instead of a retry.
- *Optimistic concurrency with a version column.* Same retry problem, plus a
  column whose only job is to detect the collision that `FOR UPDATE` prevents.
- *A `CHECK` constraint or exclusion constraint on the budget.* A per-row check
  cannot see an aggregate over sibling rows, so this would need a trigger doing
  the same `SUM` — the same logic, moved somewhere harder to test.
- *A stored counter with `UPDATE campaign SET spent = spent + x WHERE spent + x
  <= budget`.* This is genuinely atomic and was tempting. It reintroduces the
  denormalised counter rejected above, and the budget check then lives in a SQL
  string rather than next to the pricing logic.
- *An advisory lock keyed on campaign id.* Works, but it is a lock on a number
  rather than on the row it protects, and it is easy to forget in a new code
  path. `FOR UPDATE` on the row is self-documenting.

**How it is proved.** `tests/integration/concurrent-approvals.test.ts`:

- The interleaving is *forced*, not hoped for. The service takes an
  `afterCampaignLock` test hook; the first transaction parks inside it while
  holding the campaign lock, the second is started only once the first is known
  to hold it, so the second genuinely blocks on the lock. Exactly one succeeds;
  the loser gets `BUDGET_EXCEEDED` with the required and remaining amounts.
- A second test fires six approvals at once against a budget that covers three,
  with no hook, and asserts three winners and a ledger of exactly the budget.
- I checked the tests actually bite: removing `.for("update")` from the campaign
  select makes all six approvals succeed and overspend the budget by 2×.

## Assumptions and deliberate deviations

- **Ingest covers pending submissions too.** Section 4.5 says "one row per
  approved submission per day". Taken literally, a submission would have no
  views until *after* it is approved, so every approval would price at zero, the
  budget ceiling could never bind, and the concurrent-approval requirement in
  4.4 would be untestable. So `pnpm ingest` measures everything still in play —
  `pending`, `approved` and `paid` — and skips only `rejected`.
- **Approvals are allowed on `paused` campaigns.** Pausing stops *new*
  submissions; the existing queue can still be worked through. `draft` and
  `completed` campaigns refuse approvals.
- **A campaign completed by exhausting its budget reports `BUDGET_EXCEEDED`,
  not "campaign closed", to the admin who lost the race.** The amounts are what
  the UI needs. A campaign an admin closed by hand while budget remains does
  report `CAMPAIGN_NOT_ACCEPTING_REVIEW`.
- **Daily views are per-day *new* views, not the running total.** Metric rows
  are cumulative snapshots, so a day is worth `views - previous snapshot`. This
  matters because the campaign period is expected to contain days with no
  metrics: with new-views, an empty day is an honest zero rather than a drop to
  the axis. The series is generated with `generate_series` over the campaign
  period and left-joined, so every day of the period is present.
- **All date logic is UTC.** `captured_at` is a `date`, and the daily series
  casts the campaign period in UTC.
- **The dev user switcher is always available**, not gated behind an env flag,
  so the hosted build can be demoed. It is the only thing that hands out a
  session; it grants no authority by itself.
- **Money is entered in cents in the forms.** Converting a dollars-and-cents
  text input is UI work that would only add a place for a float to sneak in.

## Access control

The signed cookie (`userId` + HMAC over it with `AUTH_SECRET`) is the only thing
the client controls, and it establishes identity, nothing more. Authority is
enforced per procedure in `src/server/trpc/init.ts`:
`protectedProcedure` → `adminProcedure` / `creatorProcedure`.

Ownership is enforced by construction rather than by checking an input:
`submission.mine` has no `creatorId` input at all — it reads the session — so
there is nothing to tamper with. `submission.byId` scopes its `WHERE` clause by
the viewer, and returns the same `NOT_FOUND` for "does not exist" and "not
yours", so the endpoint cannot be used to probe for ids.

`tests/integration/access-control.test.ts` covers anonymous callers, creators
reaching admin procedures, and one creator asking for another creator's
submission by a hand-crafted id.

## Typed errors

Service-layer failures throw `AppError` with a discriminated payload
(`src/shared/errors.ts`). A tRPC middleware maps it to a `CONFLICT` and the
error formatter puts the payload on `error.data.appError`, so the client can
branch on `BUDGET_EXCEEDED` / `DUPLICATE_SUBMISSION_URL` / `PLATFORM_NOT_ALLOWED`
rather than string-matching a message. `appErrorFrom(error)` narrows it back on
the client.

## Tests, and why these

- **Payout math** (`tests/unit/payout.test.ts`) — pure, and the thing that
  decides what somebody is owed. Covers the truncation boundary at every
  thousand, missing metrics, and the exact-budget vs one-cent-over case.
- **Budget ceiling** (`tests/integration/budget.test.ts`) — that a refused
  approval rolls back completely, that pricing uses the newest metric row, and
  that the campaign completes itself at exactly zero.
- **Concurrent approvals** — see above.
- **Access control** — role and ownership, including hand-crafted input.
- **Ingest** (`tests/integration/ingest.test.ts`) — a repeated run for the same
  day changes nothing, views never go down, and one submission failing does not
  stop the rest or lose the day on retry.
- **URL validation and dedup** (`tests/unit/platform.test.ts`,
  `tests/integration/campaign-api.test.ts`) — a profile URL is not a post URL,
  and the same clip cannot land on one campaign twice via a tracking parameter.

## UI

Graded on states, accessibility and restraint, so: shadcn/ui defaults, no custom
design work, no theming, no animation beyond what the primitives ship with.

- **Every list and detail has all three states.** `src/components/states.tsx`
  holds `LoadingRows` / `LoadingBlock` (skeletons inside a polite live region),
  `ErrorState` (`role="alert"` plus a retry that re-runs the query) and
  `EmptyState`, so "loading", "failed" and "nothing here" look and announce the
  same way on every screen instead of being re-invented per page.
- **Empty is not the same as filtered-empty.** The campaign list and the
  submissions list say which one it is and offer the matching action ("Clear
  filters" versus "New campaign").
- **Colour is never the only signal.** `CampaignStatusBadge` /
  `SubmissionStatusBadge` always render an icon *and* the word, so status
  survives greyscale and colour vision deficiency.
- **Forms are the shadcn `Form` wrapper**, which is what wires `id`,
  `aria-describedby` and `aria-invalid` between label, control, hint and error
  message. Validation errors are announced, not just coloured red.
- **The campaign form validates with `campaignFormSchema` from
  `src/shared/schemas/campaign.ts`** — the same module and the same `cents`,
  title, platform and period rules the tRPC procedure enforces. Only the input
  parsing differs, because `<input type="number">` and `<input type="date">`
  hand back strings. Same pattern as the existing `submissionFormSchema`.
- **Typed errors become states, not toasts.** `BUDGET_EXCEEDED` renders the
  amounts it carries and offers the two things a reviewer can actually do
  (reject the clip, or raise the budget). `DUPLICATE_SUBMISSION_URL` and
  `PLATFORM_NOT_ALLOWED` are set on the URL field itself.
  `BUDGET_BELOW_COMMITTED` sits under the budget input with the amount that is
  already committed.
- **Landmarks and keyboard.** Skip link, `header`/`nav`/`main`, `aria-current`
  on the active nav link, `<section aria-labelledby>` per region, `scope` on
  table headers and an `sr-only` caption naming the page. Focus rings are the
  shadcn defaults and are never removed. Row actions carry an `sr-only` suffix
  (`Approve https://…`) so "Approve" is not ambiguous out of context.
- **The chart has a text equivalent.** The figure caption states the total and
  the busiest day, the container is `role="img"` with a summary label, and a
  `<details>` underneath holds the same numbers as a table.
- **Money is entered in cents** with a live `= $2.50` hint. Parsing a
  dollars-and-cents field is the one place a float could reach a payout.
- **List filters live in React state, not the URL.** Deep-linking a filtered
  page would be nice, but it costs a `useSearchParams` Suspense boundary for
  something the case does not ask for. Pagination, search and filtering are
  still done in Postgres — that is the part being graded.
- **The dev switcher is in the header on every page**, labelled `DEV` with a
  screen-reader note that it is not real authentication. Client-side `RoleGate`
  renders "you are signed in as the wrong role" instead of a wall of failed
  queries; it is a courtesy, not the access control, which stays server-side.

## New dependencies

| Dependency | Why |
| --- | --- |
| `recharts` | The daily views chart. Declarative, ~1 component for a bar chart, and it renders real SVG so the axis labels are text. Hand-rolling SVG would have been more code for a worse tooltip; a full charting suite would have been more weight than one chart deserves. |
| `@playwright/test` | End-to-end coverage of the journeys that only break when the client, the procedures and Postgres are wired together. Vitest with a DOM shim would mock exactly the layer these tests exist to exercise. |

## End-to-end tests

```bash
docker compose up -d
pnpm exec playwright install chromium   # once
pnpm test:e2e
```

`playwright.config.ts` starts its own `next dev` on port 3100 and points it at
`wavy_e2e`, a third database on the same container, so a run never touches the
database you are developing against. The global setup creates and migrates it;
every test reseeds first via the same deterministic `seed()` the CLI uses.

That is what keeps the suite fast (about 25s for 7 tests) and deterministic:
fixed seed ids, one worker, and not a single `waitForTimeout` — every wait is an
assertion on what should be on screen.

Covered: an admin creating a campaign and finding it via server-side search and
filter; field-level validation refusing an impossible campaign; a creator
submitting a clip and the same URL being refused the second time; a URL from the
wrong platform refused inline; approve moving budget spent, budget left and the
creator's earnings; reject demanding a reason and delivering it to the creator;
and an over-budget approval surfacing the typed error with the amounts and
changing nothing.

## CI

`.github/workflows/ci.yml` runs `pnpm lint`, `pnpm typecheck` and `pnpm test`
against a Postgres service container on every push and pull request. No deploy,
no matrix — the point is that a clean machine can prove the documented setup
works. The e2e suite is deliberately not in CI: it needs a browser download and
a dev server, and it is the slowest thing here for the least marginal signal.

## Decisions

| Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- |
| Budget bookkeeping | `SUM(approved_payout_cents)` | `campaign.budget_spent_cents` counter | One source of truth; the lock already makes the sum race-free |
| Payout timing | Frozen at approval | Recomputed live from current views | A live sum drifts past `total_budget` with no approval involved |
| Approval concurrency | `SELECT … FOR UPDATE` on the campaign row | `SERIALIZABLE`, optimistic version column, advisory lock | Gives the loser a real answer instead of a retry; lock sits on the row it protects |
| Postgres driver | `pg` (node-postgres) pool | `postgres.js` | Predictable pooled clients, which the concurrency test depends on |
| Duplicate detection | Unique index on `(campaign_id, normalized_url)` | `SELECT` before `INSERT` | The index is the only check two simultaneous submissions cannot slip past |
| Submission platform | Derived server-side from the URL | Taken from client input | One less thing a hand-crafted request can lie about |
| Daily views series | Per-day new views, `generate_series` left join | Cumulative totals; skipping empty days | An empty day reads as zero, not as a collapse to the axis |
| Auth | Signed cookie + switcher | Real auth provider | Explicitly out of scope (case 4.1); server still enforces role and ownership |
| Budget edits | Locked check against committed spend | Allowing any budget value | An edit must not retroactively break the payout ceiling |
| Rejection reason | Zod `min(5)` **and** a DB `CHECK` | Validation only | The constraint holds for the seed and any future code path |
| RHF/Zod schemas | Shared factory taking the campaign's platforms | Duplicated client and server rules | Client and server disagree the moment they are written twice |
| Chart | `recharts` bar chart plus a `<details>` data table | Hand-rolled SVG; a charting suite | Real SVG text for axes, and the numbers stay readable without the chart |
| E2E | Playwright against `next dev` and its own `wavy_e2e` database | Reusing the dev database; mocking tRPC in jsdom | Isolation without fixtures, and the tests exercise the layer they exist for |
| List filters | React state | URL search params | Deep links are not asked for; the pagination that is graded still happens in Postgres |

## WIP — to finish in the next pass

> The sections below are deliberately incomplete at this point; the UI work they
> describe has not been built yet.

- **What I left out on purpose** — *WIP.* So far: no real auth, no custom design
  work, no i18n, no payout *execution* (`paid` is a status an admin sets, not a
  transfer), no soft deletes, no audit log beyond `reviewed_by` / `reviewed_at`.
- **First thing I'd fix given another day** — *WIP.*
- **Where I used AI tooling and what I had to correct** — *WIP.* Corrections so
  far:
  - The campaign-status guard ran *before* the budget check, so the admin who
    lost a race for the last of the budget got "campaign is completed" instead
    of the typed over-budget error with the amounts. Caught by the concurrency
    test; the checks are now ordered budget-first.
  - Duplicate-URL detection tested `error.code === '23505'` on the thrown error,
    but Drizzle wraps driver errors, so the SQLSTATE is on `error.cause`. The
    duplicate surfaced as a raw query failure instead of a typed
    `DUPLICATE_SUBMISSION_URL`. Caught by the dedup test; detection now walks
    the cause chain.
- **UI states, accessibility and restraint** — done; see "UI" above.
