# ✅ Pre-release checklist — everything before the store launch

**One-time launch list. Updated 2026-08-07 for the mobile pivot:** Hanzi Dojo
ships as a **native mobile app on Google Play and the Apple App Store** (see
CLAUDE.md §1 — this is the distribution decision of record). The plan is to
**wrap the existing React SPA with Capacitor** — no rewrite, `src/` unchanged,
the same code runs in the store apps. The web deploy survives only as the
public/legal surface the stores require (landing, `/privacy` `/terms`
`/support`, public story links).

This is *not* the per-merge gate — that lives in
[`docs/RELEASE-CHECKLIST.md`](RELEASE-CHECKLIST.md) and still runs on every PR.
Work this file top to bottom; §0 is the new critical path.

**Baseline verified 2026-08-07:** lint 0 errors / 7 known warnings ·
3,054/3,054 unit tests · build clean. Verified against prod: `grade_card`,
`public_story`, `writing_stats`, `story_questions`, `tts_audio` and the prefs
columns all exist — older "pending migration" doc entries were stale.

**Store-blocker audit (2026-08-07, verified in code):**
- Account deletion is "ask in Discord" (`TrustPages.jsx`) — **fails Apple
  5.1.1(v) and Google Play policy**, both require in-app self-serve deletion.
- Google sign-in exists (`Auth.jsx` `signInWithOAuth`) with no Apple sign-in —
  **fails App Store guideline 4.8** (third-party login ⇒ Sign in with Apple
  mandatory).
- Reminders are Web Push only (`src/push.js`) — **dead inside an iOS app**;
  needs native FCM/APNs.

---

## 0 · Mobile app + store release (the new critical path)

### 0a · Capacitor scaffolding (code)

- [x] **Add Capacitor — DONE 2026-08-07.** Capacitor 8: `@capacitor/core` +
      `app` + `status-bar` (deps), `cli` + `android` + `ios` (dev). App ID
      `com.hanzidojo.app`, `capacitor.config.json` webDir `dist/client`.
      ⚠️ The app build is **`npm run build:public`** — plain `npm run build`
      produces the internal HQ page (vite.config.js `SITES_BUILD`). Scripts:
      `npm run cap:sync` (public build + sync), `cap:android`, `cap:ios`.
      Native projects committed; synced web assets gitignored on both
      platforms; `android/**`+`ios/**` excluded from ESLint. iOS `pod install`
      still needs a Mac — untested until one builds it.
- [x] **Deep links route into the SPA — DONE 2026-08-07.**
      `src/NativeShellBridge.jsx` (mounted in `main.jsx`, inside the router)
      listens to `appUrlOpen`; `src/nativeShell.js` maps universal links
      (hanzi-dojo.com hosts only) and the custom scheme to routes — pure,
      13 specs. The `com.hanzidojo.app` scheme is registered in
      `AndroidManifest.xml` and `Info.plist`.
- [ ] **Universal links** so `https://hanzi-dojo.com/read/...` opens the app:
      host `assetlinks.json` + `apple-app-site-association` on the domain,
      add `autoVerify` intent filter + Associated Domains entitlement. Needs
      the store signing identities to exist first (0d).
- [x] **Service worker off inside the native app — DONE 2026-08-07**
      (`main.jsx` guards registration with `isNativeApp()`; web build
      unchanged). The IndexedDB offline layer stays — it is the app's
      offline story.
- [x] **Safe-area basics were already in place** (`viewport-fit=cover` in
      `index.html`; `MobileNav` bar + sheet already pad
      `env(safe-area-inset-bottom)`). Still open: sweep the *other* fixed
      elements (reader audio bars, fixed study layout) on real notched
      devices — folded into §1 mobile sweep. Status-bar theming
      (`@capacitor/status-bar` is installed, unwired) with it.
- [x] **Android hardware back button — DONE 2026-08-07**
      (`NativeShellBridge` + `backAction()`: history back → Home → exit only
      from Home; tested).
