# Play Store & App Store launch plan

Everything between today's web app and a listing on both stores. Based on a
full repo audit (2026-08-02) plus current store policy research. Items marked
**BLOCKER** will cause rejection or cannot-submit; everything else is ordered
by phase. Nothing in this plan has been started unless marked done.

**The one-line summary:** the app itself is unusually store-ready (offline,
installable, first-party-only analytics, no payments, no UGC) — but four hard
blockers exist (account deletion, Sign in with Apple, support email, draft
legal texts), the wrapper layer doesn't exist at all, and both stores have
slow bureaucratic clocks (Play's 14-day closed test, identity verification,
D-U-N-S) that should be started before any code is written.

---

## 0. Strategy decisions (make these first — everything downstream depends on them)

### D1. How to wrap — recommendation: TWA for Android, Capacitor for iOS

| | Android: TWA (Bubblewrap) | iOS: Capacitor |
|---|---|---|
| What it is | Real Chrome rendering the live site, no webview | WKWebView wrapper with bundled web assets + native plugins |
| Web Push (VAPID) | **Works as-is** — the whole reminder system survives | Does NOT work — needs APNs plugin + sender changes, or drop reminders on iOS v1 |
| Speech recognition (Speaking drill) | **Works** (real Chrome) | Doesn't work in WKWebView — the graceful fallback already exists (`Speaking.jsx`), so acceptable for v1 |
| Updates | Instant — every Vercel deploy updates the app | Bundled assets → binary releases (or an OTA service later, e.g. Capgo) |
| Store risk | Low (Google explicitly supports TWA/PWA) | **Guideline 4.2 "minimum functionality"** — the real risk; mitigations in §5 |
| Work | Days | 1–2 weeks + ongoing native maintenance |

Why not Capacitor on both: Android-in-Capacitor *loses* web push and speech
recognition (WebView, not Chrome) — TWA keeps the full product for free.
Why not a thin iOS wrapper pointing at hanzi-dojo.com: highest 4.2 rejection
risk + no offline. Bundle the build.

### D2. iOS push reminders at v1? — recommendation: **ship v1 without them**
The APNs path means a native plugin, a second sender branch in
`send-review-reminders.mjs`, and APNs keys. Reminders are opt-in and calm by
design; cutting them from iOS v1 removes a week of work and a review surface.
Add in v1.1. (Android keeps them via TWA.)

### D3. iPhone-only or iPad too? — recommendation: **iPhone-only at v1**
The app is responsive and would mostly work, but iPad support doubles
screenshot sets and review surface. Enable later; one checkbox + assets.

### D4. Store account types — recommendation: **organization accounts if feasible**
- **Play:** personal accounts created after Nov 2023 must run a **closed test
  with 12+ opted-in testers for 14 consecutive days** before production access.
  Organization accounts skip this. If personal: recruit the Discord testers
  early — this is the longest fixed clock in the plan.
- **Apple:** individual ($99/yr) is fine and faster; organization needs a
  D-U-N-S number (takes days–weeks). Individual shows a personal name as
  seller — decide if that's acceptable.
- Start account creation + identity verification in week 1 regardless — Play
  developer verification is also rolling out as an Android platform
  requirement through late 2026.

---

## 1. Hard blockers (both stores) — the app cannot ship without these

### B1. In-app account deletion — **BLOCKER, biggest single work item**
Audit result: no UI, no RPC, no edge function. The Support page says "ask in
Discord", which fails both stores' policies.
- [ ] A `delete_account` path that removes the auth user + all owned rows
  (profiles, language_tracks, cards, level_unlocks, story_reads, feedback,
  push_subscriptions, analytics rows keyed to user_id…). Deleting an auth
  user requires the service role → this must be a **Supabase Edge Function**
  (verify-JWT) or an RPC with definer rights, not a client call.
