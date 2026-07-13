<div align="center">

# 🥋 Hanzi Dojo

### Learn words. Unlock stories you can actually read.

Hanzi Dojo pairs **FSRS spaced‑repetition flashcards** with **graded mini‑stories matched to your known vocabulary** — so every study session turns into real reading, not another streak.

Chinese · Japanese · Russian &nbsp;•&nbsp; PWA · offline‑capable &nbsp;•&nbsp; React + Supabase

</div>

---

## Why Hanzi Dojo

Most language apps optimize for streaks. Hanzi Dojo optimizes for **reading you can feel**. The core idea is simple:

> Every word you learn becomes part of a story you can read.

The daily loop is deliberately short and guided:

1. **Learn / review words** with a real FSRS scheduler (not fake "levels").
2. **See those words unlock reading** — each story shows how much of it you already know.
3. **Read a mini‑story** matched to your known vocabulary (comprehensible input, no dictionary hunting).
4. **Get a recap** that shows concrete progress and what you'll unlock next.
5. **Come back tomorrow** for the next session and story.

Everything that isn't part of that loop is tucked into a secondary **Practice Lab**, so Home feels like a coach — not a menu.

> **Screenshots:** _add product screenshots here_ — Landing hero · Today's Dojo (Home) · Story reader with "% known" · Session recap.

---

## Core features

