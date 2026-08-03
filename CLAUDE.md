# CLAUDE.md — Hanzi-dojo

Read this file before making any change. It is deliberately short: only the
things that are **true across sessions** live here — the vision, the rules, the
shape of the codebase, and how to verify work. Everything that changes weekly
lives in the docs indexed below.

**When a decision isn't covered here, choose the option that best serves the
vision and learning philosophy in §1.**

## How to answer (read this first)

The maintainer has ADHD. Long replies are genuinely hard to use, so **short is
not a style preference here — it is the requirement.**

- **5 lines or fewer** unless more is asked for.
- **Answer first.** Reasoning only if asked.
- **No tables, no long bullet lists** unless requested.
- If something is genuinely complex, give the one-line version and offer detail.
- Never re-explain what was already agreed.
- **Never bring up the frozen non-Chinese tracks** (§1). Not in a status line,
  not as a caveat, not as a suggestion. If work happens to touch them through
  shared code, say "all tracks" and move on.

This applies to chat replies only. Commit messages, PR bodies and these docs
still get full detail — they are read once, on purpose.

## Where things are

| Doc | What's in it | Read when |
|-----|--------------|-----------|
| **this file** | Vision, stack, repo shape, coding rules, DB safety rules, workflow | Always, first |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Full DB schema, level/mastery/SRS systems, design system, content pipeline | You need the detail |
| [`docs/METRICS.md`](docs/METRICS.md) | The metric dictionary — one definition per number the product shows | Touching analytics or any displayed number |
| [`docs/STORY-BIBLE.md`](docs/STORY-BIBLE.md) | The story universe: world rules, cast, how a season is made. Machine half: `data/story-canon.chinese.json` | Writing or reviewing stories |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Env vars, hosting, routing, PWA, secrets, failure cheat-sheet | Something is broken in prod |
| [`docs/TESTING.md`](docs/TESTING.md) | What needs manual testing on a real device | Before asking testers |
| [`ROADMAP.md`](ROADMAP.md) | Public plan — **auto-syncs to Discord** | Starting or finishing work |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Engineering backlog, known issues, tech debt | Picking up a fix |
| [`docs/PM-BOARD.md`](docs/PM-BOARD.md) | Current milestone, ownership, merge order | Coordinating parallel work |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Session-by-session history (reference only) | Archaeology |
| [`docs/TTS.md`](docs/TTS.md) | Voice config, pinyin phoneme pinning, the audio pipeline | Touching TTS or regenerating audio |
| [`docs/RELEASE-CHECKLIST.md`](docs/RELEASE-CHECKLIST.md) | Pre-release gate | Cutting a release |
| [`docs/TESTERS.md`](docs/TESTERS.md) | Who tests, and how they're briefed | Organising a test round |
| [`docs/DISCORD.md`](docs/DISCORD.md) | Server layout, webhooks, the sync workflows | Changing anything Discord-facing |
| [`docs/DOJO-BRIDGE.md`](docs/DOJO-BRIDGE.md) | The `tools/` bridge | Working on DojoHQ |
| [`docs/STORY_EXPERIENCE_AUDIT.md`](docs/STORY_EXPERIENCE_AUDIT.md) | Long-form audit of the reading experience | Reworking the reader |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Older schema notes — **`docs/ARCHITECTURE.md` is the current source of truth**; last touched 2026-07-02 | Rarely; prefer ARCHITECTURE.md |
| `docs/superpowers/` | Design specs and plans for shipped features. `archive/` holds completed ones | Archaeology on a feature's design |

### Keep the roadmap current (every task — it is live in Discord)

Whenever we finish or start a meaningful piece of work, edit **`ROADMAP.md`** in
the same change: move finished items to **✅ Shipped**, add newly started/planned
work under **🚧 Now** / **🔜 Next**. Treat this as part of "done", not optional
bookkeeping — the roadmap is the community's live view of progress.