- [ ] In-app UI: Settings/Profile → "Delete account" → typed confirmation →
  sign-out. Must be *initiate-able in-app* (a support-email flow is not
  compliant).
- [ ] **Web deletion URL** (Play requires one in the Data Safety form, usable
  without reinstalling): a `/delete-account` public route that signs you in
  and runs the same flow.
- [ ] When Sign in with Apple ships (B2): call Apple's token-revocation REST
  API during deletion — Apple checks this.
- [ ] Update Privacy page + Support page to describe the self-serve flow.

### B2. Sign in with Apple — **BLOCKER (iOS)**
Google OAuth is offered, so guideline 4.8 demands an equivalent
privacy-preserving login. Email+password arguably qualifies under the revised
rule, but reviewers are inconsistent — adding SIWA is the safe, standard move
and Supabase supports the Apple provider natively.
- [ ] Enable Apple provider in Supabase (needs the Apple developer account:
  Services ID, key, team ID) · add the button in `Auth.jsx` · add revocation
  to B1.

### B3. Support email — **BLOCKER (both listings require one)**
The Privacy page literally says "A dedicated support email is coming."
- [ ] Create `support@hanzi-dojo.com` (Brevo/forwarding is fine) · put it in
  TrustPages, both store listings, and the Play "developer contact" section.

### B4. Legal texts out of draft state — **BLOCKER**
Privacy + Terms render a "this document is being finalized" beta banner and
are flagged owner-review-only in CLAUDE.md.
- [ ] Owner (ideally professional) review → remove the BetaNote banners.
- [ ] Add the **feedback→Discord webhook** egress to the Privacy
  infrastructure list (audit found it undisclosed — it must match the Data
  Safety form exactly).
- [ ] Verify `https://hanzi-dojo.com/privacy` renders for store reviewers
  (it's a client-rendered SPA route — it works in a browser, which is what
  reviewers use; no SSR needed, but check it on a phone).

### B5. Auth inside the wrappers — **BLOCKER (iOS; TWA mostly unaffected)**
Google blocks OAuth inside embedded webviews; magic-link/confirmation emails
redirect to the website, not the app.
- [ ] iOS: open OAuth via the system browser (`ASWebAuthenticationSession` /
  Capacitor Browser), return via **custom URL scheme or universal link**,
  listener via `@capacitor/app` `appUrlOpen`.
- [ ] Add the scheme/universal-link to Supabase's Redirect URL allow-list
  (note: DEPLOY.md says even the *current* Site-URL allow-list task is
  still open — close both at once).
- [ ] Email confirmation + password reset links: point `emailRedirectTo` at a
  page that bounces into the app (or accept web-completion for v1 — test it).
- [ ] TWA: auth is the real website in Chrome — verify the OAuth round-trip
  survives the TWA activity (it should; test).

---

## 2. Repo/tech work (pre-wrapper)

- [ ] **Build target trap:** default `npm run build` overwrites `index.html`
  with the internal admin page and **deletes `sw.js`**. Every wrapper build
  must use `npm run build:public`. Encode this in the wrapper build scripts
  so it cannot be gotten wrong.
- [ ] `public/.well-known/assetlinks.json` (Play/TWA — proves domain↔app) and
  `public/.well-known/apple-app-site-association` (universal links). Static
  files in `public/` bypass the SPA rewrite on Vercel, so serving works —
  verify content-type after deploy.
- [ ] Manifest: add `id` (stable PWA identity — do this **before** the TWA is
  built), `lang: "en"`, `categories: ["education"]`; optionally
  `screenshots` + `shortcuts` (nice, not required).
- [ ] Fix `sw.js` push handler's dead icon path (`pwa-192.png` doesn't exist;
  actual file is `icon-192.png`) — Android reminder notifications currently
  show a broken icon.
- [ ] Bundle Google Fonts locally (first paint currently depends on
  `fonts.googleapis.com` — bad for wrapper cold-start offline, and one less
  third-party endpoint to disclose).