- [ ] **Keyboard**: `@capacitor/keyboard` resize mode checked against the
      fixed-height flashcard and writing screens.
- [ ] **External links** (Discord, attribution links) open the system browser,
      never navigate the app webview.
- [ ] **App icons + splash screens**, all densities, light + dark (defaults
      are the Capacitor placeholders right now).

### 0b · Hard store blockers (rejection-level, code + config)

- [ ] **🔴 In-app account deletion.** Self-serve flow in Profile: deletes the
      auth user + every owned row (cards, tracks, logs, activity, dojo data).
      Needs a security-definer RPC or edge function (client can't delete auth
      users). Also required: a **web** deletion path URL for the Play Data
      Safety form. Update `TrustPages.jsx` copy once it exists.
- [ ] **🔴 Sign in with Apple.** Mandatory on iOS because Google sign-in is
      offered. Enable the Apple provider in Supabase (needs the Apple
      Developer account, Services ID + key), add the button in `Auth.jsx`
      (iOS at minimum).
- [ ] **🔴 Native OAuth flow.** Google blocks OAuth inside webviews: open
      auth in the system browser (`@capacitor/browser`) and return via deep
      link (`com.hanzidojo.app://auth-callback` or universal links). Add the
      scheme to the Supabase redirect allowlist. Same for **magic links and
      password-reset emails** — they must open the app, not the website.
- [ ] **🔴 Native push notifications.** Replace Web Push with
      `@capacitor/push-notifications`: FCM (Android) + APNs (iOS).
      `send-review-reminders.mjs` sends via FCM instead of Web Push; store
      device tokens; calm iOS permission prompt (ask in context, never on
      first launch). Web Push can stay for the web build.
- [ ] **Privacy declarations**: finalized privacy policy at a public URL
      (both stores require it — the web `/privacy` page serves this), App
      Store privacy "nutrition labels", Play **Data Safety** form. Declare:
      account data in Supabase, first-party analytics events, privacy-safe
      client error events. No third-party ad/tracking SDKs — say so.
- [ ] **Age rating questionnaires** — answer honestly that the dictionary
      contains CC-CEDICT entries flagged explicit (hidden behind a per-query
      reveal, `dictExplicit.js`); expect Teen/12+ rather than Everyone/4+.
- [ ] **Apple review prep**: a working demo account + review notes explaining
      the level system (reviewers must be able to reach a story and a review
      session without studying for a week — Creative Mode may help seed it).

### 0c · Webview correctness (verify, likely small fixes)

- [ ] **Audio in WKWebView**: flashcard TTS, story narration, slow variants —
      real-device pass on iOS; autoplay policies differ from Safari.
- [ ] **Speaking drill**: Web Speech API is absent in WKWebView — confirm the
      existing "not supported" fallback fires there (it keys off browser
      detection today, not capability).
- [ ] **Offline launch**: airplane-mode cold start must not white-screen
      (reviewers test this). Local assets + cached data should carry it.
- [ ] **hanzi-writer stroke data** loads from CDN at runtime — fine online;
      decide whether to bundle it for offline stroke animations (optional).
- [ ] **localStorage/IndexedDB persistence** in the app context — durable
      data is in Supabase by design, so eviction is survivable; just verify
      prefs/caches degrade quietly (the guards in §6.5 already exist).

### 0d · Accounts, signing, pipeline (owner + code)

- [ ] **Google Play Console** account ($25 one-time) — owner.
- [ ] **Apple Developer Program** ($99/yr) — owner. Needed for Apple sign-in
      config too (0b).
- [ ] **Android signing**: generate + safely store the upload keystore
      (GitHub secret + offline backup — losing it means losing the listing).
- [ ] **iOS signing**: certificates + provisioning profiles; pick the build
      lane — owner's Mac with Xcode, GitHub Actions macOS runner, or Xcode
      Cloud. TestFlight for betas.