**It syncs to Discord instantly, no manual merge:** any change to `ROADMAP.md`
(or the internal `docs/BACKLOG.md`) on a working branch is auto-copied to `main`
by `.github/workflows/roadmap-live-sync.yml`, and that `main` push triggers
`.github/workflows/discord-notify.yml`, which edits the pinned **#roadmap** (and
**#backlog**) message in place. So you never wait for the feature PR to merge.
That sync only ever moves those two doc files to `main`, never code. A merge to
`main` also posts the changelog to **#announcements** — so write descriptive
commit and PR titles.

---

## 1. Purpose and philosophy

Hanzi-dojo is a free language-learning web app built on the two methods that
actually work: **FSRS spaced repetition** and **level-matched immersion**.

**Scope: Chinese (HSK 3.0) only.** The two non-Chinese tracks are **frozen** —
they stay in the app and keep working for anyone already on them, but they are
out of scope for good: no new content, no new features, no fixes, no design
work, no migrations, no plans. Treat "Chinese" and "the product" as the same
thing.

Applies to work and to conversation both:
- **Never propose, plan, estimate or ask about the frozen tracks.** Not as an
  option, not as a follow-up, not as a "while we're here". Don't report their
  content gaps, their broken things, or their test coverage.
- **Don't spend work on them.** A change that touches all languages because it
  lives in shared code is fine — that is the architecture doing its job — but
  never open a task, script run or migration *for* a frozen track.
- **Don't rip them out either.** Deleting their rows, assets, themes or
  language branches is its own pile of risk and work for zero benefit. Frozen
  means untouched, not removed.
- **The freeze is enforced server-side too** (since 2026-07-31): a DB trigger
  on `language_tracks` only lets ordinary clients activate languages listed by
  `public.public_track_languages()`. **Un-pausing a language therefore takes
  TWO edits**: `PUBLIC_LANGUAGES` in `src/languageTheme.js` AND a migration
  updating that function — the client-side comment alone is no longer the
  whole story.
- Their seeded content, migrations and generator scripts stay in the repo as
  history. Leave them where they are.

**Why it exists:** most apps don't teach the language. Gamified loops waste
time; immersion works, but finding material at your level is hard. Hanzi-dojo
combines SRS with immersion content matched to what you actually know, so the
learner never hunts for comprehensible input — the right stories come to them.

**The daily loop** (the UX should reinforce this order):
1. **Flashcards** — daily SRS review and new cards
2. **Stories** — reading immersion matched to learned vocabulary
3. **Listening** — curated video/audio for the level
4. **Writing / output** — active recall

**Core philosophy:**
- **No shortcuts.** Progression is gated on genuine mastery (FSRS stability), not self-graded buttons.
- **Mastery before progression.** The level test requires 100%. Stories unlock on a lower "learned" bar to encourage early immersion.
- **Calm, not pressured.** No dark patterns, no guilt, no fake urgency. Streaks and XP were deliberately **removed** — they cut against this promise. Copy is observational; the return hook is the work waiting, not guilt.
- **Frequency-first vocabulary.** Most useful words first.
- **Stay free.** If monetisation is ever needed, prefer donations — never paywalls on core features.

**Language stays data-driven anyway.** Per-language identity (accent, font,
native name, background, level system, whether the script is CJK) lives in
`src/languageTheme.js`, and screens read that config rather than branching on
which language is active. That rule survives the scope decision above: it costs
nothing, it is what keeps the frozen tracks working without anyone maintaining
them, and a hardcoded `if (active_language === …)` is still a bug.

---

## 2. Stack

