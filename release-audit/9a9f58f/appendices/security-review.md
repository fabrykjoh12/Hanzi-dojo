# SEC — security / authorization / privacy review (commit 9a9f58f)

Method: static read of auth/deep-link/session/admin/dev-tool code in the read-only checkout; live **metadata-only** queries
against prod `bvqvturqupbggxaeihvi` (pg_policies, pg_proc secdef/proconfig/has_function_privilege, constraints, triggers,
FK delete actions, storage.buckets, aggregate counts; Supabase security advisor). No row data, no writes.

## Confirmed-good (verified, not trusted from docs)
- Every SECURITY DEFINER fn in `public` has `search_path` pinned (`public` or `""`). anon can execute only `public_story`,
  `public_assessment_vocab` (intended public surface). All six `admin_*` RPCs and `dojo_hq_members` call `assert_admin`
  (checks `profiles.is_admin` for `auth.uid()`); `assert_admin`, `tts_claim_jobs`, `replace_story_questions` not executable by anon/authenticated.
- `guard_is_admin` trigger is BEFORE INSERT OR UPDATE on profiles; blocks role `authenticated` from setting/changing is_admin. 3 admins.
- RLS: every user table owner-scoped; dojo_* tables + `dojo-attachments` bucket admin-only; stories/questions/utterances published-only.
  `audio` bucket public with NO write policies on storage.objects (only admins on dojo-attachments) → not writable by clients.
- Native auth: PKCE on native (`src/supabase.js:57`), code extracted from deep link (`nativeAuth.js:130`); an attacker-supplied
  `auth-callback?code=` cannot complete (verifier local) → no login-CSRF. Implicit flow on web, https redirect only.
- `delete_my_account` (`search_path=""`, auth.uid()): deletes analytics_events/unlocked_stories/bodyos_app_state, profile (all learner
  tables cascade from profiles — FK map verified live), then auth.users (sessions/identities cascade). dojo_* FKs SET NULL (admin-only data).
- No service key / non-VITE secret in `src/` (only VITE_SUPABASE_URL/ANON_KEY/VAPID_PUBLIC_KEY/BUILD_*); stale `dist/` grep clean.
- errorMonitor bounded (name 40 / msg 40 / route 40, no stacks). analytics_events rows bounded by CHECKs (props ≤2 KB, name ≤64…).
- Workflows: no `pull_request_target`/`workflow_run`/`issue_comment`; PR-triggered jobs (ci/e2e/native) use no secrets; only
  first-party `actions/*`; `discord-notify` passes event fields via env, not inline.
- Web navigate() callers encode ids (`routes.js:89-95` storyPath/seriesPath); `openExternal` allows only http(s) (`externalLink.js`).

## Findings

### SEC-01 · Medium · static-complete-path · conf M — Dojo cloud bridge: invite code ⇒ remote Claude launch on maintainer PC; `--self-update` runs unsigned remote code
- `tools/dojo-bridge.mjs:398-403` executes worker-queued commands `read|sync|launch`; `launch` (`:255-281`) writes a prompt built from
  the queued item and spawns `claude` in PROJECT_ROOT. Only secret = workspace invite code (`worker/index.js:43-50`), which the HQ UI
  embeds in a copy-paste command (`src/DojoHQ.jsx:1298`). Worker `POST /api/dojo/workspaces` is unauthenticated (`worker/index.js:160`).
- `--self-update` (`dojo-bridge.mjs:444-460`, enabled by the HQ command) fetches `${site}/dojo-cloud-bridge.mjs`, overwrites itself and
  re-executes — no signature/hash pinning; whoever controls the site deploy (or the Sites asset) gets code execution on the dev machine.
- Mitigation present: `--permission-mode manual`, HTTPS required. Not shipped to learners (public build excludes it, `vite.config.js:77-81`,
  `tools/verify-public-bundle.mjs:41`).
- Fix: retire cloud mode if Supabase HQ replaced it; else pin self-update to a hash from the paired session, drop `launch` from remote
  commands or require local confirmation. Accept: bridge refuses remote `launch` without local y/N; self-update verifies digest. Milestone: optional/post-launch (dev tooling).