- [ ] iOS meta polish: `apple-mobile-web-app-capable`, status-bar-style,
  splash/launch screens (Capacitor generates these from one 2732×2732 image).
- [ ] Favicon is still the off-brand purple mark (DEPLOY.md) — unify with the
  enso icon before screenshots are taken.
- [ ] Known iOS notes that get **better** in a wrapper, no action needed:
  the 7-day Safari storage eviction doesn't apply to WKWebView apps;
  Background Sync no-op already has an app-launch flush fallback;
  `playAudioEl` already handles the WebKit audio quirks.

## 3. Google Play checklist

**Account & policy**
- [ ] Developer account ($25 one-time) + identity verification (start week 1)
- [ ] If personal account: **closed test, 12+ opted-in testers, 14 consecutive
  days** before production — recruit via Discord/TESTERS.md, budget 3 weeks
- [ ] Target API level: current requirement (API 35 now, **API 36 required for
  new apps Aug 31, 2026**) — current Bubblewrap handles this; pin it
- [ ] App signing by Google Play (default; keep the upload key safe)

**Listing & forms**
- [ ] **Data Safety form** — from the audit, truthfully: collects email
  (account), user feedback text (shared with Discord as processor), app
  activity (first-party analytics, no third-party SDKs, no ads, no tracking);
  data encrypted in transit; **deletion URL** (B1's web route)
- [ ] Account deletion URL field (same)
- [ ] **IARC content rating** questionnaire — no UGC, no violence; note the
  curated YouTube embeds; expect Everyone/PEGI 3
- [ ] Target audience: 13+ (matches Terms), **not** directed at children (no
  Families program → no age-gate obligation)
- [ ] Ads declaration: none · Privacy policy URL: `/privacy`
- [ ] Store listing: title (30), short description (80), full description,
  icon 512, **feature graphic 1024×500**, ≥2 phone screenshots (up to 8)
- [ ] "Hanzi Dojo" name availability/trademark sanity check on the store

**TWA build**
- [ ] Bubblewrap init against the live manifest · signing key → SHA-256 →
  `assetlinks.json` · verify no browser chrome appears (assetlinks valid)
- [ ] Verify: OAuth round-trip, push reminders, offline launch, audio, deep
  links (`/read/:id` opens the app once App Links verify)

## 4. Apple App Store checklist

**Account & compliance**
- [ ] Developer Program ($99/yr; D-U-N-S first if organization)
- [ ] **Privacy nutrition labels** (mirror the Data Safety answers)
- [ ] `PrivacyInfo.xcprivacy` privacy manifest (required-reason APIs —
  UserDefaults etc.; Capacitor templates cover most of it)
- [ ] Export compliance: standard-HTTPS-only exemption declaration
- [ ] Age rating questionnaire (new tiered system: expect 4+ or 9+;
  unrestricted-web is "no" — embeds are curated)

**App**
- [ ] Capacitor project: bundled `build:public` assets, app icon set, launch
  screen, custom scheme + universal links (§2), SIWA (B2), account deletion
  (B1)
- [ ] Decide D2/D3 (push: no; iPad: no) and configure accordingly
- [ ] Real-device pass on an actual iPhone — audio autoplay paths, safe-area,
  offline cold start, the Speaking fallback message

**Listing & review**
- [ ] Screenshots: 6.9" and 6.5" iPhone sets (5 each is plenty)
- [ ] Name (30) / subtitle (30) / keywords (100) / description / support URL
  (`/support`) / marketing URL
- [ ] **Demo account for the reviewer** with pre-seeded progress (so stories,
  review queue and offline are visible) + review notes (§5)
- [ ] TestFlight beta with the Discord testers before submission

## 5. Apple 4.2 "minimum functionality" — the one real rejection risk

Web-wrapped apps get rejected as "repackaged websites." The defense is that
Hanzi Dojo genuinely isn't one, and making that visible to a reviewer in the
first two minutes:

- **Lead the review notes with the native-feeling substance:** full offline
  study with a durable sync outbox; installable SRS engine; per-word tap
  lookups; TTS narration with read-along; no browser chrome, no external
  links in the core flow.
- **Small native touches buy disproportionate goodwill:** haptics on grade
  buttons (Capacitor Haptics, ~an hour), native share sheet (already using
  Web Share API — works), correct launch screen, app-like page transitions
  (already the case).
- **Remove web-isms from the wrapped build:** no "install this app" hints, no
  links that navigate the webview away from the app, external links (Discord,
  YouTube) open in the system browser via the Capacitor Browser plugin.
- **The demo account matters:** an empty app looks like a website; a seeded
  one looks like a product.
- If rejected anyway: respond in Resolution Center citing the offline engine
  + SRS scheduling as core native-equivalent functionality; escalation
  usually succeeds for real products. Worst case: App Review Board appeal.

## 6. Ops & post-launch

- [ ] **Version/update strategy:** Android (TWA) tracks the website
  automatically; iOS binaries go stale — either accept periodic binary
  releases or add an OTA layer later. Keep the SW update-pill UX in both.
- [ ] Crash visibility: Play Console vitals + App Store crash reports only
  (privacy stance = no third-party SDK; `errorMonitor.js` already reports JS
  errors first-party). Revisit only if native crashes appear.
- [ ] Store-review re-test ritual: any auth or deletion change re-runs the
  §1 checks before the next release.
- [ ] docs/TESTING.md gets a wrapper section (iOS device pass, TWA pass).
- [ ] Marketing sync: store links on Landing + `/support`, Discord announce.

## 7. Suggested order (dependency-sorted)

**Week 1 — start the slow clocks + decisions**
Create both developer accounts, begin verification (+ D-U-N-S if org) ·
lock D1–D4 · create support email (B3) · owner starts legal review (B4).

**Weeks 1–3 — the blockers in code**
Account deletion end-to-end (B1: edge function + UI + web route) · Sign in
with Apple (B2) · auth deep links + Supabase redirect list (B5) ·
§2 repo items (manifest id, assetlinks/AASA, fonts, icon fix).

**Weeks 2–4 — wrappers**
TWA build + closed-testing track live (starts the 14-day clock if personal
account) · Capacitor iOS project + device pass · screenshots & listing
assets once the UI is final.

**Weeks 4–6 — forms, betas, submission**
Data Safety + IARC + privacy labels + age rating · TestFlight beta ·
Play closed test completes → production access → submit both · answer
review feedback (budget 1–2 rounds on iOS).

Realistic total: **4–6 weeks**, gated mostly by the Play 14-day test (if
personal account) and Apple review rounds — not by code.

## 8. Sources

- Play closed-testing requirement (12 testers / 14 days, post-Nov-2023
  personal accounts): [Google Play Console Help](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en) · [2026 playbook](https://medium.com/@kefayatkhadem/google-play-closed-testing-in-2026-the-full-path-from-12-testers-to-production-access-1f48b7833671)
- Target API 36 by Aug 31 2026: [Android Developers](https://developer.android.com/google/play/requirements/target-sdk)
- Play account-deletion policy (in-app + web URL): [Play Console Help](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- Apple in-app account deletion: [Apple Developer News](https://developer.apple.com/news/?id=12m75xbj)
- Sign in with Apple / 4.8 revision: [9to5Mac](https://9to5mac.com/2024/01/27/sign-in-with-apple-rules-app-store/) · token revocation: [Apple Developer News](https://developer.apple.com/news/?id=j9zukcr6)
- Guideline 4.2 webview rejections: [MobiLoud](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper) · [Code2Native](https://code2native.com/blog/fix-app-store-rejection-42-webview)
- Supabase native deep-linking: [Supabase docs](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- Android developer verification rollout (Sept 2026+): Google Play publishing guides (2026)
