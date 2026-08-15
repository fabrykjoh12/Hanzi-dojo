# Hanzi Dojo — Deep Competitive Analysis

*2026-08-08. Research doc, not a decision log. Supersedes the market-scan half of
`2026-07-18-competitive-analysis.md`; that doc's monetization sketch is untouched here.*

**How this was produced:** full codebase inspection (every route, screen, and learning
system read in source, not assumed from file names), a digest of the product docs, and
four independent web-research sweeps: Chinese-specific apps, general language apps +
adjacent products, AI tutors + adaptive engines, and real user complaints + onboarding
science. Claims from single secondary sources are flagged in the underlying research;
everything stated as fact about Hanzi Dojo itself was verified in code at HEAD `0a26857`.

---

## 1. Executive Summary

**Where Hanzi Dojo stands:** the product thesis — FSRS spaced repetition feeding
level-matched, curated story immersion, free, calm, no dark patterns — is not just
defensible, it sits **precisely in the intersection of the three biggest unsolved
complaints in the market**: SRS without avalanche anxiety or setup burden (Anki's
failure), vocabulary that actually reappears in content (every flashcard app's failure),
and consistency without coercion (Duolingo's failure). No competitor occupies this
intersection. Du Chinese grades content but doesn't know what *you* know; Hack Chinese
knows your memory state but has no content; Migaku models the learner but on wild,
uncurated content; Duolingo has scale and habit science but is now actively resented for
gamification-without-learning, energy paywalls, and AI-slop content. **The strategy is
sound. The execution has specific, fixable holes.**

The honest three-sentence verdict:

1. **The core engines are better than the competition's** — correct FSRS v5 (no major
   Chinese app verifiably ships FSRS), one canonical tested %-known engine shared by
   every surface, an honest 21-day-stability mastery gate, and a professionally built
   TTS pipeline. These should be protected and *marketed*, because today they are
   invisible.
2. **The product around the engines is thinner than it looks**: one flashcard type
   (recognition only), no character decomposition in an app called *Hanzi* Dojo, no tone
   or pronunciation feedback worth the name (and none at all in the store builds),
   comprehension questions that exist for a fraction of the library and gate nothing,
   six divergent reader implementations with no deep links, and an onboarding that
   collects level/purpose/pace and then throws three of the four answers away.
3. **The differentiator is within reach and nobody else can copy it cheaply**: the
   closed loop where doing your reviews *visibly* makes the next chapter of a serial
   readable. The pieces all exist — FSRS state, the readability engine, cliffhanger
   serials with a recurring cast — they are just not yet wired into one loop the user
   can feel.

The rest of this document is the evidence and the plan.

---

## 2. What the Best Language Apps Do Right

Patterns that recur across every successful product, with the mechanism named:

**P1. Delay every ask until after the first win.** Duolingo's only universally admired
trick: language pick → motivation → goal → *a real lesson, still anonymous* → only then
signup. Moving signup after the first lesson raised DAU ~20% (their own published A/B).
Notification permission is asked only when there's something to protect. Mechanism:
endowed progress + commitment/consistency — after investing effort, abandoning at the
wall feels like a loss. *Hanzi Dojo already does the first half of this well; the seam
is after signup (§10).*

**P2. Make the return trip specific, not generic.** The best retention hooks name the
thing waiting: "18 reviews come due tomorrow", "Chapter 7 is ready." Streaks work by
loss aversion; the calm-compatible substitute is *appetite* — Webtoon's cliffhanger,
Kindle's "pick up where you left off". Mechanism: Zeigarnik effect (open loops are
mentally sticky) without a resettable counter.

**P3. Display memory state, not content consumed.** Hack Chinese's strong/weak-memory
bars and LingQ's known-words count out-motivate XP because they're *real* — identity
("I know 900 characters") beats score ("I have 9,000 points"). A completed-lessons bar
is a vanity metric; a strong-memory count is a competence metric.

**P4. Feedback at the moment of error, scoped to the error.** HelloChinese's per-sentence
speech feedback, Skritter's per-*stroke* grading, LingoDeer's grammar note at point of
need, Duolingo's Explain My Answer (popular enough they made it free). Mechanism:
corrective feedback works when it's immediate, specific, and doesn't interrupt flow —
apps that defer detail to a post-session review score better than ones that interrupt.

**P5. Reduce extraneous cognitive load in the reading surface.** Du Chinese is the
category benchmark because every friction point is removed: sentence-synced audio
highlighting (binds sound to text), tap-lookup with *context-correct* definitions (no
dictionary detour), pinyin as removable scaffolding, tone colors as free incidental
exposure, serialized re-exposure of new vocab across chapters.

**P6. One number the learner steers by.** Duolingo Score, Busuu's "A2.3", Clozemaster's
frequency-coverage %, LingQ's known words. The products that feel like they're "going
somewhere" all compress progress into one legible, externally meaningful number.

**P7. Bounded sessions with a clean end.** Drops' 5-minute cap, Pimsleur's 30-minute
ritual, Headspace's closed loop. Ending while appetite remains protects the habit;
"done for today, genuinely nothing owed" builds the trust that earns the next open.

**P8. Never betray invested users.** The three biggest self-inflicted wounds of
2024–26: Duolingo's energy system and AI-first backlash, Memrise deleting community
courses, Beelinguapp's AI-slop library. Users detect and punish (a) punishment
economies, (b) uncurated generated content replacing curated content, (c) orphaning
the thing power users built their routine on.

---

## 3. Competitor Deep Dives

Condensed to what matters for decisions; the app-by-app detail (pricing, sentiment,
sources) lives in the research summaries below each verdict.

### 3.1 The Chinese course apps — HelloChinese, SuperChinese, ChineseSkill

**HelloChinese** is the consensus best structured beginner app (ahead of Duolingo on
Reddit): a Mandarin-specific gamified path with inline grammar notes, stroke-order
tracing, a dedicated pinyin/tone course, and — its strongest hand — **speech recognition
with tone-aware feedback woven into every lesson**, so pronunciation is trained where
errors happen rather than in a quarantined drill. Free Learn tier is generous; Premium
$69.99/yr. Known ceiling: content caps out around HSK 3–4 (the intermediate cliff), and
its SRS is a course-companion review, not a serious scheduler. **SuperChinese** goes
further (HSK 5, 12 levels) with per-sentence pronunciation scoring and an AI-tutor
pivot, but is pushier: leagues, aggressive upsell, auto-renew complaints.
**ChineseSkill** pioneered the format and is now the outcompeted third.

*What to take:* pronunciation feedback embedded in the core loop, not a side mode; a
real pinyin/tone foundation course at the start of the curriculum. *What to avoid:*
the paywall pressure and leagues that generate their 1-star reviews.

### 3.2 The graded readers — Du Chinese, The Chairman's Bao, Maayot

**Du Chinese** is the reader UX benchmark: 3,000+ professionally written stories in 6
levels, sentence-synced karaoke audio, tap-any-word with context-correct definitions,
tone colors, pinyin toggle, multi-chapter serials with deliberate vocab re-exposure.
$79.99/yr. Weaknesses to exploit: still graded on HSK 2.0, **no learner model** (it
grades content, not the match between content and learner), flashcards bolted on late,
no comprehension gating. **TCB** is the news variant (9,500+ lessons, 6/day — volume
and freshness as the retention hook; dry register). **Maayot** does one story per level
per day with human writing/speaking feedback on paid tiers — buggy app, small team.

*What to take:* the reader bar (audio sync + tap-lookup + tone colors is table stakes),
serialized vocab re-exposure, TCB's "fresh content daily" cadence as an aspiration.
*The gap they leave open:* none of them knows what the learner actually knows. Hanzi
Dojo's %-known engine is exactly the missing half.

