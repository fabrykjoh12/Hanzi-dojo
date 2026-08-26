# 🔍 FAB-19 — App Store privacy, data-use and privacy-manifest audit

**Audit only — no product code was changed.** Branch
`claude/app-store-privacy-audit-np6khk`, cut from `main` @ `184fd69`
(2026-08-25). Every claim below carries `file:line` evidence from that tree, or
a read-only query against the live Supabase project `bvqvturqupbggxaeihvi`.

Read §3 first if you only want the fix plan.

---

## 1 · Inventory — what is actually true

### 1.1 Data types collected and stored

34 public tables live (`list_tables`, 2026-08-25). RLS is enabled on all 34.

| Table | Learner data it holds | Linked to identity |
|---|---|---|
| `auth.users` | email, hashed password, OAuth identities, sessions | Yes |
| `profiles` | `display_name` (**never populated** — 0 of 37 rows), prefs (`daily_new_cards`, `recall_mode`, `audio_autoplay`, `furigana_default`, `audio_speed`, `target_retention`), `timezone`, `reminder_enabled`, `reminder_hour_utc`, `is_admin` | Yes |
| `cards` | FSRS state per word, **`source_sentence`**, `source_story_id/title/translation`, prior-knowledge columns | Yes |
| `review_logs` | every grading event | Yes |
| `daily_activity`, `writing_stats`, `level_unlocks`, `language_tracks` | progress | Yes |
| `test_attempts` / `test_answers` | `user_answer` — a *chosen option* or `'Skipped'`, not free text (`Test.jsx:291,308`) | Yes |
| `story_reads`, `story_unlocks`, `story_reward_claims`, `unlocked_stories` | reading progress | Yes |
| `grammar_reviews` | grammar SRS state | Yes |
| `feedback` | **`email`, free-text `message`, `page`, `language`, `context` jsonb** | Yes |
| `push_subscriptions` | Web Push `endpoint`, `p256dh`, `auth` — **0 rows live** | Yes |
| `analytics_events` | `name`, `session_id`, `user_id`, `language`, `level`, `app_version`, `props` | Partly — 2,905 of 5,334 rows have `user_id IS NULL` |
| `bodyos_app_state` | `data` jsonb — **referenced nowhere in this repo**; 0 rows | Yes |

`analytics_events` has exactly one policy: INSERT, role `{public}`, check
`((user_id IS NULL) OR (auth.uid() = user_id))`. There is no client SELECT path;
the dashboard reads through admin RPCs that exclude `is_admin` accounts
(`supabase/migrations/20260801090000_honest_admin_metrics.sql:41-59`).

### 1.2 Client-side collection

`src/analytics.js` — every event row is 8 fixed columns (`buildEvent`,
`:132-143`). `sanitizeProps` (`:117-129`) keeps finite numbers, booleans, and
strings of 1–40 characters; everything else is dropped. 34 event names, all
counts and enums. `session_id` is a module-level in-memory value regenerated per
app load (`:80-93`) and **never written to device storage**.

`src/errorMonitor.js` — `client_error` events carry `source`, `error_name`,
`message` truncated to 40 chars, and `route`. No stack traces, no typed text,
capped at 5 per app load (`:14,:33`).

Analytics is **unconditional and pre-authentication**: `LANDING_VIEWED`,
`PUBLIC_STORY_VIEWED` and `ASSESSMENT_*` fire before an account exists. There is
no consent gate and no opt-out. Because analytics writes nothing to the device,
ePrivacy "cookie" consent is not engaged; the basis is legitimate interest.

### 1.3 Authentication providers

- **Email + password** — `signUp`, `signInWithPassword`, `resetPasswordForEmail`.
- **Google OAuth** — `signInWithProvider` (`nativeAuth.js:81-103`). Web
  redirects; native opens the system browser with `skipBrowserRedirect` and
  returns through `com.hanzidojo.app://auth-callback`.
- **Sign in with Apple** — native only (`nativeAuth.js:239-271`), scopes
  `'email name'`, identity token exchanged via `signInWithIdToken`. Gated on
  `FLAGS.APPLE_SIGN_IN` and `isNativeApp()`.
- **Session storage** — `window.localStorage`; PKCE on native, implicit on web
  (`supabase.js:57-67`).

Apple returns `givenName`/`familyName`; nothing persists them —
`profiles.display_name` is null for all 37 live profiles.

### 1.4 Runtime network destinations (the store build)

| Host | Purpose | When |
|---|---|---|
| `bvqvturqupbggxaeihvi.supabase.co` | auth, Postgres, public `audio` bucket | continuously |
| `fonts.googleapis.com` + `fonts.gstatic.com` | Noto Sans SC, Inter, Poppins | **every cold launch, native included** (`index.html:22-28`) |
| `cdn.jsdelivr.net` | `hanzi-writer-data@2.0.1` stroke JSON | any stroke-order view (`strokeData.js:19`) |
| `img.youtube.com` | video thumbnails on Practice → Videos | whenever that screen opens (`YouTube.jsx:29`) |
| `www.youtube-nocookie.com` | embedded player | on play (`YouTube.jsx:135`) |
| `discord.com/api/webhooks/…` | server-side relay on feedback insert — **currently inert**, see F3 | never today |
| Apple / Google OAuth endpoints | sign-in | on tap |

The internal DojoHQ Cloudflare worker (`worker/index.js`) is **excluded from the
store build**: `vite.config.js:44,59` folds `__DOJO_INTERNAL_BUILD__` to false so
Rollup drops the chunk, and `tools/verify-public-bundle.mjs` asserts it against
the built artifact in CI. The service worker is off in native
(`main.jsx:91`). Azure Speech, Google TTS and Gemini are build-time only —
non-`VITE_` vars, never bundled (`.env.example`).

### 1.5 Device identifiers

**None.** No IDFA/IDFV, no GAID, no `ATTrackingManager`, no
`NSUserTrackingUsageDescription`, no install id, no fingerprinting anywhere in
the repo or the shipped dependency set.

Device storage is six localStorage keys — `hanzi-dojo-hq-local-v1`,
`hanzi-dojo-hq-device-v1`, `hanzi-dojo-hq-online-v1` (all DojoHQ, stripped from
the store build), `prelogin:prefs`, `srs:target-retention`, and
**`dict:recent:<language>`** — the last 8 dictionary words the learner opened,
with reading and meaning (`recentLookups.js:8-45`). Plus Supabase's own auth
token, plus IndexedDB `hanzi-offline` with stores `cache`, `outbox`, `audio`,
`prefs` (`offline.js:20-42`).

`dict:recent:*` is a **search history**, but it never leaves the device, so it is
not "collected" under Apple's definition. It still belongs in the policy's
on-device paragraph, which currently describes only content caches and the review
queue.

Android declares `INTERNET` only. iOS declares no usage-description strings, and
needs none: speech recognition is disabled in the native shell
(`speechSupport.js:22-27`), so no microphone permission is ever requested.

### 1.6 Retention, deletion, export

`delete_my_account()` (`supabase/migrations/20260807130000_delete_my_account.sql`)
deletes `unlocked_stories`, `analytics_events` and `bodyos_app_state` explicitly,
then `profiles`, then `auth.users`. A live FK check confirms **complete
coverage** — every learner table cascades from `profiles` or is deleted
explicitly, including `story_reward_claims` and `story_unlocks`, which were added
*after* the RPC was written. `auth.users` cascades identities, sessions and
refresh tokens.