| Tool | Version / Notes |
|------|----------------|
| React | 19.x |
| Vite | 8.x (OXC parser) |
| react-router-dom | 7.x — BrowserRouter; each top-level screen is `/<key>`, home is `/` |
| Supabase JS | ^2.107 — auth, Postgres, storage (`audio` bucket) |
| ts-fsrs | ^5.4.1 — FSRS v5 scheduling |
| wanakana | ^5.3.1 — Japanese romaji conversion |
| hanzi-writer | ^3.7.3 — animated stroke order (char data from CDN at runtime) |
| lucide-react | ^1.17 — **all** UI icons; never emoji-as-icon |
| vitest | ^4.x — unit tests: `src/**/*.test.js` **and** root `*.test.mjs` (the content scripts' pure parts). Both patterns are in `vitest.config.js` |
| Playwright | ^1.61 — e2e, `tests/e2e/*.spec.js` |
| Tailwind CSS | **Preflight only.** No utility classes in JSX — styling is inline style objects. But `src/index.css` does `@tailwind base/components/utilities`, so Tailwind's CSS reset **is** live and styling the app. Removing the dependency would change rendering everywhere; it is not a free delete |
| openai | content scripts only (Groq/Gemini-compatible API) — **not in the app bundle** |
| Node | 22+ (`@supabase/supabase-js` v2 needs a global `WebSocket` at `createClient`) |
| Language | Plain JSX. **No TypeScript.** |

**Supabase project:** `bvqvturqupbggxaeihvi` · `https://bvqvturqupbggxaeihvi.supabase.co` ·
public storage bucket `audio` (all TTS MP3s).

---

## 3. Shape of the codebase

`src/` is **flat** — ~340 files, no subdirectories except `src/tts/` and
`src/assets/`. It works because naming is consistent. Keep the convention:

- **`Foo.jsx`** — a screen or component. Components only (react-refresh).
- **`fooThing.js`** — pure logic, no React, no Supabase import. **This is where behaviour belongs.**
- **`fooThing.test.js`** — sits next to the module it tests. Vitest.
- **`useFoo.js`** — a hook.

**The single most important structural habit in this repo:** when a screen grows
logic, extract the logic into a plain `.js` module and test it there.
`Study.jsx`, `DojoHQ.jsx` and `StoryReaderImmersive.jsx` are each ~1,500 lines
and are where this has not yet been done — every new piece of behaviour in them
should arrive as a tested module, not another branch inside the component.

**Entry points worth knowing:**

| File | Role |
|------|------|
| `src/App.jsx` | Root — session, profile, track, counts; routes view ↔ URL; gates admin views on `profile.is_admin` |
| `src/main.jsx` | React root, `BrowserRouter`, service-worker registration |
| `src/supabase.js` | The client. Renders a visible "Site can't start" card if env vars are missing |
| `src/languageTheme.js` | Per-language identity — **single source of truth** |
| `src/navConfig.js` | Nav arrays — single source consumed by `Sidebar` + `MobileNav`. `ADMIN_NAV` is gated in `App.jsx` |
| `src/srs.js` | FSRS scheduling — `schedule(card, grade)`, `previewLabels(card)` |
| `src/mastery.js` | `MASTERY_STABILITY_DAYS = 21`, `TEST_UNLOCK_MASTERY_PCT = 0.9` |
| `src/storyReading.js` | Story segmentation + vocab matching (CJK greedy, Russian whole-token + inflection) |
| `src/storyShelfFlat.js` | The Stories page's one-page shelf: level sections, series units, % known sorting, inline locks |
| `src/TrustPages.jsx` | Public `/privacy` `/terms` `/support` `/methodology`. **Legal texts are owner-reviewed drafts — never present them as final** |
| `src/errorMonitor.js` | Client error → `client_error` analytics events. Name + 40-char message + route ONLY — never stacks or typed text |
| `src/syncQueue.js` | Durable write outbox — offline grading replay |
| `src/designTokens.js` + `src/panels.jsx` | The "one lit panel" design language |

**Outside `src/`:** `*.mjs` at the repo root are **content-generation scripts**
(never bundled — see `docs/ARCHITECTURE.md`). `supabase/migrations/` holds SQL.
`tools/` holds the Dojo bridge. `worker/` holds the Cloudflare worker.

---

## 4. Core systems (short version — detail in `docs/ARCHITECTURE.md`)

**Levels.** Chinese `hsk_3` levels 1–9 → "HSK N". Japanese `jlpt` levels 1–6 →
N5·Part 1, N5·Part 2, N4, N3, N2, N1. Russian `russian` levels 1–6 → CEFR A1–C2.
**Always use `getLevelLabel(language, system, level)` from `utils.js`. Never
hardcode a label.**

**Mastery — two tiers.** *Learned* = `learned` column true, or state is
`review`/`relearning` → gates story tiers (low bar, early immersion). *Mastered*
= FSRS `stability >= 21 days` → gates the level test and the mastery display.
`is_easy` is kept but gates nothing; **stability is the gate.**

**SRS.** ts-fsrs v5, `request_retention: 0.9`, `enable_fuzz: true`. Grades 0–3 =
Again/Hard/Good/Easy. Learning/relearning cards get `due_at = now()` and re-enter
the session queue at position `gap`; review cards get a real future date. Reviews
use **day-based availability** (Anki-style): everything scheduled for today is
available from local midnight, not at the exact clock time it was last reviewed.

**Metrics.** Every number the product shows has ONE definition, in
`docs/METRICS.md`. Staff accounts are excluded from engagement aggregates
(never from error monitoring), and a broken query gets fixed — never clamped
with `Math.min(100, x)`.

**Database.** ~15 tables; the ones you'll touch most are `profiles`,
`language_tracks`, `vocabulary`, `cards`, `stories`, `daily_activity`. Progress
reset goes through the `reset_current_language_progress` RPC. Full schema in
`docs/ARCHITECTURE.md`.

---

## 5. Design system (essentials — full palette in `docs/ARCHITECTURE.md`)

**Use semantic tokens for every neutral colour**, or it won't theme:
`--bg`, `--surface`, `--surface-2`, `--surface-glass`, `--border`, `--text`,
`--text-muted`, `--text-faint`, `--shadow-1`, `--shadow-2`, `--hairline`.
Hardcoded neutral hexes are a bug.

- **Accents stay hardcoded** — Chinese `#B83A24`, Japanese `#2E3A6E`, Russian
  `#2563C9` — as do status colours and white-on-accent text. Derive them from
  `languageTheme()`, never a ternary on the language.
- **Accent as ink:** wrap an accent in `ink(hex)` (`languageTheme.js`) wherever
  it is *text or a drawn mark* — it lifts toward white in dark mode. Keep the raw
  hex for tints and borders that already mix into a surface.
- **Tints must mix into the surface:** `color-mix(in srgb, <accent> 11%, var(--surface))`,
  never an `<accent>+'14'` alpha hex (that stays light in dark mode).
- **One lit panel per screen.** Exactly one `HeroPanel` — the thing the screen is
  about — on a ground darkened from the *language accent*. Everything else is a
  flat `Panel`. Atmosphere stays under ~12% opacity and is **drawn** (`inkWash.js`),
  never photographic.
- **Flex scroll rule:** any `flex: 1` scroll area inside a `position: fixed` or
  fixed-height flex column needs `min-height: 0`, or it grows to fit its content
  and the overflow gets clipped.

---

## 6. Coding rules (mandatory — the OXC parser is strict)

1. **No TypeScript in `src/`.** No type annotations anywhere in app code.
   (`drizzle.config.ts` is the one exception — it is tooling config, not app code.)
2. **Regex literals are fine.** *(Corrected 2026-08-04.)* This rule used to say
   "no complex regex literals — OXC breaks on them". That is no longer true, and
   the codebase had already outgrown it: ~38 files in `src/` use regex literals
   today and the build is green, including a Unicode property escape in
   `homeStory.js` (`/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u`). Write the
   regex when a regex is clearest; reach for `indexOf()`/`split()`/`includes()`
   because they read better, not out of fear of the parser.
3. **All styling is inline style objects.** No Tailwind utility classes in JSX.
4. **Prefer concatenation in JSX style props** — `'url(' + src + ')'` over
   `` `url(${src})` ``. This is house style for consistency with the existing
   code; the original reason (an OXC parser limit) is unverified and probably
   as stale as rule 2 was. Don't rewrite working template literals to satisfy it.
5. **Device storage is guarded, never assumed.** `localStorage`/IndexedDB work
   fine in production — but always through the existing helpers (`offline.js`,
   the `prelogin.js` try/catch pattern) so a blocked storage API degrades
   quietly. Durable learner data lives in Supabase; device storage is for
   caches and prefs only. *(An older version of this rule claimed storage
   "doesn't work" — that was wrong.)*
6. **Never rely on native `<form>` submission** — it reloads the SPA. Plain
   `onClick`/`onChange` is the house style; a real `<form>` is fine when it has
   `onSubmit` + `preventDefault` (DojoHQ does this).
7. **Keep components flat.** Extract a subcomponent when it's reused or the file would be unreadable — and extract *logic* to a `.js` module (see §3).
8. **`src/` must stay at zero ESLint errors.** Run `npm run lint`; don't add new warnings either.
9. **Verification is not optional** — see §8. The build and the tests are the source of truth, not a read-through.

**The vendored skills in `.claude/skills/` do not know these rules.** They come
from general-purpose upstream projects and several teach in TypeScript. Where a
skill and this file disagree, **this file wins** — see `.claude/skills/VENDORED.md`.

---

## 7. Supabase safety rules

1. **Never delete vocabulary rows** — set `is_active = false`.
2. **Never delete cards** without an explicit user request. Reset goes through the `reset_current_language_progress` RPC only.
3. **Never set `is_easy = true`** outside the SRS grading flow (`srs.js` + `Study.jsx`). Other features may set it `false`, never `true`.
4. **RLS is enabled** — frontend queries run as the authenticated user. **Never put the service key in frontend code or any `VITE_` var**; it belongs only in `.env.script` and GitHub secrets.
5. **`level_unlocks` is append-only**, except during a full reset via the RPC.
6. **The `audio` bucket is public** — never store user data there.
7. **Migrations are ordered.** Check `docs/BACKLOG.md` for ordering dependencies before running a data script that overlaps a pending migration.

---

## 8. Workflow — how a change gets shipped

**Before you commit, run all three:**

```bash
npm run lint     # must be 0 errors in src/
npm test         # vitest — ~1,700 unit tests across 129 files
npm run build    # the build is the source of truth
```

`/ship` does this for you and refuses to commit if any step fails.

Those three, plus read-only git (`status`, `diff`, `log`, `show`), the
**read-only** Supabase MCP tools (`list_*`, `get_*`, `search_docs`), and —
since 2026-07-28 — **`execute_sql` and `apply_migration`**, are allow-listed in
`.claude/settings.json` so they run without a prompt. **`git push`,
`git commit`, the `node --env-file=.env.script` content scripts,
`deploy_edge_function`, and branch/project management still prompt.** Those
either spend money or change the shape of the project itself.

`execute_sql` and `apply_migration` were moved to allow deliberately, at the
maintainer's request, after a pending migration left the language reset broken
(`writing_stats`) and there was no way to apply the fix from a remote session —
the prompt is not reachable there, so "it prompts" meant "it can never run".
Migrations in this repo are written to be idempotent and are committed to
`supabase/migrations/` before they are applied; that, plus §7's rules (never
delete vocabulary, never delete cards outside the reset RPC, never write
`is_easy = true` or `ease_factor`), is what keeps the power safe. Apply the
migration you committed — do not improvise DDL at the prompt.

