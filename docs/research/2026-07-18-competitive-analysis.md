# Hanzi Dojo — Competitive Analysis & Inspiration Report

*What the best language-learning apps do better than us, and what we can steal.*
Prepared 2026-07-18. Research method: 4 parallel web-research passes across ~40 apps in four clusters (Chinese-specific, SRS/kanji tools, reading/immersion platforms, gamified/AI-tutor apps). Kitsunewa.com and several app domains are blocked by this environment's egress policy, so findings lean on reviews, roundups, and app-store copy rather than live walkthroughs. Prices are 2025–2026 as reported and drift often — re-verify before quoting.

---

## TL;DR — the five things that matter most

1. **Content depth is the moat we don't have.** Du Chinese (3,000+ hand-written stories), The Chairman's Bao (9,500+ graded news, daily), HelloChinese (1,000+ stories + 2,000 videos) win on a deep, curated, *interesting* library. Our generated "% known" stories risk feeling thin and samey. And our signature bet — **AI stories from your vocabulary — is no longer unique**: Langua, Miao AI, WordWise, MeloLingua already generate graded stories from a user's deck. Our moat now has to be *execution*, not the idea.

2. **The single biggest structural gap is "bring your own content."** LingQ, Readlang, jpdb, and DuShu all let a learner read *their own* text/video annotated against *their own* known words. We have none of it. A paste-text / paste-URL MVP that applies our "% known" + tap-to-add UX would close the widest gap versus the category leaders.

3. **Grammar is a whole category we treat as static.** Bunpro, MaruMori, and Renshuu *schedule grammar as SRS cloze items*. Our grammar guides are read-only reference. This is the largest pedagogy gap and it fits our existing tap-to-reveal UI perfectly.

4. **We have no speaking / pronunciation / tone-production loop** — a glaring hole for Chinese, where tones are everything. HelloChinese shows tone-contour graphs; the free browser `SpeechRecognition` API gives us a "read it aloud, get a ✓" loop at zero marginal cost, and it out-features every reading-only competitor (Du Chinese, TCB, LingQ all lack it).

5. **Our anti-streak stance is a marketing asset, not a handicap.** The Duolingo backlash is a real, documented genre ("I'm quitting Duolingo" threads; listicles selling "calm" alternatives; Pimsleur monetizing "no gamification"). Say it out loud: *"No streaks. No leagues. No guilt. Just real progress."* Then replace the streak with honest mechanics (study rhythm, named mastery ladder, gentle return, monthly recap).

---

## Where Hanzi Dojo already wins (don't lose these)

These came up repeatedly as genuine, defensible strengths:

- **A real FSRS scheduler.** Many competitors still run SM-2 or two-sided recognition cards (Hack Chinese is even critiqued for card style). FSRS with true mastery prediction is a real edge.
- **The tight vocab-unlocks-matched-stories loop with live "% known."** No competitor fuses FSRS → personalized comprehensible-input this cleanly. jpdb and LingQ track known words; none tie it to a generated, level-matched story engine the way we do.
- **The unique triple combination: SRS engine + graded reader + AI chat in one app.** Hack Chinese (SRS), Du Chinese (reader), and the AI-tutor apps each do *one* of these. Nobody does all three. Positioning line: *"Hack Chinese's memory engine + Du Chinese's stories + a tutor, in one calm app."*
- **"Honest" 90%/100% mastery gating** vs. gamified fake streaks — aligned with a documented market appetite for calm alternatives.
- **Offline-first PWA, zero-config.** The immersion power tools (Migaku, LingQ, Language Reactor) are *repeatedly* criticized for setup friction, desktop dependence, and Anki overhead. Our winning message: *"the LingQ/Migaku learning model without the assembly."*
- **Multi-language breadth** (Chinese/Japanese/Russian) and a **calm single-next-action home** — the antidote to Duolingo's cluttered, anxiety-inducing UI.

The gaps below are almost entirely about **content depth, reading UX, grammar, speaking, character pedagogy, and growth** — not the core engine.

---

## The gaps, by theme (with who does it best and what to steal)