Deliberately retained: `dojo_*` (internal board) and `tts_audio.approved_by`
become `SET NULL` — admin-authored content, de-identified.

**There is no retention policy.** No TTL, no cron, no purge on any table. The
oldest `analytics_events` row is 2026-07-15 and nothing removes it.

**There is no data export feature** anywhere in `src/`.

---

## 2 · Findings

Severity: **blocker** = cannot ship · **high** = ship risk or a false published
claim · **medium** = should fix before submission · **low** = tidy-up.

### 2.1 Privacy Policy vs reality

#### F1 · FIXED in Stage 2 · high — "Analyze text" pasted text *is* stored on the server
**Layer: policy text (or code)**

Policy (`src/TrustPages.jsx:103-108`):
> "Analysis happens on your device. The pasted text is never stored on our
> servers or sent anywhere; the only thing recorded is an aggregate event (how
> many words were recognized), with none of the text."

Reality: `src/Analyzer.jsx:273` captures `sentence: pl.line` — a line of the
learner's pasted text — `:297` passes it to `addOne`, and `:114` writes
`source_sentence: sentence || null` into `cards`. 55 live rows have a non-null
`source_sentence`.

The absolute claim is false whenever a learner taps a word in their pasted text
and adds it to their deck.

**Fix:** reword the paragraph to describe mining accurately — "we don't keep the
text you paste; if you add a word from it to your deck, we save that one sentence
with the card so reviews can show the context." The feature is worth keeping;
the sentence in the policy is what needs to change. Removing `source_sentence`
from the Analyzer path is the alternative, but it costs a genuinely good feature.

#### F2 · FIXED in Stage 2 · medium — the push section described an unbuilt feature
**Layer: policy text (code later, when §0b lands)**

Policy (`TrustPages.jsx:119-129`) says that in the iPhone and Android apps a push
token issued by APNs or FCM is stored.

Reality: push is **Web Push only** (`src/push.js:8-13,28-59` — `PushManager`,
VAPID, service worker). `@capacitor/push-notifications` is not a dependency;
`android/app/build.gradle` logs *"google-services.json not found … Push
Notifications won't work"*; `docs/PRE-RELEASE-CHECKLIST.md:127-131` still lists
native push as an open 🔴 blocker; `push_subscriptions` has **0 live rows**.
Neither WKWebView nor Android WebView exposes `PushManager`, so reminders are
unavailable in the apps today.

Over-declaring is not a leak, but it would drive a wrong "Device ID" answer in
both stores and describes a feature reviewers cannot find.

**Fix:** scope the paragraph to the web until native push ships.

#### F3 · **CLOSED IN PRODUCTION 2026-08-26** · medium — Discord as an undisclosed recipient of feedback content
**Layer: code/SQL to remove the relay — or policy text**

> **Corrected 2026-08-25 after a live check.** The trigger is installed and
> enabled (`tgenabled = 'O'`), but `vault.secrets` is **empty** — the
> `discord_feedback_webhook` secret has never been created in production, so the
> function returns on its first branch and **no feedback has ever left
> Supabase**. This is a loaded gun, not a live leak: the moment anyone runs the
> `vault.create_secret` line from the migration's own setup comment, every
> feedback message starts flowing to Discord with no other change and no notice.

`supabase/migrations/20260715230000_feedback_discord_webhook.sql:61-64` installs
an `AFTER INSERT` trigger on `public.feedback` that `net.http_post`s the
feedback `message` (up to 3,900 chars), `page`, `language` and `user_id` to a
Discord webhook. `20260715234500_feedback_discord_hide_email.sql:36` replaced the
submitter's email with the user id in that payload — so the leak was noticed
once, and half-fixed.

The policy says only *"Feedback you send: the text of in-app feedback, so we can
act on it."* Its Infrastructure list (`TrustPages.jsx:131-140`) names Supabase,
Vercel, Cloudflare, Brevo, Google Fonts, APNs and FCM — **not Discord**.

**Fix (recommended):** drop the trigger and the function. It has never fired,
there are 2 feedback rows in total, and removing it deletes this finding, F13 and
F26 outright — while keeping the existing "no third-party sharing" answer true.
Otherwise: name Discord in the policy *and* declare the sharing in Play Data
Safety **before** the secret is ever set.

#### F4 · FIXED in Stage 3 · medium — Google Fonts is scoped "on the web" but loaded natively too
**Layer: code (preferred) or policy text**

The policy lists *"Google Fonts (font delivery on the web)"*. But
`index.html:22-28` is the same document the Capacitor build ships
(`capacitor.config.json` webDir `dist/client`), and nothing strips it for native.
Every cold launch of the iOS and Android app requests `fonts.googleapis.com` and
`fonts.gstatic.com`, disclosing the device IP and user-agent to Google.

**Fix:** self-host the three families for the native build. That is the better
fix on its own merits — an offline-first app should not need a CDN round-trip to
render its first paint. Minimum viable fix: delete "on the web" from the policy.

#### F5 · FIXED in Stage 2 · medium — jsDelivr was an undisclosed runtime third party
**Layer: policy text or code**

`src/strokeData.js:19` — `STROKE_CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1'`,
used by `StrokeOrder.jsx:37` and `Writer.jsx:88`. Every stroke-order view
discloses the learner's IP *and which character they are studying* to jsDelivr.
The Infrastructure list does not name it.

**Fix:** name it in the policy, or bundle/proxy the stroke data (which also
removes a runtime network dependency from an offline-first app).

#### F6 · FIXED in Stage 2 · medium — error/crash reporting was not described in the policy
**Layer: policy text**

`errorMonitor.js` sends `client_error` events. The policy's "Product analytics"
paragraph covers *usage* events and never mentions error or crash reporting —
while the Play Data Safety draft already declares "Crash / diagnostic"
(`docs/STORE-LISTING.md:179`). Apple treats Crash Data and Other Diagnostic Data
as distinct declarable types; the policy has to match what you declare.

**Fix:** one sentence in the analytics section.

#### F7 · FIXED in Stage 2 (wording) · low — "ask for a copy of your data" with no export path
**Layer: process/verification (code optional)**

Policy `:150-151`. There is no export feature anywhere in `src/`; fulfilment is
manual over email. The promise as written ("ask us") is satisfiable, but it is
unstaffed, untested, and GDPR gives you one month to answer.

**Fix:** decide and document the manual procedure now; a `Profile → Download my
data` button is roughly a day's work and closes it properly.

#### F8 · FIXED in Stage 2 · low–medium — no retention statement, and anonymous events are immortal
**Layer: policy text (+ optional SQL)**

Policy `:152-153` says data is kept "as long as you have an account" — true for
learner rows. But 2,905 of 5,334 `analytics_events` rows have `user_id IS NULL`;
they belong to no account, and nothing ever deletes them.

**Fix:** state a retention window for anonymous usage events, and optionally add
a purge.

#### F9 · FIXED in Stage 2 · medium — no children's-data section
**Layer: policy text (+ store metadata alignment)**

The 13+ age requirement lives only in the Terms (`TrustPages.jsx:187`). The
Privacy Policy says nothing about age or children. Both stores' age
questionnaires and Play's Families policy look for this.

#### F10 · FIXED in Stage 2 · low — "Last updated 1 August 2026" was stale
`TrustPages.jsx:358`. It predates the account-deletion RPC (2026-08-07) and
everything since. Bump it in the same commit as the fixes.

