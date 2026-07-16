# Public Story Links — Design

**Date:** 2026-07-16
**Status:** Approved (design)
**Roadmap item:** "Public story links — open a story without an account, see 'you'd
understand ~X%', with a 'learn to read this' invite" (ROADMAP.md → Now).

## Goal

A signed-out person opens a shared story URL, picks their rough level, sees
"you'd understand ~X%" of *this* story, reads a short taste, and hits a
"sign up free to read the rest" gate. This is the destination the just-shipped
share card and Known-Content Analyzer were missing — the share card currently
links only to the homepage.

This is a **growth / acquisition** feature: the funnel is shared link →
public reveal → signup.

## Non-goals (v1)

- No add-to-deck, audio playback, or tap-to-define on the public page (all
  account-gated features).
- No carry-through of story context into signup — a visitor who signs up goes
  through **standard onboarding**, not a preselected language/level or a
  land-back-on-this-story flow.
- No server-side prerendering for crawler-grade OG tags — client-side
  `document.title` + meta updates only.
- No precomputed readability table — the percentage is computed live,
  client-side, with the canonical function.

## Core constraint & approach

Today RLS locks `stories` and `vocabulary` to `authenticated` users, and
`App.jsx` renders `<Landing/>` for anyone without a session (the URL is
ignored). Three changes address this:

1. **Public route.** `App.jsx` checks the pathname *before* the
   `!session → Landing` branch. A path of `/read/:storyId` renders a new
   `<PublicStory/>` component. A **signed-in** user hitting `/read/:storyId` is
   redirected into the normal in-app reader for that story.

2. **Anon read access via a `security-definer` RPC** — `public_story(p_story_id)`
   returns a single **published** story's `{ id, title, language, system, level,
   cover_url, content, english_content, vocab_pool }`, where `vocab_pool` is the
   vocabulary rows needed to segment and grade the story (word, reading, meaning,
   level, sort_order). It asserts `is_published = true` and returns nothing for
   unpublished/absent stories. This mirrors the admin-dashboard pattern (RLS stays
   locked; an RPC returns exactly what's needed) and is preferred over a broad
   `anon` RLS policy because it can only ever expose published-story content.

3. **Client-side percentage.** `<PublicStory/>` computes "% known" with the
   existing `calculateStoryReadability` from `storyReading.js` — the app's single
   source of truth — so the public number **exactly matches** what the user sees
   after signup. No drift, no precompute. Story text is not sensitive (signed-in
   users read it free, and public/indexable content aids growth), so shipping the
   full text in the anon payload is acceptable even though only a few lines render.

## The public page (`src/PublicStory.jsx`)

A single-screen flow with **no app shell** (no sidebar/nav) — a landing surface
styled like `Landing.jsx` / `Auth.jsx`.

1. **Above the fold:** cover image, title, language + level badge, one line of
   positioning ("A real {language} story. How much can you already read?").

2. **Level pick:** three chips — **Just starting · Some · Quite a bit** — mapping
   to an assumed-known vocabulary set:
   - *Just starting* → the most common ~50 words of level 1.
   - *Some* → all of level 1.
   - *Quite a bit* → cumulative vocabulary up to the **story's own level**.

   The mapping reuses the app's cumulative-level model (a learner at level N is
   assumed to know all vocab at levels ≤ N). Pure helper, unit-tested.

3. **The reveal:** on pick, a memoized `calculateStoryReadability` run produces
   the headline **"You'd understand ~X%"** plus the same known / learning / new
   breakdown bar the real reader uses. Then the **first 3–4 lines** render with
   real word highlighting (known = plain, new = underlined) — a genuine taste.

4. **The gate:** directly under the teaser lines —
   **"Sign up free to read the rest and start learning these words"** → primary
   CTA to signup. A soft secondary row lets them re-pick level or share.

State: local `assumedLevel` + memoized readability derived from the single RPC
result. One component, one data read.

## Entry point & share wiring

- **"Share this story" in `StoryReaderImmersive.jsx`** builds
  `BRAND_URL + '/read/' + story.id` and passes it as the `url` argument to the
  existing `shareReadingCard(...)`. The branded share image now links to the
  actual story; `shareCard.js` logic is unchanged (it already accepts `url`).
- **Direct link** — the URL is shareable on its own (Discord, DMs), with or
  without the image.
- **SEO / unfurl:** `PublicStory` sets `document.title` and best-effort
  meta/OG tags per story so a pasted link unfurls with the title + "understand
  X%" hook. Client-side only; full crawler-grade prerendering is a noted
  follow-up, not in v1.

## Analytics

`analytics_events` already accepts anonymous rows (the anon-funnel insert
policy), so the funnel is measurable end-to-end without an account. New event
constants in `analytics.js`, fired from `PublicStory`:

- `PUBLIC_STORY_VIEWED` — { storyId, language, level }
- `PUBLIC_STORY_LEVEL_PICKED` — { assumedLevel, knownPct }
- `PUBLIC_STORY_SIGNUP_CLICKED`

These feed the existing admin dashboard, making "shared links → signups" a
visible conversion funnel.

## Components & boundaries

| Unit | Purpose | Depends on |
|------|---------|-----------|
| `public_story(p_story_id)` RPC | Return one published story + its vocab pool to anon | Supabase (security definer) |
| `src/publicStory.js` (pure) | Level-chip → assumed-known-vocab mapping; teaser-line selection | none (unit-tested) |
| `src/PublicStory.jsx` | The public page: pick → reveal → gate | `publicStory.js`, `storyReading.js`, `analytics.js`, supabase RPC |
| `App.jsx` routing | Render `PublicStory` for `/read/:id` before the Landing gate; redirect signed-in users into the reader | routes.js |
| `StoryReaderImmersive.jsx` | "Share this story" builds the `/read/:id` URL | `shareCard.js` |

## Testing

- **`src/publicStory.test.js`** — the level→known-vocab mapping and teaser-line
  selection (pure logic).
- **Routing** — extend `routes.test.js` so `/read/:id` resolves to the public
  view and is not treated as a 404.
- **`ecc:react-test`** — RTL flow: pick level → reveal % → gate CTA present.
- **Security pass** — `ecc:database-reviewer` + `ecc:security-reviewer` on the
  `security-definer` RPC: confirm it exposes only published-story content and
  no user data or unpublished rows.
- **`verify`** — drive the signed-out flow end-to-end (Playwright) before ship.

## Error handling

- RPC returns nothing (unpublished / bad id) → friendly "story not found" state
  with a link to the homepage, not a crash.
- RPC / network failure → same friendly fallback; never a blank screen.
- Signed-in visitor on `/read/:id` → redirect into the in-app reader.
- Analytics inserts are best-effort (existing `analytics.js` contract) and can
  never block the page.

## Deployment note

The `public_story` RPC ships as a new migration under `supabase/migrations/`
and must be applied in the Supabase SQL editor before the public page returns
data (the page degrades to the "not found" state until then — same defensive
pattern as prior migrations).
