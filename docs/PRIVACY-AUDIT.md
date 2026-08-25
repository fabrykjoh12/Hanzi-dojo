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

#### F1 · MISMATCH · high — "Analyze text" pasted text *is* stored on the server
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

#### F2 · MISMATCH · medium — the push section describes an unbuilt feature
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

#### F3 · MISSING · medium (latent, not active) — Discord is an undisclosed recipient of feedback content
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

#### F4 · MISMATCH · medium — Google Fonts is scoped "on the web" but loads natively too
**Layer: code (preferred) or policy text**

The policy lists *"Google Fonts (font delivery on the web)"*. But
`index.html:22-28` is the same document the Capacitor build ships
(`capacitor.config.json` webDir `dist/client`), and nothing strips it for native.
Every cold launch of the iOS and Android app requests `fonts.googleapis.com` and
`fonts.gstatic.com`, disclosing the device IP and user-agent to Google.

**Fix:** self-host the three families for the native build. That is the better
fix on its own merits — an offline-first app should not need a CDN round-trip to
render its first paint. Minimum viable fix: delete "on the web" from the policy.

#### F5 · MISSING · medium — jsDelivr is an undisclosed runtime third party
**Layer: policy text or code**

`src/strokeData.js:19` — `STROKE_CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1'`,
used by `StrokeOrder.jsx:37` and `Writer.jsx:88`. Every stroke-order view
discloses the learner's IP *and which character they are studying* to jsDelivr.
The Infrastructure list does not name it.

**Fix:** name it in the policy, or bundle/proxy the stroke data (which also
removes a runtime network dependency from an offline-first app).

#### F6 · MISSING · medium — error/crash reporting is not described in the policy
**Layer: policy text**

`errorMonitor.js` sends `client_error` events. The policy's "Product analytics"
paragraph covers *usage* events and never mentions error or crash reporting —
while the Play Data Safety draft already declares "Crash / diagnostic"
(`docs/STORE-LISTING.md:179`). Apple treats Crash Data and Other Diagnostic Data
as distinct declarable types; the policy has to match what you declare.

**Fix:** one sentence in the analytics section.

#### F7 · MISMATCH · low — "ask for a copy of your data" with no export path
**Layer: process/verification (code optional)**

Policy `:150-151`. There is no export feature anywhere in `src/`; fulfilment is
manual over email. The promise as written ("ask us") is satisfiable, but it is
unstaffed, untested, and GDPR gives you one month to answer.

**Fix:** decide and document the manual procedure now; a `Profile → Download my
data` button is roughly a day's work and closes it properly.

#### F8 · MISSING · low–medium — no retention statement, and anonymous events are immortal
**Layer: policy text (+ optional SQL)**

Policy `:152-153` says data is kept "as long as you have an account" — true for
learner rows. But 2,905 of 5,334 `analytics_events` rows have `user_id IS NULL`;
they belong to no account, and nothing ever deletes them.

**Fix:** state a retention window for anonymous usage events, and optionally add
a purge.

#### F9 · MISSING · medium — no children's-data section
**Layer: policy text (+ store metadata alignment)**

The 13+ age requirement lives only in the Terms (`TrustPages.jsx:187`). The
Privacy Policy says nothing about age or children. Both stores' age
questionnaires and Play's Families policy look for this.

#### F10 · MISMATCH · low — "Last updated 1 August 2026" is stale
`TrustPages.jsx:358`. It predates the account-deletion RPC (2026-08-07) and
everything since. Bump it in the same commit as the fixes.

#### F11 · NEEDS DEVICE/ARCHIVE VERIFICATION · low — `bodyos_app_state`
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

#### F13 · PASS today, MISMATCH the moment the relay is enabled · high — "Data shared with third parties: No"
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

#### F18 · PARTLY CLOSED — see §2.6 · blocker — `@capacitor-community/apple-sign-in` calls `UserDefaults` and ships no manifest
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

#### F25 · MISSING · medium — YouTube is an undisclosed runtime third party
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

#### F27 · MISMATCH · medium — the device timezone is captured silently
**Layer: policy text**

`src/App.jsx:103-112` writes `Intl.DateTimeFormat().resolvedOptions().timeZone`
to `profiles.timezone` on load whenever it differs from what is stored. The
learner never types or confirms it. The policy lists timezone among
*"your preferences … timezone for reminders"* — framing an automatic capture as
something the learner chose.

**Fix:** say it is read from the device automatically.

#### F28 · MISSING · medium — a feedback row holds more than "the text"
**Layer: policy text**

The policy says *"Feedback you send: the text of in-app feedback"*. The row also
carries `email`, `page`, `language`, and a `context` jsonb with the open story's
id and truncated title plus the build sha (`src/Feedback.jsx:73`,
`src/feedbackContext.js`, `20260801120000_add_feedback_context.sql`).

#### F29 · MISSING · low — on-device dictionary history is not described
**Layer: policy text**

`localStorage['dict:recent:<language>']` keeps the last 8 words the learner
looked up, with reading and meaning (`src/recentLookups.js:8-45`). It never
leaves the device — so it is not "collected" for store-declaration purposes —
but the policy's "On your device" paragraph lists only content caches and the
review queue.

#### F30 · MISSING · low — the TTS vendor is unnamed while every other subprocessor is
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

#### F32 · MISSING · medium — analytics run before any account exists, with no gate
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

#### F35 · NEEDS DEVICE/ARCHIVE VERIFICATION · medium — Supabase platform logging
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

**F18 therefore stays open** until the archive check confirms static linkage and
the Capacitor/Cordova manifests. What Stage 1 closed is the app's own obligation.

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