- **FSRS flashcards** — scheduling via [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs); mastery means the algorithm predicts recall ~3 weeks out, so it can't be faked by tapping buttons.
- **Graded stories with "% known"** — each story shows known / new / weak words inline; tap an underlined word to reveal it, tap again to add it to your deck.
- **Honest level progression** — levels unlock through a real test (available at 90% mastery, passed at 100%).
- **A calm daily coach** — Home surfaces one next action, why it matters, and what it unlocks.
- **Practice Lab** — weak words, listening, writing, fill‑in‑the‑blank, sentence builder, tones/kana/Cyrillic, stroke order, grammar guides, word list, and video input.
- **Chat Missions** — short conversations built from the words you just learned.
- **Offline‑first PWA** — installable, with a durable IndexedDB write outbox that replays on reconnect (see [Offline & data safety](#offline--data-safety)).
- **Multi‑language** — Chinese (HSK 3.0), Japanese (JLPT), Russian (CEFR). Chinese is the flagship track.
- **Audio** — real TTS narration for vocabulary and stories, with an iOS‑safe playback fallback.
- **Optional daily review reminders** via Web Push.

---

## Tech stack

| Area | Choice |
| --- | --- |
| UI | React 19, React Router 7 |
| Build | Vite 8 |
| Styling | Tailwind CSS 3 + CSS variables (theme‑aware light/dark) |
| Scheduling | `ts-fsrs` |
| Backend | Supabase (Postgres + Auth + Storage + RLS) |
| Script helpers | `wanakana` (kana), `hanzi-writer` (stroke order), `web-push` (reminders) |
| Tests | Vitest |
| Hosting | Static SPA (Vercel / GitHub Pages) |

---

## Local setup

```bash
# 1. Install
npm install

# 2. Configure environment (see below)
cp .env.example .env.local   # then fill in your Supabase values

# 3. Run
npm run dev
```

The app expects a Supabase project with the schema in [`supabase/schema.sql`](supabase/schema.sql) applied (plus the migrations in `supabase/migrations/`). See [`docs/DATABASE.md`](docs/DATABASE.md) for the data model.

### Required environment variables

**App (client, `VITE_`‑prefixed — safe to expose):**

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous public key |
| `VITE_VAPID_PUBLIC_KEY` | _(optional)_ Web Push public key for daily reminders |

**Content‑generation & reminder scripts (server‑side only — never commit):**

| Variable | Used by |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | seed / generation / reminder scripts |
| `GOOGLE_TTS_KEY` | audio generation (`generate-audio.mjs`, `generate-story-audio.mjs`) |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` | story & example generation (see `llm.mjs`) |
| `LLM_MODEL`, `LLM_MODEL_PREMIUM`, `LLM_BASE_URL`, `LLM_BASE_URL_PREMIUM` | LLM provider overrides |
| `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` | `send-review-reminders.mjs` |

---

## Available scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build (also copies `index.html` → `404.html` for SPA fallback) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint over the project |
| `npm test` | Run the Vitest suite once |

**Content pipeline (run manually / via GitHub Actions, not part of the app):** `seed-vocab.mjs`, `generate-meanings.mjs`, `generate-examples.mjs`, `generate-serial-stories.mjs` (current story generator), `generate-audio.mjs`, `generate-story-audio.mjs`, `send-review-reminders.mjs`.

---

## Architecture overview

- **SPA, no server of its own.** The React app talks directly to Supabase (Auth, Postgres via the JS client, Storage for audio). Routing is client‑side; `src/routes.js` maps URL ⇄ view and an unknown path renders `NotFound` rather than silently redirecting.
- **`src/App.jsx`** is the shell: it owns the session, active language track, and home counts, and mounts the persistent nav (`Sidebar` desktop / `MobileNav` mobile). Heavy screens are lazy‑loaded.
- **Data layer.** `src/data.js` (`getTrackCards`) is a read‑through cache; `src/homeCounts.js` derives the dashboard numbers; `src/srs.js` wraps FSRS scheduling; `src/mastery.js` / `src/fluency.js` / `src/xp.js` / `src/streak.js` are pure, unit‑tested progress helpers.
- **Shared UI primitives** live in `src/ui.jsx` (`Centered`, `PrimaryButton`, `SecondaryButton`, `CountUp`); navigation is defined once in `src/navConfig.js`.
- **Theming** is CSS‑variable based (`src/index.css`, `ThemeContext`) so light/dark switch cleanly.

### Offline & data safety

Offline support is **strictly additive** — the online code path is unchanged; offline branches only run when `navigator.onLine === false`.

- `src/offline.js` — dependency‑free IndexedDB wrapper (`cache` / `outbox` / `audio` / `prefs`), every op resolves to a safe default on failure.
- `src/syncQueue.js` — durable write outbox replayed on reconnect; card writes are idempotent upserts, XP is reconciled as a delta against the live server total.
- `src/audioCache.js` — persists TTS blobs for iOS‑safe offline playback.

> **Known trade‑off / TODO:** grading currently issues several separate Supabase writes (card update, review log, daily activity, XP). A future improvement is to collapse these into a single RPC/transaction so a mid‑write failure can't leave partial state. This is tracked in the roadmap.

---

## Testing

```bash
npm test
```

The suite (Vitest) focuses on **meaningful behavior**, not string smoke tests: FSRS scheduling & preview labels, mastery/fluency/XP/streak math, queue and sentence‑bank logic, the sync‑queue reconciliation helpers, route mapping / unknown‑route handling, and email normalization.

---

## Deployment

- Static SPA build (`npm run build`) deployable to Vercel (config in `vercel.json`) or GitHub Pages. The build emits a `404.html` fallback so deep links resolve on static hosts.
- Set the `VITE_*` env vars in your host's environment.
- Supabase: apply `supabase/schema.sql` and the `supabase/migrations/`. Auth redirect URLs must include your deployed origin.
- Daily reminders run as a scheduled GitHub Action (`send-review-reminders.mjs`) — needs the VAPID + Supabase service secrets above.

---

## Current status

Actively developed. Chinese (HSK) is the most mature, flagship track; Japanese (JLPT) and Russian (CEFR) are supported and seeded, with content depth still growing. Core learning is free.

## Roadmap

**Product**
- [ ] First‑session onboarding that ends in an unlocked story + recap ("First story unlocked")
- [ ] Story reader polish — book‑like typography, clearer "learn N more to unlock the next story"
- [ ] Shareable reading recap card ("I can read 82% of this Chinese story")
- [ ] Known‑Word Map & Reading Ladder (visualize what you can read as vocabulary grows)
- [ ] Word‑to‑World chat missions expanded across levels
- [ ] Known‑Content Analyzer — paste text, see % known + words to learn next

**Technical**
- [ ] Collapse the multi‑write grading path into a single Supabase RPC/transaction
- [ ] Continue extracting the large `Study` screen into focused hooks/components
- [ ] Supabase generated types (gradual TypeScript adoption)
- [ ] Centralize design tokens (colors/spacing/shadows) beyond the current shared primitives

**Business**
- Core learning stays free. Potential future premium: unlimited AI‑generated stories, audio/dialogue mode, writing feedback, HSK/JLPT exam mode, custom decks, Anki import/export, teacher/classroom mode.

## Known limitations

- Content depth varies by language and level; Chinese is furthest along.
- Grading is not yet transactional (see the data‑safety note above).
- Reminder scheduling uses a plain UTC hour, so it can drift ~1h across a DST change.
- Some offline paths (grade replay, XP reconcile) are covered by unit tests + build and want a real‑device pass before being fully trusted.
