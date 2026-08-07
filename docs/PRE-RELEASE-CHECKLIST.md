# ✅ Pre-release checklist — everything missing before launch

**One-time launch list, compiled 2026-08-07.** This is *not* the per-merge gate —
that lives in [`docs/RELEASE-CHECKLIST.md`](RELEASE-CHECKLIST.md) and still runs on
every PR. This file collects every open item across `docs/PM-BOARD.md`,
`docs/BACKLOG.md`, `ROADMAP.md`, `docs/TESTING.md` and `TASKS.md` into one list,
ordered so we can work top to bottom. Check items off here as they land; delete
the file (or archive it in `docs/CHANGELOG.md`) once we ship.

**Baseline verified 2026-08-07 (this session):** `npm run lint` 0 errors /
7 known warnings · `npm test` 3,054/3,054 across 129 files · build clean.
Also verified against prod: `grade_card` RPC, `public_story` RPC,
`writing_stats`, `story_questions`, `tts_audio` and the prefs columns **all
exist** — the "pending migration" entries in older docs are stale; those are
done.

---

## 1 · Code — release blockers

Things a coding session can finish, no credentials needed.

- [ ] **HD-P5 — Navigation / loading / learner shell pass.** The one milestone
      phase never started. Reassess against the current app (much has shipped
      since the brief): route transitions, loading states on every screen,
      no dead ends, back behavior. (`docs/PM-BOARD.md` HD-P5)
- [ ] **Accessibility pass (HD-P13).** Finish the a11y audit started 2026-08-01:
      keyboard reach on every interactive control, focus traps on all dialogs,
      contrast in both themes, `aria-live` where state changes silently. The
      known WCAG items are done; this is the systematic sweep.
- [ ] **Mobile pass (HD-P13).** Every screen at 360–390 px: no horizontal
      overflow, 44 px touch targets, safe-area insets, the `min-height: 0`
      flex-scroll rule (CLAUDE.md §5) everywhere it applies.
