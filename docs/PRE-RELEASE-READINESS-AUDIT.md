# 🚀 Pre-release readiness audit

**Research and documentation only — 2026-08-15.** No product code, configuration
or asset was changed by this audit. Home V3 / navigation is owned by Codex on
`codex/home-v3-final-craft` and was treated as locked; App Icon V2 is closed at
`8745bcd` and is likewise locked.

Store requirements were checked against **current official sources** (Apple App
Review Guidelines; Google Play account-deletion policy; Android `collect-share`
data-safety guidance), not from memory. Every repo claim carries file:line
evidence or a live read-only query against production Supabase. Where the repo
cannot prove something, this document says **"cannot prove from repo"** rather
than guessing.

> ✅ Ready · 🟡 Verify (believed done, repo can't prove it) · 🟠 Missing / needs work · 🔴 Release blocker · ⚪ Not applicable

---

## Executive release status

| | Count |
|---|---|
| 🔴 **Confirmed release blockers** | **2** — plus one approved-and-costed action (the Azure re-render) |
| 🟠 Important gaps | 12 |
| 🟡 Verification-only (owner/console/device) | 19 |
| ⚪ / safe for v1.1 | 8 |

> **Corrected 2026-08-15.** A first pass classified the Sign in with Apple plugin
> as a fifth, top-priority blocker ("iOS cannot be built"). **That was wrong** —
> it read the plugin's *upstream* manifest instead of what `cap sync ios`
> actually produces. Capacitor's CLI patches it automatically. Builds 43, 44 and
> 45 archived and uploaded successfully, which is stronger evidence than a static
> version reading. Full correction in §5; it is now **🟠 REAL RISK**, not a
> blocker, and the count is 5 → 4.

**The one-sentence summary:** the *product* is in good shape — iOS builds and
ships today, deletion is genuinely self-serve, there is no monetization, no
third-party analytics, no ads SDK, no advertising ID, and the paused language
tracks cannot leak. What is missing is **paperwork and pipeline coverage**, not
working software.

### The blockers

**Remaining — 2, both owner actions:**

1. **No App Review demo account exists** — Apple 2.1(a); a reviewer who cannot sign in is an automatic rejection.
2. **Play's required web-accessible account-deletion URL is not established.** The copy is written and waiting on one fact: the Supabase backup-retention window.

**Azure TTS licensing: ✅ CLOSED 2026-08-15.** The resource is on S0 and all 8,814 active clips were re-rendered under it — zero failures, per-row provenance (`tier=S0`, config v2). One artifact still owed: a portal screenshot showing the tier. [`TTS-RELICENSE-DRY-RUN.md`](TTS-RELICENSE-DRY-RUN.md).

**Closed:**

- ~~Content licensing is unproven~~ — `LICENSE`, `NOTICE.md` and `docs/CONTENT-LICENSING.md` now exist; `/terms` no longer overclaims; CC-CEDICT's ShareAlike terms are disclosed properly; new imagery records its prompt and date. The **icon master's origin is established** (ChatGPT / OpenAI ImageGen, owner statement), and the **Azure tier is now S0** — what survives is one costed re-render, not a blocker.
- ~~A personal email address ships in the production bundle~~ — removed; `/dev` gates on `profile.is_admin`, and CI fails if it returns.

~~Plus one blocker-adjacent pipeline gap: `build:public` is never run in CI.~~
**Closed 2026-08-15** — `ci.yml` now builds the store bundle on every PR and
fails if a personal identifier appears in it.

> **Azure TTS re-licensing COMPLETE, 2026-08-15.** All **8,814** active Azure
> clips regenerated under **S0**, in six staged batches, **zero failures**,
> 66,390 characters, ≈ USD 1.06. Independently reconciled against the live
> database: 8,814/8,814 at config v2 with `tier=S0` provenance, zero stale, zero
> rows pointing at a missing object, orphans untouched (7,416), Google audio
> untouched (6,580). The 8,814 superseded F0 objects are **retained** pending
> listening QA; cleanup is a separate gate. The blocker is closed on the
> engineering side — what remains is one portal screenshot and a listening pass.
>
> **Azure tier answered, 2026-08-15.** The Speech resource was on **F0** and has
> been moved to **S0**. Moving tier licenses future synthesis, not past output,
> so the served clips still need re-rendering — but a dry-run audit
> ([`TTS-RELICENSE-DRY-RUN.md`](TTS-RELICENSE-DRY-RUN.md)) sized that at
> **8,814 clips / 66,390 characters ≈ USD 1.06 ≈ NOK 10**, against ~NOK 1,931 of
> credit. It also found that **7,416 of 16,230 clips are orphaned** by the
> 2026-07-28 vocabulary re-import and are unreachable by app and generator alike,
> which is why the scope is half what the earlier "~10,522 clips" figure implied.
> This stops being a blocker and becomes a costed, approved action.
>
> **Icon provenance closed, 2026-08-15 (owner statement).** The icon master
> `src/assets/86055582-…png` is no longer of unknown origin: the owner has
> confirmed it was **generated for them through ChatGPT / OpenAI ImageGen** — not
> bought from a stock marketplace, not taken from a third-party logo. The whole
> derivation chain (original raster → V2 cleanup → E2 material → the shipped icon
> family) inherits that, so **no icon is redrawn and no pixel changes**. Recorded
> with its caveats — the original prompt may be unrecoverable, AI output is not
> guaranteed unique, and this is not a copyright guarantee in every jurisdiction —
> in `CONTENT-LICENSING.md` and `CONTENT-PROVENANCE-AUDIT.md` §1.
>
> **Blocker count is now 3**, down from 4: content licensing survives only as the
> Azure Speech tier question; the App Review demo account and the Play deletion
> URL are unchanged. All three are owner actions — the checklist is at the end of
> [`RELEASE-BLOCKER-REMEDIATION.md`](RELEASE-BLOCKER-REMEDIATION.md).
>
> **Implementation pass, 2026-08-15 — two of the original four blockers are closed.**
> Blocker 3 (personal email in the store bundle) is fixed: the email allowlist is
> gone and `/dev` gates on `profile.is_admin`, with a CI assertion so it cannot
> return. Blocker 1's *documentable* half is fixed: `LICENSE`, `NOTICE.md` and
> `docs/CONTENT-LICENSING.md` now exist, `/terms` no longer overclaims, CC-CEDICT's
> ShareAlike terms are properly disclosed, `public/icons.svg` (four companies'
> brand marks) is deleted, and new generated imagery records its prompt and date.
> **Still blocking, all owner-dependent:** the icon master's provenance, the Azure
> Speech tier, the App Review demo account, and the Supabase backup-retention
> window that blocker 4's copy needs. Status table in
> [`RELEASE-BLOCKER-REMEDIATION.md`](RELEASE-BLOCKER-REMEDIATION.md).
>
> **Updated 2026-08-15 (remediation pass).** Blocker #1 was taken apart in
> [`CONTENT-PROVENANCE-AUDIT.md`](CONTENT-PROVENANCE-AUDIT.md) and got *worse*,
> not better: it is not one gap but three hard sub-blockers (the icon master's
> unknown origin, the `© BRAND_NAME` artwork claim on `/terms`, and Azure TTS's
> paid-tier-only commercial grant) plus seven documented gaps. §7 below is
> rewritten to match. The remediation plan for all four blockers — with exact
> fixes, Codex collision risk and ordering — is in
> [`RELEASE-BLOCKER-REMEDIATION.md`](RELEASE-BLOCKER-REMEDIATION.md).
> The blocker count is unchanged at 4; the 🟠 count rose 12 → 16 (§7 provenance
> gaps, plus DojoHQ shipping in the public bundle, §8).

---

## Reference — what the stores actually require (checked 2026-08-15)

| Source | Requirement |
|--------|-------------|
| Apple **5.1.1(v)** | "If your app supports account creation, you must also offer account deletion within the app." |
| Apple **4.8** | An app using Google Sign-In "must also offer as an equivalent option another login service" limiting collection to name + email, allowing a private email, and not collecting in-app interactions for advertising. Exception only if the app *exclusively* uses the developer's own sign-in. |
| Apple **2.1(a)** | Final builds, working URLs, no placeholder text; "include demo account info (and turn on your back-end service!) if your app includes a login." |
| Apple **2.3.1(a)** | No hidden/undocumented features; all features described specifically in Notes for Review and reachable by the reviewer. |
| Apple **2.3.3** | "Screenshots should show the app in use, and not merely the title art, login page, or splash screen." |
| Apple **5.1.1(i)** | Privacy policy must identify data collected, how, and all uses; must explain retention/deletion and how to request deletion. |
| Google Play — deletion | Account-creating apps need **both** an in-app deletion path **and** a **web-accessible URL**; the URL "must be accessible from the web, so users who deleted your app from their devices can access it without redownloading it." Enforced since 2024-04-15. |
| Google Play — Data safety | Declare per type whether *collected* and/or *shared*; third-party SDK collection counts as yours. Security answers (encryption in transit, deletion path) required. |

Sources: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) · [Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111) · [Android Data safety guidance](https://developer.android.com/guide/topics/data/collect-share)

---

## 1 · App Store Connect

| Item | Status | Evidence | Action needed | Owner / phase |
|---|---|---|---|---|
| App name — "Hanzi Dojo" | ✅ | `docs/STORE-LISTING.md:26` | Enter in console | Owner · submission |
| Subtitle — "Read real Chinese, sooner" (25/30) | ✅ | `STORE-LISTING.md:42` | Enter | Owner · submission |
| Description (drafted, claim-checked) | ✅ | `STORE-LISTING.md:46-92` | Enter | Owner · submission |
| Keywords (100 char) | ✅ | `STORE-LISTING.md:93` | Enter | Owner · submission |
| Promotional text | 🟠 | Not present in `STORE-LISTING.md` | Draft (optional field, but useful — it's the only editable-without-review copy) | Owner · v1.0 |
| Category — Education / Reference | ✅ | `STORE-LISTING.md:29` | Enter | Owner · submission |
| Age rating | 🟡 | `STORE-LISTING.md:196-200` — expects 12+/Teen because CC-CEDICT can surface explicit entries behind a reveal | Answer questionnaire honestly; don't argue the rating down | Owner · submission |
| Copyright | 🟠 | No copyright string anywhere in repo | Decide the legal entity/name string | Owner · v1.0 |
| Support URL `https://hanzi-dojo.com/support` | ✅ | Route is public: `src/App.jsx:367-373`, `src/routes.js:96` | — | — |
| Marketing URL | ✅ | `STORE-LISTING.md:32` | — | — |
| Privacy policy URL `/privacy` | 🟠 | Page exists and is public, **but is an explicit draft**: `src/TrustPages.jsx:12-14`, `BetaNote` at `:49-61`, hardcoded "1 August 2026" at `:340` | Owner review + remove beta note + refresh date. Apple 5.1.1(i) requires it be accurate | Owner · **v1.0** |
| Screenshots | 🟠 | Harness exists at correct geometry (`tests/e2e/store-screenshots.spec.js`, 1290×2796, `STORE_SHOTS=1`) but output is gitignored and **shot 5 is the old Home** | Recapture after Home V3 — see §9 | Claude+Owner · post-Codex |
| App previews (video) | ⚪ | — | Skip for v1.0 | v1.1 |
| App Store icon (1024) | ✅ | `ios/.../AppIcon-512@2x.png`, verified 1024², no alpha, full-bleed by `tools/verify-app-icons.mjs` (11 checks) | — | — |
| Localization | ⚪ | English only; no i18n framework in `src/` | Correct scope for v1.0 | v1.1 |
| Version / build info | 🟡 | `MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1` (`project.pbxproj:308,301`); Android `versionName "1.0"`, versionCode from CI run number (`build.gradle:22-23`) | Confirm 1.0/build 1 is the intended first submission | Owner · submission |
| Build selection | ✅ | Builds 43/44/45 archived, exported and uploaded to TestFlight via `ios-testflight.yml` | Select the build in the console at submission | Owner · submission |
| Export compliance | ✅ | `ITSAppUsesNonExemptEncryption=false` pre-answered with rationale, `ios/App/App/Info.plist:80-86` | — | — |
| App Review contact info | 🟡 | Not in repo (console-only) | Owner enters name/phone/email | Owner · submission |
| Review notes | ✅ | Drafted `STORE-LISTING.md:131-170` — covers demo account, deletion path, Apple sign-in, speech, content, third-party data | Update the deletion path if §4 changes | Owner · submission |
| Demo account | 🔴 | Placeholder only: `playreview@hanzi-dojo.com` with password deliberately not committed (`STORE-LISTING.md:133-136`) | **Create the account, seed it with due cards + unlocked stories + a level in progress**, put the password in the console only. Apple 2.1(a) requires a working login | Owner · **v1.0** |

---

## 2 · App Privacy (Apple disclosure mapping)

Evidence-based. Nothing below is inferred from a library merely being present.

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose | Evidence |
|---|---|---|---|---|---|
| **Email address** | Yes | Yes | No | Account management | `src/Auth.jsx:66-76`; stored by Supabase Auth |
| **User ID** | Yes | Yes | No | App functionality | `analytics.js:132-143` (`user_id`) |
| **Product interaction** (screens, learning events) | Yes | Yes | No | Analytics, app functionality | `src/analytics.js:164` → own `analytics_events` table; 30 event names at `:21-66` |
| **Study history / progress** | Yes | Yes | No | App functionality | `cards`, `review_logs`, `daily_activity`, `story_reads`, `test_attempts`, `level_unlocks`, `writing_stats` |
| **Crash / diagnostic data** | Yes | Yes | No | App functionality (bug fixing) | `src/errorMonitor.js:19-28` — **only** `source`(≤20), `error_name`(≤40), `message`(≤40), `route`(≤40); capped at 5/load `:14,33-34`. **No stack traces** |
| **User-generated content** (feedback text) | Yes | Yes | No | Support | `src/Feedback.jsx:65-73` — **and forwarded to a Discord webhook**, `supabase/migrations/20260715230000_feedback_discord_webhook.sql:52-56` (body ≤3900 chars; email replaced by `user_id` in `20260715234500_...:37`) |
| **Coarse device data — timezone** | Yes | Yes | No | Scheduling reminders / day boundaries | `src/App.jsx:96-105` → `profiles.timezone`; disclosed `TrustPages.jsx:82-83` |
| **Push token** (opt-in only) | Yes | Yes | No | Reminders | `src/push.js:44-50`; deleted on disable `:76-78` |
| **Precise/coarse location** | **No** | — | — | — | No `navigator.geolocation`; Android declares only `INTERNET` (`AndroidManifest.xml:45`) |
| **Contacts / Photos / Camera / Files** | **No** | — | — | — | No `NS*UsageDescription` keys in `Info.plist` at all; no APIs in `src/` |
| **Audio** | **No** | — | — | — | No `MediaRecorder`, no audio upload. Speech uses browser `webkitSpeechRecognition` (`src/speechSupport.js:18`) — processed by the browser, never stored |
| **Advertising ID (IDFA/GAID)** | **No** | — | — | — | No ad SDK; no `AD_ID` permission; no ATT prompt |
| **Purchases / financial info** | ⚪ None | — | — | — | §6 — no monetization exists |
| **Third-party analytics / attribution SDK** | **None** | — | — | — | No Firebase, Sentry, Amplitude, Segment, RevenueCat, Meta/TikTok in `package.json` |

**Tracking (ATT):** nothing in the app meets Apple's definition of tracking — no
data is shared with data brokers or joined with third-party data for advertising.
**No ATT prompt is required.** Answer "Not used for tracking" for every category.

| Finding | Status | Action |
|---|---|---|
| Feedback text → Discord is **not disclosed** in `/privacy`'s Infrastructure list (`TrustPages.jsx:131-140`; Discord named only as a support channel at `:161-162`) | 🟠 | Add Discord to the infrastructure/sub-processor list, or stop forwarding the body |
| Google Fonts loaded from `fonts.googleapis.com` on every cold start → user IP to Google | 🟡 | Already disclosed (`TrustPages.jsx:136`). Consider self-hosting in v1.1 |
| Privacy policy is a draft | 🟠 | See §1 |

---

## 3 · Google Play Data Safety

| Question | Answer | Evidence |
|---|---|---|
| Collects data? | **Yes** | §2 |
| Shares data with third parties? | **Yes — narrowly.** Feedback message bodies are forwarded to Discord | `20260715230000_feedback_discord_webhook.sql:52-56` |
| Personal info → Email address | Collected, **required**, account management. Not shared | `Auth.jsx:66` |
| Personal info → User IDs | Collected, required, app functionality. Not shared | `analytics.js:132` |
| Personal info → Name, phone, address | **Not collected** | No such fields |
| App activity → App interactions | Collected, required, analytics + app functionality | `analytics.js:21-66` |
| App activity → User-generated content | Collected, **optional** (only if user submits feedback), support. **Shared** (Discord) | `Feedback.jsx:65-73` |
| App info & performance → Crash logs / diagnostics | Collected, required, app functionality. Not shared | `errorMonitor.js:19-28` |
| Device or other IDs | **Not collected** (session id is per-load and not a device ID) | `analytics.js:82-93` |
| Location / Contacts / Photos / Audio / Files / Calendar / Financial / Health / Messages / Web browsing | **Not collected** | `AndroidManifest.xml:45` — INTERNET only |
| Data encrypted in transit | **Yes** | `androidScheme: https` (`capacitor.config.json:6`); no cleartext config anywhere; all endpoints HTTPS |
| Users can request deletion | Yes, in-app | §4 |
| **Web-accessible deletion URL** | 🔴 **Not established** | `STORE-LISTING.md:183` currently answers `/profile`, which **requires sign-in** — see §4 |

---

## 4 · Account deletion

**Apple 5.1.1(v): ✅ satisfied. Google Play's two-part requirement: 🔴 half-satisfied.**

| Check | Status | Evidence |
|---|---|---|
| In-app deletion exists | ✅ | `src/Profile.jsx:793-843`, a `Panel danger` at the bottom of Profile (a first-class nav item) |
| Destructive-action wording | ✅ | "Permanently deletes your account and everything in it… **This cannot be undone.**" `Profile.jsx:796-803` |
| Typed confirmation | ✅ | Arm-then-type-`delete`: `accountDeletion.js:13-22`, button disabled until both (`Profile.jsx:809`) |
| Non-destructive alternative offered | ✅ | Points to "Reset a language" instead, `Profile.jsx:801-803` |
| Deletes study data | ✅ | `cards`, `review_logs`, `daily_activity`, `test_attempts`, `test_answers`, `writing_stats`, `grammar_reviews`, `level_unlocks`, `language_tracks` — via `profiles` CASCADE, `20260807130000_delete_my_account.sql:11-13` |
| Deletes story progress | ✅ | `story_reads` (cascade); `story_unlocks` + `story_reward_claims` cascade via `user_id → profiles` (`20260809090000_story_chapter_rewards.sql:36,64`) |
| Deletes analytics | ✅ | Explicit delete, `20260807130000_delete_my_account.sql:42-50` |
| **Deletes the auth identity** | ✅ | `delete from auth.users where id = uid`, `:56` — sessions/refresh tokens cascade |
| Deletes local device data | ✅ | `forgetDeviceData()` → `clearDownloads()` + `outboxClear()`, `accountDeletion.js:29-31` |
| Requires contacting support? | ✅ No | Email is a *fallback only*, for users who can't sign in (`TrustPages.jsx:249-258`) |
| Guarded against anon call | ✅ | Raises `'Not signed in'`; revoked from `anon`/`public`, granted to `authenticated` (`:28-38,60-62`) |
| **Play web deletion URL** | 🔴 | `STORE-LISTING.md:183` answers `https://hanzi-dojo.com/profile` — that route is **behind the `!session` gate** at `src/App.jsx:375-380`. A user who uninstalled and cannot sign in has no web path |
| Stale comment: RPC header says "12 cascading tables" | ⚪ | Now 14 (`:11-13`). Cosmetic |
| Two dead guards: `unlocked_stories`, `bodyos_app_state` never created by any migration | ⚪ | Harmless (`to_regclass` guarded) |

**Action (🔴) — decided in the remediation pass:** answer Play with
**`https://hanzi-dojo.com/support`**, not a new `/delete-account` route.
`/support` is already in `TRUST_PAGES` (`src/routes.js:96`), already renders
signed-out, and already carries the in-app path plus the email fallback
(`TrustPages.jsx:249-258`). What it is missing is the *second half* of Play's
requirement — enumerating **which data is deleted, which is kept, and any
retention period**. That is a copy edit inside `TrustPages.jsx`, zero routing
change, zero collision with Codex (who is editing `routes.js`). Reasoning and the
rejected alternative are in
[`RELEASE-BLOCKER-REMEDIATION.md`](RELEASE-BLOCKER-REMEDIATION.md) §4.

---

## 5 · Authentication & App Review

| Item | Status | Evidence |
|---|---|---|
| Email + password sign-up / sign-in | ✅ | `src/Auth.jsx:66-76` |
| Password reset by email | ✅ | `Auth.jsx:96` |
| Google OAuth (web + native) | ✅ | `Auth.jsx:410-411` (ungated) → `nativeAuth.js:81-103` |
| Sign in with Apple (native only) | ✅ code | `Auth.jsx:384` — `FLAGS.APPLE_SIGN_IN && isNativeApp()`; `nativeAuth.js:239-271` |
| Apple entitlement present | ✅ | `ios/App/App/App.entitlements:8-11` |
| **Guideline 4.8 satisfied** | ✅ | Google is offered on iOS, and SwA is offered alongside it. Requirement met *provided SwA actually works* — see B1 |
| Native OAuth via system browser + PKCE | ✅ | `supabase.js:57` (`pkce` on native), `nativeAuth.js:83-101` (`skipBrowserRedirect` + `open`) |
| Custom scheme registered both platforms | ✅ | `Info.plist:29,32`; `AndroidManifest.xml:26-31` |
| Account required at first run | ✅ by design | Hard gate `src/App.jsx:375-380`. Public exceptions: `/read/:id`, `/assessment`, trust pages |
| Account creation placement | ✅ | Value-first: flashcard → story → prefs → *then* signup (`Landing.jsx:313-322,567-571`); legal consent shown at signup (`Auth.jsx:338-352`) |
| Demo account for review | 🟠 | Placeholder only — see §1 |
| Leaked-password protection | 🟡 | **Disabled** — live Supabase advisor `auth_leaked_password_protection`. One dashboard toggle | Owner |

### 🟠 B1 — Sign in with Apple runs on a CLI-patched plugin manifest

**Corrected classification: 🟠 REAL RISK. Not a blocker.** An earlier pass called
this "iOS cannot be built". That was wrong, and the correction matters, so the
reasoning is recorded in full.

**What the earlier pass got wrong.** It read the plugin's *upstream, as-published*
manifest and stopped there:

```
node_modules/@capacitor-community/apple-sign-in/Package.swift:13
  .package(url: ".../capacitor-swift-pm.git", from: "7.0.0")   // = >=7.0.0 <8.0.0

ios/App/CapApp-SPM/Package.swift:14
  .package(url: ".../capacitor-swift-pm.git", exact: "8.5.0")
```

Those two are genuinely unsatisfiable *as written*. The error was assuming Xcode
ever sees them as written. **It does not** — `cap sync ios` rewrites the plugin
manifest first.

**What actually happens.** Capacitor 8.4.1 shipped
[`fix(cli): patch Capacitor SPM dependency version in plugins` (#8492, `28bb2c6`)](https://github.com/ionic-team/capacitor/commit/28bb2c687069dfdd6aa7abc866004a1c6388d103),
released [2026-06-19](https://github.com/ionic-team/capacitor/blob/main/CHANGELOG.md).
This project runs **CLI 8.5.0**, so it contains the fix. The logic, verified in
the installed copy at `node_modules/@capacitor/cli/dist/ios/update.js:49-63`:

```js
const packageSwiftPath = join(plugin.rootPath, 'Package.swift');
let content = await readFile(packageSwiftPath, { encoding: 'utf-8' });
const regex = new RegExp('url:\\s*"https://github.com/ionic-team/capacitor-swift-pm\\.git",\\s*from:\\s*"([^"]+)"');
const version = content.match(regex)?.[1];
const majorCapVersion = major(iosPlatformVersion);
if (version && major(version) != majorCapVersion) {
  const forceVersion = preCapVersion ? iosPlatformVersion : `${majorCapVersion}.0.0`;
  content = setAllStringIn(content, 'url: ".../capacitor-swift-pm.git",', ')', ` from: "${forceVersion}"`);
  await writeFile(packageSwiftPath, content);
  logger.warn(`${plugin.id} is built for Capacitor ${major(version)}, it might cause issues`);
}
```

Traced against this project:

| Step | Value |
|---|---|
| `version` (matched from the plugin manifest) | `7.0.0` |
| `iosPlatformVersion` (`@capacitor/ios`) | `8.5.0` |
| `major(7.0.0) != major(8.5.0)` | **true → patch applies** |
| `forceVersion` | `8.0.0` |
| Plugin manifest **after** `cap sync` | `from: "8.0.0"` = `>=8.0.0 <9.0.0` |
| App pin `exact: "8.5.0"` | ✅ **satisfied — resolution succeeds** |

It applies to **local/community plugins specifically**: the loop runs over
`checkPluginsForPackageSwift(...)`, i.e. every installed plugin of type
`PluginType.Core` that has a `Package.swift` on disk —
`@capacitor-community/apple-sign-in` qualifies (`Package.swift` verified present
at `node_modules/@capacitor-community/apple-sign-in/Package.swift`).

**Why Build 45 succeeds — the exact reason.** `ios-testflight.yml` runs
`npm ci` (:90) → **`npx cap sync ios` (:126)** → `xcodebuild archive` (:238).
The patch is applied at step 2, *before* Xcode ever resolves packages.
`node_modules` is not committed and `Package.resolved` is not tracked, so the
sequence re-runs cleanly on every CI job: npm installs the pristine `from: "7.0.0"`,
`cap sync` rewrites it to `from: "8.0.0"`, Xcode resolves 8.5.0, archive succeeds.

**Why this sandbox saw the unpatched state.** `cap sync ios` has never been run
here (Linux, no Xcode), so `node_modules` still holds the pristine published
manifest — which is exactly what the earlier pass read. Confirmed: the working
copy still shows `from: "7.0.0"` today. **A static read of `node_modules` is not
the build path.**

**The residual risk that is real.** The CLI forces the *version constraint*; it
does not verify *Swift API compatibility*, and it says so — it emits
`"@capacitor-community/apple-sign-in is built for Capacitor 7, it might cause issues"`
on every sync. Three successful archives prove it **compiles and links**. They do
not prove the sign-in flow works at runtime, and
`docs/PRE-RELEASE-CHECKLIST.md` §0b independently records Sign in with Apple as
*"code done 2026-08-07 … unverified until someone signs in on a real device."*

That combination — build verified, runtime not — is precisely 🟠 REAL RISK.
It would drop to 🟡 TECH DEBT the moment one successful Apple sign-in is
completed on a TestFlight build.

| Question | Answer |
|---|---|
| Can the current production build path resolve and archive? | **Yes** — proven by Builds 43, 44, 45 |
| Does Capacitor's 8.4.1+ patch apply here? | **Yes** — CLI 8.5.0 ≥ 8.4.1; plugin has a `Package.swift`; major mismatch 7 ≠ 8 triggers it |
| Is upstream Capacitor-8 support released? | **No** — `npm view` shows `latest: 7.1.0`; there is no 8.x plugin release |
| Classification | **🟠 REAL RISK** — needs one targeted device verification of the Apple sign-in flow, nothing more |
| Action before next TestFlight | **None required.** The build path is unchanged and working |

**Do not "fix" this.** Downgrading Capacitor, vendoring the plugin, or hand-patching
`Package.swift` would each *replace* a working official mechanism with a bespoke
one. The correct action is a single device test of the sign-in flow, tracked as
v1.1 debt until the plugin publishes an 8.x major.

### Draft App Review notes (information only — no fictional credentials)

The existing draft at `STORE-LISTING.md:131-170` is good. Additions to make once
the blockers close:

- **Demo account** — real address + password entered *in the console only*, pre-seeded with due cards, unlocked stories and a level in progress.
- **How to reach the main loop** — sign in → Home → "Study" → grade a card → open a story → tap a word for the dictionary sheet.
- **Account deletion** — Profile → Delete account → type `delete`. Immediate and permanent.
- **Sign in with Apple** — offered alongside Google and email/password; native sheet.
- **Speech** — the Speaking drill is hidden on iOS because WKWebView has no speech recognition; **no microphone permission is requested**.
- **No purchases, no ads, no third-party analytics.**
- **Dictionary** — CC-CEDICT; a small number of entries are explicit and hidden behind a per-search reveal (explains the age rating).

### Review-blocking risks to pre-empt

| Risk | Status | Note |
|---|---|---|
| Reviewer cannot sign in (no working demo account) | 🟠 | Apple 2.1(a) — hard rejection. See §1 |
| Backend must be live during review | 🟡 | Supabase is always-on; confirm no maintenance window |
| **iOS mic prompt without a usage string** | 🟠 | `src/speechSupport.js:18` uses `webkitSpeechRecognition`; `Info.plist` has **no** `NSMicrophoneUsageDescription`/`NSSpeechRecognitionUsageDescription`. If WKWebView ever prompts, iOS **crashes the app** — a hard rejection. `speechSupport.js:24` gates on native, so it likely never fires. **Must be confirmed on device** |
| `/dev` reachable by any signed-in user | 🟠 | See §8 — Apple 2.3.1(a) prohibits hidden/undocumented features |

---

## 6 · Payments / premium — ⚪ none exists

Exhaustive grep for `purchase|subscription|stripe|revenuecat|paywall|premium|donate|billing|payment|checkout` across `src/` returns **zero monetization hits**. Every match is a false positive: `push_subscriptions` (`src/push.js`), the Supabase auth `subscription` handle (`App.jsx:289`), Azure's `Ocp-Apim-Subscription-Key` in build-time TTS tooling, the word "paywall" in a comment explaining what the UI *avoids* (`ManhuaReader.jsx:28`), and "premium" as a button style (`NativeWelcome.jsx:78`).

No StoreKit, no Play Billing, no purchase plugin in `package.json`. Terms state the product is free (`TrustPages.jsx:179-180`).

**Declare: no in-app purchases, no ads, free app.** Consistent with `CLAUDE.md` §1 ("Stay free… never paywalls on core features").

---

## 7 · Content / intellectual property

**Superseded by the deep-dive.** Full evidence, per-asset, is in
[`CONTENT-PROVENANCE-AUDIT.md`](CONTENT-PROVENANCE-AUDIT.md) (3 🔴 / 7 🟠 / 4 🟡
/ 2 ✅). This section is the summary; that document is the source of truth, and
it corrects two rows this table previously got optimistic about.

| Item | Status | Evidence | Action |
|---|---|---|---|
| ~~No LICENSE / NOTICE / third-party-terms file anywhere~~ | ✅ **Fixed 2026-08-15** — `LICENSE`, `NOTICE.md`, `docs/CONTENT-LICENSING.md`. Original finding: | `git ls-files \| grep -iE "licen\|notice\|copying\|attrib\|third.?party\|credits\|copyright"` over all **1,179 tracked files → zero matches**; `package.json` has no `license` key | Establish the licensing basis for everything shipped (below) |
| ~~Every shipped app icon derives from a file of unknown origin~~ | ✅ **Closed 2026-08-15** — owner statement: generated through ChatGPT / OpenAI ImageGen; not stock, not a third-party logo. Original finding kept for the record: | `src/assets/86055582-d1d3-4cb7-a460-6c907025fe15.png` — UUID filename, **no PNG metadata chunks at all** (verified: no `tEXt`/`iTXt`/`zTXt`/`eXIf`; 1254×1254, colortype 2), added in the squashed initial commit. The approved V2 mark is a *cleaned raster of it*, not a redraw (`P14-APP-ICON-V2-BRUSH.md:20-23`), so `mask-V2.png` → every iOS/Android/web icon inherits the lineage. The V3 vector is measured from the same raster, so it is **not** a clean-room escape | Owner produces the acquisition record, or confirms it was self-made/commissioned, or the mark is regenerated from a provenance-clean source |
| ~~`/terms` publicly claims © over artwork with no rights record~~ | ✅ **Fixed 2026-08-15** — narrowed to what is owned, AI artwork acknowledged. Original finding: | `src/TrustPages.jsx:196` — *"Stories, artwork, and app design are © {BRAND_NAME}"*, covering the icon master, `Hanzi-logo.png`, 3 of 4 backgrounds, 267 covers, 127 panels and the third-party brand marks in `public/icons.svg` | Soften the wording to what is actually owned. Cheapest of the three to de-risk — one copy edit |
| **Azure TTS commercial rights are paid-tier-only** | 🔴 | ~**10,522 clips** (`CHANGELOG.md:89`) from `zh-CN-Xiaoxiao*` / `zh-CN-Yunxi` (`src/tts/providers/azure.js:27-29`). Microsoft grants commercial use of prebuilt neural voices to paid tiers; **F0 is not licensed for it**. `.env.example` records only key + region — **tier cannot be determined from repo** | Owner confirms the Speech resource is **S0, not F0**, and archives a screenshot. If F0: every clip must be regenerated on a paid resource |
| AI story artwork — commercial-use rights | 🟠 *(was 🔴)* | 127 committed panels + 267 covers via **Higgsfield MCP** (`nano_banana_pro` at 2k, `data/manhua/*.art.json:3`). Higgsfield's published terms are **favourable**: it claims no ownership of Outputs, does not restrict commercial use, and permits sublicensing | Downgraded on the terms themselves. Residual: `nano_banana_pro` is Google's model *via* Higgsfield, and Higgsfield grants rights but does **not indemnify**. Owner archives a dated PDF of the terms |
| **Generation prompts are not archived** | 🟠 | Manifests hold exactly `{file,url}`; `grep -rn '"prompt"' data/` → **0** across all 9 | No per-image proof the "no resemblance to any franchise" constraint was applied. Extend `.art.json` with `prompt` + `generated` going forward |
| **16 shipped panels have no manifest at all** | 🟠 | `public/stories/upstairs/hsk3/ep01` — no `.art.json`, no source URL, no model, no art-direction note. Also unmanifested: `data/manhua/references/upstairs-hsk3-cast.webp` and 2 of 5 `bible/` sheets | Record what is knowable; accept the gap for the rest |
| Story text — LLM-generated | 🟠 | Gemini → Groq chain (`llmProviders.mjs:63-70`), Anthropic premium tier (`llm.mjs:89-94`). Plus 176 *"Human/Claude-authored"* stories with **no per-story marker** | Confirm commercial-use terms; record them |
| **Third-party brand marks ship in the bundle** | 🟠 | `public/icons.svg` — Bluesky, X, GitHub and Discord marks (trademarks, not just copyright), present in `dist/client/` and publicly fetchable, **referenced by zero app code**. Origin cannot be determined from repo | Dead but deployed — deleting it is the whole fix |
| Other bundled art of unknown origin | 🟠 | `src/assets/Hanzi-logo.png` (bundled, on 8 screens; `BACKLOG.md:271-273` says it is "the same ensō", i.e. §1's lineage); `bg-chinese`, `bg-japanese`, `bg-login` (only `bg-russian` is documented) | Record or replace |
| Fonts — Noto Sans SC, Inter, Poppins, Noto Sans JP | 🟡 | All CDN-linked, **none bundled** (`index.html:24`, `fontLoader.js:13`) | All four are OFL 1.1, but **the repo states no license**. Add a NOTICE. No redistribution occurs, so risk is low |
| Third-party franchise names in shipped content | ✅ | Grep of ~25 anime/manga/game/brand names across `src/`, `data/`, `public/` → **zero hits in story content** | — |
| Competitor names in UI copy | 🟡 | `Anki`/`Pleco` named as import formats (`KnownWords.jsx:224`, `Dictionary.jsx:221`) | Nominative use is fine in-app; **do not put competitor names in store listing copy** |
| WeChat | ✅ | `chatMissions.js:34` — comment explicitly says "**not** WeChat branding"; deliberate non-copy palette | — |
| Originality policy exists and is enforced | ✅ | `docs/STORY-BIBLE.md:275-283` CRITICAL CONSTRAINTS (verbatim-locked), `:290-291` "Never name a franchise, a studio or an artist in a prompt", `:273-274` records 14/19 panels regenerated for a breach | Policy is strong; the **evidence trail** is what's missing |
| CC-CEDICT / Tatoeba attribution exists | ✅ | `TrustPages.jsx:198-201` (Terms) and `:306` (Methodology), plus `seed-dict.mjs:10` | — |
| **CC-CEDICT ShareAlike is only half-satisfied** | 🟠 | CC BY-SA requires credit **+ a licence-deed link + indicating changes**, and ShareAlike on adaptations. The project *has* adapted it (pinyin corrections, curated readings); the current text names the licence but links no deed and states no changes | Add the deed link and a "changes made" line |
| **Flashcard glosses are visibly CC-CEDICT-derived but unattributed as such** | 🟠 | `src/hskBuild.js:11` concedes the HSK glosses are *"CC-CEDICT-style dumps"*; e.g. 把 → "to hold; to grasp; to hold a baby in position to help it urinate or defecate". Source dataset `drkameleon/complete-hsk-vocabulary` is MIT and also unattributed | Attribute both |
| **`hanzi-writer-data` and `lucide` notices not retained** | 🟠 | Stroke corpus derives from Make Me a Hanzi / **Arphic PL**, which has its own notice requirement (`src/strokeData.js:19`); `lucide-react` is ISC across 66 import sites | One NOTICE row each |
| Fonts | 🟡 | **Zero font binaries in the repo**; all CDN-linked (`index.html:24`, `fontLoader.js:13`) — no OFL redistribution obligation is triggered | NOTICE entry closes it |
| Third-party franchise names in shipped content | ✅ | Grep of ~25 anime/manga/game/brand names across `src/`, `data/`, `public/` → **zero hits in story content** | — |

**The honest position, revised.** The *policy* is excellent and the shipped
content shows no franchise contamination — and the biggest single worry going in,
Higgsfield's terms, turned out to be fine. What did **not** hold up is the
foundation underneath the brand: the icon every store listing will carry traces
back to a metadata-stripped UUID PNG nobody can source, and `/terms` already
asserts ownership over it in public. That is a smaller, sharper problem than
"licensing is unproven" — and a more urgent one, because it is the one thing here
that could require re-drawing a shipped asset rather than writing a document.

---

## 8 · Production configuration

| Item | Status | Evidence |
|---|---|---|
| Bundle / application ID consistent | ✅ | `com.hanzidojo.app` in `capacitor.config.json:2`, `project.pbxproj:310,331`, `build.gradle:16` |
| No remote-loaded webview | ✅ | No `server.url`, no `cleartext`, no `allowNavigation` in `capacitor.config.json` |
| Android permissions | ✅ | `INTERNET` only (`AndroidManifest.xml:45`) |
| No cleartext / network-security-config | ✅ | Zero hits across `android/`, `ios/`; `androidScheme: https` |
| Export compliance answered | ✅ | `Info.plist:80-86` |
| **No secrets committed** | ✅ | `git grep "eyJhbGciOi"`, `sk-…`, `AIza…` → **zero hits**. `service_role` never in `src/` or any `VITE_` var, guarded by a build-failing test (`src/tts/serverOnly.test.js:111`) |
| `.gitignore` covers `.env`, `.env.script`, keystores, `.p8`/`.pem` | ✅ | `.gitignore:14-22,55-60` |
| Committed env files are placeholders only | ✅ | `.env.test`, `.env.e2e`, `.env.example` — all fake values |
| **Personal email in the production bundle** | ✅ **Fixed 2026-08-15** | `src/devTools.js:11` `DEFAULT_DEV_EMAILS = 'fabrykjoh@gmail.com'` — **confirmed present in the emitted `dist/client/assets/devTools-*.js`** (2,958 B). Because `VITE_DEV_EMAILS` was unset at build time, Vite's static `import.meta.env` replacement collapsed the fallback and the literal is the *only* surviving value. It is the only personal address in the whole build; the only other email is `support@hanzi-dojo.com`. No source maps are emitted. **Public-but-unprofessional, not a security exposure** — the gate is client-side, and every `/dev` action runs as the signed-in user under RLS |
| **`/dev` reachable by any signed-in user** | ✅ **Fixed 2026-08-15** | `Dev.jsx` now gates on `profile.is_admin` — the same server-backed flag as `/hq` and `/dashboard`, and one a user cannot self-assign (`guard_is_admin_flag`). `App.jsx` was deliberately not touched (Codex holds it), so the route still renders the component; the component refuses |
| Admin surfaces server-enforced | ✅ | All six `admin_*` RPCs call `assert_admin()` — **verified live**: `assert_admin()` raises `'not authorized'` unless `auth.uid()` is an admin profile. Privilege escalation blocked by trigger (`20260716120000_guard_is_admin_flag.sql:18-34`) |
| `admin_*` RPCs executable by `anon` role | 🟡 | Live Supabase advisor. **Not a leak** (guard verified above), but revoke `EXECUTE` from `anon` as defence-in-depth | 
| `hq.html` excluded from store build | ✅ | `vite.config.js:60-61` — `SITES_BUILD` branch; `cap:sync` uses `build:public` |
| **…but DojoHQ's code still ships in the store bundle** | 🟠 | *(New, 2026-08-15.)* Excluding `hq.html` only drops the second **entry point**. `src/App.jsx:58` lazy-imports `./DojoHQ` for the in-app `/hq` route, so a `DOJO_PUBLIC_BUILD=1` build still emits `dist/client/assets/DojoHQ-*.js` (**124 kB**) + `DojoHQ-*.css` (69 kB) — verified on a public build with no `hq.html` present. The localhost bridge string `127.0.0.1:43127` is inside that chunk. Access is server-enforced (`assert_admin()`), so this is **dead weight and a 2.3.1(a) talking point, not a leak** |
| Paused Japanese/Russian tracks cannot leak | ✅ | `PUBLIC_LANGUAGES = ['chinese']` **and** `ADMIN_LANGUAGES = ['chinese']` (`languageTheme.js:84,89`); every picker uses `availableLanguages()`; single-language list makes the picker step skip entirely (`Landing.jsx:309`). Server-side trigger also enforces it |
| Universal links / App Links | 🟠 | **Not configured** — no `apple-app-site-association`, no `assetlinks.json`, no `autoVerify`. Documented as a later step (`AndroidManifest.xml:23-25`) |
| Orientation disagreement | 🟠 | iOS allows landscape (`Info.plist:65-70`); Android locks portrait (`AndroidManifest.xml:16`); web manifest says portrait (`manifest.webmanifest:8`) |
| `UIRequiredDeviceCapabilities = armv7` | 🟡 | `Info.plist:62-64` — 32-bit-era Capacitor boilerplate | 
| `secrets.VITE_GOOGLE_TTS_KEY` | 🟠 | `regen-content.yml:76` — a **paid credential under a `VITE_`-prefixed secret name**. Not leaking (only read via `process.env` in `generate-audio.mjs:23`) but the name invites a client-build mistake |
| Android release signing falls back to unsigned | 🟠 | `build.gradle:45` assigns `signingConfig … : null` rather than failing, contradicting its own comment at `:3-5`. CI works around it (`android-build.yml:95-99`) |
| `minifyEnabled false` | 🟡 | `build.gradle:43` — no shrinking/obfuscation in release |
| `allowBackup="true"` | 🟡 | `AndroidManifest.xml:4` — Android default; means app data can be backed up to the user's Google account |
| Console statements in `src/` | ⚪ | 7 total, all diagnostic, none log credentials/PII |
| Localhost dev bridge in source tree | 🟠 | `dojoClaudeBridge.js:1` (`127.0.0.1:43127`) — imported only by admin-gated HQ, but **that chunk ships** (row above). Harmless at runtime; it just should not be in a store binary |
| Supabase: stale backup table with RLS-no-policy | ⚪ | `_reading_backup_20260725` — deny-all, but should be dropped |
| Supabase: `pg_net`, `pg_trgm` in public schema | ⚪ | Advisor WARN; move to `extensions` schema in v1.1 |

---

## 9 · Store screenshot plan (no screenshots created)

Harness already exists: `tests/e2e/store-screenshots.spec.js` — iPhone 6.7"
(430×932 @3× = **1290×2796**, exactly what App Store Connect wants), runs under
`STORE_SHOTS=1`, output gitignored as a build artifact.

**Recommended order** (first three carry the conversion; Apple shows 1–3 on the
product page without scrolling):

| # | Screen | Headline concept | Why it earns the slot |
|---|---|---|---|
| 1 | **Story mid-read, one word tapped open** | *"Read real Chinese — tap any word."* | The single most differentiating moment. Shows the product's actual promise, not a menu |
| 2 | **Stories shelf with "% known" pills** | *"Stories matched to the words you know."* | This is the differentiation — nobody else grades a library against your own deck |
| 3 | **Flashcard revealed, four grade buttons** | *"Spaced repetition that doesn't let you fool yourself."* | Establishes the SRS credential fast |
| 4 | **Home V3 / training guide** | *"Your day, already planned."* | ⏸ **Blocked on Codex.** Must be recaptured — do **not** ship the Build 45 Home |
| 5 | **Manhua panel with a speech balloon** | *"Comics you can actually read."* | Visually the strongest frame; strong scroll-stopper deep in the carousel |
| 6 | **Dictionary entry / word lookup** | *"A real dictionary, one tap away."* | Reference credibility |
| 7 | *(optional)* **Progress / Profile** | *"Progress you can trust."* | Only if it looks calm — see below |

**Do NOT use:**
- The **login or signup screen** — explicitly prohibited by guideline 2.3.3.
- The **splash screen or bare logo** — same guideline.
- **Any Build 45 Home** — superseded by Home V3.
- **Empty or zeroed states** (a new account's 0-card Home) — reads as an empty app.
- **The level test / assessment** — tests-as-hero implies exams, which fights the calm positioning.
- **Dashboard / HQ / any admin surface** — would advertise a hidden feature.

**Practical notes:** recapture *after* Home V3 lands; the mock-backend fixture
means the seeded state is reproducible; captions are added in the store console,
not baked into the PNGs. Play needs its own sizes — the harness currently only
emits the iPhone 6.7" set.

---

## 10 · Accessibility / review risk

Breadth is genuinely good — this is not a from-scratch pass.

| Area | Status | Evidence |
|---|---|---|
| 44px touch targets | ✅ | 64 files reference the 44px minimum; `ReadingScaffold.jsx:59-70` documents a shared 44×44 tap-target wrapper |
| ARIA labels / roles | ✅ | `aria-label` in 56 files, `role=` in 51 |
| Live regions for drill results | ✅ | `aria-live` in 20 files — added in the accessibility pass recorded in `ROADMAP.md` |
| Chinese text marked `lang="zh"` | ✅ | 7 files — stops screen readers using an English voice on hanzi |
| Reduce Motion | 🟡 | 11 files reference `prefers-reduced-motion`. **Home V3 introduces new motion** — must be re-checked after Codex lands |
| Dark mode | ✅ | Semantic token system per `CLAUDE.md` §5 |
| Dynamic Type / large text | 🟠 | No evidence of testing at accessibility text sizes. Fixed-height study layout (`studyLayout.js`) is the likeliest breakage point |
| Keyboard / focus | 🟡 | Focus trapping shipped for dialogs (per ROADMAP); web-only concern |
| VoiceOver end-to-end pass | 🟡 | Cannot be verified in sandbox — device pass needed |

**None of these is a release blocker on current evidence.** The two worth a
device pass: Dynamic Type on the Study screen, and Reduce Motion against Home V3.

---

## 11 · Offline / failure states

| Case | Status | Evidence |
|---|---|---|
| Missing env vars at boot | ✅ | `supabase.js:12-28` renders a visible config-error card, not a white screen |
| Profile load fails | ✅ | Retry card — "Your progress is safe — try again" (`App.jsx:403,413,423`); explicitly avoids dumping an existing learner into signup |
| Home queue fails | ✅ | "Couldn't load today's queue" + CTA doubles as retry (`Home.jsx:335,347,351`) |
| Dictionary offline vs failed | ✅ | Distinguishes the two, offers degraded offline search + Try again (`Dictionary.jsx:504-515`) |
| Offline grading | ✅ | Durable IndexedDB outbox, idempotent `grade_card` with stable `opId` (`syncQueue.js:8-42`); analytics deliberately lossy `:57-58` |
| Offline status surfaced | ✅ | `OfflineBar.jsx` — appears only when it has something to say; flushes on reconnect + Background Sync |
| Image/asset failure | ✅ | Service worker refuses to cache SPA-shell HTML as an asset and self-heals poisoned entries (`sw.js:90-99,106-112`) — this is the manhua-blank-panel bug, fixed |
| Ranged audio on iOS | ✅ | Ranged requests bypass the SW cache (`sw.js:148-155`); offline replay uses the IndexedDB audio store |
| **Writes that fail while `navigator.onLine === true`** | 🟠 | `syncQueue.js:6-7` enqueues **only** when `onLine === false`. Captive portals, DNS failure, and a down Supabase fall in the gap — the write is lost, not queued |
| **No timeout / backoff / circuit breaker on any Supabase call** | 🟠 | No client-side deadline found in `src/`; every "retry" is a user tap. A hung request hangs the screen |
| Grammar screens degrade to *empty*, not to an error | 🟠 | `Grammar.jsx:96,105`, `GrammarPractice.jsx:38` — `.catch(() => {})`. User offline sees "no grammar" rather than "you're offline" — inconsistent with Home/Dictionary |
| **Push notification icon is broken** | 🟠 | `sw.js:177-178` references `./pwa-192.png` — **verified: the file does not exist** in `public/`. Under the Vercel SPA rewrite that path returns HTML, so notifications render with no icon. Manifest correctly uses `icon-192.png`; the App Icon V2 rename missed `sw.js` |
| Interrupted study session / background-restore | 🟡 | Cannot verify in sandbox — device test |

---

## 12 · Test / release pipeline

### What CI actually covers today

| Check | On PR? | On push to main? | Where |
|---|---|---|---|
| `npm run lint` | ✅ | ✅ | `ci.yml:45-46` |
| `npm test` (vitest, 3301 tests / 144 files) | ✅ | ✅ | `ci.yml:48-49` |
| `npm run build` (**Sites** variant) | ✅ | ✅ | `ci.yml:53-54` |
| **`npm run build:public`** (the store bundle) | 🟠 **NO** | 🟠 **NO** | Only in `android-build.yml:54`, `ios-testflight.yml:116` — both `workflow_dispatch` |
| Playwright e2e (27 specs) | ✅ | ✅ | `e2e.yml:26` |
| iOS native build | ❌ | ❌ | `ios-testflight.yml` — dispatch only |
| Android native build | ❌ | ❌ | `android-build.yml` — dispatch only |

**The gap that matters:** `npm run build` takes the `SITES_BUILD` branch (emits
`hq.html`); `build:public` takes the other. **A regression that only affects the
store bundle passes every PR check.** Add `build:public` to `ci.yml`.

Scored 🟠 rather than 🔴 deliberately: the store bundle *is* built before every
upload (by `android-build.yml` / `ios-testflight.yml`), so this cannot block a
submission — it can only let a store-only regression reach that build unnoticed.
Cheap to close, high value, not a blocker.

Other pipeline findings:
- Node version drift: **22** in `ci.yml`/native builds, **20** in `e2e.yml`/`visual-baseline.yml`.
- Playwright runs **desktop Chromium only** (`playwright.config.js:29-36`) — no mobile viewport, no WebKit, despite iOS being the primary target.
- A branch pushed **without** an open PR gets no CI at all (`ci.yml:12-15`).
- `send-reminders.yml` runs hourly on cron — the only scheduled production job.

### Recommended release gate (once Codex + icon branch merge)

```
1.  npm run lint                 # 0 errors in src/
2.  npm test                     # full vitest suite
3.  npm run build                # Sites build
4.  npm run build:public         # THE STORE BUNDLE — add to CI
5.  node tools/verify-app-icons.mjs   # 11 icon checks
6.  npx playwright test          # full e2e, not a subset
7.  npx cap sync ios             # patches the plugin manifest; expect the
                                 #   "built for Capacitor 7" warning (§5 B1)
8.  npx cap sync android + bundleRelease
9.  Authoritative CI green on the merge commit (check the SHA, not the badge)
10. iPhone physical device pass  — 4 appearance modes, Settings › Apps dark,
                                    Dynamic Type on Study, VoiceOver spot-check
11. Android physical device pass — themed icon, 4 masks, parallax, API 24 legacy
12. Fresh-install test           — brand-new account through onboarding
13. Upgrade-from-previous-build  — existing account, cached SW, offline outbox
                                    must survive the sw.js v8 bump
```

⚠️ **Do not trust a green check on an art-fetch or bot commit** — pushes made with
`GITHUB_TOKEN` do not re-trigger workflows (`docs/BACKLOG.md`, `visual-baseline.yml:12-16`).

---

## Top 10 things we must do before submission

Ordered by dependency and severity.

| # | Item | Why it's this early | Owner |
|---|---|---|---|
| **1** | **Establish content licensing + provenance** | Longest lead time and entirely owner-dependent. Submission warrants you own or are licensed for all content: needs Higgsfield/`nano_banana_pro`, Azure TTS and LLM-text terms recorded, plus a LICENSE/NOTICE | Owner + Claude |
| **2** | **Create and seed the App Review demo account** | Apple 2.1(a) — a reviewer who can't sign in is an automatic rejection | Owner |
| **3** | **Owner-review and finalise `/privacy` and `/terms`** | Both carry a visible beta note and self-declare as drafts; 5.1.1(i) requires accuracy. Also add Discord to the sub-processor list | Owner |
| **4** | **Decide the Play web deletion URL** | Play requires a URL reachable without the app; `/profile` is behind auth. `/support` is public and already describes the process — likely just a form answer, not code | Owner + Claude |
| **5** | **Remove the personal email from the production bundle** | `fabrykjoh@gmail.com` is in `dist/`. Set `VITE_DEV_EMAILS` for store builds, and gate `/dev` on `is_admin` like `/hq` | Claude |
| **6** | **Add `build:public` to CI** | The bundle the stores ship is currently never verified by any PR check — cheap fix, prevents a whole class of silent failure | Claude |
| **7** | **Fix `sw.js` → `pwa-192.png`** | Broken push-notification icon; a leftover from the App Icon V2 rename | Claude |
| **8** | **Verify Apple Sign-In on a real device** | Build is proven (§5 B1); the *runtime* flow is not. One TestFlight sign-in closes it and drops the plugin to tech debt | Owner |
| **9** | **Recapture store screenshots on Home V3** | Blocked on Codex; guideline 2.3.3 forbids login/splash shots | Claude + Owner |
| **10** | **Physical-device passes (iPhone + Android)** | Only place the icon appearances, mic-prompt question, Dynamic Type and themed icons can actually be settled | Owner |

---

## Explicitly NOT blockers — safe for v1.1

| Item | Why it can wait |
|---|---|
| **Public repository + proprietary LICENSE** | Not a blocker at all — a **product decision**. The repo is public (`visibility: public`) and the LICENSE added 2026-08-15 is all-rights-reserved. Those are compatible, but the combination should be chosen, not inherited: *do we intentionally want the source publicly visible while remaining proprietary?* No licence change without the owner saying so — in particular, never switch to MIT/Apache/GPL on anyone's initiative |
| **Apple Sign-In plugin has no Capacitor-8 major** | Capacitor's CLI patches the manifest on every sync and three TestFlight builds prove it archives (§5 B1). Genuine debt — revisit if upstream publishes 8.x or if the device test fails |
| Native Speaking support | Feature gap, not a compliance issue; the drill is correctly hidden on iOS and no mic permission is requested |
| Universal links / App Links | Custom scheme covers OAuth today; deep links are an enhancement, and this is documented as a deliberate later step |
| Practice refinements driven by telemetry | Needs post-launch data by definition |
| `minifyEnabled false` on Android | No obfuscation requirement for store acceptance |
| `UIRequiredDeviceCapabilities = armv7` | Capacitor boilerplate; no evidence it blocks review |
| Node version drift (20 vs 22) in CI | Cosmetic; both work |
| Playwright mobile/WebKit project | Would raise confidence, but physical-device passes cover the release risk |
| Supabase hygiene: drop `_reading_backup_20260725`, move `pg_net`/`pg_trgm` out of `public`, revoke `anon` EXECUTE on `admin_*` | Advisor WARNs; the admin RPCs are already guarded by `assert_admin()`, verified live |
| Self-hosting Google Fonts | Disclosed today; a privacy improvement, not a requirement |
| Orientation disagreement (iOS landscape vs Android portrait) | Cosmetic inconsistency; neither store requires a lock |

---

## Appendix — what this audit could not determine

Honest limits, so nothing here reads as more settled than it is:

- **Anything requiring macOS/Xcode.** This sandbox is Linux, so `cap sync ios` has never run here and `node_modules` holds pristine, unpatched plugin manifests. Reading them directly is *not* the build path — that mistake produced the retracted B1 blocker. Any future iOS claim must be traced through `cap sync` output or CI logs, never through `node_modules` alone.
- **Whether WKWebView actually prompts for the microphone.** `speechSupport.js:24` gates on native, but `Info.plist` has no usage string. Device test only.
- **Console state.** Whether App Store Connect / Play Console accounts exist, and what is already entered in them, is not knowable from the repo.
- **Live database contents.** Only schema/advisors were queried read-only; no user data was read.
- **Commercial-use terms** for Higgsfield, `nano_banana_pro`, Azure Neural TTS voices, Gemini/Groq/Anthropic output — none are recorded in the repo.
- **Whether `unlocked_stories` / `bodyos_app_state` exist in production** (the delete RPC guards for them; no migration creates them).
