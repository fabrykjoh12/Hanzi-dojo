# 🧯 Release blocker remediation plan

**Planning only — 2026-08-15. Nothing was fixed, no product code was touched.**
This turns the four confirmed blockers from
[`PRE-RELEASE-READINESS-AUDIT.md`](PRE-RELEASE-READINESS-AUDIT.md) into an
executable plan: exact fix, exact files, collision risk against Codex's
`codex/home-v3-final-craft`, and how each one is verified.

Evidence for blocker 1 lives in its own document —
[`CONTENT-PROVENANCE-AUDIT.md`](CONTENT-PROVENANCE-AUDIT.md).

> ## Implementation status — 2026-08-15
>
> The Codex-safe half of this plan is **done**, on branch
> `claude/hanzi-dojo-icon-audit-iv0a1m`:
>
> | Item | State |
> |---|---|
> | **3 · Personal email in the bundle** | ✅ Shipped — allowlist deleted, `/dev` gates on `profile.is_admin`, `grep -R fabrykjoh dist/` is clean |
> | **5 · `build:public` in CI** | ✅ Shipped — plus a grep assertion so the email cannot return |
> | **1d · LICENSE / NOTICE / licensing record** | ✅ Shipped — `LICENSE`, `NOTICE.md`, `docs/CONTENT-LICENSING.md`; `public/icons.svg` deleted |
> | **1b · The `©` claim on `/terms`** | ✅ Shipped — narrowed to what is actually owned |
> | **CC-CEDICT ShareAlike** | ✅ Shipped — deed linked, changes stated, scope limited to the dataset |
> | **1e · Per-image provenance** | ✅ Shipped — `artProvenance.mjs`; new images refuse to fetch without a prompt + date. Nothing backfilled |
> | **4 · Play deletion URL** | ⏸ Copy drafted below, **not shipped** — needs the backup-retention window |
> | **1a · Icon master provenance** | ✅ **Closed 2026-08-15** — owner statement: generated through ChatGPT / OpenAI ImageGen. Not stock, not a third-party logo. No icon pixel changed |
> | **1c Azure · 2 demo account** | ⏸ Owner-blocked, untouched |
> | **3b · DojoHQ in the bundle** | ⏸ Deferred — needs `App.jsx`, which Codex holds |

> **Codex baseline used for every collision call:** `origin/codex/home-v3-final-craft`,
> 32 files / +1460 −613. It touches `App.jsx`, `Home.jsx`, `MobileNav.jsx`,
> `Profile.jsx`, `navConfig.js`, **`routes.js`**, `routes.test.js`,
> `homePresentation.js`, `homeStory.js`, `index.css`, `mobileNavState.js`,
> `nativeShell.test.js`, `moduleNames.test.js`, fonts, and 9 test/fixture files.
> It touches **none** of: `TrustPages.jsx`, `devTools.js`, `Dev.jsx`,
> `STORE-LISTING.md`, any doc, any icon or manifest.

---

## 1 · Content licensing and provenance

### What is actually wrong

Blocker #1 was written up as "licensing is unproven". Taking it apart made it
**smaller in one place and sharper in another**. The generator terms — the thing
that looked most likely to sink it — came back clean: Higgsfield claims no
ownership of Outputs, does not restrict commercial use, and permits sublicensing.
What did not come back clean is the foundation of the brand itself.

| # | Sub-blocker | Why it blocks | Can a document fix it? |
|---|---|---|---|
| 1a | ~~The icon master has no traceable origin~~ | **✅ CLOSED 2026-08-15.** Owner statement: `src/assets/86055582-…png` was generated for the owner through **ChatGPT / OpenAI ImageGen** — not bought from a stock marketplace, not taken from a third-party logo. The whole derivation chain (original raster → V2 cleanup → E2 material → the shipped icon family) inherits that. **No redraw. No icon pixel changed.** Caveats recorded in `CONTENT-LICENSING.md`: the original prompt may be unrecoverable, AI output is not guaranteed unique, and this is not a copyright guarantee in every jurisdiction | Recorded |
| 1b | ~~`/terms` publicly asserts © over that artwork~~ | **✅ FIXED 2026-08-15** — the clause now asserts only what is owned and acknowledges the AI-generated artwork directly | Shipped |
| 1c | **Azure TTS grants commercial use on paid tiers only** — ~10,522 shipped clips; the resource tier is not in the repo | If the Speech resource is F0, every clip is unlicensed for commercial use | **No** — worst case regenerate on S0. **The only remaining piece of blocker 1** |