### SEC-02 · Low · static-complete-path (path mapping reproduced in node; final navigation inferred from react-router 7.17 source) · conf M — Android custom-scheme deep link → external open redirect (GHSA-wrjc-x8rr-h8h6 reachable)
- `routeFromDeepLink('com.hanzidojo.app:/\\evil.com')` → `'//\\evil.com'` (`src/nativeShell.js:66-71`) → `navigate()` (`NativeShellBridge.jsx:60`)
  → react-router `removeDoubleSlashes` → `/\evil.com`; on Android origin `https://localhost` (`capacitor.config.json` androidScheme https)
  the URL parser treats `\` as `/` → cross-origin pushState throws → history falls back to `window.location.assign`
  (react-router chunk `getUrlBasedHistory.push`). Capacitor then hands the foreign URL to the system browser. iOS (`capacitor://`, non-special) not affected.
  https universal links normalise `\` and `//` → safe; app has no https intent filter yet anyway.
- Impact: a link tap opens an attacker page in the browser — no token/session exposure. Fix: in `routeFromDeepLink` reject results
  containing `\` or starting `//`; upgrade react-router past the advisory. Accept: unit test for the backslash vectors returns null. Milestone: beta (cheap).

### SEC-03 · Low · static-complete-path · conf H — Device data not cleared on sign-out; stories snapshot not keyed by user
- Sign-out is `supabase.auth.signOut()` only (`App.jsx:385`, `Profile.jsx:936`; `sessionPrep.js:260` says so). IndexedDB `cache`/`audio`/`prefs`
  survive. `Stories.jsx:351` key `storiesdata2:<lang>:<sys>:<level>` holds the user's cards, story_reads, unlocks, review_logs (`:408-412`)
  and is read back offline for whoever is signed in (`:413-423`). `data.js:24` cards cache IS user-keyed; outbox is user-filtered (`syncQueue.js:268`).
- Impact: shared device — next account offline sees previous learner's progress; data lingers after logout. Fix: add userId to snapKey and
  call `clearDownloads()` on sign-out / account switch. Accept: sign out A, sign in B offline → no A data. Milestone: public.

### SEC-04 · Low · static-complete-path · conf H — Web host sends no security headers
- `vercel.json` has only a rewrite; no CSP, `frame-ancestors`/X-Frame-Options, Referrer-Policy, Permissions-Policy; `index.html` has no CSP meta.
  Signed-in SPA is frameable (clickjacking; account deletion still needs typed word). Fix: add `headers` block (frame-ancestors 'none',
  nosniff, referrer, a CSP allowing self + supabase + fonts). Accept: `curl -I https://hanzi-dojo.com` shows them. Milestone: public.

### SEC-05 · Low · reproduced-automated (Supabase advisor) + static · conf H — Weak auth policy
- Leaked-password protection disabled (advisor `auth_leaked_password_protection`); min length 6 (`authValidation.js:6`, `PasswordReset.jsx:63`).
  Fix: enable HIBP check, raise min to 8 server+client. Milestone: public.

### SEC-06 · Low · static-complete-path (live constraints) · conf H — feedback rows unbounded and email self-asserted
- Only CHECK is `char_length(trim(message)) > 0`; `context` jsonb unbounded; `email` is written by the client (`Feedback.jsx:66-68`) and RLS
  checks only user_id → any user can store arbitrary size text and an arbitrary reply-to email. Fix: CHECK message ≤ 5000, context ≤ 4 KB;
  fill email server-side (default/trigger from auth.users) or ignore client value. Milestone: public.

### SEC-07 · Low · static-complete-path (live policy) · conf H — anon analytics insert unthrottled
- Policy `analytics insert own or anon` lets anon insert rows with any session_id (bounded per row, not in rate). Anyone can inflate
  funnel/active metrics (dashboard honesty, `docs/METRICS.md`) and grow the table. Fix: per-session/day cap or an edge function with rate limiting;
  dashboards tolerate it meanwhile. Milestone: post-launch.

### SEC-08 · Low (single-player) · static-complete-path (live policies + grade_card source) · conf H — All progression gates are client-trusted (self-only)
- Owner can directly: write `cards.reps/stability/state` (policy `users can update own cards`; `grade_card` also accepts client FSRS values
  verbatim), INSERT `level_unlocks`, UPDATE `language_tracks.current_level`, INSERT `story_unlocks`; and read every published story regardless of
  unlock (`stories` policy is_published only). `cards_unverified_claim_is_inert` constrains only prior-known claims. No cross-user effect.