### A. Content depth & the AI-story threat
- **Du Chinese** — 3,000+ professionally written/recorded stories, HSK-tiered, weekly updates, 4.9★ (43k reviews). **The Chairman's Bao** — 9,500+ graded *news* lessons, up to 6/day, topical and fresh. **Maayot** — one teacher-written story a day; reviewers praise the *stories themselves* as interesting, a warning that AI-generated voice/quality matters. **Mandarin Companion** — book-length narratives under strict vocab control (recurring characters, sustained arcs).
- **The AI-story cohort already exists:** **Langua** weaves your saved vocab into generated stories; **Miao AI** generates personalized level-adaptive stories with per-story quizzes + SRS; **WordWise AI** builds a story from any scenario you describe; **MeloLingua** does daily personalized graded stories + audio + pronunciation feedback. There's even a 2025 paper, *"SRS-Stories: Vocabulary-constrained multilingual story generation"* (arXiv 2512.18362), on exactly our technique.
- **Steal:**
  - Ship **"generate a story from my deck / weak words"** as a first-class button, constraining generation to known + a few target-new words — before the AI-story startups own the category (it's already on our roadmap; the competitors make it urgent).
  - **Interest/scenario prompts** ("a detective story," "about cooking") so generated content is personally engaging — directly addresses the Maayot "quality drives retention" lesson.
  - **Topic/genre tagging + filtering** of the story library (Mandarin Bean tags Business/Culture/History/News/Travel) so learners pick by interest, not just level.
  - **Multi-chapter serials with recurring characters** (Mandarin Companion) so vocabulary recycles across an arc instead of resetting each vignette.
  - A **"daily fresh" lane** (Maayot / TCB ritual) — leverage our existing web-push as a *content* hook ("a new story unlocked at your level"), not just a review nag.

### B. Reading UX
- **Du Chinese** — **word-level karaoke audio**: the current word highlights as native audio plays; *tap any word to start playback from there*; 0.5–1.5× speed; graduated pinyin (all / only-hard / off). **Satori Reader** — **context-aware definitions** (the *sense used in that sentence*, not a dictionary dump), gray underlines for idioms/cultural notes, sentence-level voice-actor audio. **The Chairman's Bao** — per-article reading *and* listening comprehension quizzes; tap-word highlights *every* occurrence in the text. **Beelinguapp** — side-by-side L1/L2 parallel text with karaoke scroll.
- **Steal:**
  - **Upgrade TTS from sentence-level to word-synced karaoke** with tap-to-play-from-here. Concrete, achievable, table-stakes among reading apps.
  - **Graduated pinyin** — show pinyin only for words above the learner's known level (a natural fit for our "% known" data), instead of all-or-nothing.
  - **Sense-disambiguated definitions in context** — we already have the sentence and the word; pick the right gloss.
  - **Comprehension quizzes** appended to stories (we have a *progress* recap, not a *comprehension* check).
  - **Highlight-all-occurrences** of a tapped word within a story; optional **tone-based character coloring** (DuShu) as a display mode.
  - Optional **full side-by-side translation** view for a whole story (Beelinguapp) for learners who stall on longer passages.

### C. Bring-your-own-content & a global "% known" model
- **LingQ** — the category king: import *anything* (articles, ebooks, Netflix/YouTube subs, podcasts), every word color-coded new→learning→known, status follows the word across your *entire* library, and it computes each text's "% unknown" so difficulty is visible at a glance. **jpdb** — a word learned in one deck is marked known everywhere; "% known" for any new text updates automatically. **Readlang** — click any word / drag any phrase on *any* webpage to translate; every lookup auto-saves to SRS; experimental pinyin/furigana. **DuShu** — import .txt/.html/.epub. **Lute** — parent/child term linking (a base form's definition auto-applies to inflected forms).
- **Steal (highest-leverage cluster):**
  - **Make "% known" a persistent, global word-status model** (new/learning/known driven by FSRS state), not a per-story stat — surface every story's, video's, and pasted text's difficulty from that global state. This *generalizes our existing bet.*
  - **Bring-your-own-text MVP** — paste an article/URL, get it auto-annotated against the known-word set with the same tap-to-reveal/add UX. Even a paste-only version closes the biggest gap vs. LingQ.
  - **Phrase-level selection** (Readlang) — drag to add a multi-character chunk or idiom, not only single words.
  - **Word-family linking** (Lute) — connect character/word variants and shared components so learning one form credits the family.

