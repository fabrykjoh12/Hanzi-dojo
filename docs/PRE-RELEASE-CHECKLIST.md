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

- [x] **🔴 In-app account deletion — DONE 2026-08-07, migration applied.**
      `delete_my_account` RPC (security definer, authenticated-only, verified
      to refuse without a session): deletes the no-FK user tables, the profile
      (cascading all 12 owned tables), then the auth user. Profile → Delete
      account panel: arm by tap, type "delete" to confirm
      (`accountDeletion.js` + specs), then device cleanup (caches + outbox)
      and sign-out. `/privacy` + `/support` describe the flow; the web
      Profile doubles as Play's required web deletion path. Dojo HQ board
      rows deliberately survive (shared team content). Still to do: walk it
      end-to-end with a throwaway account (§4).
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
- [x] **Speaking drill — DONE 2026-08-07.** The gate was "does the
      constructor exist", and WKWebView/Android WebView both expose
      `webkitSpeechRecognition` without implementing it — so in the apps the
      drill would have rendered and then failed on the first tap.
      `speechSupport.js` decides availability (constructor AND not in the
      native shell), the Practice hub omits the drill entirely when it isn't
      usable, and `service-not-allowed` no longer masquerades as a blocked
      microphone. 11 specs. *A real native speech plugin stays a §5 item.*