#### F11 · **RESOLVED 2026-08-26** · low — `bodyos_app_state`
A user-keyed table with a `data` jsonb, RLS and four owner policies, sharing this
project's `auth.users` tenant, and referenced **nowhere in this repo** except the
deletion RPC. 0 rows today.

**Owner question:** is this Supabase project shared with another product? If it
ever fills, the Infrastructure paragraph and the store answers both need to
account for a shared identity tenant.

### 2.2 App Store Connect App Privacy / Play Data Safety

#### F12 · MISSING · blocker — there are no ASC App Privacy answers at all
**Layer: App Store Connect metadata + docs**

`docs/STORE-LISTING.md:171-184` drafts only Play Data Safety.
`docs/PRE-RELEASE-CHECKLIST.md:133-137` still has "App Store privacy nutrition
labels" as an open box. You cannot submit without them.

Recommended answer set, derived from the evidence above:

| Data type | Collected | Purposes | Linked to user | Used for tracking |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | App Functionality | Yes | No |
| Identifiers → User ID | Yes | App Functionality, Analytics | Yes | No |
| User Content → Customer Support | Yes (`feedback.message`) | App Functionality | Yes | No |
| User Content → Other User Content | Yes (`cards.source_sentence`) | App Functionality | Yes | No |
| Usage Data → Product Interaction | Yes | Analytics, App Functionality | Yes | No |
| Diagnostics → Crash Data | Yes (`client_error`) | Analytics, App Functionality | Yes | No |
| Diagnostics → Other Diagnostic Data | Yes (`app_version`, session duration) | Analytics | Yes | No |

Everything else is **Not Collected** — Precise and Coarse Location, Contacts,
Health & Fitness, Financial Info, Purchases, Browsing History, Search History,
Audio Data, Photos or Videos, Sensitive Info, and **Device ID**.

Note on "Linked": Apple asks per data type, not per row. Signed-in events carry
`user_id`, so Usage Data and Diagnostics must be declared Linked even though the
pre-auth events are anonymous.

#### F13 · **CLOSED IN PRODUCTION 2026-08-26** · high — "Data shared with third parties: No"
**Layer: Play Console metadata — or code/SQL (see F3)**

`docs/STORE-LISTING.md:184`. The answer is **true today**, because the Discord
relay is inert (F3). It becomes false the instant the webhook secret is created:
feedback content plus the user id would then be transferred to a third party, and
Discord is a general communications platform, not a processor acting on your
instructions.

**Fix:** drop the trigger (F3) and this answer stays true permanently. If the
relay is ever wanted, this answer and the policy must change in the same commit.

#### F14 · MISMATCH · medium — Play draft omits User IDs and user content
`Name / phone / address | Not collected` is defensible (`display_name` is null
for all 37 profiles), but the table never declares **Personal info → User IDs**
(collected) or the user-generated content in `feedback.message` and
`cards.source_sentence`.

#### F15 · PASS — Play's data-deletion requirement is met
In-app `Profile → Delete account` (`Profile.jsx:260,826-842`), plus the web URL
`https://hanzi-dojo.com/profile`, plus reviewer steps already written into the
App Review notes (`docs/STORE-LISTING.md:147-151`).

#### F16 · PASS — App Tracking Transparency is **not** required
Apple defines tracking as linking your app's user or device data with data
collected by *other companies* for targeted advertising or ad measurement, or
sharing with a data broker. There is no advertising SDK, no attribution SDK, no
cross-app or cross-site linkage, and no data broker anywhere in the shipped
dependency set (`react`, `react-dom`, `react-router-dom`, `@supabase/supabase-js`,
`ts-fsrs`, `wanakana`, `hanzi-writer`, `lucide-react`, five Capacitor packages).
All "Used for Tracking" answers are No, and `NSUserTrackingUsageDescription` must
stay absent.

Two packaging notes, not privacy issues: `web-push` and `drizzle-orm` sit in
`dependencies` but are imported by no file under `src/` — they belong in
`devDependencies`.

### 2.3 Privacy manifest (`PrivacyInfo.xcprivacy`)

#### F17 · FIXED in Stage 1 (archive verification pending) · blocker — the app had no privacy manifest
**Layer: native project config**

`find ios -name '*.xcprivacy'` returns nothing, and
`ios/App/App.xcodeproj/project.pbxproj` contains no `PrivacyInfo` reference — so
there is nothing in the App target's Resources build phase either. Apple has
required this since May 2024; uploads without it draw ITMS-91053.

#### F18 · NEEDS ARCHIVE VERIFICATION — see §2.6 · blocker — `@capacitor-community/apple-sign-in` calls `UserDefaults` and ships no manifest
**Layer: native project config**

`node_modules/@capacitor-community/apple-sign-in/ios/Sources/SignInWithApple/Plugin.swift:20,55,77`
— `let defaults = UserDefaults()`, storing and reading `callbackId`. The package
contains **no** `.xcprivacy`, and it is linked as a local SPM package from
`ios/App/CapApp-SPM/Package.swift:16`.

Because the dependency carries no manifest of its own, the **app target** must
declare `NSPrivacyAccessedAPICategoryUserDefaults` with reason **`CA92.1`**
("access info from the app itself") — that is exactly what this usage is.
This is the specific thing that trips ITMS-91053 on upload.

#### F19 · PASS — no other required-reason API usage found
The app's own Swift (`ios/App/App/AppDelegate.swift`,
`ios/App/App/SceneDelegate.swift`,
`ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift`) uses none. Nor do
`@capacitor/app`, `@capacitor/browser`, `@capacitor/keyboard` or
`@capacitor/status-bar` — grepped for `UserDefaults`, `systemUptime`,
`mach_absolute_time`, `statfs`, `creationDate`, `modificationDate`,
`activeInputModes`, `availableCapacity`; zero hits.

#### F20 · NEEDS DEVICE/ARCHIVE VERIFICATION · high — the shipping Capacitor runtime is not the one in `node_modules`
`ios/App/CapApp-SPM/Package.swift:15` pins
`https://github.com/ionic-team/capacitor-swift-pm.git` exact `8.5.0`. The two
`PrivacyInfo.xcprivacy` files under `node_modules/@capacitor/ios` — both
declaring an **empty** `NSPrivacyAccessedAPITypes` — are not necessarily the ones
linked into the binary.

On a Mac: resolve the package, `grep -rn "UserDefaults\|systemUptime\|statfs"`
the checkout, inspect its resolved manifest, then archive and run
**Xcode → Organizer → Generate Privacy Report**. That PDF is the ground truth for
what the binary actually declares.

#### F21 · MISSING · medium — privacy manifests are absent from the checklist
**Layer: process/verification**

`docs/PRE-RELEASE-CHECKLIST.md` §0b has a "Privacy declarations" box but never
mentions `PrivacyInfo.xcprivacy` or required-reason APIs.

### 2.4 In-app access

#### F22 · FIXED in Stage 1 · high — a signed-in user could not reach the Privacy Policy inside the app
**Layer: code**

The only links are `src/Auth.jsx:350` (sign-up screen) and `src/Landing.jsx:780`
(public landing footer). `src/Settings.jsx` links Discord only (`:299`);
`src/Profile.jsx` has no legal links at all. The `/privacy` route renders fine
for a signed-in user (`App.jsx:382-390`) — nothing navigates to it.