### 3.3 The SRS specialists — Anki, Hack Chinese, Skritter, Pleco

**Anki**: the algorithm gold standard now that FSRS ships (23.10+, default-on during
2025) — and the UX cautionary tale: setup paralysis, deck-quality lottery, review
avalanches that kill accounts, "ease hell" folklore. **Hack Chinese**: the calm one —
curated error-checked HSK lists (2.0 *and* 3.0), a global word pool (no duplicate cards
across lists), strong/weak-memory progress bars, consistency calendar, no leagues, no
guilt. $99/yr, no free tier. Proprietary scheduler, not FSRS. **Skritter**: the most
learning-science-correct SRS in the market — **writing, reading, tone, and meaning of
the same word are scheduled independently**, with per-interval-band accuracy tracking;
plus real-time per-stroke handwriting grading with fading scaffolds ("raw squigs").
$14.99/mo for a deliberately narrow scope. **Pleco**: the universally installed
dictionary; one-tap card creation from any entry; one-time purchase; zero retention
mechanics and decade-long loyalty anyway — the existence proof that calm + useful
retains.

*What to take:* Skritter's per-skill scheduling idea (a Chinese word genuinely is
several separable memory traces); Hack Chinese's memory-state progress display; Pleco's
one-tap capture. *The marketable fact:* **no major Chinese-specific app verifiably
ships FSRS. Hanzi Dojo already runs it.** "Anki's best algorithm, zero settings" is a
true sentence no competitor can say.

### 3.4 The character apps — HanziHero, Mandarin Blueprint, Skritter again

**HanziHero** (WaniKani-for-Chinese): components → characters → words in dependency
order, a handcrafted mnemonic per character, and a **persona system for pronunciation**
— each initial, final, and tone maps to a recurring actor/place, so pronunciation is
encoded inside the mnemonic. Typed recall (no self-grading bias). **Mandarin
Blueprint**: the Hanzi Movie Method — set = final, actor = initial, room = tone —
the most complete mnemonic capture of tone anywhere, wrapped in an expensive video
course with a hated sales funnel.

*What this means for Hanzi Dojo:* character decomposition is the largest single content
gap versus the specialists — the app literally named Hanzi Dojo treats characters as
opaque word-atoms. The component/mnemonic layer is well-understood, buildable from open
data (character decomposition databases exist), and directly on-brand.

### 3.5 The immersion tools — LingQ, Migaku, Readlang, Language Reactor, Readibu

**LingQ**: the word-knowledge state machine made visible (blue → yellow → known), known
words as *the* progress number; chronically clunky, over-counts knowledge, SRS ignored.
**Migaku**: known-word tracking overlaid on Netflix/YouTube/web — "level-matched
immersion" executed on the open web; expects Anki-grade self-direction, weak onboarding.
**Readlang/Language Reactor**: frictionless capture (one click from encountered word to
SRS card with its sentence) and per-sentence auto-pause on native video. **Readibu**:
HSK-grades arbitrary Chinese web novels on the fly.

*What to take:* rendering word status *on the words themselves* in the reader; one-tap
capture (already done); sentence-loop audio controls. These tools also mark the ceiling
Hanzi Dojo should eventually bridge learners toward — native content — via the Analyzer
and the planned graded-YouTube concept.

### 3.6 The giants — Duolingo, Babbel, Busuu, Memrise

Covered in §2's patterns; the decision-relevant points: Duolingo's onboarding funnel is
the one to study and its 2025–26 troubles (energy system, leagues resentment, AI-slop
backlash, plateau reputation) are the churn pool Hanzi Dojo recruits from. Babbel's
lesson-as-dialogue and Busuu's CEFR-credential framing ("A2.3, on track for B1") are
worth adapting: HSK levels can carry credential weight the same way. Memrise's
community-course deletion is the loyalty-betrayal cautionary tale.

### 3.7 The AI tutors — Speak, Praktika, Loora, Langua, TalkPal, Duolingo Max

The category exploded 2024–26; almost all of it is subscription-funded because voice AI
costs $0.05–0.30/conversation-minute. The quality separator is not the avatar or the
model — it's **whether the app has a learner model**. **Langua is the benchmark**: tap
unknown words mid-conversation → they become SRS cards → future conversations and
co-written stories *weave your saved and struggling words back in*, with cross-session
memory. Reviewers call exactly this feature "magical." **Speak** builds a curriculum
first and generates review from your mistakes (paywalled tier). **Duolingo Max**'s
Video Call has the only published efficacy study (real speaking gains). **Praktika**'s
avatars are polish over generic feedback; **TalkPal** is the thin-wrapper cautionary
tale ("robotic, too simple, no depth"). None of them can score Mandarin tones.

*What this means:* Hanzi Dojo's planned "Chat Missions constrained to words you know"
is the right idea and Langua proves the demand — but Langua injects target words into
otherwise-unconstrained output; **nobody ships conversation constrained to the
learner's actual known-vocabulary set**, because nobody else has the FSRS-grade
knowledge state to constrain against. That is a real structural advantage — and a real
cost decision, addressed in §13.

---

## 4. Competitive Feature Matrix

🟢 excellent · 🟡 good · 🟠 limited · 🔴 missing. HD = Hanzi Dojo today (from code, not
aspiration). Chosen competitors are the ones that matter per dimension.

