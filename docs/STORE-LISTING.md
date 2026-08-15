# 🏪 Store listing — draft copy and review notes

**Draft, 2026-08-07. The owner edits this; nothing here is final.** Written to
be filled into Google Play Console and App Store Connect when those accounts
exist (`docs/PRE-RELEASE-CHECKLIST.md` §0d).

Two rules this copy follows, and any edit should keep:

- **Every claim must be true today.** The public-beta hardening milestone
  exists because the product had claims that weren't (a "60-second" test that
  took three minutes). No "AI tutor", no "fluent in N months", no invented
  user counts, no "official HSK certification" — the level test is an internal
  mastery gate and the word lists are curated HSK-3.0-**aligned** study sets
  (`docs/PM-BOARD.md` HD-P3, decided).
- **No streaks, no guilt.** The listing should sound like the app: calm,
  factual, and about reading real Chinese. Don't borrow the gamified language
  every competitor uses — that mechanic was deliberately removed.

---

## Identity

| Field | Value |
|-------|-------|
| App name | **Hanzi Dojo** |
| Bundle / package ID | `com.hanzidojo.app` |
| Category | Education (secondary: Reference) |
| Price | Free, no in-app purchases, no ads |
| Support URL | `https://hanzi-dojo.com/support` |
| Support email | `support@hanzi-dojo.com` — Play requires a contact email on the listing; App Store review may email it too. Same address the trust pages show. |
| Privacy policy URL | `https://hanzi-dojo.com/privacy` |
| Marketing URL | `https://hanzi-dojo.com` |

## Short description (Play, 80 chars max)

> Learn to read Chinese with spaced repetition and stories at your level.

*(70 characters.)*

## Subtitle (App Store, 30 chars max)

> Read real Chinese, sooner

*(25 characters.)*

## Full description (Play, 4000 chars max — also the App Store description)

> **Hanzi Dojo teaches you to read Chinese, using the two methods that
> actually work: spaced repetition and reading material matched to what you
> already know.**
>
> Most apps drill you forever without ever handing you something real to read.
> Hanzi Dojo does the opposite: you learn words with a proper memory engine,
> and the stories you can read come to you — no hunting for material at your
> level, no dictionary marathon, no wall of text you're not ready for.
>
> **A calm daily loop**
> Review the words that are due. Read a story built from words you know. Tap
> anything unfamiliar to hear it, see it, and add it to your deck. That's it —
> usually under fifteen minutes.
>
> **A memory engine, not a guessing game**
> Scheduling uses FSRS, the same modern algorithm serious learners use
> elsewhere. Words come back exactly when you're about to forget them, and
> nothing advances on a self-graded button — progress is gated on genuinely
> remembering.
>
> **Over 200 graded stories**
> Every story tells you what percentage of its words you already know before
> you open it. There are drawn comics (manhua) with tappable dialogue, chat
> stories, picture-book scenes, and multi-chapter serials that follow the same
> characters as you climb the levels. Every line has audio and an English
> translation a tap away.
>
> **Built for HSK 3.0, levels 1–6**
> Around 5,000 words with native-quality audio, example sentences and a
> 120,000-entry dictionary with stroke-order animations. Levels unlock when
> you've earned them.
>
> **No streaks. No leagues. No guilt.**
> There is no chain to break and no daily counter shaming you. Miss a week and
> nothing is lost — the schedule simply catches up. The reason to come back is
> that the work is waiting, not that an app is nagging you.
>
> **Works offline**
> Review and read on a plane or underground; your answers sync when you're
> back.
>
> **Free.** No subscription, no paywalled features, no ads.

*(~1,900 characters — comfortably inside both limits.)*

## Keywords (App Store, 100 chars, comma-separated, no spaces)

> chinese,mandarin,hsk,hanzi,flashcards,spaced,repetition,reading,pinyin,characters,vocabulary,study

*(98 characters. "Hanzi Dojo" itself is excluded — the app name is already
indexed, so spending keyword characters on it is waste.)*