Everything else in §7 of the audit (prompt archive, unmanifested `upstairs`
panels, CC-CEDICT ShareAlike, HSK glosses, `hanzi-writer-data`, `lucide`, fonts,
`public/icons.svg`) is 🟠: **real obligations, all closable by writing them down.**

### Exact fix

**Four artifacts, in this order** (full templates in `CONTENT-PROVENANCE-AUDIT.md`
§"Recommended minimum structure"):

1. **`LICENSE`** at the repo root — code licence, or "all rights reserved" if the
   source stays private. Also resolves the missing `package.json` `license` key.
2. **`NOTICE.md`** at the repo root — one row per dependency-with-obligations:
   CC-CEDICT (BY-SA), Tatoeba (BY 2.0 FR), `complete-hsk-vocabulary` (MIT),
   `hanzi-writer` + `hanzi-writer-data` (MIT / Arphic PL), `lucide` (ISC), the
   four OFL fonts.
3. **`docs/CONTENT-LICENSING.md`** — the generator record: Higgsfield, Azure,
   Google TTS, Gemini/Groq/Anthropic, each with the terms *as they stood on the
   generation dates* and a pointer to an archived PDF.
4. **Process change** — extend the existing `.art.json` manifests with `prompt`
   and `generated` keys for all future generation. Backfill is impossible for the
   127 existing panels; the version-controlled CRITICAL CONSTRAINTS block plus its
   documented enforcement history (`STORY-BIBLE.md:273-283`) is the good-faith
   record for work already done.

Plus three small code-adjacent edits: soften `TrustPages.jsx:196`; add the
CC-CEDICT **deed link + "changes made"** statement to the same file; delete
`public/icons.svg` (four companies' brand marks, shipped in `dist/`, referenced
by **zero** app code).

### What only the owner can resolve

- ~~The acquisition record for `86055582-…png`~~ — **answered 2026-08-15:**
  generated for the owner through ChatGPT / OpenAI ImageGen. Optional follow-up:
  export the generating conversation as a dated PDF.
- The **Azure Speech resource tier** (S0 vs F0), with a screenshot.
- Archived PDFs of Higgsfield's terms as they stood on the generation dates
  (`higgsfield.ai` is egress-blocked from this sandbox).
- Whether the softened `/terms` wording is acceptable to whoever signs it off.

---

## 2 · App Review and demo access

### What a reviewer actually needs

**Apple 2.1(a):** an app behind a login must ship a working demo account in App
Store Connect → App Review Information, or be rejected without being tested.
**Google Play:** the same thing under *App content → App access*.

Hanzi Dojo is a hard gate — `src/App.jsx:375-380` renders `Landing` for any
unauthenticated view. The public exceptions are only `/read/:id`, `/assessment`
and the four trust pages. So a reviewer sees **nothing** of the product without
credentials.

**Self-signup is not a fallback.** `src/Auth.jsx:74` returns *"Check your email to
confirm your account!"* — sign-up is gated on an email round-trip, and the Brevo
SMTP path is still listed as live-test-pending in `docs/BACKLOG.md`. A reviewer
who tries to register can plausibly get stuck at a confirmation mail that never
arrives. **A pre-confirmed demo account is therefore mandatory, not a courtesy.**

The account also has to be *pre-seeded*. A blank account shows an empty Home, no
due cards, no unlocked stories — a reviewer would see a shell and could not
evaluate the app's actual functionality. There is **no user-progress seeding
script in the repo** (the `seed-*.mjs` scripts seed content — vocab, dictionary, examples — not accounts).

### Proposed App Review Notes structure

The existing draft (`docs/STORE-LISTING.md:131-170`) is good and mostly reusable.
Recommended final shape — seven blocks, in this order:

1. **Demo account** — address + password. *Password entered in the console only;
   never committed.*
2. **What the app is**, in two sentences.
3. **The 60-second path to the core loop** — sign in → Home → *Study* → grade a
   card → open a story → tap a word for the dictionary sheet. Reviewers time-box;
   give them the route.
4. **Account deletion (5.1.1(v))** — Profile → Delete account → type `delete`.
   Immediate and permanent. Also at `hanzi-dojo.com/support`.