| Capability | HD | Duolingo | HelloChinese | SuperChinese | Du Chinese | Hack Chinese | Skritter | Pleco | Anki | LingQ/Migaku | Langua/Speak |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SRS algorithm quality | 🟢 FSRS v5 | 🟡 proprietary | 🟠 | 🟠 | 🟠 | 🟡 | 🟡 adaptive | 🟡 configurable | 🟢 FSRS | 🟠/🟡 | 🔴/🟠 |
| SRS usability (zero-setup) | 🟢 | 🟢 | 🟡 | 🟡 | 🟡 | 🟢 | 🟡 | 🟠 | 🔴 | 🟠 | — |
| Card types (recognition/production/listening/cloze) | 🔴 one type | 🟡 | 🟡 | 🟡 | 🟠 | 🟠 | 🟢 per-skill | 🟢 | 🟢 | 🟠 | — |
| Character components / mnemonics | 🔴 | 🔴 | 🟠 | 🟠 | 🔴 | 🔴 | 🟡 | 🟡 | 🟡 decks | 🔴 | 🔴 |
| Handwriting / stroke order | 🟡 practice, unscheduled | 🟠 | 🟡 | 🟡 | 🔴 | 🔴 | 🟢 | 🟡 input | 🟡 add-ons | 🔴 | 🔴 |
| Tone training | 🟠 MCQ drills | 🔴 | 🟢 | 🟢 | 🟠 colors | 🔴 | 🟢 SRS-scheduled | 🟠 | 🟠 | 🟠 | 🔴 |
| Pronunciation scoring | 🔴 (web-only binary ASR) | 🟡 Max | 🟢 | 🟢 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🟡 no tones |
| Grammar (explanations + practice) | 🟡 FSRS-scheduled, small | 🟠 | 🟡 | 🟡 | 🟠 notes | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🟡 AI |
| Graded reading library | 🟡 204 stories, HSK 1–2 deep | 🟠 stories | 🟡 | 🟠 | 🟢 3,000+ | 🔴 | 🔴 | 🟠 reader | 🔴 | 🟢 wild content | 🟠 |
| Reader UX (audio sync, tap-lookup) | 🟡 | 🟠 | 🟡 | 🟠 | 🟢 | — | — | 🟡 | 🔴 | 🟡 | 🟠 |
| Comics / manhua format | 🟢 unique | 🟠 adventures | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| Content matched to learner's known words | 🟢 unique (%-known engine) | 🔴 | 🔴 | 🟠 | 🔴 | — | — | 🔴 | 🔴 | 🟡 Migaku | 🟡 word injection |
| Adaptive learning | 🟠 FSRS + weak words only | 🟢 Birdbrain | 🟡 | 🟡 | 🔴 | 🟡 | 🟢 | 🔴 | 🟢 FSRS | 🟠 | 🟡 |
| AI conversation | 🟠 authored Chat Missions | 🟡 Max $ | 🟠 | 🟡 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🟢 |
| Dictionary | 🟢 CC-CEDICT, integrated | 🔴 | 🟠 | 🟠 | 🟡 | 🟡 | 🟠 | 🟢 the standard | 🔴 | 🟡 | 🔴 |
| Progress display (memory state) | 🟡 rich but scattered | 🟠 Score | 🟠 | 🟠 | 🟠 | 🟢 | 🟡 | 🟠 | 🟠 | 🟡 known words | 🟠 |
| HSK 3.0 alignment | 🟢 native, L1–9 | 🔴 | 🟡 rebuilding | 🟠 | 🔴 2.0 | 🟡 both | 🟡 lists | 🟢 lists | 🟡 decks | 🔴 | 🔴 |
| Offline | 🟢 outbox + audio cache | 🟡 | 🟡 | 🟠 | 🟡 | 🔴 web | 🟡 | 🟢 | 🟢 | 🟠 | 🔴 |
| Onboarding (time-to-value) | 🟡 great until signup seam | 🟢 | 🟢 | 🟡 | 🟢 | 🟡 | 🟡 | 🟢 | 🔴 | 🔴 | 🟡 |
| Notifications that work | 🔴 dead on iOS build | 🟢 | 🟢 | 🟢 | 🟡 | 🟡 | 🟡 | — | 🟠 | 🟡 | 🟡 |
| Calm / no dark patterns | 🟢 (one XP island) | 🔴 | 🟠 | 🔴 | 🟡 | 🟢 | 🟡 | 🟢 | 🟢 | 🟡 | 🟡 |
| Free (real, not demo) | 🟢 | 🟠 hostile free | 🟡 | 🟠 | 🟠 | 🔴 | 🔴 | 🟡 core | 🟢 | 🔴 | 🔴 |

**Reading the matrix:** Hanzi Dojo's uniques (manhua, learner-matched content, native
HSK 3.0, FSRS, genuinely free) are all in rows where nearly everyone else is red — that
is a real position. Its reds (card types, character decomposition, pronunciation
scoring, working notifications) are rows where *specialists* are green, i.e. the
things a user notices missing when they compare.

---

## 5. Hanzi Dojo Strengths (protect and market these)

1. **The FSRS core** — correct v5 integration, day-based availability, transactional
   idempotent writes, offline outbox, honest undo, a real retention dial (0.85/0.90/0.95),
   deterministic tested queue construction, first-run cap, gentle-return cap. No major
   Chinese app has this. *It is also completely invisible in the product's marketing
   surface — see §17.*
2. **One canonical readability engine** (`storyReading.js`) shared by reader, shelf,
   recap, Analyzer, and the public reading test. The %-known number cannot disagree with
   itself. This is the substrate the killer feature (§23) is built on.
3. **Honest, non-fakeable progression** — learned (low bar, early immersion) vs
   mastered (21-day FSRS stability), level test at 100%, wrong answers re-entering the
   review queue. "No shortcuts" is implemented, not just claimed.
4. **The story universe** — 204 published stories, a persistent canon (这条街's
   recurring cast as the stated retention mechanism, the sea strand's level-constrained
   plotting, two opposed manhua series), and a validation pipeline where coverage is
   measured by the same matcher the reader uses. Nobody else has canon-consistent,
   level-matched serials. The Duolingo AI-slop backlash proves curation is a moat.
5. **The manhua format** — tappable real-text-over-art, panel progression, the closing
   plate ("第二话 · continues at HSK 2") that makes the level load-bearing. A genuinely
   unique format in the category.
6. **The TTS pipeline** — content-hash caching, stale-not-silent, pinyin phoneme
   pinning, per-word overrides, six variants including honestly-slow re-synthesis.
7. **Loop closure already half-built** — save a word from a story and its real sentence
   appears on the flashcard back; finish a session and the recap names a story you can
   now read. This is the seed of the differentiator.
8. **Design identity** — the one-lit-panel system, ink-wash atmosphere, seal, warm
   paper, written-down rules. It reads authored, not templated (§17).
9. **Honest failure states everywhere** — "couldn't load" is never "all caught up."
   Rare in the category, and the foundation of the trust positioning.
10. **The calm position itself** — free, no ads, no streaks, no leagues. §8 shows the
    defector pool this recruits from is large and growing.

---

## 6. Hanzi Dojo Weaknesses (where competitors are clearly better)

Stated bluntly, as requested.

1. **The SRS has one card type.** Recognition (hanzi → meaning) only. No production,
   no listening, no cloze *inside the scheduler*. Skritter schedules four skills per
   word independently; Anki users build all of these. Eight practice drills exist but
   feed back only a `due_at` nudge — the scheduler learns almost nothing from them.
   A learner can be "mastered" on a word they cannot produce, hear, or write.
2. **Characters are opaque atoms.** No components, no radicals, no etymology, no
   mnemonics, no confusable-character practice. HanziHero and Mandarin Blueprint built
   entire businesses on this layer. For an app named Hanzi Dojo this is the most
   embarrassing gap on the board.
