# Analytics Dashboard — Design Spec

**Date:** 2026-07-15
**Status:** Approved design, pending implementation plan
**Roadmap item:** §17 priority #1 — "Analytics dashboard"

---

## 1. Problem & goal

The app instruments a privacy-friendly learning-journey event stream
(`src/analytics.js` → `analytics_events` table), but **nothing reads it**. There
is no way to see whether users activate (Landing → Signup → Onboarding → First
Mission → First Story) or come back. The goal is a single **admin-only**
dashboard that turns the already-collected events into the handful of decisions
that matter: is activation working, are people returning, are stories being
finished.

**In one sentence:** give the developer an in-app product-health dashboard —
activation funnel, DAU/WAU, retention, story completion — reading the existing
`analytics_events` table without exposing raw rows or new infrastructure.

### Success criteria

- The developer, signed in on the live site (GitHub Pages **or** Vercel), can
  open `/dashboard` and see: headline KPIs, the activation funnel with
  conversion rates, a DAU/WAU trend, D1/D7/D30 retention, and story
  open-vs-complete rates, filterable by date range.
- No non-admin can read analytics data — enforced in Postgres, not just the UI.
- The dashboard is buildable and demoable **before** real traffic exists, via a
  synthetic-event seed script.
- Chart/metric math is pure and unit-tested, consistent with the project's
  existing "extract pure logic, test it" convention.

### Non-goals (YAGNI — explicitly out of v1)

- User-facing learner stats (a different data source and privacy model — its own
  spec if ever wanted).
- Real-time / live-updating charts.
- CSV export, per-user drilldown, or a custom query builder.
- Materialized views or a caching layer (add only if query latency becomes a
  real, measured problem).
- External BI tools (Metabase/Grafana/Supabase Studio dashboards).

---

## 2. Constraints discovered in the codebase

These shaped the architecture and are load-bearing:

1. **Static SPA on two hosts.** The app ships to GitHub Pages (static) and
   Vercel (`vercel.json` is only an SPA rewrite — no serverless functions).
   There is **no server-side compute** to lean on. Any solution must run as
   pure client + Supabase to work on both hosts.
2. **RLS blocks all client reads.** `analytics_events` has an insert-only policy
   and **no `SELECT` policy** (migration `20260713120000_add_analytics_events.sql`).
   The browser — anon or signed-in — cannot read the table today. The migration
   comment says "dashboards read with the service role," but the service key
   cannot ship to a static client.
3. **No existing admin surface.** The `/dev` tooling referenced in `Claude.md`
   is actually a set of Claude Code slash commands (`.claude/commands/*.md`) that
   hand the developer SQL to paste into Supabase — there is no in-app admin page,
   route, or role flag to build on.
4. **Screen pattern is fixed and simple.** Each top-level screen is a component
   rendered by `App.jsx` via `view === '<key>'`, its key listed in
   `KNOWN_VIEWS` (`src/routes.js`), reached at path `/<key>`. Screens query
   Supabase directly (`supabase.from(...)`). Navigation is a single source of
   truth in `src/navConfig.js`.
5. **No heavy dependencies.** UI is React 19 + Tailwind + CSS variables +
   `lucide-react` icons. Charts should be lightweight inline SVG, not a charting
   library. Vite uses the strict OXC parser (no complex regex in JSX).
6. **Event shape.** `analytics_events` columns: `id, user_id (nullable —
   null for pre-auth funnel steps), session_id, name, language, level,
   app_version, props (jsonb), created_at`. Event names are the `EVENTS` enum in
   `src/analytics.js`. `session_ended` carries `props.duration_ms`.

---

## 3. Chosen approach

**Approach A — in-app admin dashboard backed by security-definer SQL functions.**
(Rejected: B external BI — dashboard would live outside the product/repo;
C Vercel serverless — breaks the GitHub Pages deploy and adds a backend surface
the project avoids.)

One migration adds Postgres **security-definer functions** that each (a) verify
the caller is an admin and (b) return **only aggregates**, never raw event rows.
The client calls them with `supabase.rpc(...)`. Raw analytics never leave the
database; the service key is never in the browser; it works identically on both
hosts.

### Why security-definer RPCs rather than an admin `SELECT` policy on the table