- [ ] **CI**: add `cap sync` + Android AAB build to Actions; keep the
      existing lint/test/build/e2e exactly as they are (they test the same
      code the apps ship).
- [ ] **Versioning + release process**: versionCode/build-number bumping,
      internal testing tracks (Play internal + TestFlight), and a written
      release cut procedure — "merged to main" no longer means users have it.
      Evaluate a JS-bundle OTA service (e.g. Capgo) later for hotfixes; not
      needed for launch.
- [ ] **Store listings**: app name, subtitle/short description, full
      description, keywords, screenshots (6.7" + 5.5" iPhone, Android phone +
      tablet), feature graphic. Screenshots after the UI passes in §1.
- [ ] **Announce the pivot in `ROADMAP.md` when ready** — deliberately not
      done in this change: editing the roadmap posts to Discord instantly, so
      the owner chooses the moment and the wording.

## 1 · Code quality — now in service of the app

The webview ships these screens, so every pass below is store-launch work.

- [ ] **Navigation/loading/shell pass (HD-P5)** — route transitions, loading
      states, no dead ends; now includes native back behavior (0a).
- [ ] **Accessibility sweep (HD-P13)** — keyboard/switch access, focus traps,
      contrast both themes, `aria-live` on silent state changes.
- [ ] **Mobile sweep (HD-P13)** — now the *primary* form factor: 360–390 px,
      44 px targets, no horizontal overflow, `min-height: 0` flex-scroll rule,
      safe-area insets everywhere.