3. **Pronunciation feedback is effectively absent.** Binary web-only ASR ("did the
   recognizer hear roughly this word"), no tone scoring, and the drill is *removed
   entirely* in the iOS/Android builds. HelloChinese and SuperChinese — the two apps a
   new learner most likely compares against — are green here. For a tonal language this
   is the weakness a reviewer will name first.
4. **Comprehension is decorative.** Questions exist for a fraction of the library
   (the audit found 9 rows across 204 entries; the roadmap claims backfill — verify),
   and they gate nothing either way. "Finishing" a story is unassessed, so the mastery
   philosophy stops at the story door.
5. **Six reader implementations, zero routability.** The audit's own finding: they
   behave "like separate products" (335 inline-style blocks, 22 hard-coded hexes across
   13 files), and no story, series, chapter, or beat has a URL. No share links, no
   resume-by-link, broken back/refresh, no per-story analytics.
6. **Onboarding leaks its own value.** Verified in code: `startLevel`, `placementLater`,
   `purposes`, `minutesPerDay` are collected pre-signup, celebrated in "your training
   path", then never read again. The user is asked their level twice and their pace
   twice in different units; "I'm not sure" points at nothing. Email confirmation
   interrupts the flow at peak momentum.
7. **The retention channel is dead where the users will be.** Push is Web-Push only —
   no `@capacitor/push-notifications` — so the iOS app has no proactive channel at all.
   Meanwhile 0 of 31 profiles have reminders enabled, which means the toggle is
   undiscoverable, the value is unclear, or both.
8. **`Writing.jsx` contradicts the brand in shipping code.** A full XP/level/streak/
   combo-multiplier economy with a flame icon, live at `/writing`, while the public
   Terms page says "there are no streaks, leagues, or XP." Buried, but shipping — and
   it's the kind of thing a reviewer screenshots.
9. **Content depth falls off a cliff after HSK 2.** HSK 3–6 have vocabulary but thin
   serial content (blocked on a funded LLM key / authoring time), and the HSK 3–6 level
   tests are ~500-word walls. The intermediate cliff is the market's shared failure —
   and currently Hanzi Dojo reproduces it.
10. **The level test measures the wrong thing at the margin.** 30 MCQs of word↔gloss
    recognition with random distractors: no reading, no listening, no production, and a
    100%-over-MCQ bar that is partly a luck tax. It is *honest* about memory but narrow
    about language.
11. **Progress is rich but scattered.** Learned/mastered counts, known-word map,
    calendar, accuracy, level mastery bar — all on Profile, none composed into one
    legible "where am I, what's next" answer (Hack Chinese does this better with less
    data). And two decorative parallel systems (writing XP, `fluency.js` ranks) dilute
    the honest one.
12. **Audio metadata lies** (`has_audio` stale for many rows; two audio systems, one
    boolean), word-level sync is estimated rather than measured, and eight published
    beginner stories sit below their own coverage bar — beginner trust damage exactly
    where trust matters most.

---

## 7. Missing Features (specific gaps, with judgment)

Classified per the framework: importance → current state → verdict.

| Feature | Importance | HD today | Verdict |
|---|---|---|---|
| Production/listening/cloze card types in SRS | **Critical** | Missing | **Implement** (§9.1) |
| Character decomposition + mnemonics | **Critical** for a hanzi app | Missing | **Implement, adapted** (§9.2) |
| Tone-pair drills + minimal pairs | High-value | Partial (MCQ tones drill) | **Implement** (§9.3) |
| Pronunciation scoring w/ tone feedback | High-value | Missing | **Adapt** — native plugin + tone-capable API, phased (§9.3) |
| Native push notifications | **Critical** (channel is dead on iOS) | Missing | **Implement directly** |
| Deep links / routable stories | High-value | Missing | **Implement directly** |
| Comprehension questions across library, lightly consequential | High-value | Partial | **Implement** (§9.5) |
| One composed progress surface ("HSK readiness") | High-value | Partial, scattered | **Implement** (§15) |
| Dictation (type what you hear) | Useful | Missing | **Implement** as a card type, not another drill |
| Shadowing / sentence-loop audio | Useful | Partial (speed, per-line audio) | **Adapt** — loop button + record-compare later |
| Placement that actually places | High-value | Partial (reading test exists, wizard discards) | **Implement** — wire the seam (§10) |
| Leech suspension/parking | Useful | Missing (coach exists) | **Implement** — FSRS-honest "set aside" |
| Per-user FSRS parameter optimization | Useful | Missing (data exists) | **Adapt** later — needs review-log volume |
| Streaks, leagues, energy | — | Absent | **Avoid** (by design; see §16) |
| AI free-chat tutor | High-value later | Missing (authored Chat Missions exist) | **Adapt, phased** (§13) |
| Community/social features | Nice-to-have | Discord only | **Take inspiration only** — Discord is enough for now |
| Graded YouTube | High-value later | Tab exists, thin | **Phase 3** — big, real, but after the core loop |

---

## 8. Problems Competitors Haven't Solved (the opportunity list)

From the complaint-mining research (Reddit, HN, app-store analyses, quit
retrospectives), ordered by frequency × strength:

1. **"I felt productive but learned nothing"** — the #1 complaint about Duolingo-class
   apps. Unmet need: visible *real* progress (can I read this?). No mainstream-polish
   app gates on genuine mastery. *Hanzi Dojo's wedge.*
2. **Streak anxiety** — the mechanic works for the company and hurts the user; freezes
   monetize the anxiety. No language app has solved consistency-without-coercion.
3. **Review avalanches** — the thing that kills Anki accounts. Return after a week to
   400 due cards and quit. FSRS fixes scheduling, not backlog psychology. *Hanzi Dojo's
   gentle-return cap is already the best shipped answer anywhere — it should be louder.*
4. **Vocabulary that never reappears** — flashcard words with no afterlife; readers with
   no memory model. The closed loop (SRS ↔ content) is essentially unshipped.
5. **The intermediate cliff** — course apps end at HSK 3–4; readers don't teach; serious
   learners assemble a 6-app stack (the standard Reddit advice is literally italki +
   HelloChinese + Pleco + Anki + Du Chinese + Skritter). *"The 6-app stack in one calm
   app" is a positioning sentence.*
6. **Artificial sentences** — "there is a horse in my apartment." Solved only by graded
   readers; solved in strong form by story-first curriculum.
7. **Tone neglect** — mainstream apps under-serve production feedback on tones; the
   specialist tools that could are not where learners are.
8. **Grammar explained nowhere or elsewhere** — nobody does grammar *inline in
   immersion content* (LingoDeer does it in lessons). Hanzi Dojo's grammar-in-context
   roadmap item targets exactly this.
9. **Notification guilt** — universally resented, universally shipped. Honest,
   information-bearing notifications are a free differentiator.
10. **Paywall resentment / trust collapse** — energy systems, AI-slop content,
    orphaned power users. "Actually free, actually curated" is rare and credible.

The white space is the intersection: **3 + 4 + 2** (SRS without anxiety, the
vocab↔content loop, calm consistency) — one product occupying all three would be
recommended in the exact threads where people complain about the others.

---

## 9. Learning-System Improvements

### 9.1 Vocabulary / SRS

**Diagnosis:** world-class scheduler, single-dimensional cards.

- **Add card types inside the scheduler, not more side drills.** Concretely: each
  vocabulary item can carry up to three cards — *recognition* (today's), *listening*
  (audio → meaning/hanzi; the TTS clips already exist), and *cloze/production* (the
  example sentence with the word blanked; typed or multiple-choice by user setting).
  Each is its own FSRS card (ts-fsrs handles this natively — it's more rows in
  `cards`). Introduce them staggered: recognition on day 1, listening when the word
  reaches `review` state, cloze when stability crosses ~7 days. That is Skritter's
  per-skill insight applied with FSRS discipline, and it converts three existing side
  drills (Listen, FillBlank, typed Writing) from decorative to scheduled. Keep the
  four-grade UI; it's already well-explained in-product.
- **Leech parking.** At `lapses ≥ 5` after coach interventions, offer "set this word
  aside for two weeks" (suspend with a scheduled return), framed calmly. Never silent,
  never permanent by default.
- **Per-user FSRS optimization** once `review_logs` volume permits: run the FSRS
  optimizer server-side monthly per user, fall back to defaults. Quiet, honest gain —
  fewer reviews at equal retention — and a marketing sentence ("the schedule adapts to
  your memory, measurably").
- **Keep**: retention dial, undo, day-based availability, gentle return, first-run cap.
  These are already best-in-market.

### 9.2 Hanzi / characters

**Diagnosis:** the name writes a check the product doesn't cash.

- **Component layer on the word detail / dictionary entry** first (cheap, high value):
  per-character decomposition (open decomposition data), component meanings, and the
  **声旁 sound-family** view ("青 gives qing: 请清情晴") — the single most useful
  insight in Chinese literacy and almost nowhere in apps. Roadmap already names this;
  it should be pulled forward.
- **Mnemonic hints, curated not generated**, starting with the HSK 1–2 characters
  (finite set, one editorial pass) — HanziHero proves the demand; Hanzi Dojo's voice
  should be its own (see §17; the story universe can lend imagery).
- **Connect stroke practice to the scheduler**: writing practice for a character
  becomes a fourth (optional, off-by-default) card type for learners who opt into
  handwriting, replacing `Writing.jsx`'s XP island (which should be dismantled
  regardless — §16).
- **Confusable-character drill** derived from data already held (`test_answers`,
  `review_logs` wrong-answer patterns + a curated confusable list: 我/找, 请/清, 买/卖).

### 9.3 Pronunciation and tones (the special-attention area)

**Diagnosis:** the biggest visible gap vs the Chinese course apps, and the store builds
currently ship *nothing*.

Phased honestly:

1. **Now (no new tech):** make the existing Tones drill matter — tone and tone-pair
   items become scheduled listening cards for words the learner has (the drill
   infrastructure and TTS clips exist). Add **minimal-pair discrimination** (shí/sì,
   zhǔ/chǔ; 4↔2 tone contrasts) — no mainstream app does systematic minimal pairs; the
   audio can be pre-generated by the existing pipeline. Add a **sentence-loop button**
   in the reader (Language Reactor's one mechanic worth its whole product).
2. **Next (native plugin):** a speech-recognition Capacitor plugin restores the
   Speaking drill in the store builds (binary feedback is still worth having — it's
   what HelloChinese's reputation is built on).
3. **Later (paid API, gated):** per-character **tone scoring** via a
   SpeechSuper-class API for a bounded feature (the roadmap's tone trainer: your pitch
   contour vs target, per-syllable verdicts). This is a metered cost — bound it (e.g.
   N assessed recordings/day) rather than making it ambient. Generalist AI tutors
   structurally can't do this; the two apps that can aren't reading apps. It is the
   most defensible "special attention" investment available.

### 9.4 Grammar

Already better than reputation (FSRS-scheduled patterns, hand-picked confusable
distractors). Improvements in order: **surface patterns from the story being read**
(the reader knows which guide's `find[]` strings match the current story — flag "this
chapter introduces 了 for completed actions" on the finish screen, one tap to enroll);
grow topics beyond beginner; add pattern items into the level test (2–3 per test) so
grammar is inside the mastery bar, not beside it.

### 9.5 Reading

The engine is the crown jewel; the surface needs consolidation, not invention:
one `StoryShell` (per the audit's own recommendation), routable stories, comprehension
questions across the library — generated by the existing script, human-spot-checked —
with a **light consequence**: a chapter counts as *read* when finished, but *understood*
(and eligible for the "readable" stat) after the 3-question check. Never a hard gate;
the philosophy is no-shortcuts, not busywork. Fix `has_audio`. Then the reader is
honestly at Du Chinese's bar with a learner model Du Chinese doesn't have.

### 9.6 Listening

TTS narration + slow variants is a real base. The gap between "studied clips" and
native speed is the plateau complaint (§8.10). In order: dictation card type (§9.1);
sentence-loop + speed in one control; then the graded-YouTube flagship (Phase 3) —
%-you'll-understand over real videos via the same engine, pre-learn the gap words,
watch with a tappable transcript. That last one is the honest bridge out of the app's
own content, and no one else can compute the % against real learner state.

### 9.7 Speaking

Be honest that this is the weakest pillar for the near term and that's acceptable:
the market's speaking solutions are all paid AI voice products with real COGS. Phase
order: ASR plugin restore (9.3) → shadowing (record yourself against the story line,
self-compare — no scoring needed, cheap, genuinely effective) → tone scoring (9.3) →
Chat-Mission speech input (§13). Never claim a "tutor" before it exists (the store
listing's honesty rule already forbids it).

### 9.8 Writing

Typed production via the cloze card type (9.1) covers the real need. Handwriting stays
opt-in (9.2). Free-writing-with-AI-correction is a Phase 3+ consideration only; Maayot's
human feedback shows demand but the cost/quality bar is high.

---

## 10. Onboarding Recommendations — the ideal first 10 minutes

**What the funnel teaches (§2 P1):** every ask after the win, personalize early, first
success inside ~5 minutes, notification ask only when there's something to protect.

**Verdict on the current "first encounter" concept** (flashcard 你好 → flip → real TTS →
micro-story where the word appears → choice → card joins collection): **it is a
genuinely strong differentiating opening** — it *demonstrates* the product thesis
(words become stories) instead of describing it, it reaches interaction with the
language in under a minute, and wrong choices teach instead of punish. Keep it. The
research adds three refinements and one repair:

- **The repair (highest-leverage activation fix in the whole product):** close the
  data seam. `startLevel`, `purposes`, `minutesPerDay` must flow into the post-signup
  profile; the tier picker and goal picker should *confirm* prefilled answers, not
  re-ask. `placementLater` should route to the reading test after the first mission.
  The work is plumbing, not design — the screens already exist.
- **Soften the email-confirmation wall.** If Supabase settings permit, defer
  confirmation (allow the first session on an unconfirmed account); at minimum, keep
  the built path visible behind the confirm screen ("your path is saved — confirm to
  continue") so the momentum object isn't lost.
- **Let the micro-story pay off the flip.** The current flow already does this —
  guard it in future edits: the aha is *"I read Chinese and understood it"*, and it
  must occur before the first form field of any kind.
- **Time the notification ask like Duolingo times signup**: after the first real
  session ends, on the recap, with the fact in hand — "18 cards come due tomorrow.
  Want a reminder at [their stated study time]?" One system prompt, primed, never
  repeated unprompted. (Requires §7's native push first; on iOS today the ask would
  be a lie.)

**The ideal first 10 minutes, composed** (mostly existing pieces, reordered/wired):

0:00 ensō splash → welcome (native) or landing (web) · 0:30 first encounter: 你好 card,
flip, audio · 1:30 micro-story with the word, one choice · 2:30 "your card, your
collection" + three quick calibration questions (level/purpose/minutes — asked once,
kept forever) · 3:30 path building → signup (Apple/Google one-tap preferred) · 4:30
first mission: 5 new words with progressive hints · 8:00 recap → "Story unlocked:
[title] — you know 100% of it" → read it → 10:00 finish screen: today's honest numbers,
tomorrow's forecast, the primed reminder offer.

---

## 11. The Daily Learning Loop

Design principle from the research: **the loop must end, visibly, and end with
appetite** (§2 P7). The order the CLAUDE.md vision already states (flashcards → stories
→ listening → output) is correct; what's missing is that only step 1→2 is currently
connected by the recap, and steps 3–4 are opt-in side rooms.

**5-minute session** (the floor, and the mobile default): due reviews (capped, honest
estimate shown) → recap → *one* next-step card: the story/chapter with the highest
%-known that's unread — or "done for today, N waiting tomorrow." Nothing else.

**10-minute session** (the recommended default; matches the onboarding math): reviews →
new words (daily goal) → recap → **the story containing today's words** (recap picker
already does this) → its 3-question check → done screen.

**20-minute session:** the above → one scheduled non-recognition block (listening cards
or tone minimal-pairs or a grammar pattern due — chosen by the Practice hub's existing
"what actually has a count" logic) → optional Chat Mission with today's words → done.

Two rules across all three: (1) the loop is assembled from *scheduled* items, so every
minute feeds the learner model — this is what the card-type work (§9.1) buys; (2) the
done screen is a real terminus (P7) — "genuinely nothing owed" — with tomorrow's
forecast as the only forward pointer. No "one more lesson" bait.

---

## 12. Story + Manhua Strategy

The stories are currently *very good content attached to the app*. The strategy is to
make them *the spine the app hangs from*:

1. **Wire mastery to episodes, visibly** (the killer feature, §23): every serial's next
   chapter shows its live %-known; Home surfaces "Chapter 7 of 面馆 is ready — you now
   know 96% of it"; doing reviews visibly moves that number. The cliffhanger is the
   ethical retention engine (Webtoon's lesson, minus Fast Pass), and the story bible
   already states the bet in its own words: "the reader comes back for 奶奶 and the cat."
2. **One reader shell, routable.** Six implementations → one `StoryShell` with format
   modules; `/stories/:id/:chapter` deep links; share links for public story pages
   (already planned as growth). Precondition for everything else here.
3. **Close the trust gaps in beginner content**: the eight under-coverage stories,
   `has_audio`, missing covers. Beginner-graded trust is the product's first impression.
4. **Comprehension everywhere, lightly consequential** (§9.5) — this is also what makes
   "readable stories" an honest stat for the progress surface.
5. **Manhua as the marquee.** It is the only format nobody else has. Ship it into the
   first mission where art carries meaning (already partially true), keep the
   100%-coverage/zero-reach bar, and use the closing plate's promise ("continues at
   HSK 2") as the explicit bridge between levels. Panel art needs responsive variants
   (25 MB of full-size WebP is a mobile cost today).
6. **"A story from your words"** (roadmap item): the authored-lane version is a
   curated-template engine, not runtime LLM — pick from season-shaped templates whose
   slots are filled against the learner's actual known set, validated by the same
   matcher. Pre-generation economics preserved.
7. **HSK 3–6 serials are a content emergency, not a feature gap** — everything above
   amplifies content that must exist. The funded-LLM-key blocker (a dollar or two per
   level on Sonnet, per the team's own measurement) is the single cheapest unlock in
   this entire document.

---

## 13. AI Strategy (only the high-value applications)

The research verdict is unambiguous: AI that *adds practice on top of curated content*
is rewarded; AI that *replaces curated content* is punished (Duolingo backlash,
Beelinguapp). Hanzi Dojo's zero-runtime-AI architecture is currently a strength —
every competitor's subscription price is a proxy for their voice-stack bill.

Priorities, in order of value-per-cost:

1. **Pipeline AI (now):** the story generator with a funded key; comprehension
   backfill; meaning-gloss cleanup; example-sentence coverage. All pre-generated,
   validated, curated — the proven lane.
2. **Comprehensible chat, the roadmap's Chat Missions evolution (next):** Langua
   proves the demand for "your words woven into conversation"; Hanzi Dojo can go one
   structural step further — **constrain generation to the learner's known set + a
   small i+1 margin**, which nobody ships because nobody else has the knowledge state.
   Design rules learned from the market: scenario-anchored with recurring canon
   characters (order dumplings from 老王 — parasocial continuity is Praktika's one real
   insight), text-first (voice is a cost multiplier), corrections deferred to an
   end-of-chat recap that feeds the review queue (over-correction kills flow), and
   **bounded** (N missions/day) so the free promise survives. Cost note: text-only
   chat on a small model is orders of magnitude cheaper than voice; a bounded text
   mission is plausibly free-tier-sustainable, and if it ever isn't, the prior
   research doc's "honest Pro" sketch is where that conversation lives — not here.
3. **Explain-this-sentence (later, cheap):** a bounded per-tap explanation in the
   reader for a sentence the learner flags — the Explain My Answer pattern, applied to
   real reading. Cacheable per story-line, so cost amortizes toward zero.
4. **Not recommended:** runtime free-form voice tutor (COGS incompatible with free);
   AI-generated replacement of authored stories; avatars; "AI" as a marketing word
   (the store-listing honesty rule already bans it).

---

## 14. Adaptive Learning Strategy

**Should Hanzi Dojo have a central learner model? It already has the hard half.** FSRS
per-card memory state *is* the learner model that Duolingo's HLR approximates at
population scale. What's missing is breadth (only recognition is measured — §9.1) and
*spending* the signal (Duolingo spends its model on exercise selection; Langua on
conversation content).

The ideal engine, staged:

- **Stage 1 (plumbing that exists):** one read model — `knownSet(userId)` with per-word
  state {new/learning/known/mastered, stability, lapses} — already computable; make it
  the single API every feature reads (shelf ranking, recap picker, Chat Missions,
  analyzer all already approximate this separately).
- **Stage 2 (breadth):** per-skill state from the new card types (recognized/heard/
  produced per word), tone-drill results, comprehension answers, grammar-pattern state.
  Error-pattern mining from `review_logs` + `test_answers` (confusable pairs, weak
  tones, weak initials) — the data is already collected and unread.
- **Stage 3 (spending it):** session assembly weights weak skills; story
  recommendations weight words *due soon* (reading a story with due words is a
  retrieval event — the contextual-review idea); the tone trainer targets the
  learner's measured weak contrasts; Chat Missions inject due words. Each is a
  bounded, testable rule on a pure module — no ML required, matching the repo's
  design philosophy. Birdbrain-style learned models are a luxury for later; the
  rules-on-FSRS version captures most of the value at none of the opacity.

---

## 15. UX and Navigation Recommendations

The IA is already unusually disciplined (5 primary destinations, one lit panel, the
Practice hub absorbing 14 tools). Recommendations:

1. **Elevate the Test on mobile.** The screen the whole progression gates on is behind
   "More". It belongs on the level-progress surface: tapping the "Toward HSK 2" bar on
   Home should land on a level screen with the mastery bar, the test CTA, and the
   readable-stories count — one composed answer to "where am I."
2. **One progress surface.** Profile's excellent-but-scattered stats (known-word map,
   calendar, accuracy, mastery) compose into a single **Progress** view with the
   §16 hierarchy; Profile keeps account/settings concerns. "742 / 1,200 HSK 4 words
   mastered" framing everywhere a level is named (the research is clear that this
   beats abstract levels).
3. **Routable everything** — stories, chapters, dictionary entries, the level screen.
   Precondition for share links, support, analytics, and the store-app deep links
   already wired in `nativeShell.js`.
4. **Kill the parallel economies** — Writing XP island, `fluency.js` ranks. One
   honest currency: memory state.
5. **Keep**: the calm Home (one action), the hub structure, the sidebar identity, the
   feedback FAB scoping, honest failure states. Don't add a dashboard; the market's
   cluttered home screens are a warning, not a model.

---

## 16. Retention Strategy (meaningful, not shallow)

The evidence-backed calm stack, most of which is partially built:

1. **The work waiting, named precisely** — "About 25 waiting tomorrow" (shipped) →
   extend with the story hook: "…and Chapter 7 becomes readable when you clear them."
2. **Native notifications, honest and primed** (§7, §10) — information, never guilt.
   The one channel currently dead where the users will be.
3. **Loss-proof progress only** — monotonic counts, gap-tolerant "studied 4 of the
   last 7 days" (shipped), calendar heatmap (shipped). Never a resettable counter.
   *Delete the Writing flame-streak.*
4. **Aggressive avalanche forgiveness** — gentle return (shipped) is the market's best
   answer to the #3 complaint; add the "welcome back, here's a 10-minute plan" framing
   and never mention the absence.
5. **The cliffhanger** — the serial cast as the reason to return (the bible's own bet,
   §23). This is the *variable-reward* slot streaks occupy elsewhere, aligned with
   learning instead of beside it.
6. **Weekly recap, not daily scorekeeping** — the month-so-far card (shipped) plus the
   planned weekly email: backward-looking, informational, shareable.
7. **Session-end closure** — "done for today" as a real terminus (shipped in copy;
   protect it).
8. **Avoid:** streaks in any costume, leagues, daily quests, energy, decorative XP,
   guilt copy, notification re-prompts. Measure with W1/W4 weekly retention and
   return-after-lapse rate — against education-vertical D30 ≤ 2–3%, a calm app judged
   on DAU will look falsely broken.

Achievements (11, quiet, real-milestone-based) are fine as-is: state recognition, not
a reward loop.

---

## 17. Product Identity

**What exists is already distinctive** — warm paper, ink wash, the seal, one lit panel,
small type, observational copy. The gap is not visual identity but **identity
legibility**: what a user would *say* Hanzi Dojo is.

1. **Name the method.** The FSRS engine, the honest gates, the %-known matching — the
   product's actual superiority — are invisible. A short in-product "How the dojo
   works" surface (the methodology page, promoted) plus store copy that says the true
   sentences no one else can say: *"The scheduler Anki users fought for, with zero
   setup." "Stories that know what you know." "No streaks. Real progress."*
2. **The dojo metaphor, structural not decorative.** The research warning: don't
   theme the UI into martial-arts kitsch. The dojo's real meaning — practice,
   mastery, rank earned by demonstration — is already implemented (the level test IS
   a belt test; 100% or return to practice). Language can quietly carry this:
   "training", "the work", the ensō, the seal. No mascot needed — **the cast is the
   mascot**: 奶奶, 大毛, 小雨, 小白 are the emotional attachment surface (Duolingo
   spends millions on Duo; Hanzi Dojo's equivalent walks the streets of 这条街).
3. **Fix the off-token seams** — the sage CTA, the un-migrated screens — so the one
   design language is actually one.
4. **Sound identity**: the studio-voice cast (narrator + character voices) is already
   a differentiator; the first-encounter's real TTS on the first card is the right
   instinct. Audio *is* brand for a tonal language.

---

## 18. Competitive Gap Analysis

**Already does well — protect and improve:** FSRS core · %-known engine · honest
mastery/level gates · story universe + manhua · TTS pipeline · dictionary · offline ·
calm Home · design system · accessibility · trust/honesty posture.

**Exists but needs major improvement:** onboarding (seam, email wall) · reader
(six implementations, no routes) · comprehension (coverage + consequence) · tone drill
(unscheduled MCQs) · grammar (good core, invisible) · progress display (scattered) ·
practice drills (disconnected from scheduler) · Chat Missions (authored-only) ·
notifications (built, dead on iOS, undiscovered).

**Important missing:** card types beyond recognition · character decomposition/
mnemonics · pronunciation/tone feedback · native push · deep links · dictation ·
leech parking · HSK 3–6 content depth · placement wiring.

**Opportunities competitors ignore:** mastery-gated episode readiness (nobody) ·
known-set-constrained generation (nobody) · minimal-pair tone training (nobody
mainstream) · HSK 3.0-native positioning (almost nobody) · honest HSK-readiness score
(nobody) · avalanche forgiveness as a feature (nobody) · genuinely free + polished
(only Pleco, in a different category).

**Should NOT build:** streaks/leagues/energy/XP in any form · runtime voice AI tutor
(free-model COGS) · social feeds/leaderboards · branching interactive fiction (bible's
own rule until validation can hold) · a separate PWA/web growth track (decided) ·
video platform before the core loop closes · mascot-costume gamification · placement
by long upfront test (the reading test's adaptive frontier is already better).

---

## 19. Priority Table

Scores 1–10; Effort is cost (10 = hardest). **Score = (2·Impact + Learning + Retention +
Differentiation) − Effort**, a transparent heuristic — read it as ranking, not truth.

| # | Recommendation | Impact | Learning | Retention | Diff. | Effort | Score |
|---|---|---|---|---|---|---|---|
| 1 | Close onboarding data seam + defer email wall | 9 | 3 | 8 | 3 | 2 | 30 |
| 2 | Native push + primed ask (Capacitor) | 9 | 2 | 9 | 2 | 3 | 28 |
| 3 | Episode-readiness loop on Home ("Ch. 7 ready — 96%") | 8 | 6 | 9 | 10 | 4 | 37 |
| 4 | Card types in SRS (listening, cloze/production) | 9 | 10 | 6 | 7 | 6 | 35 |
| 5 | Fund the LLM key; HSK 3–6 serial backfill | 9 | 8 | 8 | 8 | 2 | 40 |
| 6 | Comprehension across library + light consequence | 7 | 7 | 5 | 5 | 4 | 27 |
| 7 | One StoryShell + routable stories | 7 | 3 | 5 | 3 | 6 | 19 |
| 8 | Character components + 声旁 families + mnemonics | 8 | 9 | 5 | 8 | 6 | 32 |
| 9 | Tone minimal-pairs + scheduled tone cards | 7 | 8 | 4 | 8 | 4 | 30 |
| 10 | Progress surface: HSK readiness ("742/1,200") | 7 | 4 | 7 | 6 | 3 | 28 |
| 11 | Dismantle Writing XP island; migrate drill | 6 | 3 | 3 | 4 | 2 | 20 |
| 12 | Beginner content trust (coverage-failing stories, has_audio, covers) | 7 | 5 | 5 | 3 | 3 | 24 |
| 13 | Speech plugin: restore Speaking in store builds | 6 | 5 | 4 | 4 | 4 | 21 |
| 14 | Tone scoring API (bounded) — the tone trainer | 7 | 8 | 5 | 9 | 7 | 29 |
| 15 | Chat Missions → known-set-constrained generation | 8 | 8 | 7 | 9 | 8 | 32 |
| 16 | Level-test breadth (reading/listening/grammar items) | 6 | 7 | 3 | 5 | 4 | 23 |
| 17 | Grammar-in-context surfacing from stories | 6 | 7 | 4 | 6 | 4 | 25 |
| 18 | Per-user FSRS optimization | 5 | 6 | 4 | 6 | 5 | 21 |
| 19 | Dictation card type | 5 | 7 | 3 | 4 | 3 | 21 |
| 20 | Graded YouTube | 7 | 7 | 6 | 8 | 9 | 26 |
| 21 | "A story from your words" (template engine) | 6 | 6 | 6 | 8 | 7 | 25 |
| 22 | Leech parking | 4 | 5 | 4 | 3 | 2 | 18 |
| 23 | Level-test band splitting (HSK 3–6 walls) | 5 | 4 | 6 | 3 | 3 | 21 |

---

## 20. Phase 1 Roadmap — Competitive Baseline

*Goal: a new user comparing against HelloChinese/Du Chinese finds no immediate "the
other app just works better" moment. Mostly repairs and wiring; aligns with the store
launch.*

- Onboarding seam closed; email wall softened; notification ask primed on first recap (#1)
- Native push notifications (#2)
- Beginner content trust pass: 8 under-coverage stories fixed or re-leveled, `has_audio`
  truthful, missing covers shipped (#12)
- Writing XP island dismantled — Terms page becomes true (#11)
- Comprehension backfill verified across the library (#6, content half)
- Routable stories (at minimum `/stories/:id`) (#7, first half)
- Progress surface v1: level screen with mastered-count framing + test CTA on mobile (#10)
- Speech plugin restoring the Speaking drill in store builds (#13)
- Funded LLM key secured; HSK 3 serials publishing (#5 start)
- Docs truth pass (stale ARCHITECTURE claims, canon-file wiring note)

## 21. Phase 2 Roadmap — Become Excellent

*Goal: best Chinese-learning product for a serious learner, HSK 1–4.*

- Card types: listening + cloze inside FSRS, staggered introduction; drills feed the
  scheduler (#4, #19)
- Episode-readiness loop: %-known on every next chapter, Home hook, recap wiring (#3)
- One StoryShell; six readers converge; chapter deep links (#7 complete)
- Character layer: decomposition + 声旁 families on word detail; curated HSK 1–2
  mnemonics; confusable drills (#8)
- Tone program v1: minimal pairs, scheduled tone cards, sentence-loop in reader (#9)
- Comprehension made lightly consequential ("understood" vs "read") (#6 complete)
- Grammar-in-context: story finish screen flags its pattern; test includes grammar (#17, #16)
- HSK 3–6 content at coverage bar; test band splitting (#5, #23)
- Progress surface v2: full HSK-readiness view, weekly recap email (#10)
- Per-user FSRS optimization (#18)

## 22. Phase 3 Roadmap — Become Different

*Goal: "use Hanzi Dojo because no other app does this."*

- **The killer feature, fully realized** (§23): the mastery↔story loop as the
  product's public identity
- Tone trainer with per-syllable scoring (bounded API) — the Mandarin-specific moat (#14)
- Chat Missions with known-set-constrained generation; recap feeds the review queue (#15)
- "A story from your words" — template-engine personalization (#21)
- Graded YouTube — %-you'll-understand over real video, pre-learn, tappable transcript (#20)
- Public shareable artifacts: reading-test result, word/story pages, give-a-friend loop
  (growth items already on ROADMAP)

---

## 23. The Killer Feature

**The Mastery-Gated Serial: your reviews visibly turn into the next chapter.**

Not AI, not a single screen — the loop: every serial chapter has a live %-known
computed from the learner's actual FSRS state; the next chapter in a season is always
visible with its number ("Chapter 7 — 96% readable"); doing today's reviews and new
words moves that number *while the learner watches*; clearing the queue flips it to
"ready"; the chapter ends on the bible's engineered cliffhanger and the closing plate
promises the next one at the next level. The flashcard is the key; the story is the
door; the cast is the reason to care.

**Why this one:**
- **It is the product thesis made tangible.** Everything else (SRS quality, %-known
  engine, story canon, tier gates, recap picker) already exists as parts; no
  competitor has more than one of the parts. Du Chinese has serials without a learner
  model; Hack Chinese has the model without content; Langua injects words without
  curation; Duolingo has neither honesty nor matching. The combination is structurally
  hard to copy: it requires FSRS-grade state AND a curated level-matched library AND a
  canon worth returning to.
- **It converts retention and learning into the same mechanic.** The return hook is
  narrative appetite (Webtoon's engine) but the *thing that opens the next episode is
  genuine vocabulary mastery* — the reward is comprehension itself. This is the only
  retention mechanic in the research where engagement and learning are literally the
  same variable.
- **It answers the market's #1 complaint** ("felt productive, learned nothing") with a
  felt experience: last week this chapter was noise; today you read it.

**Secondary differentiators:** (1) the **manhua format** — the visual, shareable face
of the same loop, unique in the category; (2) **honest HSK 3.0 readiness** — the one
legible number ("742/1,200 HSK 4 words mastered — natively HSK 3.0") nobody else can
compute honestly; (3) **the Mandarin tone program** — minimal pairs now, per-syllable
tone scoring later; the gap every generalist structurally can't close.

---

## 24. Top 10 Things to Build or Improve Next

1. **Close the onboarding seam.** *Problem:* three of four wizard answers are
   discarded; users re-asked level and pace; email confirmation kills momentum.
   *Solution:* persist wizard answers to the profile, prefill the post-signup steps,
   route "not sure" to the reading test, soften the confirm wall. *Why:* activation is
   the cheapest retention there is; the funnel science says the first session decides
   D30. *Inspiration:* Duolingo's delayed-commitment funnel. *Our version is better
   because* the first win is reading a real story, not a translation drill.
   *Difficulty: low.*
2. **Native push + the primed ask.** *Problem:* the only proactive channel is dead in
   the iOS build; 0/31 users have reminders on. *Solution:* `@capacitor/push-
   notifications` + FCM/APNs, ask once on the first recap with tomorrow's real count.
   *Why:* every retention mechanic downstream assumes a channel exists. *Inspiration:*
   permission-priming best practice. *Better because* the notification is honest
   information with the user's own chosen time. *Difficulty: low-medium.*
3. **The episode-readiness loop.** *Problem:* mastery and stories are connected by
   architecture but not by experience. *Solution:* %-known on every next chapter, Home
   hook line, recap "this unlocked", readable-count on the level screen. *Why:* §23.
   *Inspiration:* Webtoon cliffhangers + LingQ's visible knowledge state. *Better
   because* the unlock is earned by memory, not by waiting or paying. *Difficulty:
   medium (display + wiring; engine exists).*
4. **Fund the LLM key and fill HSK 3–6.** *Problem:* the content cliff reproduces the
   industry's intermediate-desert failure; the blocker costs dollars. *Solution:* the
   team's own settled plan — paid key, serial generator, editorial pass. *Why:* every
   other recommendation amplifies content that must exist. *Difficulty: trivial
   technically; editorial time is the real cost.*
5. **Card types inside the SRS.** *Problem:* recognition-only; drills are decorative.
   *Solution:* listening and cloze cards per word, staggered by stability; drills
   write real FSRS grades. *Why:* the single biggest learning-quality upgrade; a word
   you can't hear or produce isn't known. *Inspiration:* Skritter's per-skill
   scheduling. *Better because* FSRS + existing TTS clips + existing example sentences
   make it pure wiring, no new content. *Difficulty: medium-high (queue, UI, counts).*
6. **Character decomposition + mnemonics.** *Problem:* Hanzi Dojo doesn't teach hanzi
   structure. *Solution:* component + 声旁 view on word detail; curated HSK 1–2
   mnemonics; confusable drills. *Why:* the specialists prove the pedagogy; the name
   demands it. *Inspiration:* HanziHero's persona system, Outlier-style etymology.
   *Better because* mnemonics can live in the story universe's own imagery.
   *Difficulty: medium.*
7. **Comprehension everywhere, lightly consequential.** *Problem:* finishing a story is
   unassessed; "readable" is unverified. *Solution:* backfill verified, 3 questions per
   story, "understood" state feeding the readable stat — never a hard gate. *Why:*
   extends no-shortcuts through the immersion pillar. *Inspiration:* graded-reader
   comprehension checks. *Better because* it stays calm — consequence is a stat, not a
   lock. *Difficulty: low-medium.*
8. **One StoryShell + routable stories.** *Problem:* six readers, no URLs; audit's own
   top structural finding. *Solution:* shared shell + format modules + `/stories/:id/
   :chapter`. *Why:* precondition for sharing, growth pages, support, analytics, and
   every reader improvement landing once instead of six times. *Difficulty: medium-
   high, mostly refactor discipline.*
9. **The tone program.** *Problem:* no production feedback in a tonal language; nothing
   at all in store builds. *Solution:* minimal pairs + scheduled tone cards now; speech
   plugin next; bounded per-syllable tone scoring later. *Why:* the first thing a
   comparing reviewer checks; a durable moat the generalists can't cross.
   *Inspiration:* HelloChinese in-loop feedback; Skritter tone-as-SRS-dimension;
   SpeechSuper APIs. *Better because* tone items become *scheduled memory*, not a
   one-off drill. *Difficulty: staged low → high.*
10. **One progress surface with the honest number.** *Problem:* the market's best
    mastery data, scattered across Profile; Test buried on mobile. *Solution:* a level
    screen — "742 / 1,200 HSK 4 words mastered", readable-stories count, test CTA,
    calendar — composed from existing components. *Why:* P3/P6 — the number the
    learner steers by, and the number they screenshot. *Inspiration:* Hack Chinese
    dashboards, Busuu's credential framing. *Better because* the number is FSRS-real
    and HSK 3.0-native. *Difficulty: low-medium.*

---

*End of report. Nothing here has been implemented; this document is the research,
analysis, and prioritized strategy requested — implementation decisions belong to the
owner and the PM board.*