5. **Sign in with Apple** — offered alongside Google and email/password (4.8).
6. **Speech / microphone** — the Speaking drill is hidden on iOS because
   WKWebView has no speech recognition; **no microphone permission is requested**.
   Pre-empts a reviewer wondering why the feature appears in copy but not the app.
7. **Content and data** — CC-CEDICT dictionary, some entries explicit behind a
   per-search reveal (explains the age rating); no purchases, no ads, no
   third-party analytics.

Two additions to the existing draft: **fix the deletion URL** (it currently says
`/profile`, which is behind auth — see §4), and add a line for the `/dev` route
if §3 Option A is not taken, since Apple 2.3.1(a) prohibits undocumented features.

### What must be created manually (cannot be produced from this repo)

1. A mailbox the owner controls for the demo address. `playreview@hanzi-dojo.com`
   in the draft is a **placeholder** — no evidence anywhere that it exists.
2. The Supabase auth user, **email-confirmed** (Dashboard → Authentication → Add
   user → auto-confirm, or confirm via the real mailbox).
3. The password, stored in App Store Connect and Play Console **only**.
4. Seeded progress. Safest method: **sign in as the demo account and use the app
   for ~10 minutes** — grade real cards, open a story. That routes through the
   normal SRS flow, so it cannot violate the `is_easy` / `ease_factor` rules
   (`CLAUDE.md` §7.3, §10) the way a hand-written INSERT could.
5. The same credentials entered in **Play Console → App content → App access**.
6. Enabling Supabase's leaked-password protection (one dashboard toggle; live
   advisor currently reports it disabled).

**No credentials were invented and no account was created by this task.**

---

## 3 · Personal email in the production bundle

### The trace

| Step | Evidence |
|---|---|
| Source | `src/devTools.js:11` — `const DEFAULT_DEV_EMAILS = 'fabrykjoh@gmail.com'` |
| Consumed by | `devEmailList()` (`:13-18`) → `isDevUser()` (`:20-23`) |
| Imported by | `src/Dev.jsx:3`, used once at `:61` (`const allowed = isDevUser(email)`) |
| Reached from | `src/App.jsx:64` `const Dev = lazy(() => import('./Dev'))`, rendered at `:690-701` for `view === 'dev'` |
| Also present in | `src/devTools.test.js:14` — **not bundled** (tests are not an entry point) |
| **Survives tree-shaking?** | **Yes.** `VITE_DEV_EMAILS` was unset at build time, so Vite's static `import.meta.env` replacement collapsed the `raw != null` branch and the literal became the *only* surviving value. The chunk is a lazy split point, so it is not in the initial download — but it sits at a stable, publicly fetchable URL (`dist/client/assets/devTools-*.js`, 2,958 B) |
| Source maps | **None emitted** — no `.map` files in the build |

### Severity call

**Public-but-unprofessional. Not a security exposure.** The `isDevUser` check is
client-side and trivially bypassable, but it guards nothing that matters: every
`/dev` action runs as the **signed-in user through RLS**, so it can only ever
touch that account's own rows — which the account can already do through the
normal UI. The real exposures (`assert_admin()`-guarded `admin_*` RPCs, the
`is_admin` escalation trigger) are server-enforced and were verified live.

The genuine costs are: a personal address published in a store binary, and an
undocumented route reachable by any signed-in user — the latter being an Apple
**2.3.1(a)** talking point.

### Ranked options

| | Option | What changes | Trade-off |
|---|---|---|---|
| **A — preferred** | **Delete the allowlist mechanism; gate `/dev` on `profile.is_admin`** | `Dev.jsx:61` becomes `const allowed = !!profile?.is_admin` (`profile` is already a prop). Remove `DEFAULT_DEV_EMAILS`, `devEmailList`, `isDevUser` and their specs | Closes **both** problems at once with a server-backed flag, and matches how `/hq` and `/dashboard` already gate. Deletes ~15 lines and 4 assertions. **Does not touch `App.jsx`** — the gate moves inside the component — so it is Codex-safe |
| **B — acceptable** | **Empty the default; supply the list at build time** | `DEFAULT_DEV_EMAILS = ''`; set `VITE_DEV_EMAILS` as a CI secret for store builds | Smallest diff, removes the literal. But the address moves into CI config rather than disappearing, and `/dev` stays reachable by whoever is listed — 2.3.1(a) unchanged |
| **C — fallback** | **Swap in a role address** — `dev@hanzi-dojo.com` | One-token change | Removes the *personal* identifier only. Leaves the mechanism and the hidden route. Use only if A and B are somehow blocked |