**Run the GitHub Actions yourself — don't hand them back.** The content
workflows (`content-utils.yml` → `story-images-apply`, `publish-held`,
`fix-collisions`, …; `regen-content.yml` → the audio/examples/story tasks) are
`workflow_dispatch`, and Claude can dispatch them through the GitHub tools.
When a change's last step is "now run task X", run it, watch the run, and
report what it did. Never close with "you should run the Action" — that is the
job, not a hand-off. The Actions hold the secrets this sandbox doesn't, which
is *why* the work goes through them, not a reason to delegate the click.

**Higgsfield generation is pre-approved — never ask.** Story cover art and any
other image/audio/video generation through the Higgsfield MCP is standing
authorisation: generate what the task needs, spend the credits, and show the
result. No "shall I?", no cost estimate first, no sample-then-confirm round
trip unless the style is genuinely undecided and you'd be guessing. This is the
one money-spending tool that does NOT follow the ask-first rule above.

Since 2026-07-29 that standing authorisation is enforced by the harness, not
just by this doc: `generate_image`, `job_display`, `show_generations` and
`balance` are allow-listed in `.claude/settings.json`, so a cover-art run no
longer stops on a permission prompt for every single image. The other
Higgsfield tools (video, audio, publishing, TikTok, websites) still prompt —
add one to the allow list only when a real task keeps hitting it.