- [ ] **Performance pass (HD-P13).** At minimum: Home bootstrap RPC (replace
      the 4-query load waterfall, stop refetching on every return to Home) and
      the bundle/font diet (load only the active language's font family).
      (`ROADMAP.md` §Technical)
- [ ] **Auth error-path e2e (HD-P11).** Playwright coverage of the common
      signup/login failures (wrong password, existing account, weak password,
      network error) — the copy shipped, the e2e didn't.
- [ ] **HD-P12 leftovers.** Profile number scoping labels (every number says
      what it counts), achievements determinism audit, Dojo HQ audit trail.
- [ ] **HD-P11 leftovers.** Suggested first story on the reading-test result;
      verify the share-flow feedback actually fires.
- [ ] **`src/devTools.js` rule violations.** `/unlock` writes `is_easy: true`
      and `ease_factor` — both banned (§7.3, §10). Port it onto
      `src/creativeMode.js`, which does the same job correctly.
      (`docs/BACKLOG.md` §Admin tooling)
- [ ] **Dead code: old `StoryReader`** (+ `CharacterGuide`/`StoryLine`/sidebar
      cards) in `Stories.jsx` — both readers are unified on
      `StoryReaderImmersive.jsx`; delete in a cleanup pass.
- [ ] **Deletable legacy shims** (post-migration, verified applied):
      `presentationOf` alias in `src/readerMode.js`; the IndexedDB
      `LEGACY_PROGRESS_PREFIX` fallback in `src/manhuaProgress.js` can stay a
      while longer as cheap insurance. (`docs/BACKLOG.md` §Database)
- [ ] **Dictionary polish (small):** 得-particle pinyin in examples renders
      `dé` where neutral `de` is wanted; CC-CEDICT proper-noun pinyin
      (Běijīng) displays lower-cased in `src/cedict.js`.
- [ ] **Migration hardening:** add `drop policy if exists` to `20260719120000`
      and the partial unique index on `vocabulary` (bounds concurrent
      dictionary-word inserts). (`docs/BACKLOG.md` §Reference dictionary)
- [ ] **Timezone-correct reminders.** `send-review-reminders.mjs` fires on a
      plain UTC hour (~1 h DST drift). Schedule per user timezone.

## 2 · Owner / dashboard actions — secrets, config, money

No coding session can do these; they need dashboard access or billing.

- [ ] **🔴 Add `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` as Actions secrets.**
      Blocks two things: the 21 single-character words still *spoken* with the
      wrong reading (regen is staged: `tts-flashcards`, `tts_ids` list in
      `docs/BACKLOG.md` §Learning quality), and any HSK 3–6 slow-word/sentence
      audio.
- [ ] **🔴 Fund an LLM key** (Anthropic key as `ANTHROPIC_API_KEY` secret, or
      paid Gemini/Groq) — unblocks the serial-story generator for HSK 3–6
      volume. Until then the hand-authored lane is the only content path.
- [ ] **Supabase Auth URL config:** Site URL `https://hanzi-dojo.com`, redirect
      allowlist `https://hanzi-dojo.com/**` + `http://localhost:5173/**` —
      fixes login redirects landing on the raw github.io host.
- [ ] **Custom SMTP live test:** send a real magic link to an external inbox;
      confirm it arrives (not spam) from `no-reply@hanzi-dojo.com`.
- [ ] **Google OAuth branding:** set app name "Hanzi Dojo" + logo + authorized
      domain in Google Cloud Console (free, biggest win); optionally the
      Supabase custom domain `auth.hanzi-dojo.com` to remove the
      "continue to …supabase.co" line.
- [ ] **Disconnect the two Cloudflare "Workers Builds" checks** (dashboard:
      Workers & Pages → hanzi-dojo + hanzidojo → disconnect repo). Red that
      means nothing trains everyone to ignore red.
- [ ] **Turn off the retired GitHub Pages site** (repo Settings → Pages →
      Source → None).
- [ ] **Trust pages sign-off:** `/privacy` `/terms` `/support` `/methodology`
      are owner-reviewed drafts — review and remove the beta note before a
      wider push.
- [ ] **Run the Supabase security advisors** (`get_advisors`) one final time
      before announcing — an unprotected table sat exposed for two days once.
- [ ] *(optional)* Groq/Gemini quota day to fill the last **25 HSK 6 example
      sentences** (Actions → `examples-fill`, level 6).

## 3 · Content & editorial

- [ ] **🔴 Chinese editorial sign-off (HD-P9) — needs a qualified Chinese
      reviewer.** Blocked for a coding session by design: the 14 grammar-guide
      topics and published stories must not be self-certified by Claude.
- [ ] **Eight published HSK 1–3 stories sit under their level's coverage bar.**
      Decision needed on `在动物园` (65%), `下雨天` (64%), `我的早上` (74%);
      the marginal five may just need a word swapped. List + offending words in
      `docs/BACKLOG.md` §Content.
- [ ] **`1. 不见了的苹果` held season (2–6)** still tells the older *flowers*
      version of the mystery — rewrite one side to match before publishing
      (owner decided: leave for a content session). (HD-P4b)
- [ ] **Held-chapter gaps:** L3 `田里的田螺` (6–12 held) and L3 `老王的眼镜`
      (7–12 held) are each missing most of a season; L2 `兔子` (6 held). Run an
      editorial `publish-held` pass or decide to hold them deliberately.
- [ ] **Six older chat/scene stories have no per-line English** — verify that's
      by design for those formats before "fixing" (HD-P7).
- [ ] **Wire the HSK 1 pool into `authoredStories.test.js`** — must land in the
      same change that resolves the under-bar HSK 1 stories above (the test is
      absolute and would fail them today).
- [ ] **Run `check-published` (Actions → Content utilities) as final content
      gate** and actually read its warnings.
- [ ] *(deferred, noted)* Four small letterbox bars in the two shipped Inkbound
      episodes — fix next time those episodes are touched anyway.
- [ ] *(volume, not a blocker)* More stories per level; HSK 3–6 serials once
      the LLM key exists; more manhua episodes.

## 4 · Verification — real device + real account

The single biggest gap: **everything below is built and unit-tested but has
never been exercised on a live device.** This is `docs/RELEASE-CHECKLIST.md` §6.

- [ ] **Real-device manual pass per `docs/TESTING.md`** — all 16 open items,
      especially: iOS Safari flashcard + reader audio, the Chinese polyphone
      spot-check (长 行 银行 重 觉 — also the top item in `TASKS.md`), offline
      grade replay, Web Push reminders end-to-end.
- [ ] **Fresh-account walkthrough:** signup → onboarding → first session →
      first story → reset a language from Profile (confirm the reset completes
      and a writing answer persists after reload).
- [ ] **HSK 3–6 as a learner:** study, level test, placement — the new levels'
      full loop on a real account.
- [ ] **Creative mode against a real account** (`/dashboard` sandbox —
      especially level jump, which appends to append-only `level_unlocks`).
- [ ] **Dojo HQ end-to-end** with a second admin account.
- [ ] **Email + OAuth checks** from `docs/TESTING.md` (`email-sender`,
      `oauth-branding`) — after the §2 dashboard items land.

## 5 · Explicitly post-release (do not block launch)

Tracked so nobody re-litigates them at the gate:

- FSRS parameter tuning (needs real `review_logs` volume).
- Global word-status model; server-authoritative progression;
  data-cache normalization; centralized data layer; Supabase generated types.
- "Read next" weighted by slipping words; graded YouTube; custom flashcards /
  import; pictures on flashcards; HSK 7–9.
- Continue extracting `Study.jsx` / `DojoHQ.jsx` / `StoryReaderImmersive.jsx`
  logic into tested modules.
- Axe a11y checks in e2e (new dependency).
- Drop the dead `profiles` XP/streak columns.
- HD-P15 differentiation work — starts only after the release gate is healthy.

---

**Suggested order:** §1 code items in parallel sessions → §2 owner actions in
one dashboard sitting → §3 editorial (the Chinese reviewer is the long pole —
start recruiting now) → §4 verification last, on the finished build → launch.