## What's new (first release)

> First release. Learn Chinese vocabulary with FSRS spaced repetition, read
> over 200 stories matched to the words you know, and practise with listening,
> writing, speaking and grammar drills. Free, offline-capable, no ads.

## Screenshots — the shot list

Six, in this order (the first two are what most people actually see):

1. **A story mid-read**, with one word tapped open — this is the product's
   whole differentiator in one image. Caption: *"Stories you can actually read"*.
2. **The Stories shelf**, showing the "% known" pills. Caption: *"Every story
   tells you how much you'll understand"*.
3. **A flashcard revealed**, with the four grade buttons. Caption: *"A memory
   engine that knows when you'll forget"*.
4. **A manhua panel** with a speech bubble. Caption: *"Read comics in Chinese"*.
5. **Home**, showing the calm queue. Caption: *"About fifteen minutes a day"*.
6. **The dictionary entry** with stroke order. Caption: *"120,000 words, with
   stroke order"*.

Sizes: iPhone 6.7" and 6.5"; Android phone plus a 7" and 10" tablet if the
listing offers tablet slots. Capture on a real device AFTER the mobile pass is
verified there (`docs/PRE-RELEASE-CHECKLIST.md` §4) so the screenshots show the
shipped layout, not the pre-fix one.

**Feature graphic (Play, 1024×500):** the ensō mark on the app's own light
background with the wordmark — no screenshot collage, no marketing gradient.

---

## App Review notes (paste into App Store Connect → Notes for Review)

> **Demo account**
> Email: `playreview@hanzi-dojo.com`
> Password: `<owner: the password you set at signup — paste it in the console,
> never commit it here>`
>
> The account is pre-seeded so nothing needs to be studied before the app is
> usable: it already has vocabulary in review, unlocked stories, and a level in
> progress.
>
> **What the app does**
> Hanzi Dojo teaches reading in Chinese. The daily loop is: review flashcards
> (scheduled by the FSRS algorithm) → read a short story built from words the
> learner knows → optional practice drills.
>
> **Account deletion (guideline 5.1.1(v))**
> Sign in → **Profile** (bottom navigation) → scroll to **Delete account** →
> tap it, type `delete` to confirm. This permanently removes the account and
> all its data immediately. The same flow is available on the web at
> https://hanzi-dojo.com/profile.
>
> **Sign in with Apple**
> Offered alongside Google sign-in and email/password.
>
> **Speech recognition**
> The Speaking drill is hidden inside the app because iOS's web view does not
> provide speech recognition; no microphone permission is requested.
>
> **Content**
> All stories are written or reviewed in-house for language learners. The
> bundled dictionary is CC-CEDICT, an open dataset that contains some entries
> marked explicit; those are hidden by default behind a per-search reveal,
> which is why the age rating is set as it is.
>
> **Third-party data**
> No advertising SDKs and no third-party analytics. Accounts and learning data
> live in Supabase (Postgres); error reports contain an error name, a truncated
> message and a route — never typed text or stack traces.

## Play Data Safety — the answers

| Question | Answer |
|----------|--------|
| Collects data? | Yes |
| Email address | Collected, for account management. Not shared. Required. |
| Name / phone / address | Not collected |
| App activity (learning progress, screens visited) | Collected, for app functionality and analytics. Not shared. |
| Crash / diagnostic | Collected (privacy-safe: error name, truncated message, route). Not shared. |
| Audio | **Not collected.** Speech recognition, where available, is processed by the browser and never recorded or uploaded. |
| Location, contacts, photos, files | Not collected |
| Data encrypted in transit | Yes |
| Can users request deletion? | Yes — in-app, and at https://hanzi-dojo.com/profile |
| Data shared with third parties | No |

**Age rating:** answer honestly that the bundled dictionary can surface
explicit language on an explicit search (hidden behind a reveal by default).
Expect Teen / 12+ rather than Everyone / 4+ — and that is the correct outcome,
not something to argue down.