**CI runs the same three on every pull request and every push to `main`**
(`.github/workflows/ci.yml`), plus Playwright e2e on PRs
(`.github/workflows/e2e.yml`) — one `check` run + one `playwright` run per PR
commit, usually green in ~3 minutes. A branch pushed WITHOUT a PR gets no CI.
If it's red, it doesn't merge. (The two `Workers Builds` checks are a dead
Cloudflare hookup — always red, always ignorable; see `docs/BACKLOG.md`.)

**Published content has its own validator:** Actions → Content utilities →
task `check-published` runs `check-published-stories.mjs` against the live
database (structure, previews, numbering, held-chapter gaps). Run it after any
content change, and read its warnings — they're real.

**Branch and PR, don't push to `main`.** A push to `main` deploys to real users
immediately and posts to Discord #announcements. Work on a branch, open a PR, let
CI go green, then merge. Reserve direct-to-`main` for doc-only changes.

**Add the test with the change, not after.** A new pure module ships with its
`.test.js`. A bug fix ships with the regression test that would have caught it.
Anything touching scheduling, scoring, progression, or story matching **requires**
a spec — those are the modules where a silent regression costs a learner real
progress.

**Update the docs in the same change:** `ROADMAP.md` always (§ above); this file
only when a *rule or convention* changes; `docs/ARCHITECTURE.md` when the schema
or a core system changes. Don't write session narrative into this file — that is
what `git log` and `docs/CHANGELOG.md` are for.