- [ ] **Performance pass (HD-P13)** — Home bootstrap RPC (kill the 4-query
      waterfall; slow starts feel worse in an app), font diet (load only the
      active language's family).
- [ ] **Auth error-path e2e (HD-P11)** — plus the new native OAuth/deep-link
      flows once 0b lands.
- [ ] **HD-P12 leftovers** — profile number scoping labels, achievements
      determinism audit, HQ audit trail.
- [ ] **HD-P11 leftovers** — suggested first story on the reading-test
      result; verify share-flow feedback fires.
- [ ] **`src/devTools.js` rule violations** — `/unlock` writes `is_easy: true`
      + `ease_factor` (banned §7.3/§10); port onto `src/creativeMode.js`.
- [ ] **Dead code** — old `StoryReader` (+ `CharacterGuide`/`StoryLine`/
      sidebar cards) in `Stories.jsx`; `presentationOf` alias in
      `readerMode.js` (migration verified applied).
- [ ] **Dictionary polish** — 得-particle pinyin in examples; capitalized
      proper-noun pinyin display in `cedict.js`.
- [ ] **Migration hardening** — `drop policy if exists` in `20260719120000`;
      partial unique index on `vocabulary`.
- [ ] **Timezone-correct reminders** — folds into the FCM rework (0b): store
      user timezone, schedule per-user, kill the ~1 h DST drift.

## 2 · Owner / dashboard actions

- [ ] **🔴 `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` Actions secrets** —
      unblocks the 21 mispronounced single-character words (staged
      `tts-flashcards` run, ids in `docs/BACKLOG.md` §Learning quality) and
      HSK 3–6 slow/sentence audio.
- [ ] **🔴 Funded LLM key** (`ANTHROPIC_API_KEY` secret, or paid Gemini/Groq)
      — unblocks HSK 3–6 serial-story generation.
- [ ] **Supabase Auth URLs** — Site URL `https://hanzi-dojo.com`, allowlist
      `https://hanzi-dojo.com/**` + `http://localhost:5173/**` **+ the app
      deep-link scheme from 0b**.
- [ ] **SMTP live test** — magic link arrives from `no-reply@hanzi-dojo.com`,
      not spam.
- [ ] **Google OAuth branding** — app name "Hanzi Dojo" + logo in Google
      Cloud Console (the consent screen currently shows the Supabase URL).
- [ ] **Disconnect the two always-red Cloudflare "Workers Builds" checks.**
- [ ] **Turn off the retired GitHub Pages site.**
- [ ] **Trust-pages sign-off** — review `/privacy` `/terms` `/support`
      `/methodology`; they become *legally load-bearing* store URLs (0b), so
      this is no longer optional polish.
- [ ] **Final `get_advisors` security run** before submission.
- [ ] *(cheap)* Fill the last **25 HSK 6 example sentences** (`examples-fill`,
      level 6, once quota allows).

## 3 · Content & editorial

- [ ] **🔴 Chinese editorial sign-off (HD-P9)** — qualified Chinese reviewer
      for the 14 grammar-guide topics + published stories. Not
      self-certifiable by Claude; the long pole — start recruiting now.
- [ ] **Eight HSK 1–3 stories under the coverage bar** — decide on `在动物园`
      (65%), `下雨天` (64%), `我的早上` (74%); word-swap the 5 marginal ones.
      Lists in `docs/BACKLOG.md` §Content.
- [ ] **`1. 不见了的苹果` held season (2–6)** — still the older *flowers*
      plot; rewrite one side before publishing (owner: content session).
- [ ] **Held-chapter gaps** — L3 `田里的田螺` (6–12), L3 `老王的眼镜` (7–12),
      L2 `兔子` (6): publish-held pass or a deliberate hold.
- [ ] **Six older chat/scene stories lack per-line English** — confirm
      by-design before "fixing" (HD-P7).
- [ ] **Wire the HSK 1 pool into `authoredStories.test.js`** — same change
      as the under-bar HSK 1 fixes (the test is absolute).
- [ ] **Final `check-published` run**, warnings actually read.
- [ ] *(deferred)* Inkbound letterbox bars — next time those episodes are
      touched. *(volume)* More stories per level; HSK 3–6 serials once the
      LLM key exists.

## 4 · Verification — on the real apps

Everything below now happens **inside the wrapped iOS + Android apps**, not a
mobile browser. This replaces the old "real-device pass".

- [ ] **Full `docs/TESTING.md` pass in both apps** — all 16 open items;
      audio (polyphones 长 行 银行 重 觉), offline grade replay, and the new
      native push flow especially.
- [ ] **Fresh-account walkthrough in-app** — signup (incl. Apple + Google
      sign-in) → onboarding → first session → first story → language reset →
      **account deletion** (0b) — the exact loop store reviewers walk.
- [ ] **HSK 3–6 full loop** as a learner.
- [ ] **Magic link + password reset** deep-link back into the app from a real
      inbox.
- [ ] **Airplane-mode cold start + offline grading + replay on reconnect.**
- [ ] **Creative mode** against a real account; **Dojo HQ** with a second
      admin (internal tools stay web — fine).
- [ ] **TestFlight + Play internal testing round** with the Discord testers
      (`docs/TESTERS.md`) before public listing.

## 5 · Explicitly post-launch (do not block the stores)

- FSRS parameter tuning (needs real `review_logs` volume).
- Global word-status model; server-authoritative progression; data-cache
  normalization; centralized data layer; Supabase generated types.
- "Read next" weighted by slipping words; graded YouTube; custom flashcards /
  import; pictures on flashcards; HSK 7–9.
- Continue extracting `Study.jsx` / `DojoHQ.jsx` / `StoryReaderImmersive.jsx`
  logic into tested modules.
- Axe a11y checks in e2e; drop the dead `profiles` XP/streak columns.
- OTA hotfix service (Capgo/Appflow); native speech-recognition plugin for
  the Speaking drill; HD-P15 differentiation work.

---

**Suggested order:** 0a scaffolding first (everything else is testable inside
it) → 0b store blockers + §1 quality passes in parallel sessions → §2 owner
sitting (store accounts early — Apple enrollment can take days) → §3 editorial
in parallel (reviewer is the long pole) → 0d pipeline + listings → §4
verification on TestFlight/internal track → submit both stores.