### D. Reading → SRS (sentence mining)
- **Migaku** — one click on a subtitle word builds a card embedding **a video clip + screenshot + the sentence + the word's audio**; live known/unknown coloring over subs, synced from SRS state. **Satori Reader** — SRS cards **carry the source sentence + its audio**. **Readlang** — every lookup auto-flows to review. **Clozemaster** — cloze from real sentences; Pro users build cloze sets from pasted passages.
- **Steal:**
  - When a word graduates from a story into FSRS, **attach the source sentence and its TTS audio to the review card.** Turns reading into higher-retention review and deepens the read↔SRS loop that is our signature. (Low effort — we already have both the sentence and the TTS.)
  - **Auto-generate cloze exercises from the sentences the learner just read**, targeting that story's new words (our Practice Lab already has fill-in-blank; sourcing blanks from just-read stories is the upgrade).
  - For video input: **capture the frame + audio clip + sentence** onto mined cards, Migaku-style.

### E. Grammar-point SRS  *(largest pedagogy gap)*
- **Bunpro** — 800+ grammar points N5→N1 drilled via **cloze deletion**, 10,000+ example sentences, textbook-order sync (Genki/Minna), per-point nuance/common-mistake pages, "ghost" reviews for failed items, cram mode. $5/mo, $150 lifetime. **MaruMori** — grammar SRS *plus* in-depth lessons bundled with vocab/kanji/reading. **Renshuu** — 7,500+ hand-made grammar questions, construction diagrams.
- **Steal:**
  - **Convert our grammar guides into first-class FSRS-scheduled cloze items** ("tap to reveal" already fits), unlocked by the same vocab-mastery loop.
  - **Blank out one target grammar pattern per graded story** and have the reader produce it — grammar drilling inside comprehensible input.
  - **Just-in-time grammar:** tie grammar notes to the structures appearing in each unlocked story ("this story introduces 把-construction"), turning passive guides into contextual lessons (LingoDeer's grammar-first strength, minus the separate course).

### F. Character / component / mnemonic pedagogy
- **WaniKani** — the gold standard: never teach a character before its radicals, never a word before its characters; each part ships with a **named mnemonic story**; **legible mastery ladder** (Apprentice→Guru→Master→Enlightened→Burned). **HanziHero** — Chinese radical→component→character→word progression with a fixed per-sound mnemonic system. **jpdb** — *need-based* kanji: teaches only the components a chosen word requires, on demand. **Zizzle** — visual mnemonic stories that encode shape + meaning + **tone**. **Dong Chinese** — real **etymology** for the 1,000 most frequent characters. **MaruMori** — mnemonic order that reuses learned kanji to teach new ones.
- **Steal:**
  - **Teach shared components / phonetic series (声旁) as first-class items** so new hanzi decompose into already-known parts (e.g. 青 → qīng/qíng/jīng…), rather than treating each word as atomic. Highest-leverage character-pedagogy add for Chinese.
  - **Optional mnemonic hints** (visual story or component breakdown, ideally encoding the tone) on hard/confusable words — a first-exposure aid FSRS timing can't provide.
  - **Etymology snippets** on character cards as an alternative to arbitrary mnemonics.
  - Consider **need-based introduction** (jpdb) — surface only the components a just-unlocked word requires.

### G. Speaking, pronunciation & tone feedback  *(glaring hole)*
- **HelloChinese** — speech recognition with **tone-contour graphs** (your tone vs. target). **ChineseSkill** — speech assessment + tone animations. **NativShark** — pitch/intonation visualizer + shadowing loops. **Speak** — the category leader on speaking-first output with scoring. Kitsunewa's whole product is a browser-speech-rec "Speaking Gym."
- **Steal:**
  - **Pronunciation scoring via the free Web Speech API** — user reads/repeats a line aloud, we compare transcript-to-target for a ✓/try-again. Zero marginal cost, closes the speaking gap that Du Chinese / TCB / LingQ *completely lack*.
  - **A tone-contour visualizer** for Mandarin's 4 tones + sandhi (NativShark's pitch visualizer applied to Chinese) in the tones module.
  - **Shadowing loops** built from the sentences in a learner's graded stories (reuse existing story audio).

