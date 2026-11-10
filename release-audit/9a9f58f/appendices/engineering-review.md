# Engineering / delivery / native / store review (ENG-*)

The reviewer couldn't write this file, so this is the lead's transcription of its hand-back report. The lead re-checked ENG-01, ENG-02 and ENG-03 against the workflow files and the CI logs.
Ledger: `ledgers/eng-ledger.txt`. Evidence: `../evidence/splash-vs-icon.png`.

## Findings
- **ENG-01 · High** · H · static-complete-path. Both store builds use `build:public`, not `build:native`.
  - **Refs:** `.github/workflows/ios-testflight.yml:116`, `.github/workflows/android-build.yml:59`.
  - **Effect:** `index.html:22-28` keeps the Google Fonts tags, so the apps fetch fonts from Google on cold launch.
  - **Consequences:**
    - `/privacy` says the opposite: "The iPhone and Android apps … never contact Google for them" (`src/TrustPages.jsx:216-217`).
    - PRIVACY-AUDIT.md:208 says "F4 FIXED".
    - `verify:native` checks a bundle that never ships.
    - `native-ci-contract.test.mjs` does not pin the store build command.
  - **Lead re-check:** confirmed by grep of both workflows and `index.html`.
- **ENG-02 · High** · H · static + CI history. `android-build.yml:58-59` builds without `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`.
  - **Effect:** the bundle would render the "Site can't start" card (`src/supabase.js:4-28`). iOS fixed this same bug at `ios-testflight.yml:95-123`.
  - **Build history:** the only Android run ever (31246394419, 2026-08-08) produced an unsigned debug APK. No signed AAB has ever been built.
  - **Lead re-check:** confirmed by grep.
- **ENG-03 · High** · H · CI logs. TestFlight is blocked.
  - **Failed runs:** 42547830386 and 42549643275 (2026-11-09).
  - **Error:** `GET certificates → HTTP 403: … Account Holder must agree to the latest Program License Agreement`.
  - **Last good build:** 2026-08-16 (97c9f3a).
  - **Fix:** owner action, about 5 minutes. The Account Holder's personal name is deliberately left out of this report.
- **ENG-04 · Medium** · H. The Play web deletion page (`/support`, `TrustPages.jsx:441-450`) still lacks what is deleted or kept, and the retention period.
  - RELEASE-BLOCKER-REMEDIATION.md:25 still says "not shipped", and that is still true.
  - STORE-LISTING's App Review note cites `/profile`.
  - In-app deletion itself exists and is applied.
- **ENG-05 · High (public)** · M · suspected. There is no evidence that an App Review demo account exists (RELEASE-BLOCKER-REMEDIATION.md:28,327). External TestFlight needs one too. It is not verifiable without reading auth rows, which was out of scope.
- **ENG-06 · Medium** · H. The iOS target declares iPad (`TARGETED_DEVICE_FAMILY "1,2"`, pbxproj:318,339) and iPhone landscape (Info.plist:65-77). Android is portrait-locked (Manifest:16).
  - No iPad testing or screenshots are planned, but App Store Connect will require iPad screenshots.
- **ENG-07 · Low** · M. Android has `allowBackup="true"` with no extraction rules, so WebView storage (session tokens, the offline outbox) goes into Google backups.
- **ENG-08 · Medium** · H. There is no release-cut discipline.
  - Store workflows can be dispatched from any branch. iOS run 31874626411 built from `codex/home-v3-final-craft`.
  - Nothing requires green CI or a tag first.
  - The version is hardcoded 1.0, and no bump process is written down.
  - Android release signing silently falls back to unsigned (`build.gradle:45`).
- **ENG-09 · Medium** · M · suspected. Backup, restore and rollback are unproven.
  - The Supabase plan and point-in-time recovery are unknown.
  - DEPLOY.md has no rollback section, and there is no uptime check.
  - Production records 29 migrations against 68 repo files, with different timestamps, so the production schema can't be rebuilt from the repo.
- **ENG-10 · Medium** · H. Database logic (grade_card, RLS, account deletion) is tested only by regex over the SQL text (`gradeCardStaleReplay.test.mjs:8-14`). CI has no Postgres.
  - `Study.jsx` is 1,755 lines and `StoryReaderImmersive.jsx` 1,811.
- **ENG-11 · Low** · H. Stale doc claims in PRE-RELEASE-CHECKLIST.md:
  - :320-321 says devTools.js writes `is_easy`/`ease_factor`. False.
  - :322-324 says the old StoryReader is dead code in Stories.jsx. It is gone.
  - :14-27 still lists deletion and Apple sign-in as failing. Both are done.
  - :41-44 says the app build is `build:public`. This is the root of ENG-01.
  - Still really open: `creativeMode.js:128,137,178` writes `reps` by hand.
- **ENG-12 · Low** · M. `App.entitlements` isn't referenced in pbxproj; only the CI command line adds it (`ios-testflight.yml:247`). Any other archive would lose Sign in with Apple.
- **ENG-13 · Low** · M. The native splash still shows the pre-V2 mark. `drawable-night/splash.png` is 320×240 against 320×480 for the day version.
- **ENG-14 · Low/Info** · H. Known gaps:
  - No native push.
  - No universal-link `.well-known` files.
  - No source maps or native crash reporting.
  - `gradle-wrapper.jar` is not checksum-checked.

## Confirmed OK
- **Android:**
  - targetSdk/compileSdk 36. The Play API-36 deadline (2026-08-31) came from a web search; Play pages were blocked, so confirm it in the Play Console.
  - Only the INTERNET permission is requested.
  - FileProvider is not exported, and there is no cleartext traffic.
  - Icons are complete at every density, including monochrome.
- **iOS:**
  - The privacy manifest is in the Resources phase, with the UserDefaults CA92.1 reason.
  - `ITSAppUsesNonExemptEncryption` is false.
  - No microphone key is needed, because speech is disabled in the apps.
  - Icons are 1024 px RGB with no alpha, in light, dark and tinted.
- **Shell:** the Android back button and cold-start deep links are handled.
- **Secrets:** no credentials are committed. `.env.e2e` and `.env.test` hold mock values.
- **Binaries:** all 478 binaries have valid signatures for their extensions, and none is a credential.

## Coverage
- 20 files reviewed in full and 23 skimmed.
- 106 not reviewed (time budget): root content/protocol tests, scripts and remaining docs.
- 110 excluded as historical specs or vendored skills.
- 478 binaries checked by script.
- No Gradle or Xcode build and no device run.
- Policy sources:
  - Apple App Review Guidelines were fetched on 2026-11-09.
  - Google Play policy pages were blocked by the sandbox network. Confirm them by hand.
