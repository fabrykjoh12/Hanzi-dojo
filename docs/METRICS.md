# 📐 Metric dictionary

**Internal. Not Discord-synced.** One definition per number the product shows —
on `/dashboard` and in learner-facing progress copy. If a screen and this file
disagree, one of them is wrong; fix whichever is, in the same change.

All dashboard aggregates come from the `admin_*` RPCs
(`supabase/migrations/20260801090000_honest_admin_metrics.sql`). Shared rules:

- **Timezone:** all ranges are UTC, half-open `[from, to)`. "Last N days" means
  `now() - N days` up to now.
- **Staff exclusion:** every aggregate drops events whose `user_id` belongs to a
  profile with `is_admin = true`. Anonymous (pre-signup) staff events cannot be
  identified and remain counted — a known, accepted gap.
- **Source:** the append-only `analytics_events` table. Events are best-effort
  client inserts (never blocking the app), so all analytics are lower bounds,
  and an analytics event is never proof a learning mutation happened — learning
  state lives in `cards` / `story_reads` / `daily_activity` etc.
- **Actor:** an account (`user_id`) when signed in, else the per-app-load
  `session_id` (client-generated; one per tab load, NOT a login session).

## Dashboard metrics

| Metric | Definition |
|---|---|
| **Signups** | Distinct actors with a `signup_completed` event in range. Deduped so a retried signup can't double-count. |
| **DAU / WAU** | Distinct signed-in `user_id`s with any event in the trailing **1 / 7 days from now** — deliberately NOT scoped to the range picker (they answer "how active is the app right now"). The UI says so. |
| **Median session** | Median `props.duration_ms` over `session_ended` events in range. A tab can emit several `session_ended`s (hide/show); each carries duration-so-far, so this skews slightly low. |
| **Sessions** | Distinct `session_id`s with a `session_started` event in range (one per app load). |
| **Activation stages** | Per-stage counts in the range: `landing` and `signup` count distinct browser sessions (pre-auth); `onboarding`, `first_mission`, `first_story` count distinct accounts; `returned` counts accounts that signed up in range AND have any event on a later calendar day in range. Stages use different identities and are counted independently, so they are **not strictly nested — this is not a true funnel** and the UI no longer calls it one. |
| **Retention D1/D7/D30** | Cohort = accounts whose first `signup_completed` falls on a UTC day in range. DN = share of the cohort with any event exactly N days later. A cohort younger than N days renders "—", never 0%. Headline = blended across matured cohorts only. |
| **Readers finishing (story finish rate)** | Per language, in range: `opened` = distinct actors with a `story_opened`; `completed` = the subset of those same actors with a `story_completed`. Rate = completed/opened, so it is 0–100 by construction and reads "of readers who opened a story this period, X% finished at least one". Re-reads and duplicate finish events don't inflate it. |

### Why the story metric is reader-based, not story-based

Historical `story_opened`/`story_completed` events carry no story id, so
per-story dedupe is impossible for old rows. Since 2026-08-01 both events carry
`props.story_id`; once enough data accumulates, a per-story completion metric
can be added **as a new metric** — do not silently change this one's meaning.

Known instrumentation notes:
- The classic reader and the guided readers (paced / chat / scene) fire both
  open and complete. Before 2026-08-01 the guided readers fired only
  `story_completed` — one cause of the historical >100% rates.
- The manhua reader fires neither event today (its reads land in
  `story_reads` via its own progress flow); it is invisible to this metric.

## Learner-facing progress terms

Defined by `src/mastery.js`, `docs/ARCHITECTURE.md` §mastery:

| Term | Definition |
|---|---|
| **Learned** | `cards.learned = true`, or FSRS state is `review`/`relearning`. Gates story tiers (the low bar, for early immersion). |
| **Mastered** | FSRS `stability >= 21` days (`MASTERY_STABILITY_DAYS`). Gates the level test and the mastery display. `is_easy` gates nothing. |
| **Due** | Day-based availability: everything scheduled for today is available from local midnight (Anki-style), not at the exact clock time last reviewed. |
| **Level progress** | Learned words at the current level / active words at that level. Level labels always via `getLevelLabel()` — never hardcoded. |

When adding a new number to any screen: name its scope (current level / all
levels / date range / all time) in the copy, state its numerator and
denominator here, and never clamp a broken query with `Math.min(100, x)` — fix
the query.