**Recommendation: A.** It is the smallest change that leaves nothing to remember
later, and it converts a client-side honour system into the same server-verified
`is_admin` flag every other internal surface already uses.

### The rest of the public-build scan

Full scan of the `DOJO_PUBLIC_BUILD=1` output (`hq.html` absent, so it is
genuinely the store bundle):

| Finding | Class | Detail |
|---|---|---|
| `fabrykjoh@gmail.com` | 🔴 **Unprofessional** | The blocker above. The **only** personal identifier in the whole build |
| `support@hanzi-dojo.com` | ✅ Intended | The published support address |
| **No Supabase/OpenAI/Google keys** | ✅ | `eyJhbGciOi`, `sk-…`, `AIza…`, `service_role` → **zero matches** across every emitted asset |
| **No source maps** | ✅ | Zero `.map` files — nothing reveals original sources |
| `127.0.0.1:43127` | 🟠 **Unprofessional** | The DojoHQ↔Claude bridge, inside a **124 kB `DojoHQ-*.js` chunk that ships**. Excluding `hq.html` only drops the second *entry point*; `App.jsx:58` still lazy-imports `./DojoHQ` for the in-app `/hq` route. Access is server-enforced, so it is dead weight and a 2.3.1(a) talking point, not a leak |
| `http://localhost:9999` | ⚪ Benign | `@supabase/supabase-js`'s own default GoTrue URL constant, never used |

**One thing this sandbox could not check:** whether the *live deployed* bundle
carries the anon key or something stronger. This build had no `.env` present, so
`import.meta.env.VITE_SUPABASE_*` compiled to `undefined` — the absence of a JWT
here proves nothing about production. The whole check is one command for the
owner: `curl -s https://hanzi-dojo.com/assets/index-*.js | grep -o 'eyJhbGciOi[^"]*'`,
then decode the payload and confirm `"role":"anon"`. A `service_role` there would
be a genuine emergency; anything else is fine, since the anon key is designed to
be public.

---

## 4 · Google Play's public account-deletion URL

### The requirement

Play's deletion policy has **two** parts, and the app satisfies exactly one:

| Requirement | Status |
|---|---|
| In-app deletion path | ✅ `Profile.jsx:793-843` — arm-then-type-`delete`, cascades 14 tables plus `auth.users`, wipes local device data |
| **A web resource, reachable without the app and without signing in** | 🔴 `STORE-LISTING.md:183` answers `https://hanzi-dojo.com/profile` — which is **behind the `!session` gate** (`App.jsx:375-380`) |
| The page must state **which data is deleted, which is kept, and any retention period** | 🔴 Nowhere on the site |
| The URL goes in the Data safety form | 🔴 Currently points at the auth-gated route |

The failure mode Play is legislating for is exact: a user who uninstalled the app
and cannot sign in still has to be able to get their data deleted. `/profile`
serves them the Landing page.

### Minimum compliant solution

A **publicly reachable page** that (a) describes the in-app path, (b) gives a
request channel for people who cannot sign in, and (c) enumerates what is deleted,
what is kept and for how long.

### `/support` vs a dedicated `/delete-account`

| | Reuse `/support` | New `/delete-account` |
|---|---|---|
| Public without auth? | ✅ Already — `TRUST_PAGES` (`routes.js:96`), rendered before the auth gate | ✅ Would be |
| Content today | ✅ Has an **Account deletion** `<H2>` with the in-app path *and* the email fallback (`TrustPages.jsx:249-258`) | ✗ Would be written from scratch |
| Missing piece | The data-types / retention paragraph | The same paragraph |
| Files touched | **`TrustPages.jsx` only** (copy) | `routes.js` **+** `TrustPages.jsx` **+** `routes.test.js` |
| Codex collision | **None** — Codex does not touch `TrustPages.jsx` | **Real** — Codex edits both `routes.js` and `routes.test.js` |
| Discoverability | Support is a normal place to look for this | Marginally more direct from a Data-safety form |

**Recommendation: reuse `/support`.** Answer Play with
`https://hanzi-dojo.com/support`, and extend the existing *Account deletion*
section with the data-types-and-retention paragraph. That is a **copy-only change
in one file**, no routing change, no test change, and no collision with the
branch Codex is holding. A dedicated `/delete-account` buys nothing Play asks for
and costs the one file where a merge conflict is actually likely.