App Store guideline 5.1.1(i) requires the policy link in App Store Connect
metadata **and** in an easily accessible place inside the app. This is a cheap
and common rejection.

#### F23 · PASS — the sign-up link behaves correctly in the native shell
`legalLinkProps` (`externalLink.js:54-65`) opens the hosted copy in the system
browser rather than navigating the webview away from a half-filled form.

#### F24 · PASS — deletion is two taps from the tab bar, no support contact needed

### 2.4b Additional findings from the cross-check pass

These came out of an independent 14-agent sweep run after the first pass, and
were each re-verified by hand before being written down.

#### F25 · FIXED in Stage 2 · medium — YouTube was an undisclosed runtime third party
**Layer: policy text**

Practice → Videos loads a thumbnail per card from `https://img.youtube.com/vi/…`
(`src/YouTube.jsx:29`) and, on play, embeds
`https://www.youtube-nocookie.com/embed/…` (`:135`). Three Chinese
recommendations are live, so the screen is real, not dormant.

The player deliberately uses the privacy-enhanced `nocookie` host — good — but
**the thumbnails do not**: `img.youtube.com` is an ordinary Google host, and it
is hit for every card as soon as the screen opens, before any deliberate act by
the learner. Neither host appears in the policy's Infrastructure list.

**Fix:** name YouTube in Infrastructure. Optionally route the thumbnails through
`i.ytimg.com`/nocookie or cache them, so opening the screen isn't itself a
disclosure.

#### F26 · MISMATCH · medium — "we don't keep your data beyond that" has two exceptions
**Layer: policy text**

Policy (`TrustPages.jsx:146-149`) promises deletion removes everything "and we
don't keep your data beyond that". Two things survive:

- `dojo_*` rows and `tts_audio.approved_by` go `SET NULL` rather than being
  deleted — admin-authored content, de-identified. Correct behaviour, but the
  absolute wording doesn't cover it.
- Any feedback already relayed to Discord would be outside Supabase and outside
  the RPC's reach entirely. Inert today (F3); permanent if the relay is enabled.

**Fix:** soften the absolute claim, or — better — drop the relay (F3) so only the
de-identified admin rows need mentioning.

#### F27 · FIXED in Stage 2 · medium — the device timezone is captured silently
**Layer: policy text**

`src/App.jsx:103-112` writes `Intl.DateTimeFormat().resolvedOptions().timeZone`
to `profiles.timezone` on load whenever it differs from what is stored. The
learner never types or confirms it. The policy lists timezone among
*"your preferences … timezone for reminders"* — framing an automatic capture as
something the learner chose.

**Fix:** say it is read from the device automatically.

#### F28 · FIXED in Stage 2 · medium — a feedback row holds more than "the text"
**Layer: policy text**

The policy says *"Feedback you send: the text of in-app feedback"*. The row also
carries `email`, `page`, `language`, and a `context` jsonb with the open story's
id and truncated title plus the build sha (`src/Feedback.jsx:73`,
`src/feedbackContext.js`, `20260801120000_add_feedback_context.sql`).

#### F29 · FIXED in Stage 2 · low — on-device dictionary history was not described
**Layer: policy text**

`localStorage['dict:recent:<language>']` keeps the last 8 words the learner
looked up, with reading and meaning (`src/recentLookups.js:8-45`). It never
leaves the device — so it is not "collected" for store-declaration purposes —
but the policy's "On your device" paragraph lists only content caches and the
review queue.

#### F30 · FIXED in Stage 2 · low — the TTS vendor was unnamed while every other subprocessor was named
**Layer: policy text**

The policy names Supabase, Vercel, Cloudflare, Brevo, Google Fonts, APNs and FCM,
then says audio is *"generated in advance with text-to-speech services"* without
naming them. Azure Speech (and Google TTS) are build-time only and never see
learner data (`.env.example`, non-`VITE_` vars), so this is a consistency
point rather than a risk — but the asymmetry is conspicuous.

#### F31 · MISMATCH · low — the microphone section describes a flow the apps don't have
**Layer: policy text**

The policy (`:94-101`) explains what happens if you deny the microphone
permission. In the store apps the Speaking drill is disabled outright
(`speechSupport.js:22-27`) and no permission is ever requested — as the App
Review notes already state (`docs/STORE-LISTING.md:156-158`). The policy covers
"all three" surfaces, so it should say the drill is web-only.

#### F32 · FIXED in Stage 2 (disclosure only) · medium — analytics run before any account exists, with no gate
**Layer: policy text**

`LANDING_VIEWED`, `PUBLIC_STORY_VIEWED` and `ASSESSMENT_*` fire pre-auth; 2,905
of 5,334 live rows have `user_id IS NULL`. The policy frames all collection
around the account ("we store your account and your learning progress"), and
never mentions collection from visitors who never sign up, nor offers an opt-out.

Because nothing is written to the device for analytics, this is not an ePrivacy
consent problem — but it is an accuracy and transparency gap.

#### F33 · FIXED in Stage 1 · blocker — the Play data-deletion URL sat behind the sign-in gate
**Layer: Play Console metadata (+ policy text)**

`docs/STORE-LISTING.md:183` answers the deletion URL as
`https://hanzi-dojo.com/profile`. `/profile` is not a trust page
(`src/routes.js:117` covers only `/privacy` `/terms` `/support` `/methodology`),
so `App.jsx:392` renders the sign-in screen to any signed-out visitor. Google
Play requires the deletion URL to be reachable and to explain the process
*without* first signing in.

**Fix:** answer `https://hanzi-dojo.com/support`, which already explains deletion
publicly (`TrustPages.jsx:262-271`) — a metadata change, no code needed.

#### F34 · MISMATCH · medium — plugin SPM targets declare no `resources:` block
**Layer: native project config**

Even if a `PrivacyInfo.xcprivacy` were added to
`@capacitor-community/apple-sign-in`, its `Package.swift` target declares no
`resources:`, so SPM would not copy it into the bundle. This is why the
declaration has to live in the **app** target (F18) rather than being fixed
upstream in place.

#### F35 · **RESOLVED 2026-08-26** · medium — Supabase platform logging
**Layer: process/verification, policy text**

Supabase's API gateway records request IP addresses and user agents as platform
logs. The policy never mentions IP addresses at all. Confirm the retention window
on your plan, then either disclose it or establish that it is out of scope.

#### F36 · correction to a code comment · low — `profiles` *does* have an FK to `auth.users`
**Layer: code (comment only)**

`20260807130000_delete_my_account.sql:8-9` states *"public.profiles has NO
foreign key to auth.users, so deleting the auth user would orphan the profile"*.
A live constraint query shows `profiles.id → auth.users ON DELETE CASCADE`
exists. The RPC deletes the profile explicitly anyway, so behaviour is correct
and belt-and-braces — but the comment is wrong and would mislead the next person
reasoning about deletion completeness.

### 2.6 F18 packaging determination (Stage 1)

The audit's Stage 1 instruction was not to treat F18 as closed by adding
`CA92.1` to the app manifest. That was right: **two different Apple obligations
were being conflated.** Here is what the packaging actually is, and which
obligation each fact settles. Apple's current documentation is the authority
throughout — quotes below are verbatim from
`developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk`,
`.../describing-use-of-required-reason-api`, and
`developer.apple.com/support/third-party-SDK-requirements/`.

**How the package is linked.** Source-only Swift package, statically linked,
no bundle of its own:

- `ios/App/CapApp-SPM/Package.swift:16` pulls it in by local path:
  `.package(name: "CapacitorCommunityAppleSignIn", path: "../../../node_modules/@capacitor-community/apple-sign-in")`.
- Its own manifest declares
  `.library(name: "CapacitorCommunityAppleSignIn", targets: ["SignInWithApple"])`
  — **no `type:`**, so linkage is SPM's "automatic", which Xcode resolves to
  **static** for an app target.
- The `SignInWithApple` target sets `path: "ios/Sources/SignInWithApple"` and
  declares **no `resources:`** — so it produces no resource bundle at all.
- There is **no `Podfile` and no `Pods/` directory**, so CocoaPods is not
  involved and the `CapacitorCommunityAppleSignIn.podspec` in the package is
  dead weight here.

Net: its `UserDefaults()` calls are compiled into `App.app/App`. It contributes
no framework, no dynamic library, and no bundle.

**Where Apple expects *its* manifest in this packaging form.** In the package,
not in our app. From "Add a privacy manifest to your Swift package":

> "Place your privacy manifest file in Sources/SomeLibrary if you don't specify
> an alternative location"

> "Xcode doesn't recognize privacy manifest files as resources by default. After
> adding the manifest file to your package, explicitly declare the file or the
> directory that includes it as a package resource."

So the upstream fix is `ios/Sources/SignInWithApple/PrivacyInfo.xcprivacy`
**plus** `resources: [.process("PrivacyInfo.xcprivacy")]` in its `Package.swift`.
Neither exists. This is F34, and it is the plugin's bug to fix — worth an
upstream issue or PR.

**What our app manifest does and does not settle.** Two obligations:

1. **Required-reason API declaration (ITMS-91053) — settled by our manifest.**
   Apple: *"For each executable or dynamic library in an app that uses a required
   reason API, the bundle that includes the executable or dynamic library needs
   to include a privacy manifest file that reports the API."* Statically linked
   package code is neither an executable nor a dynamic library of its own — it is
   part of `App.app/App`, whose bundle is the app bundle. The app's
   `PrivacyInfo.xcprivacy` is therefore the correct *and only possible* place for
   this declaration, and the `NSPrivacyAccessedAPICategoryUserDefaults` / `CA92.1`
   entry added in Stage 1 covers it.

2. **Third-party SDK manifest + signature (ITMS-91061) — not settled, and not
   ours to settle.** This applies only to SDKs on Apple's published list.
   `@capacitor-community/apple-sign-in` is **not** on that list. But **`Capacitor`
   and `Cordova` are**, and this app links both (via `capacitor-swift-pm` 8.5.0).
   Apple: *"You must include the privacy manifest for any SDK listed below when
   you submit new apps in App Store Connect that include those SDKs… Any version
   of a listed SDK, as well as any SDKs that repackage those on the list, are
   included in the requirement."* Nothing in our app manifest discharges that;
   Capacitor must ship its own.

Apple's other sentence — *"Your third-party SDK can't rely on the privacy
manifest files for apps that link the third-party SDK… to report your third-party
SDK's use of required reasons API"* — is addressed to **SDK vendors**. It obliges
the plugin to ship its own manifest so that app developers get an accurate
Privacy Report. It does not relieve this app of the per-executable duty in (1),
and it does not make our declaration wrong. Both things are true at once: our
declaration is required, *and* the plugin should still be fixed upstream.

**What must stay NEEDS ARCHIVE VERIFICATION.** None of this can be finished
without a Mac:

- **That the library really links statically.** The absence of `type: .dynamic`
  is the determinative source-level fact, but only a real build proves it —
  check `otool -L App.app/App` and confirm there is no
  `App.app/Frameworks/CapacitorCommunityAppleSignIn.framework`. If it ever links
  dynamically, the declaration must move into *that* framework's bundle and our
  app-level entry stops covering it.
- **Whether `capacitor-swift-pm` 8.5.0 ships valid `Capacitor` and `Cordova`
  manifests.** Both are on Apple's required list. The copies under
  `node_modules/@capacitor/ios` are not necessarily the ones linked, and both
  declare an **empty** `NSPrivacyAccessedAPITypes`.
- **Xcode → Organizer → Generate Privacy Report** on a real archive, compared
  against the manifest committed in Stage 1.
- **The verbatim wording of reason `CA92.1`.** Apple's public documentation JSON
  API does not expose the reason-code tables — they render client-side — so it
  could not be quoted here. The code is the standard one for "access info from
  the app itself", which is exactly what the plugin does (it stores and reads its
  own `callbackId`). Xcode's manifest editor and App Store Connect's validation
  are the check: an invalid reason string is rejected at upload, not silently
  accepted.

**F18 stays NEEDS ARCHIVE VERIFICATION** until the archive check confirms static
linkage and the Capacitor/Cordova manifests. What Stage 1 closed is the app's own
obligation — not F18, and not the App Store privacy work as a whole.

### 2.7 What Stage 3 closed (2026-08-25)

Stage 3 was the "reduce what has to be declared" stage: remove capabilities so
there is less to disclose, rather than write disclosures. Three items.

#### 3.1 · The Discord feedback relay is removed — **migration written, NOT applied**

`supabase/migrations/20260825120000_drop_feedback_discord_relay.sql` drops the
`on_feedback_notify_discord` trigger and the `notify_discord_feedback()`
function. It touches no feedback rows, no RLS policy, no FK, and no Vault
secret. `pg_net` is deliberately left installed — after this migration
`notify_discord_feedback` is the only thing in `public` that ever called
`net.http` (verified live), so removing the caller is the fix; removing a
platform-managed extension is a wider blast radius than this change is entitled
to.

Verified on a throwaway PostgreSQL 16.13 cluster that reproduces the production
shape (profiles, feedback with its FK cascade and both RLS policies,
`delete_my_account`, a stubbed `net.http_post`, `vault.secrets`), with the two
historical Discord migrations applied verbatim first:

| | before the migration | after |
|---|---|---|
| relay trigger gone | FAIL (1) | **PASS** (0) |
| relay function gone | FAIL (1) | **PASS** (0) |
| no trigger on feedback calls `net.http` | FAIL (1) | **PASS** (0) |
| nothing in `public` calls `net.http` | FAIL (1) | **PASS** (0) |
| feedback still inserts | PASS | **PASS** |
| inserted row reads back unchanged | PASS | **PASS** |
| exactly one row added, none altered | PASS | **PASS** |
| RLS still enabled + both policies intact | PASS | **PASS** |
| `feedback.user_id` still CASCADEs from `profiles` | PASS | **PASS** |
| `delete_my_account` still exists | PASS | **PASS** |
| no `discord_feedback_webhook` secret | PASS | **PASS** |

The before/after split matters: the four checks that fail beforehand are what
prove the test discriminates rather than passing vacuously.

Also proven locally: the migration is idempotent (a second apply emits two
NOTICEs and no error); the two pre-existing feedback rows are untouched; and
**the relay cannot be re-armed by accident** — after the migration, creating the
`discord_feedback_webhook` secret exactly as the old migration's setup comment
instructs leaves 0 triggers on `feedback`, 0 functions reading that secret, and
0 functions calling `net.http`, while feedback inserts keep working.

Production was checked read-only and matches the local "before" baseline
exactly. **The migration has not been applied** — the apply step is in §4.

#### 3.2 · The native build no longer contacts Google Fonts

