# Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the developer an admin-only, in-app product-health dashboard (activation funnel, DAU/WAU, retention, story completion) reading the existing `analytics_events` table.

**Architecture:** A single migration adds a `profiles.is_admin` flag and five Postgres `security definer` functions that assert the caller is an admin and return only aggregates. A new `Dashboard.jsx` screen calls them with `supabase.rpc(...)`; pure transforms in `dashboardMetrics.js` shape the rows for hand-rolled inline-SVG charts. Access is gated in the UI (nav + route) and enforced in Postgres.

**Tech Stack:** React 19, Vite 8 (OXC parser), Supabase (Postgres + RLS + RPC), Tailwind + CSS variables, lucide-react, Vitest (node env). Node `.mjs` script for seeding.

## Global Constraints

- **No new npm dependencies.** Charts are hand-rolled inline SVG.
- **OXC parser is strict** — no complex regex literals in JSX.
- **Styling:** Tailwind + CSS variables (`var(--bg)`, `var(--text)`, `var(--text-muted)`, `var(--surface-2)`, `var(--surface-glass)`, `var(--border)`, etc.); theme-aware light/dark. Icons from `lucide-react`.
- **Analytics/UX ethos:** best-effort, never throw into the UI. Wrap all RPC calls in try/catch; failure shows an error state, never a crash.
- **Admin is enforced in Postgres**, not just the UI. The nav/route gate is convenience only.
- **Tests** live at `src/*.test.js`, run under Vitest node env (`npm test`). Only pure logic is unit-tested (no DOM).
- **Migrations** live in `supabase/migrations/` with a `YYYYMMDDHHMMSS_` prefix and end with `notify pgrst, 'reload schema';`.
- **Node scripts** read `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`, run via `node --env-file=.env.script`, are **dry-run by default** (`--apply` writes), and never delete non-synthetic data.
- **Event names** are the `EVENTS` enum in `src/analytics.js` (e.g. `landing_viewed`, `signup_completed`, `onboarding_completed`, `first_mission_completed`, `first_story_completed`, `story_opened`, `story_completed`, `session_started`, `session_ended`). `session_ended` carries `props.duration_ms`.
- **Verify before commit:** `npm run build` and `npm test` must pass.
- **Commit messages** are plain and descriptive (repo style — no `feat:`/`fix:` prefixes).

**RPC return contracts** (produced by Task 1, consumed by Tasks 2 & 4 — names/types are load-bearing):
- `admin_overview(from_ts, to_ts)` → one row `{ signups, dau, wau, sessions, median_session_ms }`
- `admin_funnel(from_ts, to_ts)` → rows `{ stage text, count bigint }` ordered: `landing, signup, onboarding, first_mission, first_story, returned`
- `admin_active_users(from_ts, to_ts)` → rows `{ day date, dau bigint }` ascending
- `admin_retention(cohort_from, cohort_to)` → rows `{ cohort_day date, cohort_size bigint, d1 bigint, d7 bigint, d30 bigint }`
- `admin_story_stats(from_ts, to_ts)` → rows `{ language text, opened bigint, completed bigint }`

---

### Task 1: Migration — `is_admin` flag + admin aggregation functions

**Files:**
- Create: `supabase/migrations/20260715000000_add_admin_analytics.sql`

**Interfaces:**
- Consumes: existing `public.analytics_events` and `public.profiles` tables.
- Produces: `profiles.is_admin` column; SQL functions `assert_admin()`, `admin_overview`, `admin_funnel`, `admin_active_users`, `admin_retention`, `admin_story_stats` (contracts above), each `execute`-granted to `authenticated`.

This task has no in-repo unit test (there is no SQL test harness). Its deliverable is the migration file plus a manual apply+call verification.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260715000000_add_admin_analytics.sql`:

```sql
-- Admin-only analytics: an is_admin flag on profiles + security-definer
-- aggregation functions over analytics_events. Functions return ONLY aggregates
-- (never raw event rows) and each asserts the caller is an admin, so raw
-- analytics never leave the database and the anon/user client can read nothing.
--
-- Apply in the Supabase SQL editor.

-- 1. Admin flag ---------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- 2. Admin guard (raises if the caller is not an admin) ------------------------
create or replace function public.assert_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin
  ) then
    raise exception 'not authorized';
  end if;
end;
$$;