Also fix `STORE-LISTING.md:151` (review notes) and `:183` (Data safety answer),
which both still print `/profile`.

**The retention paragraph needs one fact this repo cannot supply:** how long
Supabase's own backups retain deleted rows. The RPC deletes immediately and
`auth.users` cascades, but point-in-time backups are a project setting — the
owner must confirm the window before the sentence can be written accurately.

### Draft copy — NOT shipped, blocked on one number

Written out so the only missing piece is visible. **This has deliberately not
been added to `TrustPages.jsx`**: publishing a retention claim we cannot
substantiate would be worse than publishing nothing, and vague wording ("for a
short period") is the kind of thing Play's reviewers read as evasion. It ships
when the owner replaces the bracket — and the Play Console answer changes to
`https://hanzi-dojo.com/support` **at the same time**, not before.

> **What deleting your account removes**
>
> Deleting your account removes it immediately and permanently. That includes
> your profile, every flashcard and its review history, your daily activity and
> streak-free progress records, level unlocks and test attempts, story reads and
> unlocked stories, writing and grammar practice records, your language tracks,
> and your sign-in identity itself — so the same email can register again from
> scratch. Anything cached on your device is cleared at the same time.
>
> **What is kept**
>
> Nothing that identifies you. Aggregate, anonymous counts already recorded — how
> many people reviewed a card on a given day, for example — remain, because they
> contain no link back to any account.
>
> **Backups**
>
> Our database provider keeps encrypted backups for
> **[CONFIRM SUPABASE BACKUP RETENTION WINDOW]**, after which deleted data is
> gone from those too. Backups are never used to restore an individual deleted
> account.

Two things to check when filling this in: the retention window is a Supabase
project setting (Database → Backups), and it differs between plan tiers, so read
it from the project rather than the pricing page.

---

## The plan, in one table

| BLOCKER | ROOT CAUSE | EXACT FIX | FILES / SYSTEMS AFFECTED | COLLISION RISK WITH CODEX | ESTIMATED COMPLEXITY | VERIFICATION | CAN DO BEFORE CODEX FINISHES? |
|---|---|---|---|---|---|---|---|
| ~~**1a · Icon master provenance**~~ | ✅ **CLOSED** — the owner has stated it was generated for them through ChatGPT / OpenAI ImageGen. The XL redraw branch is dead | Recorded in `CONTENT-LICENSING.md` and `CONTENT-PROVENANCE-AUDIT.md` §1 | Docs only — **no icon pixel changed** | None | **XS**, done | Owner statement on file; optional upgrade is exporting the ChatGPT conversation as a dated PDF | Done |
| **1b · `© BRAND_NAME` artwork claim** | Terms assert ownership over artwork with no rights record | Soften the claim at `src/TrustPages.jsx:196` to what is actually owned | `src/TrustPages.jsx` (copy only) | **None** | **XS** | `npm run lint && npm test && npm run build`; read `/terms` in the browser | ✅ Yes |
| **1c · Azure TTS tier** | Commercial rights for prebuilt neural voices are paid-tier-only; the tier is not in the repo | Owner confirms the Speech resource is **S0**; archive a screenshot. If **F0**: regenerate ~10,522 clips on a paid resource | Azure portal; `docs/CONTENT-LICENSING.md`; worst case the `audio` bucket + `generate-audio.mjs` via the Actions workflow | **None** | **XS** to confirm · **L** if regeneration is needed | Portal screenshot in the licensing doc | ✅ Yes — owner action, no code |
| **1d · No LICENSE / NOTICE / attribution** | Zero of 1,179 tracked files match any licence/notice pattern; `package.json` has no `license` key | Add `LICENSE`, `NOTICE.md`, `docs/CONTENT-LICENSING.md`; add the CC-CEDICT deed link + "changes made" line to `/terms`; delete `public/icons.svg` | `LICENSE`, `NOTICE.md`, `docs/CONTENT-LICENSING.md`, `package.json`, `src/TrustPages.jsx`, `public/icons.svg` (delete) | **None** | **M** | Lint/test/build; `grep -r icons.svg src/ public/` → zero refs before deleting; the four artifacts exist | ✅ Yes |
| **1e · No per-image prompt record** | `.art.json` stores only `{file,url}`; `grep '"prompt"' data/` → 0 | Extend the manifest schema with `prompt` + `generated` for all future generation; document the rule | `data/manhua/*.art.json` (schema), `generate-story-images.mjs`, `docs/STORY-BIBLE.md` | **None** | **S** | Next generated episode ships a manifest carrying both keys | ✅ Yes |
| **2 · No App Review demo account** | The app is a hard auth gate and self-signup needs an email confirmation whose SMTP path is still unverified | Owner creates a mailbox + a **pre-confirmed** Supabase user, seeds it by using the app ~10 min, enters credentials in App Store Connect **and** Play → App access; finalise the review notes | Supabase Auth (manual); App Store Connect; Play Console; `docs/STORE-LISTING.md` | **None** | **S** (owner time, not code) | Sign in with those exact credentials on a clean device/private window and complete the 60-second path | ✅ Yes |
| **3 · Personal email in the store bundle** | `DEFAULT_DEV_EMAILS` is a literal fallback; `VITE_DEV_EMAILS` unset at build → Vite inlines it as the only value | **Option A:** delete the allowlist; gate `/dev` on `profile.is_admin` inside `Dev.jsx` | `src/devTools.js`, `src/devTools.test.js`, `src/Dev.jsx` | **None** — Option A deliberately avoids `App.jsx`, which Codex edits | **S** | `npm run build:public` then `grep -r "fabrykjoh" dist/` → **zero**; sign in as a non-admin and confirm `/dev` refuses | ✅ Yes |
| **3b · DojoHQ ships in the store bundle** | Dropping `hq.html` removes only the second entry point; `App.jsx:58` still lazy-imports `./DojoHQ` | Skip the `/hq` route in public builds (an `import.meta.env` guard around the lazy import) — **or** accept 124 kB of dead weight for v1 | `src/App.jsx`, `vite.config.js` | **⚠️ Real** — `App.jsx` is Codex's file | **S** | `npm run build:public`; no `DojoHQ-*.js` in `dist/client/assets/` | ❌ **No — do this after Codex merges** |
| **4 · Play web-deletion URL** | The answered URL (`/profile`) is behind the auth gate, and no page states data types or retention | Add a data-types-and-retention paragraph to the existing *Account deletion* section of `/support`; answer Play with `https://hanzi-dojo.com/support`; fix `STORE-LISTING.md:151,183` | `src/TrustPages.jsx` (copy only), `docs/STORE-LISTING.md`, Play Data safety form | **None** — reusing `/support` is exactly what avoids `routes.js` | **XS** | Open `https://hanzi-dojo.com/support` in a **signed-out** private window; confirm the section names deleted data, kept data and the retention window | ✅ Yes — pending the backup-window fact from the owner |
| **5 · `build:public` never runs in CI** *(blocker-adjacent)* | `ci.yml:44-54` runs `npm ci` → lint → test → **`npm run build`** — the *sites* build. `build:public`, the bundle both stores ship, is never run | Add a `build:public` step, plus an assertion that no personal email and no `DojoHQ-*.js` appear in `dist/` | `.github/workflows/ci.yml` | **None** | **XS** | The new step is green on a PR and fails if the email is reintroduced | ✅ Yes |

**Complexity key:** XS < 30 min · S ≈ 1 h · M ≈ half a day · L ≈ multi-day ·
XL = a design phase.

---

## Recommended implementation order

**Phase 0 — start today, owner only, zero code.** Everything else waits on these
and none of it is parallelisable later:

1. **Azure tier check** (1c). One portal glance. If it comes back F0, a
   ~10,500-clip regeneration lands on the critical path and everything reorders.
   **This is now the single longest-lead risk in the project.**
2. ~~Icon-master provenance~~ — **closed 2026-08-15.** It was the other candidate
   for longest task; it is not one any more.
3. **Create and seed the demo account** (2). Owner time only; unblocks submission
   and needs the SMTP path exercised at least once.
4. **Supabase backup-retention window** — one number, and blocker 4's copy cannot
   be written accurately without it.

**Phase 1 — Codex-safe code, any time, one small PR each.** All four touch only
files Codex does not:

5. **Blocker 3, Option A** (`devTools.js`, `Dev.jsx`, `devTools.test.js`) — the
   only real code fix in the set, and it closes two audit rows at once.
6. **Blocker 4** (`TrustPages.jsx` copy + `STORE-LISTING.md`) — needs #4 above.
7. **Blocker 1b** (`TrustPages.jsx:196`) — bundle with #6; same file, same review.
8. **Blocker 5** (`ci.yml`) — land it *right after* #5 so the regression gate
   exists the moment the email is gone.

**Phase 2 — the paperwork, in parallel with Phase 1.** Independent of all code:

9. **`LICENSE` + `NOTICE.md` + `docs/CONTENT-LICENSING.md`** (1d), filled in as
   Phase 0's answers arrive. Delete `public/icons.svg` in the same PR.
10. **Manifest schema change** (1e) — cheap, and stops the gap widening.

**Phase 3 — after Codex merges.** Needs `App.jsx`, so it cannot start earlier:

11. **Exclude DojoHQ from public builds** (3b).
12. Re-run `build:public` and re-verify the whole bundle scan against the merged
    tree, since Codex changes the chunk graph.

**The critical path is Phase 0, and it is entirely owner-dependent.** Every line
of code in this plan is under an hour's work; what actually decides the
submission date is whether the icon has a provenance record and whether the Azure
resource is paid.

---

*Planning document. No product code, asset, configuration or store submission was
changed by this task.*


---

## Owner checklist — the three things left

Everything Claude can do without Codex is done. These three are the whole
remaining critical path, and none of them is a code task.

### A · Azure Speech tier — **the long pole**

**Question:** is the Azure Speech resource that generated the shipped audio on
**F0 (free)** or **S0 (paid)**?

**Where:** Azure portal → the Speech resource → Overview / Pricing tier.

**Why it matters:** Microsoft grants commercial usage rights for prebuilt neural
voices to **paid tiers only**. ~10,522 clips depend on the answer.

- **S0** → archive a screenshot in `docs/CONTENT-LICENSING.md`, done.
- **F0** → every clip must be regenerated on a paid resource before release, and
  that becomes the longest task in the project.

**Nothing is regenerated until the answer is known.**

### B · App Review demo account

**What Apple and Google both need:** working credentials, because the app is a
hard auth gate and a reviewer who cannot sign in is an automatic rejection
(Apple 2.1(a); Play → App content → App access).

1. A **real mailbox** you control for the reviewer address. `playreview@hanzi-dojo.com`
   in `STORE-LISTING.md` is a placeholder — nothing proves it exists.
2. A **Supabase auth user that is already email-confirmed.** Self-signup needs an
   email round-trip and the Brevo SMTP path is still untested live, so a reviewer
   must never have to confirm anything. (Dashboard → Authentication → Add user →
   auto-confirm, or confirm through the real mailbox.)
3. A **password**, stored in App Store Connect and Play Console only — never in
   this repository.
4. **Seeded progress** — enough to demonstrate Cards → Story → Practice: some due
   flashcards, at least one unlocked story, a level in progress. The safest way is
   to sign in as that account and use the app for ~10 minutes; real grading goes
   through the normal SRS flow and cannot violate the `is_easy` / `ease_factor`
   rules the way a hand-written INSERT could.
5. The **same credentials** later entered in both consoles.

**No fictional credentials were created, and none should be.**

### C · Supabase backup-retention window

**Question:** how long does this production project retain backups containing
deleted rows?

**Where:** Supabase dashboard → Database → Backups (it differs by plan tier, so
read the project, not the pricing page).

**Why it matters:** Play requires the public deletion page to state which data is
deleted, which is kept, and any retention period. The copy is written and waiting
in §4 above with `[CONFIRM SUPABASE BACKUP RETENTION WINDOW]` as the only gap.
It ships to `/support` — and the Play Console answer changes to
`https://hanzi-dojo.com/support` — at the same moment, not before.

**Do not guess a duration.**

---

## Not a blocker — one product decision to make deliberately

**The repository is public** (`github.com/fabrykjoh12/Hanzi-dojo`, verified
`visibility: public`), and the `LICENSE` added on 2026-08-15 is intentionally
proprietary / all-rights-reserved.

Those two facts are compatible — source-visible but not open source is a normal
position — but they should be a **choice**, not a default. The question is:

> *Do we intentionally want Hanzi Dojo's source publicly visible while remaining
> proprietary?*

Either answer is fine. **No action, and no licence change, without the owner
saying so** — in particular, do not switch to MIT, Apache, GPL or anything else
on anyone's initiative.