The apps bundle Noto Sans SC, Inter and Poppins locally; the web keeps the CDN.
The split is build-time (`DOJO_NATIVE_BUILD=1`, set only by `cap:sync` via the
new `build:native` script), because there is nothing to branch on at runtime —
the tags are either in the shipped HTML or they are not. `nativeFonts.mjs` holds
the rule as a pure, tested function; `grep -rn __DOJO_NATIVE_BUILD__` is the
complete audit of the flag.

Three things had to change, not one:

1. `index.html`'s stylesheet link and both preconnect hints are stripped from
   the native HTML by a Vite plugin, which **throws** if it finds nothing to
   strip rather than silently becoming a no-op.
2. `src/fontLoader.js` — `fontHrefFor` now returns null inside the native shell.
   It fetches Noto Sans JP on demand for the paused Japanese track, so without
   this a grandfathered learner on that track would still have hit Google. The
   track keeps working; it just renders in the platform CJK face instead.
3. `sw.js` is no longer emitted for native. It is never registered inside the
   shell (`main.jsx:91`) and its font-caching rule names both hosts.

`npm run verify:native-fonts` proves it at two levels — static (no tag in the
HTML, no stylesheet references either host, every `@font-face src` is local, no
`sw.js`) and, more importantly, **runtime**: it serves the built bundle, loads it
in Chromium with all non-local requests aborted, and records every request made.
Zero go to either Google host. Run against the *web* build the same script fails
on three checks including the live request, which is what shows it discriminates.

One honest detail: `fontLoader.js`'s `GOOGLE_FONTS_BASE` constant still appears
as a dead string in the native JS chunk. It sits behind the native guard that
returns before reaching it. A dead string is not a request, and the runtime check
above is the evidence — contorting the source so a grep comes back clean would be
cosmetics, not a fix.

**Cost correction.** The first measurement of this said 17.22 MB for Noto Sans
SC. That was wrong: Google serves these as *variable* fonts, so one woff2 per
unicode-range covers all four weights, and the naive per-weight count counted the
same bytes four times. The real payload is **117 files, 4.66 MB** for all three
families.

Typography is unchanged: the generated `src/webfonts.css` mirrors Google's rules
including `unicode-range`, so a device still decodes only the ranges it paints.
The OFL's redistribution conditions now apply, so each family's licence ships
beside the binaries and `NOTICE.md` has been corrected — it previously said "no
font binary is redistributed by this project", which is no longer true.

#### 3.3 · `web-push` and `drizzle-orm` moved to devDependencies

Neither is imported anywhere under `src/`. `web-push` is used only by
`send-review-reminders.mjs` (a GitHub Action), `drizzle-orm` only by
`db/schema.ts`. Every workflow installs with a plain `npm ci`, so both remain
available where they are actually used.

Proving the bundle is unaffected needed care: `vite.config.js` stamps
`builtAt: new Date().toISOString()` into every build, so **two builds of
identical code produce 162 differing filenames**. Comparing raw hashes is
meaningless. After normalising the build stamp and the content-hash filenames,
the pre-move and post-move bundles are **identical** — and the same normaliser
reports two builds of unchanged code as identical, which is the control that
makes the result trustworthy.

#### What Stage 3 did NOT close

- **F18 remains NEEDS ARCHIVE VERIFICATION.** Nothing in Stage 3 touched it.
- The App Store Connect answers, the Play Data Safety corrections and every
  privacy-policy wording fix are Stage 2 and Stage 4, deliberately untouched.
- **The App Store privacy work as a whole is not complete.**

### 2.8 Production state and Stage 2 (2026-08-26)

**The Discord relay is gone from production.** PR #217 merged (`ed2dffe`) with CI
green — `check` and `playwright` both passed, confirming that the two visual
snapshot failures seen in the sandbox were environmental. Migration
`20260825120000_drop_feedback_discord_relay.sql` was then applied to
`bvqvturqupbggxaeihvi` as `20260826123336 drop_feedback_discord_relay`, and
nothing else was applied — Claude B's `20260822180000` is deliberately still
unapplied.

`supabase/tests/feedback_relay_removal_verification.sql` was run against
production in its rollback-safe mode: **13/13 PASS**. An independent read-only
sweep then confirmed twelve invariants, comparing against a snapshot taken
immediately before the apply:

| invariant | expected | got |
|---|---|---|
| `on_feedback_notify_discord` triggers | 0 | **0** |
| `notify_discord_feedback` functions (any schema) | 0 | **0** |
| public functions reading `discord_feedback_webhook` | 0 | **0** |
| feedback triggers calling `net.http` | 0 | **0** |
| public functions calling `net.http` | 0 | **0** |
| *any* trigger left on `public.feedback` | 0 | **0** |
| feedback row count | 2 | **2** |
| feedback id fingerprint | `d458a5d7…` | **`d458a5d7…`** |
| RLS enabled on feedback | 1 | **1** |
| feedback RLS policies | 2 | **2** |
| vault secrets total | 0 | **0** |
| `pg_net` still installed (deliberately) | 1 | **1** |

The row-id fingerprint is the part worth keeping: it is the same before and
after, so existing feedback was not merely counted but confirmed unaltered. A
feedback insert still succeeds under RLS (checked inside the rolled-back
transaction), and `delete_my_account` is untouched.

**F3 and F13 are closed in production**, not merely in the repo.

#### Stage 2 — the policy now describes what actually happens

`src/TrustPages.jsx` was rewritten to match the post-Stage-3 live product rather
than the architecture it had before. Every change is a disclosure change; no
behaviour moved.

- **"Analyze text"** no longer claims the pasted text is never stored. It says
  plainly that saving a word from the passage keeps that one sentence with the
  card, which is what the code does. *(F1)*
- **Reminders** are described as web-only, and the section states outright that
  the apps send no reminders and collect no push token — replacing an APNs/FCM
  paragraph describing a feature that was never built. *(F2)*
- **Discord is not mentioned as a feedback recipient**, because after Stage 3 it
  isn't one. Feedback "stays in our database; it is not forwarded anywhere" is
  now a true sentence. *(F3)*
- **Google Fonts** is scoped to the website, with the apps' bundled copies
  stated. *(F4)* **jsDelivr** and **YouTube** are named as services contacted
  directly by your device, with what each can see. *(F5, F25)*
- **Crash and error reports** get their own section: error name, 40-character
  message, screen, no stack traces, no typed text. *(F6)*
- **Retention** is stated honestly, including that anonymous usage events are
  currently kept indefinitely. *(F8)*
- **Age** gets its own section at 13+, pointing at the Terms. *(F9)*
- **Timezone** is described as read automatically from the device, not chosen.
  *(F27)*
- A **feedback row's real contents** are listed. *(F28)*
- **On-device dictionary history** is described, and that it never leaves the
  device. *(F29)*
- The **TTS vendors** are named, with the point that they never see learner
  data. *(F30)*
- The **microphone** section is scoped to the web, stating the drill is off in
  the apps and no permission is ever requested. *(F31)*
- **Pre-account analytics** are disclosed, including the absence of an opt-out.
  *(F32)*
- **Data export** is described as manual on request rather than implied to be
  self-service. *(F7)*
- The **absolute deletion claim** is softened to list what goes, without the
  unqualified "we don't keep your data beyond that". *(F26)*
- **Last updated** bumped to 26 August 2026. *(F10)*

#### Still open after Stage 2