### H. Handwriting with scaffold-fading
- **Skritter** — real-time handwriting recognition with **per-stroke feedback** (tells you *which* stroke is wrong), SRS-scheduled. **Ringotan** — **progressive hint-fading**: trace → dotted guide → stroke-count hint → blank, escalating as the character matures in SRS. **Pleco** — full-screen handwriting with high error tolerance.
- **Steal:**
  - **SRS-scheduled handwriting with progressive scaffold-fading** — our writing practice should escalate as a character matures in FSRS, not offer a fixed exercise. Applies to hanzi, kana, and Cyrillic.
  - **Stroke-level feedback** (grade *how* you wrote, not just show the animation) — the real differentiator over our current stroke-order module.

### I. SRS depth & study modes
- **Anki** — FSRS is now first-party with a per-user **optimizer** and a **desired-retention slider**; explicit **leech detection** (auto-flag after N lapses); rich **stats & forecasts** (7-day load, True Retention, heatmaps). **Hack Chinese** — **CRAM mode** to temporarily override the schedule for exam/trip prep; textbook-aligned preset lists. **Renshuu** — **question-format variety** (recognition/typing/audio/handwriting) + goal-anchored adaptive scheduling. **Torii** — **font randomization** (recognize the character across typefaces) + no-consequence "Endless Practice." **Kitsun/Kanji Study** — CSV/Anki import + custom user sets + input-verification cards.
- **Steal:**
  - **Formal leech detection + intervention** — after N lapses, flag a word and surface it in the "weak words" bucket *with a mnemonic / decomposition / alternate card type*, not infinite re-queuing.
  - **Learner-facing forecast & retention stats** ("next 7 days: ~X cards/day") + a **desired-retention control** — reinforces the "calm coach" promise and lets users self-regulate load.
  - **Cram / override mode** on top of FSRS for exam or trip prep (Hack Chinese).
  - **Question-format variety** and **font randomization** for deeper, generalizable encoding and less monotony.
  - **CSV/Anki import + custom user sets** ("words from my textbook ch. 5") that feed the same FSRS engine and unlock stories — lowers cold-start friction. (Cautionary tale: Memrise alienated power users by *stranding* community content — if we build it, don't kill it.)

### J. AI tutor upgrades (beating basic "Chat Missions")
- **Langua** — extracts vocab/mistakes from the conversation into flashcards; adjustable speaking speed. **TalkPal** — roleplay + debate + grammar-correction reports. **Duolingo Max** — Roleplay + a *recurring character with personality* (Lily) + "Explain My Answer." **Busuu** — human community correction. Universal complaint across all: AI tutors are **too forgiving, robotic, expensive, and give feedback too late**; the best-loved feature everywhere is the **end-of-chat report that saves mistakes into review.**
- **Steal (our unfair advantage):**
  - **Constrain the AI to the user's *known* vocab** (+ a few target-new words) — *comprehensible-input conversation*. No competitor's chatbot knows exactly which words you've mastered. This is a prompt change, not new infra, and it's our single strongest chat differentiator.
  - **End-of-chat recap that feeds FSRS** — new words tapped, words used correctly, 1–3 gentle corrections → straight into the queue. Closes review→story→chat→review into a flywheel.
  - **Recurring named characters + concrete goals** ("order dumplings from 老王," goal-completion detected by the LLM) — on-brand with honest progression.
  - **A "corrections" toggle** ("just chat" vs "correct me") and **tappable suggested replies** built from known words to kill blank-box paralysis.

### K. Engagement without streaks
- Duolingo's streak works via **loss-aversion scaffolding** (Streak Freeze/Repair, Society) — the manipulative kind. The backlash is documented and monetizable (Pimsleur = "no gamification"). WaniKani replaces streaks with a **named mastery ladder** ("Burned" = permanent win); Renshuu uses low-stakes community (haiku, shiritori) and reports *streaks causing anxiety*.
- **Steal (the honest kind — reflect real progress, don't manufacture fear):**
  - **"Study rhythm," not a chain** — "studied 4 of the last 7 days" as a calm 7-dot ring; no fire, nothing to protect.
  - **Mastery as the hero metric** — "words mastered / maturing / due" (can't be farmed; only rises on real learning). Give our mature FSRS cards a satisfying **named terminal state** (à la "Burned").
  - **Forgiveness by default** — on return after a lapse, right-size the queue ("Welcome back — 12 words are ready, let's ease in") instead of dumping a 300-card backlog (the #1 reason SRS users quit).
  - **Monthly recap card** — our calm "Wrapped" (words learned, stories read, a milestone); doubles as a growth loop.
  - **Gentle, value-based notifications** (one/day, user-scheduled): "A new story unlocked" beats "Don't lose your streak!"

### L. Onboarding & the first 60 seconds
- **Duolingo** — value *before* signup: motivation survey → real lesson → *then* register; notification opt-in only after the first win. **Busuu** — upfront CEFR placement test so intermediates skip the basics. **Speak** — speaking aloud within a minute.
- **Steal:**
  - **Let a guest read a story in the first 30 seconds — no signup.** Our killer demo, and *unique among direct competitors* (Du Chinese / TCB gate content fast). Tap through one micro-story, feel "I just read Chinese," *then* "Create a free account to save these 6 words."
  - **Turn our 90% level test into the onboarding placement test** — an adaptive 10–15-item quiz so intermediates start at HSK 3–4, not 你好 (the #1 onboarding-churn cause for structured apps).
  - **A short motivation intake** (why: travel/heritage/HSK/anime; language; rough level) to personalize the first story and set the daily target.
  - **Ask notification permission *after* the first story + first review**, framed as a gentle nudge.

### M. Monetization
- Reference prices: Du Chinese $14.99/mo · $79.99/yr · **$119.99 lifetime**; TCB $11/mo · **$385 lifetime**; Hack Chinese ~$12/mo, **21-day no-card trial**; LingQ ~$12.99/mo. Category anchors: Duolingo Max ~$30/mo (AI as the top tier), Speak ~$20/mo. Many respected apps offer **one-time / lifetime** options (DuShu $14.99, Zizzle/HanziHero/Pleco lifetime) and reviewers *explicitly* praise escaping subscription fatigue.
- **Steal (indie-realistic — put metered-cost features behind the wall):**
  - **Free tier = the calm daily loop, unlimited** (FSRS review + rotating graded stories + story TTS). Acquisition engine + brand; undercuts Du Chinese/TCB who wall content aggressively.
  - **Paid "Dojo Pro" = the AI + volume + convenience:** unlimited Chat Missions (token-heavy → honest paywall), full/new story library, pronunciation practice, extra Practice Lab modes, offline audio.
  - **Undercut the incumbents:** ~$6–8/mo or ~$49/yr, plus a **$99–129 lifetime** to match Du Chinese and capture cash upfront — while offering *more* (SRS + stories + AI).
  - **Soft paywall at demonstrated value** (after the first Chat Mission, not the door) + a **no-card reverse trial** (Hack Chinese's 21 days). Skip hearts/energy — it's exactly the manipulative pattern our brand rejects.

### N. Growth loops
- **Programmatic/SEO content libraries** are the category's cheapest CAC (Duolingo dictionary + "how do you say X"; the Chinese SERPs are dominated by review/listicle sites — the intent traffic is proven and winnable). **Duolingo Year in Review** is the gold-standard shareable. **Free placement quizzes** are classic lead magnets. Kitsunewa runs a big free `/reference` + `/guides` SEO library funneling into the app.
- **Steal (highest leverage first, all suited to a solo dev):**
  1. **Free public "What HSK level are you?" test** — our #1 lead magnet. We already own the level-test engine; expose an adaptive, no-signup placement quiz on the open web ending in a shareable result card + "your first stories are ready → start free." Nails SEO ("HSK level test" = high-intent), public assessment, and shareable results in one build. Do JLPT + CEFR versions too. (Already half on the roadmap as "How much can you read?")
  2. **Programmatic SEO off our own story/vocab library** — auto-publish crawlable per-word pages ("你好 — meaning, pinyin, HSK level, examples, hear it") and story landing pages, each ending in "keep reading free." Free inventory we already generate.
  3. **Monthly recap share card** (= the Theme-K calm mechanic) and an **"I read my first Chinese story" share moment** (emotional peak = best share trigger; advertises our exact differentiator).
  4. **Lightweight referral** ("give a friend 30 days of Pro, get 30 days") and **seed r/ChineseLanguage & r/LearnJapanese** as the calm, honest, no-streak alternative in the recurring "Duolingo alternative" threads that already rank.

---

## Prioritized action list

**Quick wins (days, mostly prompt/UX, reuse existing infra)**
1. **Constrain Chat Missions to known vocab + chat recap → FSRS** (our unfair advantage; prompt + existing queue).
2. **Attach source sentence + TTS audio to review cards** when a word graduates from a story.
3. **Web Speech API pronunciation check** ("read aloud, get ✓") on story sentences.
4. **Graduated pinyin** (only above-level words) using existing "% known" data.
5. **Comprehension quiz** appended to each story.
6. **Notification & onboarding fixes** — read-a-story-before-signup, placement test from the existing level-test engine, delayed notif opt-in, value-based push copy.

**Medium (weeks)**
7. **Word-synced karaoke audio** with tap-to-play-from-here.
8. **"Generate a story from my deck / weak words" + interest prompts**; topic tagging + serials.
9. **Grammar-point SRS** (cloze from grammar guides; blank a target pattern per story).
10. **Bring-your-own-text MVP** (paste article/URL → annotated against known words).
11. **Free public HSK/JLPT level test** as SEO + share lead magnet.
12. **Leech detection + intervention; learner-facing forecast/retention stats; cram mode.**
13. **Monthly recap share card;** study-rhythm ring; named terminal mastery state; gentle return.

**Big bets (months, differentiating)**
14. **Global "% known" word-status model** across stories + practice + imported content (generalizes our core bet — the LingQ/jpdb play).
15. **Hanzi component / phonetic-series teaching order + mnemonics.**
16. **Graded YouTube** — grade & filter a video catalog by transcript "% known" (+ speech-speed/topic), then present the transcript with tap-to-add + word-synced audio + sentence-mining. Fuses the "annotate-anything" and "graded-catalog" models nobody combines.
17. **SRS-scheduled handwriting with progressive scaffold-fading** (+ stroke-level feedback).
18. **Programmatic SEO** over the generated story/vocab library; import path (CSV/Anki) + custom user sets.

**Positioning throughout:** *"No streaks. No leagues. No guilt. Just real progress — the LingQ/Migaku learning model without the assembly, plus a tutor that only speaks words you know."*

---

## Quick-reference: who to copy for what

| Capability | Best-in-class | The steal |
| --- | --- | --- |
| Graded-reading depth/quality | Du Chinese, The Chairman's Bao, Maayot | Curated + generated library, daily lane, serials, topic tags |
| Word-synced audio | Du Chinese | Karaoke highlight + tap-to-play-from-here |
| Context-aware definitions | Satori Reader | Sense-in-this-sentence gloss |
| Known-word model / "% known" everywhere | LingQ, jpdb | Global FSRS-driven word status |
| Bring-your-own-content | LingQ, Readlang, DuShu | Paste text/URL → annotated |
| Reading → SRS mining | Migaku, Satori | Sentence + audio on the card |
| Grammar SRS | Bunpro, MaruMori | Cloze from guides + inside stories |
| Component/mnemonic pedagogy | WaniKani, HanziHero, jpdb | Phonetic-series teaching order + mnemonics |
| Pronunciation / tone | HelloChinese, NativShark, Kitsunewa | Web-Speech scoring + tone-contour visualizer |
| Handwriting | Skritter, Ringotan | Scaffold-fading + per-stroke feedback |
| SRS depth | Anki, Hack Chinese, Renshuu | Leech handling, stats/forecast, cram, format variety |
| AI tutor | Langua, Duolingo Max | Known-vocab constraint + recap→FSRS + recurring characters |
| Anti-streak engagement | WaniKani, Renshuu, Pimsleur | Mastery ladder, study rhythm, gentle return |
| Onboarding | Duolingo, Busuu | Read-before-signup + placement test |
| Monetization | Du Chinese, Hack Chinese | AI-behind-paywall, undercut price, lifetime, no-card trial |
| Growth | Duolingo, Kitsunewa | Public level test, programmatic SEO, share cards |

---

## Key sources
Du Chinese (duchinese.net; languavibe.com/du-chinese-review; alllanguageresources.com/du-chinese-review) · The Chairman's Bao (thechairmansbao.com; alllanguageresources.com/chairmans-bao-review) · Maayot (maayot.com; goeastmandarin.com/maayot-chinese-reading-app-review) · Mandarin Bean (mandarinbean.com) · DuShu (cultureyard.net/blog/dushu-app-review) · Mandarin Companion (mandarincompanion.com) · Pleco (pleco.com) · Skritter (skritter.com; hackingchinese.com/skritter-chinese-review) · Hack Chinese (hackchinese.com; hsklord.com/blog/hack-chinese-review) · Zizzle (zizzle.io) · HanziHero (hanzihero.com) · Dong Chinese (dong-chinese.com) · HelloChinese (fluentu.com/blog/reviews/hellochinese) · LingoDeer (hsklord.com/blog/lingodeer-chinese-review) · ChineseSkill (linguasteps.com/reviews/chineseskill-review-2025) · Mandarin Blueprint (fluentu.com/blog/reviews/mandarin-blueprint) · Chinese Zero to Hero (chinesezerotohero.com) · Anki (github.com/open-spaced-repetition/fsrs4anki; docs.ankiweb.net/leeches.html) · WaniKani (knowledge.wanikani.com/wanikani/srs-stages; tofugu.com WaniKani review) · Bunpro (bunpro.jp; tofugu.com/reviews/bunpro) · jpdb (jpdb.io/faq; tofugu.com jpdb review) · Renshuu (cotoacademy.com renshuu review) · Migaku (migaku.com; tofugu.com migaku review) · Kitsun (kitsun.io) · MaruMori (marumori.io) · NativShark (nativshark.com) · Ringotan (ringotan.com) · Kanji Study (tofugu.com kanji-study review) · Torii (torii-srs.com) · Memrise (en.wikipedia.org/wiki/Memrise) · LingQ (lingq.com/blog/lingq-review; lingq.com/blog/import-any-youtube-video-into-lingq) · Satori Reader (satorireader.com/features) · Readlang (readlang.com/features) · Lute (github.com/LuteOrg/lute-v3) · Language Reactor (languagereactor.com/help/export) · Trancy (trancy.org) · FluentU (fluentu.com/pricing) · Clozemaster (clozemaster.com/faq) · Beelinguapp (beelinguapp.com) · AI-story cohort (miaoai.app; languatalk.com/try-langua; wordwise-ai.com; melolingua.com; arXiv 2512.18362) · Duolingo backlash / calm alternatives (polychatapp.com/blog/apps-better-than-duolingo; lingostar.ai/duolingo-alternatives; androidauthority.com/duolingo-alternatives) · Chinese app roundups (hskstory.com/guides/best-chinese-reading-apps; clozemaster.com/blog/best-apps-to-learn-chinese)

*Prices and feature sets as reported in 2025–2026 reviews; re-verify before publishing. No code was read or changed — this is pure research.*