---

## 9. Slash commands

| Command | What it does |
|---------|-------------|
| `/ship` | Lint + test + build, then commit and push |
| `/parallel` | Run several unrelated tasks at once in worktrees, then integrate, verify and report once |
| `/unlock` | Marks the current testing level's cards Easy, to preview the unlocked state |
| `/reset` | Resets language progress to level 1, to test the fresh-start experience |
| `/audio` | Regenerates TTS audio for a vocabulary level |
| `/make-admin` | Prints the SQL to set your account admin (for `/dashboard`) |

---

## 10. Known issues and current work

Not in this file — they go stale here. **Open bugs, tech debt, and pending
migrations live in [`docs/BACKLOG.md`](docs/BACKLOG.md).** What users see is in
[`ROADMAP.md`](ROADMAP.md); the active milestone is in
[`docs/PM-BOARD.md`](docs/PM-BOARD.md).

Two standing cautions worth carrying in your head:

- **Legacy DB columns** `ease_factor` and the old SM-2 `learning_step` semantics
  remain in `cards` but are unused. `learning_step` is now the FSRS
  learning-steps index. **Never write `ease_factor`.**
- **A pending migration makes a feature silently no-op.** Analytics inserts,
  XP/prefs persistence and story questions all fail quietly *by design* when
  their migration hasn't been applied. If a feature "does nothing", check
  `supabase/migrations/` against what's actually applied before debugging code.