- **F18 — NEEDS ARCHIVE VERIFICATION.** Untouched by Stages 2 and 3.
- **F11** — the `bodyos_app_state` owner question.
- **F35** — whether Supabase's platform layer retains IPs and user agents, and
  for how long. The policy now says which services can see your IP, but the
  retention window on the platform's own logs still needs an answer.
- **Stage 4** — the App Store Connect answers (F12) and the Play Data Safety
  corrections (F14) are not written.
- **The App Store privacy work is not complete.**

### 2.9 Pre-sign-off investigation (2026-08-26)

Four things were run down before owner sign-off. All read-only; nothing was
deleted or altered.

#### F35 — RESOLVED. What the platform actually logs, and for how long

The project is `Hanzi-Dojo` in org `Learning Org`, region **`eu-west-3`
(AWS Paris — inside the EEA)**, on the **Pro** plan. Supabase's documented Logs
Explorer retention for Pro is **7 days**.

What those logs contain, measured over a 24-hour window rather than assumed
(field *presence and population*, never values):

| source | rows | with IP | with user-agent | with account id | with sign-in identifier |
|---|---|---|---|---|---|
| `edge_logs` | 1,216 | **1,216** | **1,216** | **726** | 0 |
| `storage_logs` | 251 | **251** | **125** | 0 | 0 |
| `auth_logs` | 24 | **18** | 0 | **6** | 0 |
| `auth_audit_logs` | 9 | 0 | **9** | **9** | **9** |
| `pgbouncer` / `postgres` / `postgrest` / `realtime` | 539 | 0 | 0 | 0 | 0 |

A first pass reported zero for `storage_logs` and `auth_audit_logs`. That was
wrong — each service names its fields differently (`req.headers.*` and
`auth_audit_event.*` rather than `request.headers.*`), so the query missed them.
The table above uses the per-source names. Worth recording because the
under-count would have produced a policy that understated collection.

`edge_logs` carries more than IP and user-agent: `request.cf.city`,
`request.cf.region`, `request.cf.postalCode`, `request.cf.country` (coarse
location resolved from the IP), `request.cf.asOrganization` (network operator),
and `request.cf.botManagement.ja3Hash` / `ja4` (a TLS fingerprint) — on every
row. On 726 of 1,216 rows `request.sb.auth_user` carries the signed-in account
id **alongside** those, so for a signed-in learner the IP, device string, coarse
location and account are correlated in one line, for 7 days.

**A second, larger finding came out of this — and it is not a log.**

`auth.sessions` stores `ip inet` and `user_agent text` **in the database**, one
row per signed-in device: **54 rows, all 54 populated with both, across 36
distinct users, oldest 2026-06-30, and `not_after` is NULL on all of them** — so
they have no expiry, and 35 have been idle for over 30 days. This is Supabase
Auth's normal behaviour, not a defect, but it means IP addresses and device
strings tied to an account persist **indefinitely** in the database, not for
7 days. Nothing in the audit or the policy had mentioned it.

It is covered by account deletion — `auth.sessions.user_id → auth.users ON DELETE
CASCADE`, already verified in §1.6 — so deleting the account removes it.
`auth.audit_log_entries` is empty (0 rows), so there is no second persistent copy.

Both are now disclosed in the policy: a "Server logs" section for the 7-day
platform logs, and a sign-in-sessions entry under "What we store".

#### F11 — RESOLVED. The project is **not** shared with BodyOS

`list_projects` returns exactly **one** project for the organisation:
`Hanzi-Dojo`. There is no separate BodyOS project, so the question was never
"are two products sharing a tenant" but "what is this table doing here".

Evidence gathered read-only:

| | |
|---|---|
| owner | `postgres` (the default; no separate role) |
| columns | `user_id uuid, data jsonb, app_version integer, updated_at timestamptz` |
| rows | **0** |
| distinct users | **0** |
| oldest / newest `updated_at` | **none — the table has never held a row** |
| size on disk | 16 kB (an empty heap) |
| RLS | enabled, 4 owner-only policies |
| trigger | `bodyos_app_state_touch` → `public.bodyos_touch_updated_at()` |
| provenance | applied `20260716233821 bodyos_app_state` and `20260716234138 bodyos_touch_updated_at_search_path` |
| in this repo? | **No.** Neither migration exists in `supabase/migrations/`; both were applied directly to the database, outside this repo's history |
| referenced by app code? | **No.** The only mentions are the deletion RPC's guard and two audit docs |

**Answer: abandoned scaffolding, not shared production data.** Someone created a
generic per-user key-value table for a different idea on 2026-07-16, outside the
repo's migration flow, and nothing ever wrote to it. It holds no personal data
and never has. `docs/PRE-RELEASE-READINESS-AUDIT.md:241` had already flagged it
as a "dead guard… never created by any migration" and listed its production
existence as unknown — it does exist, and it is empty.

No policy change is needed. It is left in place, as instructed. Dropping it
would be reasonable housekeeping later, but it is not a privacy matter, and the
deletion RPC's `to_regclass` guard means it costs nothing to leave.

#### Retention recommendation — account-unlinked usage events

**Recommendation: a 12-month rolling window. Not implemented.**

The rows in question are the 2,905 of 5,334 `analytics_events` with
`user_id IS NULL` — landing views, the public reading check, shared story links.
Their only product use is funnel measurement: how many people who see the
landing page start the reading check, and how many of those sign up.

That question is answered by a *rolling window*, not by an archive. Nothing in
`dashboardMetrics.js` or the admin RPCs reads beyond a recent period, and the
oldest row is 2026-07-15 — so today, indefinite retention and 12-month retention
would return identical numbers. There is no demonstrated need.

Twelve months rather than something shorter for one reason: a learning app has
real seasonality (January and September are not August), and a year lets a
future funnel change be compared against the same month a year earlier. Six
months would be leaner and still cover every current use; the trade-off is
losing year-on-year comparison permanently, since deleted rows cannot be
recovered. Anything beyond twelve months is storage without a stated purpose,
which is exactly what a regulator asks about.

The policy currently says these are kept without a fixed end date, and says
plainly that we intend to set one — rather than implying a policy that does not
exist yet.

#### Controller identity — **NOT ESTABLISHED. This blocks sign-off**

Searched: `LICENSE`, `NOTICE.md`, `package.json`, `src/brand.js`, every `.md` in
the repo, and the git history. What exists:

- `LICENSE`: "Copyright (c) 2026 **Hanzi Dojo**. All rights reserved." — a
  trading name, not a legal person.
- `package.json`: no `author`, no `license`, no `homepage`.
- `src/brand.js`: the name, `hanzi-dojo.com`, and `support@hanzi-dojo.com`.
- Supabase organisation: "Learning Org" — an internal label.
- Git commits: a personal name and a personal Gmail address — which
  `tools/verify-public-bundle.mjs` explicitly **bans** from the shipped bundle
  as a "personal-identifier" violation, so it is plainly not intended as the
  public contact.

Nowhere is there a registered company name, an organisation number, a country of
establishment, or a postal address. **No controller identity was invented.** The
policy names {BRAND_NAME} as the controller and gives the support address, which
is true and is the real contact channel — but GDPR Article 13(1)(a) wants the
controller's *identity* to be ascertainable, and a trading name alone is not.

Three facts are needed from the owner:

1. **Is there a registered legal entity** (e.g. a Norwegian AS or
   enkeltpersonforetak)? If so, its exact registered name and organisation
   number.