-- 3. Headline KPIs ------------------------------------------------------------
create or replace function public.admin_overview(from_ts timestamptz, to_ts timestamptz)
returns table (signups bigint, dau bigint, wau bigint, sessions bigint, median_session_ms numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  select
    (select count(*) from analytics_events e
       where e.name = 'signup_completed' and e.created_at >= from_ts and e.created_at < to_ts),
    (select count(distinct e.user_id) from analytics_events e
       where e.user_id is not null and e.created_at >= now() - interval '1 day'),
    (select count(distinct e.user_id) from analytics_events e
       where e.user_id is not null and e.created_at >= now() - interval '7 days'),
    (select count(*) from analytics_events e
       where e.name = 'session_started' and e.created_at >= from_ts and e.created_at < to_ts),
    (select percentile_cont(0.5) within group (order by (e.props->>'duration_ms')::numeric)
       from analytics_events e
       where e.name = 'session_ended' and (e.props ? 'duration_ms')
         and e.created_at >= from_ts and e.created_at < to_ts);
end;
$$;

-- 4. Activation funnel --------------------------------------------------------
-- Pre-auth stages (landing/signup) counted by distinct session_id; post-auth by
-- distinct user_id. 'returned' = users with any event on a day after signup.
create or replace function public.admin_funnel(from_ts timestamptz, to_ts timestamptz)
returns table (stage text, count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  with e as (
    select * from analytics_events
    where created_at >= from_ts and created_at < to_ts
  )
  select x.stage, x.count from (
    select 'landing'::text as stage, count(distinct session_id)::bigint as count, 1 as ord
      from e where name = 'landing_viewed'
    union all
    select 'signup', count(distinct session_id)::bigint, 2
      from e where name = 'signup_completed'
    union all
    select 'onboarding', count(distinct user_id)::bigint, 3
      from e where name = 'onboarding_completed'
    union all
    select 'first_mission', count(distinct user_id)::bigint, 4
      from e where name = 'first_mission_completed'
    union all
    select 'first_story', count(distinct user_id)::bigint, 5
      from e where name = 'first_story_completed'
    union all
    select 'returned', (
      select count(distinct s.user_id) from (
        select user_id, min(created_at)::date as signup_day
        from analytics_events
        where name = 'signup_completed' and user_id is not null
        group by user_id
      ) s
      where exists (
        select 1 from analytics_events a
        where a.user_id = s.user_id and a.created_at::date > s.signup_day
      )
    )::bigint, 6
  ) x
  order by x.ord;
end;
$$;

-- 5. DAU time series ----------------------------------------------------------
create or replace function public.admin_active_users(from_ts timestamptz, to_ts timestamptz)
returns table (day date, dau bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  select e.created_at::date as day, count(distinct e.user_id)::bigint as dau
  from analytics_events e
  where e.user_id is not null and e.created_at >= from_ts and e.created_at < to_ts
  group by e.created_at::date
  order by day;
end;
$$;

-- 6. Retention by signup cohort ----------------------------------------------
create or replace function public.admin_retention(cohort_from timestamptz, cohort_to timestamptz)
returns table (cohort_day date, cohort_size bigint, d1 bigint, d7 bigint, d30 bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  with cohorts as (
    select user_id, min(created_at)::date as signup_day
    from analytics_events
    where name = 'signup_completed' and user_id is not null
    group by user_id
    having min(created_at) >= cohort_from and min(created_at) < cohort_to
  ),
  activity as (
    select distinct user_id, created_at::date as active_day
    from analytics_events where user_id is not null
  )
  select c.signup_day as cohort_day,
         count(distinct c.user_id)::bigint as cohort_size,
         count(distinct c.user_id) filter (where a.active_day = c.signup_day + 1)::bigint as d1,
         count(distinct c.user_id) filter (where a.active_day = c.signup_day + 7)::bigint as d7,
         count(distinct c.user_id) filter (where a.active_day = c.signup_day + 30)::bigint as d30
  from cohorts c
  left join activity a on a.user_id = c.user_id
  group by c.signup_day
  order by c.signup_day;
end;
$$;

-- 7. Story open vs complete ---------------------------------------------------
create or replace function public.admin_story_stats(from_ts timestamptz, to_ts timestamptz)
returns table (language text, opened bigint, completed bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
  select coalesce(e.language, 'unknown') as language,
         count(*) filter (where e.name = 'story_opened')::bigint as opened,
         count(*) filter (where e.name = 'story_completed')::bigint as completed
  from analytics_events e
  where e.name in ('story_opened', 'story_completed')
    and e.created_at >= from_ts and e.created_at < to_ts
  group by coalesce(e.language, 'unknown')
  order by opened desc;
end;
$$;

-- 8. Grants: any authenticated user may CALL the functions, but each function
-- refuses non-admins via assert_admin(). No table SELECT is granted.
grant execute on function public.admin_overview(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_funnel(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_active_users(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_retention(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_story_stats(timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Verify the SQL parses (build is unaffected; migration is not imported by the app)**

Run: `npm run build`
Expected: build succeeds (the `.sql` file is not part of the JS bundle; this just confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260715000000_add_admin_analytics.sql
git commit -m "Admin analytics migration: is_admin flag + aggregation functions"
```

> **Manual apply (done by the developer, not the agent):** paste the migration into the Supabase SQL editor, then set your own row admin: `update public.profiles set is_admin = true where id = 'YOUR_USER_ID';`. Call a function to confirm: `select * from public.admin_overview(now() - interval '30 days', now());`.

---

### Task 2: Pure metrics transforms — `dashboardMetrics.js`

**Files:**
- Create: `src/dashboardMetrics.js`
- Test: `src/dashboardMetrics.test.js`

**Interfaces:**
- Consumes: RPC row shapes from Task 1.
- Produces:
  - `pct(numerator, denominator)` → integer 0–100 (0 when denominator ≤ 0)
  - `withConversion(stages)` — `stages: [{ stage, count }]` → `[{ stage, count, pctOfTop, pctOfPrev }]`
  - `median(nums)` → number (0 for empty)
  - `fillDailySeries(rows, fromISO, toISO)` — `rows: [{ day, dau }]` → continuous `[{ day, dau }]` with 0-filled gaps, ascending, inclusive of `fromISO`, exclusive of `toISO`
  - `storyCompletionRate(rows)` — `rows: [{ opened, completed }]` → integer 0–100 over summed totals

- [ ] **Step 1: Write the failing test**

Create `src/dashboardMetrics.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { pct, withConversion, median, fillDailySeries, storyCompletionRate } from './dashboardMetrics'

describe('pct', () => {
  it('rounds a ratio to an integer percent', () => {
    expect(pct(1, 4)).toBe(25)
    expect(pct(2, 3)).toBe(67)
  })
  it('is 0 when the denominator is 0 or missing', () => {
    expect(pct(5, 0)).toBe(0)
    expect(pct(5, -1)).toBe(0)
  })
})

describe('withConversion', () => {
  it('adds pctOfTop and pctOfPrev for each stage', () => {
    const out = withConversion([
      { stage: 'landing', count: 100 },
      { stage: 'signup', count: 40 },
      { stage: 'onboarding', count: 20 },
    ])
    expect(out[0]).toEqual({ stage: 'landing', count: 100, pctOfTop: 100, pctOfPrev: 100 })
    expect(out[1]).toEqual({ stage: 'signup', count: 40, pctOfTop: 40, pctOfPrev: 40 })
    expect(out[2]).toEqual({ stage: 'onboarding', count: 20, pctOfTop: 20, pctOfPrev: 50 })
  })
  it('handles an empty top stage without dividing by zero', () => {
    const out = withConversion([{ stage: 'landing', count: 0 }, { stage: 'signup', count: 0 }])
    expect(out[1].pctOfTop).toBe(0)
    expect(out[1].pctOfPrev).toBe(0)
  })
})

describe('median', () => {
  it('returns the middle of an odd-length set', () => {
    expect(median([3, 1, 2])).toBe(2)
  })
  it('averages the two middles of an even-length set', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
  it('is 0 for an empty set', () => {
    expect(median([])).toBe(0)
  })
})

describe('fillDailySeries', () => {
  it('fills missing days with 0 and sorts ascending', () => {
    const out = fillDailySeries(
      [{ day: '2026-07-03', dau: 5 }, { day: '2026-07-01', dau: 2 }],
      '2026-07-01', '2026-07-04',
    )
    expect(out).toEqual([
      { day: '2026-07-01', dau: 2 },
      { day: '2026-07-02', dau: 0 },
      { day: '2026-07-03', dau: 5 },
    ])
  })
})

describe('storyCompletionRate', () => {
  it('is completed/opened over summed totals', () => {
    expect(storyCompletionRate([
      { opened: 10, completed: 4 },
      { opened: 10, completed: 6 },
    ])).toBe(50)
  })
  it('is 0 when nothing was opened', () => {
    expect(storyCompletionRate([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/dashboardMetrics.test.js`
Expected: FAIL — `Failed to resolve import "./dashboardMetrics"`.

- [ ] **Step 3: Write the implementation**

Create `src/dashboardMetrics.js`:

```js
// Pure transforms from admin RPC row shapes into chart-ready data. No Supabase,
// no DOM — unit-tested. Keeps Dashboard.jsx to rendering.

// Integer percent; 0 when the denominator is not positive.
export function pct(numerator, denominator) {
  if (!(denominator > 0)) return 0
  return Math.round((numerator / denominator) * 100)
}

// Add conversion vs. the top stage and vs. the previous stage.
// stages: [{ stage, count }] ordered top -> bottom.
export function withConversion(stages) {
  const top = stages.length ? stages[0].count : 0
  return stages.map((s, i) => {
    const prev = i === 0 ? top : stages[i - 1].count
    return {
      stage: s.stage,
      count: s.count,
      pctOfTop: i === 0 ? (top > 0 ? 100 : 0) : pct(s.count, top),
      pctOfPrev: i === 0 ? (top > 0 ? 100 : 0) : pct(s.count, prev),
    }
  })
}

export function median(nums) {
  if (!nums || nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// Continuous daily series with 0-filled gaps, [fromISO, toISO). Days are
// 'YYYY-MM-DD' strings; iteration is UTC-safe by stepping calendar dates.
export function fillDailySeries(rows, fromISO, toISO) {
  const byDay = new Map((rows || []).map(r => [r.day, Number(r.dau) || 0]))
  const out = []
  const cursor = new Date(fromISO + 'T00:00:00Z')
  const end = new Date(toISO + 'T00:00:00Z')
  while (cursor < end) {
    const key = cursor.toISOString().slice(0, 10)
    out.push({ day: key, dau: byDay.get(key) || 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

export function storyCompletionRate(rows) {
  let opened = 0, completed = 0
  for (const r of rows || []) {
    opened += Number(r.opened) || 0
    completed += Number(r.completed) || 0
  }
  return pct(completed, opened)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/dashboardMetrics.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/dashboardMetrics.js src/dashboardMetrics.test.js
git commit -m "Pure dashboard metric transforms + tests"
```

---

### Task 3: Synthetic event seeder — `seed-analytics.mjs`

**Files:**
- Create: `seed-analytics.mjs`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`; inserts into `public.analytics_events`.
- Produces: synthetic rows tagged `app_version = 'seed'` so `--purge` deletes exactly them. No unit test (a Node ops script, like the other `*.mjs` tools); verified by dry-run output.

- [ ] **Step 1: Write the script**

Create `seed-analytics.mjs`:

```js
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

// Seed clearly-synthetic analytics_events so the admin dashboard can be built
// and demoed before real traffic exists. Every row is tagged app_version='seed'
// so --purge removes exactly these and nothing real.
//
// Run:
//   node --env-file=.env.script seed-analytics.mjs            # dry-run (prints a summary)
//   node --env-file=.env.script seed-analytics.mjs --apply    # insert
//   node --env-file=.env.script seed-analytics.mjs --purge --apply   # delete synthetic rows
//
// Dry-run by default. Never touches non-'seed' rows.

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with: node --env-file=.env.script seed-analytics.mjs ...')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const purge = args.includes('--purge')
const SEED_TAG = 'seed'
const DAYS = 30
const USERS_PER_DAY = 8
const LANGS = ['chinese', 'japanese', 'russian']

function iso(daysAgo, hour = 12) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}
function chance(p) { return Math.random() < p }

function buildRows() {
  const rows = []
  for (let day = DAYS; day >= 0; day--) {
    for (let u = 0; u < USERS_PER_DAY; u++) {
      const session = 'seed-' + randomUUID()
      const language = LANGS[Math.floor(Math.random() * LANGS.length)]
      const base = { session_id: session, language, level: 1, app_version: SEED_TAG }
      const push = (name, userId, extra = {}) =>
        rows.push({ ...base, name, user_id: userId, props: extra, created_at: iso(day, 9 + u) })

      push('landing_viewed', null)
      if (!chance(0.45)) continue
      const userId = randomUUID()
      push('signup_completed', userId)
      push('session_started', userId)
      push('session_ended', userId, { duration_ms: 60000 + Math.floor(Math.random() * 600000) })
      if (chance(0.8)) push('onboarding_completed', userId)
      if (chance(0.6)) push('first_mission_completed', userId)
      if (chance(0.4)) { push('story_opened', userId); if (chance(0.6)) push('first_story_completed', userId) }
      // Some users return the next day.
      if (day > 0 && chance(0.35)) {
        rows.push({ ...base, name: 'story_opened', user_id: userId, props: {}, created_at: iso(day - 1, 10) })
        if (chance(0.5)) rows.push({ ...base, name: 'story_completed', user_id: userId, props: {}, created_at: iso(day - 1, 10) })
      }
    }
  }
  return rows
}

async function main() {
  if (purge) {
    console.log(apply ? 'Purging synthetic rows...' : 'DRY RUN — would purge synthetic rows (app_version=seed).')
    if (apply) {
      const { error, count } = await supabase
        .from('analytics_events')
        .delete({ count: 'exact' })
        .eq('app_version', SEED_TAG)
      if (error) { console.error(error.message); process.exit(1) }
      console.log('Deleted', count, 'rows.')
    }
    return
  }

  const rows = buildRows()
  const byName = {}
  for (const r of rows) byName[r.name] = (byName[r.name] || 0) + 1
  console.log('Synthetic events:', rows.length)
  console.table(byName)

  if (!apply) { console.log('DRY RUN — pass --apply to insert.'); return }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('analytics_events').insert(rows.slice(i, i + 500))
    if (error) { console.error(error.message); process.exit(1) }
  }
  console.log('Inserted', rows.length, 'synthetic rows (app_version=seed).')
}

main()
```

- [ ] **Step 2: Verify it runs in dry-run without env/network**

Run: `node seed-analytics.mjs`
Expected: exits 1 with `Missing env vars...` (proves arg/guard wiring; a real dry-run needs `.env.script`). This is the only check runnable in the sandbox.

- [ ] **Step 3: Commit**

```bash
git add seed-analytics.mjs
git commit -m "Synthetic analytics seeder for dashboard development"
```

> **Manual (developer):** `node --env-file=.env.script seed-analytics.mjs` then `--apply` against a dev Supabase project; `--purge --apply` to clean up.

---

### Task 4: Dashboard screen — `Dashboard.jsx`

**Files:**
- Create: `src/Dashboard.jsx`

**Interfaces:**
- Consumes: `supabase.rpc(...)` (Task 1 contracts); transforms from `./dashboardMetrics` (Task 2); `useIsMobile` from `./useIsMobile`.
- Produces: `export default function Dashboard({ onBack })` — a self-contained admin screen. Rendered by App only when the user is admin (Task 5).

- [ ] **Step 1: Write the component**

Create `src/Dashboard.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { ArrowLeft, Users, Activity, Clock, BookOpen } from 'lucide-react'
import { supabase } from './supabase'
import { useIsMobile } from './useIsMobile'
import { withConversion, median, fillDailySeries, storyCompletionRate } from './dashboardMetrics'

const RANGES = [
  { key: 7, label: '7 days' },
  { key: 30, label: '30 days' },
  { key: 90, label: '90 days' },
]

const STAGE_LABELS = {
  landing: 'Landing viewed',
  signup: 'Signed up',
  onboarding: 'Onboarded',
  first_mission: 'First mission',
  first_story: 'First story',
  returned: 'Returned',
}

function rangeBounds(days) {
  const to = new Date()
  const from = new Date()
  from.setUTCDate(from.getUTCDate() - days)
  return {
    fromTs: from.toISOString(),
    toTs: to.toISOString(),
    fromISO: from.toISOString().slice(0, 10),
    toISO: to.toISOString().slice(0, 10),
  }
}

function fmtMs(ms) {
  if (!ms) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return s + 's'
  return Math.floor(s / 60) + 'm ' + (s % 60) + 's'
}

function Card({ children }) {
  return (
    <div style={{
      background: 'var(--surface-glass)', border: '1px solid var(--border)',
      borderRadius: '14px', padding: '18px 20px',
    }}>{children}</div>
  )
}

function Kpi({ icon: Icon, label, value }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
        <Icon size={16} strokeWidth={1.85} /> {label}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', marginTop: '6px' }}>{value}</div>
    </Card>
  )
}

function FunnelBars({ stages }) {
  const rows = withConversion(stages)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {rows.map(r => (
        <div key={r.stage}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '3px' }}>
            <span>{STAGE_LABELS[r.stage] || r.stage}</span>
            <span>{r.count} · {r.pctOfTop}% of top · {r.pctOfPrev}% step</span>
          </div>
          <div style={{ background: 'var(--surface-2)', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
            <div style={{ width: r.pctOfTop + '%', height: '100%', background: '#4F6047', borderRadius: '6px' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function DauChart({ series }) {
  const w = 640, h = 140, pad = 4
  const max = Math.max(1, ...series.map(d => d.dau))
  const step = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0
  const pts = series.map((d, i) => `${pad + i * step},${h - pad - (d.dau / max) * (h - pad * 2)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label="Daily active users">
      <polyline points={pts} fill="none" stroke="#4F6047" strokeWidth="2" />
    </svg>
  )
}

export default function Dashboard({ onBack }) {
  const isMobile = useIsMobile()
  const [days, setDays] = useState(30)
  const [state, setState] = useState('loading') // loading | ready | empty | error
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    const { fromTs, toTs, fromISO, toISO } = rangeBounds(days)
    async function load() {
      try {
        const [overview, funnel, active, story] = await Promise.all([
          supabase.rpc('admin_overview', { from_ts: fromTs, to_ts: toTs }),
          supabase.rpc('admin_funnel', { from_ts: fromTs, to_ts: toTs }),
          supabase.rpc('admin_active_users', { from_ts: fromTs, to_ts: toTs }),
          supabase.rpc('admin_story_stats', { from_ts: fromTs, to_ts: toTs }),
        ])
        if (cancelled) return
        const firstErr = overview.error || funnel.error || active.error || story.error
        if (firstErr) { setState('error'); return }
        const ov = (overview.data && overview.data[0]) || {}
        const funnelRows = funnel.data || []
        const totalEvents = funnelRows.reduce((s, r) => s + Number(r.count || 0), 0)
        if (totalEvents === 0) { setState('empty'); return }
        setData({
          overview: ov,
          funnel: funnelRows,
          series: fillDailySeries(active.data || [], fromISO, toISO),
          story: story.data || [],
        })
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    }
    load()
    return () => { cancelled = true }
  }, [days])

  const pad = isMobile ? '16px' : '32px'

  return (
    <div style={{ padding: pad, maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <ArrowLeft size={20} strokeWidth={1.85} />
          </button>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Dashboard</h1>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setDays(r.key)} style={{
              padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
              border: '1px solid var(--border)',
              background: days === r.key ? '#E7EDE4' : 'transparent',
              color: days === r.key ? '#4F6047' : 'var(--text-muted)',
              fontWeight: days === r.key ? 600 : 500,
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {state === 'loading' && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {state === 'error' && <Card><p style={{ color: 'var(--text-muted)', margin: 0 }}>Couldn’t load analytics. Confirm the admin migration is applied and you have admin access, then retry.</p></Card>}
      {state === 'empty' && <Card><p style={{ color: 'var(--text-muted)', margin: 0 }}>No analytics yet for this range. Once the analytics migration is applied and traffic (or seeded events) exists, charts appear here.</p></Card>}

      {state === 'ready' && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)' }}>
            <Kpi icon={Users} label="Signups" value={data.overview.signups ?? 0} />
            <Kpi icon={Activity} label="DAU / WAU" value={`${data.overview.dau ?? 0} / ${data.overview.wau ?? 0}`} />
            <Kpi icon={Clock} label="Median session" value={fmtMs(Number(data.overview.median_session_ms))} />
            <Kpi icon={BookOpen} label="Story completion" value={storyCompletionRate(data.story) + '%'} />
          </div>

          <Card>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Activation funnel</h2>
            <FunnelBars stages={data.funnel} />
          </Card>

          <Card>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Daily active users</h2>
            <DauChart series={data.series} />
          </Card>

          <Card>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Stories by language</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data.story.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No story activity yet.</span>}
              {data.story.map(s => (
                <div key={s.language} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <span style={{ textTransform: 'capitalize' }}>{s.language}</span>
                  <span>{s.completed}/{s.opened} completed</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
```

> Note: `median` is imported for a future duration-distribution view and `admin_retention` for a future cohort view — both intentionally deferred to keep v1 focused (data paths ready). If a linter flags the unused `median` import during implementation, drop it from the import line rather than adding filler UI.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds (Dashboard is not yet routed, but must compile).

- [ ] **Step 3: Commit**

```bash
git add src/Dashboard.jsx
git commit -m "Admin dashboard screen (KPIs, funnel, DAU, story stats)"
```

---

### Task 5: Wire the route, nav, and admin gate

**Files:**
- Modify: `src/routes.js` (add `dashboard` to `KNOWN_VIEWS`)
- Modify: `src/routes.test.js` (assert the mapping)
- Modify: `src/navConfig.js` (export an admin nav item)
- Modify: `src/Sidebar.jsx` (render admin item when `isAdmin`)
- Modify: `src/MobileNav.jsx` (render admin item when `isAdmin`)
- Modify: `src/App.jsx` (lazy import, admin-gated render branch, pass `isAdmin` to nav)

**Interfaces:**
- Consumes: `Dashboard` (Task 4); `profile.is_admin` (Task 1 column, already loaded via `select('*')`).
- Produces: `/dashboard` renders `Dashboard` for admins, `NotFound` otherwise; a "Dashboard" nav entry visible only to admins.

- [ ] **Step 1: Add the route + a failing test**

In `src/routes.js`, add `'dashboard'` to the `KNOWN_VIEWS` array (append after `'settings'`):

```js
export const KNOWN_VIEWS = [
  'home',
  'study', 'weak', 'test', 'writing', 'listen', 'kana', 'cyrillic',
  'practice', 'words', 'grammar', 'strokes', 'builder', 'fillblank',
  'tones', 'stories', 'profile', 'languages', 'youtube', 'settings',
  'dashboard',
]
```

In `src/routes.test.js`, add to the `describe('isKnownView', ...)` block a case:

```js
  it('accepts the admin dashboard view', () => {
    expect(isKnownView('dashboard')).toBe(true)
  })
```

- [ ] **Step 2: Run the routes test to verify it passes**

Run: `npx vitest run src/routes.test.js`
Expected: PASS (including the round-trip test, since `viewToPath('dashboard') === '/dashboard'`).

- [ ] **Step 3: Add the admin nav item**

In `src/navConfig.js`, add `BarChart3` to the lucide import and export an admin item:

```js
import {
  Home, Layers, BookOpen, Dumbbell, GraduationCap,
  User, Settings, Globe, LogOut, BarChart3,
} from 'lucide-react'
```

Then, at the end of the file:

```js
// Admin-only entry — appended to the bottom nav in Sidebar / MobileNav "More"
// only when profile.is_admin is true. Not part of the default arrays so it
// never renders for regular users.
export const ADMIN_NAV = { key: 'dashboard', label: 'Dashboard', icon: BarChart3 }
```

- [ ] **Step 4: Render the admin item in Sidebar**

In `src/Sidebar.jsx`:
- Update the import: `import { PRIMARY_NAV, BOTTOM_NAV, ADMIN_NAV } from './navConfig'`
- Change the signature: `export default function Sidebar({ view, onNavigate, onLogout, isAdmin }) {`
- Replace the bottom-section map so the admin item is prepended when `isAdmin`:

```jsx
      {/* Bottom section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {(isAdmin ? [ADMIN_NAV, ...BOTTOM_ITEMS] : BOTTOM_ITEMS).map(item => (
          <NavItem
            key={item.key}
            item={item}
            active={view}
            collapsed={collapsed}
            onClick={() => (item.key === 'logout' ? onLogout() : onNavigate(item.key))}
          />
        ))}
      </div>
```

- [ ] **Step 5: Render the admin item in MobileNav**

Open `src/MobileNav.jsx`, then:
- Add `ADMIN_NAV` to its `navConfig` import.
- Change its signature to accept `isAdmin` (e.g. `export default function MobileNav({ view, onNavigate, onLogout, isAdmin }) {`).
- In the "More" sheet list, prepend `ADMIN_NAV` when `isAdmin` — iterate `(isAdmin ? [ADMIN_NAV, ...MOBILE_MORE] : MOBILE_MORE)` wherever it currently maps `MOBILE_MORE`.

Read the file first and match its existing item-rendering shape exactly — the array swap and the new `isAdmin` prop are the only changes.

- [ ] **Step 6: Wire the screen + gate in App.jsx**

In `src/App.jsx`:
- Add a lazy import beside the others: `const Dashboard = lazy(() => import('./Dashboard'))`
- Add a render branch anywhere in the `else if` chain before the `isKnownView` fallback (e.g. just after the `view === 'settings'` branch):

```jsx
  } else if (view === 'dashboard') {
    content = profile.is_admin
      ? <Dashboard onBack={() => navigate('home')} />
      : <NotFound onHome={() => navigate('home')} />
```

- Pass `isAdmin` to both nav components in the shell:

```jsx
        {!isMobile && (
          <div style={{ position: 'relative', zIndex: 10 }}>
            <Sidebar view={view} onNavigate={navigate} onLogout={handleLogout} isAdmin={!!profile.is_admin} />
          </div>
        )}
```

```jsx
        {isMobile && <MobileNav view={view} onNavigate={navigate} onLogout={handleLogout} isAdmin={!!profile.is_admin} />}
```

- [ ] **Step 7: Verify build + full test suite**

Run: `npm run build && npm test`
Expected: build succeeds; all Vitest suites pass (routes + dashboardMetrics included).

- [ ] **Step 8: Commit**

```bash
git add src/routes.js src/routes.test.js src/navConfig.js src/Sidebar.jsx src/MobileNav.jsx src/App.jsx
git commit -m "Route, nav, and admin gate for the dashboard"
```

---

### Task 6: Admin setup command + docs

**Files:**
- Create: `.claude/commands/make-admin.md`
- Modify: `Claude.md` (document the feature, the migration action item, and admin setup)

**Interfaces:**
- Consumes: nothing at runtime. Documentation + a developer helper.
- Produces: a `/make-admin` slash command and updated project docs.

- [ ] **Step 1: Write the slash command**

Create `.claude/commands/make-admin.md`:

```markdown
Give me the SQL to make my account an admin so I can see the analytics dashboard at /dashboard.

Ask me for my user ID if I haven't provided it (Supabase → Authentication → Users). Then give me this SQL to run in the Supabase SQL editor, with the placeholder filled in:

update public.profiles set is_admin = true where id = 'YOUR_USER_ID';

Remind me that:
- This requires the migration `supabase/migrations/20260715000000_add_admin_analytics.sql` to be applied first.
- The dashboard also needs the analytics events migration `20260713120000_add_analytics_events.sql` applied and some traffic (or run `seed-analytics.mjs --apply` for synthetic data).
- To revoke admin: set `is_admin = false` for that id.
```

- [ ] **Step 2: Document in Claude.md**

In `Claude.md`, near the existing analytics migration note in §17 "Immediate action items", append:

```markdown
- **Admin analytics dashboard (new):** Apply `supabase/migrations/20260715000000_add_admin_analytics.sql`, then set your account admin (`/make-admin` slash command → `update profiles set is_admin = true`). Visit `/dashboard` (visible only to admins). Develop/demo with `node --env-file=.env.script seed-analytics.mjs --apply` (purge with `--purge --apply`). Reads via `admin_*` security-definer RPCs; no raw events leave the DB.
```

Then update the §17 priority #1 line to note the dashboard v1 is built (keep the "depends on migration + traffic" caveat).

- [ ] **Step 3: Verify build (docs-only, sanity)**

Run: `npm run build`
Expected: build succeeds (no code changed).

- [ ] **Step 4: Commit**

```bash
git add .claude/commands/make-admin.md Claude.md
git commit -m "Admin dashboard: /make-admin command + docs"
```

---

## Self-Review

**Spec coverage:**
- §3 Approach A (RPC-backed, no service key on client) → Task 1. ✓
- §4.1 access & `is_admin` gate → Task 1 (column + `assert_admin`), Task 5 (UI gate + render branch). ✓
- §4.2 five functions → Task 1 (all five present). ✓
- §4.3 UI (range selector, KPI row, funnel, DAU/WAU, story completion, loading/error/empty states) → Task 4. ✓
- §4.4 synthetic seeder → Task 3. ✓
- §7 testing (pure `dashboardMetrics` + route guard) → Task 2, Task 5. ✓
- §8 files touched → covered across Tasks 1–6. ✓
- §9 rollout → Task 1 manual note + Task 6 docs. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. Task 5 Step 5 (MobileNav) says "read the file and match its shape" because the surrounding JSX is file-specific — the actual change (array swap + `isAdmin` prop) is fully specified.

**Type consistency:** RPC names (`admin_overview/funnel/active_users/retention/story_stats`) and params (`from_ts`, `to_ts`, `cohort_from`, `cohort_to`) match between Task 1 SQL and Task 4 `supabase.rpc` calls. `dashboardMetrics` exports (`pct`, `withConversion`, `median`, `fillDailySeries`, `storyCompletionRate`) match between Task 2 definition/tests and Task 4 imports. `ADMIN_NAV` shape (`{ key, label, icon }`) matches `NavItem` usage. `Dashboard({ onBack })` prop matches App's render branch.

**Known deferrals (intentional, per spec YAGNI):** retention chart UI and the language-filter dropdown — both have their data path ready and can be added without rework.
```