- [x] **Offline launch — DONE 2026-08-07** (`tests/e2e/offline-start.spec.js`).
      Models the store build honestly: assets are bundled and always load, so
      the spec kills the backend rather than the whole network (a blanket
      offline flag stops the test server serving `index.html`, a state the
      native app can't be in). Asserts the shell renders signed-in and
      signed-out, and that the signed-in case shows honest copy instead of a
      false success state.
- [x] **hanzi-writer stroke data — DONE 2026-08-07.** Decided: cache rather
      than bundle. `strokeData.js` wraps the library's loader cache-first
      against IndexedDB, so any character viewed once animates offline and
      repeat views stop hitting the CDN — without adding megabytes of stroke
      JSON to the app. Fully best-effort (blocked storage, failed write, 404,
      no network all fall back to the previous behaviour). 7 specs.
- [ ] **localStorage/IndexedDB persistence** in the app context — durable
      data is in Supabase by design, so eviction is survivable; just verify
      prefs/caches degrade quietly (the guards in §6.5 already exist).

### 0d · Accounts, signing, pipeline (owner + code)

- [ ] **Google Play Console** account ($25 one-time) — owner.
- [x] **Apple Developer Program** ($99/yr) — owner. *Approved 2026-08-07.*
      Needed for Apple sign-in config too (0b).
- [ ] **Android signing**: generate + safely store the upload keystore
      (GitHub secret + offline backup — losing it means losing the listing).
- [x] **iOS signing + build lane** — *done 2026-08-07, build 7 is on
      TestFlight.* Lane: GitHub Actions macOS runner
      (`.github/workflows/ios-testflight.yml`). Nobody needs a Mac.

      Read this before touching it, because the obvious approach does not
      work: under **automatic** signing `xcodebuild archive` asks Apple for an
      iOS App *Development* profile, and Apple refuses to issue one to a team
      with no registered devices. There is no iPhone on the account to
      register, so automatic signing can never succeed here — and the error it
      produces ("your team has no devices") describes the symptom, not that.
      The build therefore signs **manually**: openssl makes a key and CSR on
      the runner, `.github/scripts/asc-signing-assets.mjs` turns that into a
      distribution certificate and an App Store profile through the App Store
      Connect API, and both are imported into a throwaway keychain.

      Two things that will bite otherwise:
      - The script **revokes** existing distribution certificates before making
        a new one, because their private keys died with the runner that made
        them and Apple caps how many a team may hold. That is safe only while
        nobody owns a Mac holding a real certificate. If that changes, change
        the script.
      - The job runs on **macos-26**. App Store Connect rejects any build made
        with an SDK older than iOS 26, and macos-15 tops out at Xcode 16.
        A build on the old image signs and exports perfectly, then fails at
        the upload — an expensive way to find out.

      Run `Actions → iOS signing check` for a read-only inventory of what the
      Apple account actually has (certificates, devices, profiles, bundle IDs)
      whenever provisioning misbehaves.
- [ ] **CI**: add `cap sync` + Android AAB build to Actions; keep the
      existing lint/test/build/e2e exactly as they are (they test the same
      code the apps ship).
- [ ] **Versioning + release process**: versionCode/build-number bumping,
      internal testing tracks (Play internal + TestFlight), and a written
      release cut procedure — "merged to main" no longer means users have it.
      Evaluate a JS-bundle OTA service (e.g. Capgo) later for hotfixes; not
      needed for launch.
- [ ] **Store listings** — **copy drafted 2026-08-07 in
      [`docs/STORE-LISTING.md`](STORE-LISTING.md)**: name, subtitle, short and
      full description, keywords, "what's new", the screenshot shot list, the
      App Review notes (incl. the exact account-deletion steps reviewers look
      for) and every Play Data Safety answer. **Owner: review and edit the
      wording, then paste into the consoles.** Still to do by hand: capture
      the screenshots on a real device *after* §4 verification, and produce
      the 1024×500 feature graphic.
- [ ] **Announce the pivot in `ROADMAP.md` when ready** — deliberately not
      done in this change: editing the roadmap posts to Discord instantly, so
      the owner chooses the moment and the wording.

## 1 · Code quality — now in service of the app

The webview ships these screens, so every pass below is store-launch work.

- [x] **Navigation/loading/shell pass (HD-P5) — DONE 2026-08-07.** Full
      screen-by-screen audit, then 12 fixes: a failed profile/track
      bootstrap shows a retry screen instead of dropping an existing learner
      into Onboarding (and a throw can't strand the splash); Home no longer
      claims "all caught up" when the queue fetch failed; the Test screen
      gained its back button, CTAs on all three dead-end states, an honest
      error state and an empty-pool crash guard; YouTube/Writing/Stories
      distinguish "couldn't load — Retry" from genuinely empty; a dead
      /story/:id link resolves with a toast; Settings reverts + reports
      failed preference writes and got its missing back button;
      LanguageSwitcher no longer navigates Home on a failed switch. Screens
      audited clean: Practice, Dictionary, Dashboard, Study, Grammar, Auth,
      all drills, public pages. Lint at main's exact baseline.
- [x] **Accessibility sweep (HD-P13) — DONE 2026-08-07.** Full audit, then
      fixes in three areas. *Drills:* every practice screen (Speaking,
      Listen, FillBlank, Cyrillic, GrammarPractice, Kana, SentenceBuilder,
      ComprehensionCheck, Test) announced nothing when you answered —
      correctness was colour + a tick — and dropped keyboard focus by
      disabling the options; all now announce the verdict AND the correct
      answer from an always-mounted live region, with `aria-disabled`.
      *Dialogs:* the finish overlay had no dialog semantics at all, and
      StoryReaderImmersive never imported the focus helper (its lookup
      popover left focus on the token; its sheet claimed `aria-modal` with
      focus outside); both fixed, plus traps on MobileNav's sheet and
      Feedback. *Structure:* real `<nav>` landmarks, toast container always
      mounted as a live region, InfoTip proper dialog + derived name, chat
      tokens keyboard-reachable, invalid `role="menu"` dropped, `<h1>` per
      drill, progressbar roles, announced loading states, visible skip-link
      focus ring. **`lang` is now per-language data** (`langAttr()` in
      `languageTheme.js`, 4 specs) and applied across the study screens —
      without it a screen reader speaks hanzi with the English voice.
      **Second pass, 2026-08-07 — the deferred items are now done too:**
      selected state is exposed on every custom toggle and chip (mode
      switches, filters, category chips, kana view/script/row pickers,
      the shared `Segmented` control, dashboard filters, writing round size)
      via `aria-pressed` inside labelled groups, with `role="radio"` reserved
      for the two Onboarding "choose one, then Continue" card pickers. Three
      candidates were deliberately **not** changed — the Landing, Tones and
      Cyrillic cards fire an action and advance immediately, so they have no
      selected state to expose. Also: `aria-expanded` + `aria-controls` on
      the grammar accordion (and the same bug found on the KnownWords level
      accordion), locked story **and series** cards keep their place in the
      tab order via `aria-disabled` so their "what unlocks this" label is
      finally reachable, the stroke-order tile got `role="img"` so its label
      is exposed at all, and YouTube's decorative glyphs are hidden, its
      load error is a `role="alert"`, and the inline player takes focus when
      it opens. *Still open:* axe-in-e2e (§5), and the radiogroups don't
      implement APG roving-tabindex arrow keys — WCAG-passing, APG-advisory,
      and a behaviour change rather than a semantics one.
- [x] **Mobile sweep (HD-P13) — DONE 2026-08-07.** Audit + fixes. Worst
      find: all four fixed-format story readers put play/pause and next
      **below the visible screen on every phone** (a `100vh` shell inside a
      `<main>` that already reserves the nav height, plus a duplicated
      safe-area inset) — they now share Study's `MOBILE_SHELL_HEIGHT`.
      Also: the two chat readers violated the `min-height: 0` flex-scroll
      rule; nothing but the manhua header handled `env(safe-area-inset-top)`
      despite `viewport-fit=cover` being live; overlay sheets hinged to the
      *large* viewport (the bug that once hid a chat overlay's bottom);
      ~20 touch targets were 19–40 px; grids never collapsed on a phone
      (the 5-across tone drill); answer text sat at 9–10 px; Auth/Onboarding
      had no mobile padding branch; four inputs were under 16 px, which
      makes WKWebView zoom on focus; and calendar/accuracy detail existed
      only in `title=` tooltips, i.e. nowhere on a touch device.
- [x] **Performance pass (HD-P13) — DONE 2026-08-07.** Home's six sequential
      round trips became three: profile + tracks now go out together, and so
      do cards + the week's activity + grammar-due, leaving only the
      vocabulary query (which needs the cards' study floor) to follow.
      Returning to Home no longer refetches the dashboard after a read-only
      detour (`homeRefresh.js`, conservative by design: unknown screens
      refetch, plus a staleness ceiling and a local-midnight check). Font
      diet: Noto Sans JP left the base stylesheet — a full CJK family that
      only the paused track's screens use — and loads on demand instead.
      **Deliberately NOT done:** a server-side Home RPC. It would have to
      reimplement FSRS due-dates in SQL and could then disagree with the
      client, breaking the one-definition-per-number rule
      (`docs/METRICS.md`); the parallelisation gets most of the win with
      none of that risk.
      *Still open (post-launch, §5):* self-hosting the fonts so a cold
      start doesn't depend on Google Fonts — worth doing for the app, where
      the network is least reliable.
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
- [x] **Timezone-correct reminders — ALREADY DONE (verified 2026-08-07).** The
      ~1 h DST drift was fixed before this milestone: `reminderSchedule.js`
      decides per-user from `profiles.timezone` with a `reminder_last_sent_at`
      guard, and all four columns exist in prod. The checklist entry was
      stale. **But: 0 of 31 accounts have reminders enabled**, so what remains
      is a product question (discoverability / the browser permission prompt),
      not engineering — and the delivery mechanism changes anyway when push
      moves to FCM/APNs (§0b).

## 2 · Owner / dashboard actions

- [x] **🔴 Azure secrets + the 21-word audio regen — DONE 2026-08-07.** The
      owner added `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`; the staged
      `tts-flashcards` run then executed (dry run verified 21 records/84
      clips, confirm run generated 84/84, 0 failures, 240 characters) and
      all 84 rows are verified in `tts_audio`. The mispronounced words
      (厂 合 约 胖 追 圈 广 抢 藏 匹 保 台 土 朝 美 诗 神 青 井 清 塞) now
      play correct Azure audio. HSK 3–6 slow/sentence audio is also
      unblocked (a per-level `tts-flashcards` pass, when wanted).
- [ ] **🔴 Funded LLM key** (`ANTHROPIC_API_KEY` secret, or paid Gemini/Groq)
      — unblocks HSK 3–6 serial-story generation.
- [ ] **Supabase Auth URLs** — Site URL `https://hanzi-dojo.com`, allowlist
      `https://hanzi-dojo.com/**` + `http://localhost:5173/**` **+ the app
      deep-link scheme from 0b**.
- [ ] **SMTP live test** — magic link arrives from `no-reply@hanzi-dojo.com`,
      not spam.
- [ ] **Google OAuth branding** — Google Cloud Console → APIs & Services →
      OAuth consent screen: app name **"Hanzi Dojo"**, logo, authorized
      domain `hanzi-dojo.com`. **Decided 2026-08-07: free fix only** — the
      `auth.hanzi-dojo.com` custom domain (~$10/mo add-on) is deferred, so
      the callback stays `bvqvturqupbggxaeihvi.supabase.co` and every
      provider is configured against that. Changing it later means redoing
      the Apple Services ID + its domain verification too.
- [ ] **Disconnect the two always-red Cloudflare "Workers Builds" checks.**
- [ ] **Turn off the retired GitHub Pages site.**
- [ ] **Trust-pages sign-off** — review `/privacy` `/terms` `/support`
      `/methodology`; they become *legally load-bearing* store URLs (0b), so
      this is no longer optional polish.
- [ ] **Enable leaked-password protection** (Supabase Auth → Security —
      checks passwords against HaveIBeenPwned; flagged by the security
      advisor 2026-08-07, one toggle).
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