2. **If not** — i.e. the controller is a natural person operating under the
   Hanzi Dojo name — the full legal name that should appear.
3. **A contact address.** An email alone is thin for Article 13; a postal
   address is the norm, and it becomes the address a supervisory authority
   writes to.

One related fact also needs owner confirmation, and is not discoverable from the
repo or the database: **whether data-processing agreements are actually in place**
with Supabase, Vercel, Cloudflare and Brevo. Article 28 requires a processor
contract. All four publish standard DPAs; whether they have been accepted for
this account is an owner fact.

### 2.5 Other PASS results worth recording

- Analytics can never carry free text — 40-char cap, tested
  (`analytics.test.js:70-73`). **PASS**
- Error monitoring sends no stack traces and no typed text. **PASS**
- No third-party analytics, advertising, attribution or crash SDK exists.
  Searched for firebase, gtag, admob, facebook, appsflyer, adjust, branch,
  amplitude, mixpanel, segment, sentry, bugsnag, posthog, onesignal,
  crashlytics — zero hits. **PASS**
- Account deletion is complete and correct, including tables added after the RPC
  was written. **PASS**
- RLS on all 34 tables; `analytics_events` is insert-only for clients. **PASS**
- Internal tooling (DojoHQ, the Cloudflare worker, the localhost bridge, a
  personal email) is build-excluded and CI-gated
  (`tools/verify-public-bundle.mjs`, `public-bundle-guard.test.mjs`). **PASS**
- Speech recognition is disabled in the native shell, so no microphone
  permission and no audio data — and the App Review notes already say so
  (`docs/STORE-LISTING.md:156-158`). **PASS**
- The analytics session id is in-memory only; no analytics identifier is
  persisted to the device. **PASS**
- `ITSAppUsesNonExemptEncryption` is answered `false` in `Info.plist` and that is
  correct — the app ships no crypto of its own. **PASS**

---

## 3 · Proposed fix plan

Nothing below has been applied. Ordered by what blocks submission.

### Stage 1 — submission blockers (native config + code)

1. **Add `ios/App/App/PrivacyInfo.xcprivacy`** and put it in the App target's
   Resources build phase. Content: `NSPrivacyTracking` false, empty
   `NSPrivacyTrackingDomains`, `NSPrivacyAccessedAPITypes` = UserDefaults /
   `CA92.1`, and `NSPrivacyCollectedDataTypes` matching the F12 table
   (EmailAddress, UserID, OtherUserContent, CustomerSupport, ProductInteraction,
   CrashData, OtherDiagnosticData — all linked, none tracking). *(F17, F18)*
2. **Add Privacy / Terms / Support rows to Settings** so a signed-in user can
   reach `/privacy` in the app. Route already works; this is a link. *(F22)*
3. **Change the Play deletion URL** to `https://hanzi-dojo.com/support`. Pure
   metadata, no code — but the currently drafted `/profile` answer is not
   reachable signed-out. *(F33)*

### Stage 2 — make the published policy true (policy text)

4. Rewrite the **"Analyze text"** paragraph to describe sentence mining. *(F1)*
5. Scope the **push** paragraph to the web until native push ships. *(F2)*
6. Add **Discord** to Infrastructure and say feedback text is relayed there —
   *or* drop the trigger (recommended; see stage 3). *(F3)*
7. Drop **"on the web"** from Google Fonts, or self-host for native. *(F4)*
8. Name **jsDelivr** in Infrastructure. *(F5)*
9. Add one sentence on **error reporting**. *(F6)*
10. Add a **retention** line covering anonymous usage events. *(F8)*
11. Add a short **age / children** section. *(F9)*
12. Add **YouTube** to Infrastructure. *(F25)*
13. Say the **timezone** is read from the device automatically. *(F27)*
14. Describe what a **feedback row** actually carries. *(F28)*
15. Add **on-device dictionary history** to the "On your device" paragraph. *(F29)*
16. Name the **TTS vendor**, or drop the other names for symmetry. *(F30)*
17. Scope the **microphone** section to the web. *(F31)*
18. Say analytics run **before sign-up**, and soften the absolute deletion claim.
    *(F32, F26)*
19. Bump **Last updated**. *(F10)*

### Stage 3 — reduce what has to be declared (code / SQL)

20. **Drop the Discord feedback trigger and its function.** It has never fired
    (the Vault secret was never created), two feedback rows exist in total, and
    removing it retires F3, F13 and half of F26 permanently — and stops anyone
    enabling a silent third-party relay by pasting one line from a migration
    comment. *(F3, F13, F26)*
21. **Self-host the three web fonts for the native build.** Removes a
    third-party call from every cold launch and fixes offline first paint.
    *(F4)*
22. Move `web-push` and `drizzle-orm` to `devDependencies` — neither is imported
    by `src/`. *(F16 note)*

### Stage 4 — store metadata (consoles + docs)

23. Write the **ASC App Privacy** answers into `docs/STORE-LISTING.md` using the
    F12 table, then fill the console. *(F12)*
24. Correct the **Play Data Safety** table: add User IDs, add user content, fix
    the sharing answer only if the Discord trigger is kept. *(F13, F14)*
25. Add **privacy manifest** and **required-reason API** items to
    `docs/PRE-RELEASE-CHECKLIST.md` §0b. *(F21)*

### Stage 5 — needs a Mac / a real archive

26. Resolve `capacitor-swift-pm` 8.5.0 and check its own manifest and
    required-reason API usage. *(F20)*
27. Archive and run **Xcode → Organizer → Generate Privacy Report**; compare the
    PDF against the manifest written in stage 1. *(F20)*
28. Walk deletion end-to-end with a throwaway account on device
    (`PRE-RELEASE-CHECKLIST` §4).

### Also needs an answer

- **Supabase platform logs** — confirm whether IP addresses and user agents are
  retained, and for how long, then disclose or scope out. *(F35)*
- **`20260807130000` comment is wrong** about the `profiles → auth.users` FK;
  fix the comment when the file is next touched. *(F36)*

### Open question for the owner

- **`bodyos_app_state`** — is this Supabase project shared with another product?
  It is empty today, so nothing is wrong yet; the answer decides whether the
  policy and the store answers need to describe a shared identity tenant. *(F11)*

---

## 4 · Applying the Stage 3 migration to production

**APPLIED 2026-08-26** as `20260826123336 drop_feedback_discord_relay`, after PR
#217 merged with CI green. Verification results are in §2.8 — 13/13 on the
committed test plus twelve independent read-only invariants. The steps below are
retained as the record of what was run.

```
supabase/migrations/20260825120000_drop_feedback_discord_relay.sql
```

Apply it exactly as committed — do not improvise the DDL at the prompt
(CLAUDE.md §8). Either:

* **Supabase SQL editor** — paste the file's contents and run; or
* **`apply_migration`** with the file's contents, named
  `drop_feedback_discord_relay`.

Then confirm, against production:

```
supabase/tests/feedback_relay_removal_verification.sql
```

It runs in one transaction and ends in `ROLLBACK`, so it writes nothing and is
safe to run against production. All 13 checks must report PASS. Before the
apply, checks 1–4 report FAIL — that is expected, and is what shows the test is
actually measuring something.

Nothing else needs to change at apply time: no client deploy, no config, no
Vault edit. Feedback keeps working throughout; the only difference is that the
insert no longer fires a trigger.