Exposing raw rows to the client (even admin-gated) would ship the full event log
to the browser and push all aggregation client-side. Returning aggregates from
the DB keeps payloads tiny, keeps raw data server-side, and gives one obvious
place to enforce the admin check. Each function runs `security definer` (with the
definer's rights, bypassing the base-table RLS) but **guards its own entry** with
an explicit admin assertion, so it can only ever be called by an admin.

---

## 4. Component design

The system breaks into four independently understandable units.

### 4.1 Access & admin identity

- **Migration adds `profiles.is_admin boolean not null default false`.** The
  developer flips their own row to `true` via SQL. A new slash command
  (`.claude/commands/*.md`, mirroring `/unlock`) hands over that SQL with the
  user-id placeholder — no in-app admin management UI.
- **Client gate (UX only):** `dashboard` is added to `KNOWN_VIEWS`
  unconditionally (so routing stays static and unit-testable). `App.jsx` already
  loads the profile; for `view === 'dashboard'` it renders `Dashboard.jsx` when
  `profile.is_admin` is true and `NotFound` otherwise. The "Dashboard" nav entry
  in `navConfig.js` is likewise shown only when `profile.is_admin`. Result: a
  non-admin who types `/dashboard` gets the same NotFound as any bad path — no
  admin data, no working panels.
- **Real gate (authoritative):** every RPC re-checks admin server-side:
  ```sql
  if not exists (select 1 from public.profiles
                 where id = auth.uid() and is_admin) then
    raise exception 'not authorized';
  end if;
  ```
  The UI gate is convenience; the database is the security boundary.

### 4.2 Data layer — SQL functions (one migration)

All functions take an inclusive date range `(from_ts timestamptz, to_ts
timestamptz)` (dashboard defaults to last 30 days) and assert admin first.
Existing indexes (`analytics_events_name_created_idx`,
`analytics_events_user_created_idx`) cover these access patterns.

- **`admin_overview(from_ts, to_ts)`** → one row of headline KPIs: signups
  (`signup_completed` count), DAU (distinct non-null `user_id` today), WAU
  (distinct over trailing 7d), sessions (`session_started` count), median session
  length (from `session_ended.props.duration_ms`, last value per `session_id`),
  overall story completion rate (`story_completed` / `story_opened`).
- **`admin_funnel(from_ts, to_ts)`** → one row per funnel stage with a count and
  a conversion % vs. the previous stage. Stages: `landing_viewed` →
  `signup_completed` → `onboarding_completed` → `first_mission_completed` →
  `first_story_completed` → next-day return. Pre-auth stages
  (landing/signup) are counted by distinct `session_id`; post-auth stages by
  distinct `user_id`. "Return" = a user with any event on a calendar day after
  their `signup_completed` day.
- **`admin_active_users(from_ts, to_ts)`** → daily rows `(day, dau)` plus a
  rolling `wau`, for the trend chart (distinct non-null `user_id` with any event
  that day).
- **`admin_retention(cohort_from, cohort_to)`** → per signup cohort (by
  `signup_completed` day), the D1/D7/D30 return rates.
- **`admin_story_stats(from_ts, to_ts)`** → rows `(language, opened, completed,
  completion_rate)` from `story_opened` / `story_completed`.

An optional `language` filter can be added as a nullable parameter to the
time-series/story functions if the language dropdown ships in v1.

### 4.3 Dashboard UI (`src/Dashboard.jsx`)

A single screen, admin-only, following the existing screen conventions
(horizontal padding via `useIsMobile()`, theme via CSS variables, `lucide-react`
icons, `ui.jsx` shared components where they fit).

Layout, top to bottom:
1. **Header** — title, a date-range selector (7 / 30 / 90 days), optional
   language filter. Range state drives all RPC calls.
2. **KPI row** — stat tiles from `admin_overview` (signups, DAU, WAU, sessions,
   median session length, story completion rate).
3. **Activation funnel** — horizontal bars per stage with count + conversion %.
4. **DAU/WAU trend** — inline-SVG line/area over the range.
5. **Retention** — D1/D7/D30 bars (or a compact cohort view).
6. **Story completion** — opened vs completed per language.

**States:** loading skeletons; a clear error state; and a first-class
**"no data yet"** empty state (covers "migration not applied / no traffic yet"),
so the screen is legible before events accumulate.

**Charts:** hand-rolled inline SVG, theme-aware, no new dependency. Follow the
`dataviz` skill for palette/legibility. Keep each chart a small pure-render
component fed by transformed data.

### 4.4 Dev & validation — synthetic events

`seed-analytics.mjs` (root, same conventions as other `.mjs` tools:
`--env-file=.env.script`, `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`, **dry-run by
default**, `--apply` to write, `--purge` to remove synthetic rows) inserts a few
weeks of clearly-labeled synthetic events spanning the whole funnel across a set
of fake `user_id`/`session_id` values. This unblocks building, testing, and
demoing the dashboard before the migration is applied to prod and before real
traffic exists. Synthetic rows are tagged (e.g. a reserved `app_version` value
like `seed`) so `--purge` can find and delete exactly them.

---

## 5. Data flow

```
Browser (admin, signed in)
  └─ Dashboard.jsx  ──supabase.rpc('admin_funnel', {from,to})──▶  Postgres
                                                                    │
                          security definer fn: assert is_admin,     │
                          aggregate analytics_events               ◀┘
  ◀────────────────── aggregated rows (no raw events) ──────────────
  └─ dashboardMetrics.js (pure transforms) ─▶ inline-SVG chart components
```

---

## 6. Error handling

- **Not admin:** RPC raises `not authorized`; UI never exposes the route to
  non-admins anyway. If somehow reached, show NotFound / a benign message.
- **RPC/network failure:** dashboard shows an error state with a retry; it must
  never crash the app (wrap in try/catch, mirror the app's best-effort ethos).
- **Empty result:** the "no data yet" empty state, not a broken chart.
- **Migration not applied:** RPCs won't exist → treated as the empty/error state
  with a hint to apply the migration (documented in `Claude.md` action items).

---

## 7. Testing

- **`src/dashboardMetrics.js` + `dashboardMetrics.test.js`** — pure functions
  that turn RPC row shapes into chart-ready data (funnel conversion %, DAU/WAU
  bucketing, retention rates, median duration). Unit-tested with representative
  fixtures, matching the project convention (`srs.test.js`, `xp.test.js`, etc.).
- **Route guard** — extend `routes.test.js` so `/dashboard` maps to the
  `dashboard` view (it is a known view). The admin-vs-NotFound decision lives in
  `App.jsx` (driven by `profile.is_admin`); if that branch is factored into a
  small pure helper, unit-test it too.
- **Manual/seed validation** — run `seed-analytics.mjs --apply` against a dev
  Supabase project, open `/dashboard`, verify each panel renders and the date
  range filters correctly; then `--purge`.
- SQL functions themselves are validated manually against seeded data (no DB unit
  harness exists in-repo).

---

## 8. Files touched (anticipated)

**New**
- `supabase/migrations/20260715000000_add_admin_analytics.sql` — `is_admin`
  column + the five security-definer functions.
- `src/Dashboard.jsx` — the screen.
- `src/dashboardMetrics.js` + `src/dashboardMetrics.test.js` — pure transforms.
- `seed-analytics.mjs` — synthetic event seeder.
- `.claude/commands/make-admin.md` — slash command handing over the
  `update profiles set is_admin = true` SQL.

**Modified**
- `src/App.jsx` — render `Dashboard` for `view === 'dashboard'` when
  `profile.is_admin`, else `NotFound`.
- `src/routes.js` — add `dashboard` to `KNOWN_VIEWS`.
- `src/navConfig.js` — admin-only "Dashboard" nav entry.
- `Claude.md` — document the feature, the migration action item, and the
  `is_admin` setup.

---

## 9. Rollout sequence

1. Apply the migration in Supabase (adds `is_admin` + functions).
2. Set the developer's `is_admin = true` (via the new slash command's SQL).
3. Seed synthetic events (`seed-analytics.mjs --apply`) to validate, then
   `--purge`.
4. Ship; the dashboard populates for real as the already-live analytics accrue
   (also requires the analytics events migration from PR #43 to be applied — an
   existing action item in `Claude.md` §17).

---

## 10. Open questions for the user

1. Confirm **admin-only** (vs. also wanting user-facing learner stats — separate
   spec). *Assumed admin-only.*
2. Confirm the **v1 metric scope** (the five function groups in §4.2), or
   trim/add.
3. Is the **language filter** wanted in v1, or deferred? *Assumed a simple
   optional filter; easy to defer.*