- Impact: a learner can fabricate own mastery/unlocks; skews admin metrics. CLAUDE.md §7.3b ("never write reps outside srs.schedule") is
  convention, not enforced — `creativeMode.js:128,137,178` (admin tool) writes reps directly. Acceptable for a free single-player app; document as
  accepted risk. Fix (optional): revoke direct UPDATE on cards scheduling columns, route via RPC. Milestone: optional.

### SEC-09 · Low now (Medium if BodyOS ships) · static + live metadata · conf M — Shared auth tenant with unrelated "BodyOS"
- `bodyos_app_state` (user_id FK → auth.users ON DELETE CASCADE, RLS owner policies, 0 rows) created by migrations applied out of repo
  (`20260716233821 bodyos_app_state`, `20260716234138 …`); referenced in repo only by `delete_my_account` (`20260807130000_delete_my_account.sql:48-49`).
- Consequences: same auth.users pool → a BodyOS signup is a Hanzi Dojo login and vice versa; Hanzi "Delete account" deletes the auth user, i.e.
  also destroys any BodyOS account/data without telling the user; privacy policy/store data-safety answers don't describe a shared tenant.
  43 auth users, 3 without a profile (cause unknown — could be unfinished onboarding). `docs/PRIVACY-AUDIT.md:274` marks F11 "RESOLVED" while
  `:1250` still lists it as an open owner question — doc contradiction.
- Fix: decide ownership; move BodyOS to its own project (preferred) or disclose shared identity and make deletion copy say so. Milestone: public (decision).

### SEC-10 · Low · static-complete-path (live source) · conf H — dict_add_to_deck global cap is a shared DoS lever
- Global 500 new dictionary words/24 h across all users vs 200 per user (`dict_add_to_deck`, migration `20260907010000_cap_dict_add_to_deck.sql`):
  3 free accounts exhaust it, blocking every learner's new-word adds for a day; rows land in shared `vocabulary` (content from dict_entries only — no injection).
  Fix: lower per-user cap or count only per-user. Milestone: post-launch.

### SEC-11 · Info · live metadata · conf H — DB hardening leftovers
- anon/authenticated hold Supabase default full table grants incl. TRUNCATE on all public tables (RLS covers DML; TRUNCATE not reachable via PostgREST).
  `pg_net`, `pg_trgm` in public schema (advisor). Duplicate empty public bucket `Audio` (no size/MIME limits; `audio` also unlimited) — no write policy so not abusable.
  `_reading_backup_20260725`, `vocabulary_unreachable_audio_path` RLS-on/no-policy (locked; fine). Milestone: optional.

### SEC-12 · Low · static-complete-path · conf M — Local dojo-bridge accepts empty Origin and doesn't check Host (DNS rebinding read)
- `dojo-bridge.mjs:283-285` allows `!origin`; a rebinding page's same-origin GET sends no Origin and can set `X-Dojo-Bridge` → reads
  `/api/status` diagnostics and ROADMAP/TASKS (`:338-350`). POSTs carry Origin → blocked. Binds 127.0.0.1 only. Fix: require Host ∈ {127.0.0.1:port, localhost:port}. Milestone: optional.

### SEC-13 · Low · static · conf H — CI supply-chain hygiene
- 19 `actions/checkout@v4`, 17 `setup-node@v4`, `setup-java@v4`, 5 `upload-artifact@v4` tag-pinned (others SHA-pinned). Dispatch inputs interpolated
  into shell (`vocab-complete.yml:69`, `regen-content.yml:113`, `visual-baseline.yml:78`) — writer-only, so low. `android-build`, `e2e`, `ios-*`
  have no explicit `permissions:` (default token scope). Fix: SHA-pin, pass inputs via env, add `permissions: contents: read`. Milestone: optional.

## react-router advisory reachability (asked)
Web: no navigate()/Link takes raw attacker input (ids are encodeURIComponent'd; legacy redirects are constants). Native: reachable only via the
custom-scheme deep link on Android (SEC-02); outcome = external browser opens attacker URL. Honest rating: Low.

## Gaps
Did not read migrations line-by-line (validated effect via live catalog instead); did not review DojoHQ.jsx/DojoHQ2.jsx/Dashboard.jsx UI in depth,
icon/verify tools, drizzle/, ops/ gate3 scripts, .github/scripts, iOS/Android manifests beyond the intent filter; could not check Supabase Auth
config (redirect allow-list, min password, rate limits) — no read tool for it; web open-redirect via Supabase `redirectTo` allow-list unverified.
