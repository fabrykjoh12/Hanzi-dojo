# 🧪 Recruiting beta testers

How to bring the first testers into Hanzi Dojo before marketing. Pairs with the
in-app tester area built by `scripts/testing-discord.mjs` (#tester-start-here,
#test-missions, #known-issues). Aim for **10–30 engaged testers**, not hundreds —
a small group that actually uses the app daily beats a big silent one.

## Where to find them
- **People you know** who study Chinese/Japanese/Russian — highest conversion.
- **Reddit**: r/ChineseLanguage, r/LearnJapanese, r/languagelearning, r/hsk, r/LearnUyghur (no) — post in the weekly "share your project / resources" threads, not as a standalone ad.
- **Discord language servers** — ask mods first; offer value, don't spam an invite.
- **Language-learning forums** (e.g. r/languagelearning "study buddies"), Lang-8 style communities, and X/Twitter #langtwt.

## The golden rule of recruiting
Ask for a **specific, small commitment**: *"Use it 10 minutes a day for a week and drop one bug or idea in Discord."* That's far more effective than "come test my app."

---

## Copy-paste messages

### Short DM (to a friend / individual)
```
Hey! I built a language-learning app — Hanzi Dojo. It teaches you words with
smart flashcards, then unlocks little stories you can actually read at your level
(Chinese, Japanese, Russian).

I'm looking for a few early testers. Would you try it ~10 min/day for a week and
tell me what's broken or confusing? There's a Discord to drop feedback:
https://discord.gg/GhWDpgZY9N

App: https://www.hanzi-dojo.com/
```

### Community post (Reddit / Discord — where allowed)
```
[Beta] Hanzi Dojo — learn words, then read stories you can actually understand

I've been building a reading-first app for Chinese / Japanese / Russian. Instead
of endless flashcard streaks, every word you learn unlocks graded mini-stories
matched to your known vocabulary — so studying turns into real reading.

Looking for beta testers to try it ~10 min/day and tell me what breaks or feels
off. It's free, no card needed.

Try it: https://www.hanzi-dojo.com/
Feedback Discord: https://discord.gg/GhWDpgZY9N

Happy to answer anything in the comments!
```

### Pinned welcome for new testers (already an embed in #tester-start-here)
Point everyone there first — it explains what to test, how to report, and what they get back.

---

## First-round test plan (Round 1)
Post this in **#test-missions** (already seeded) and `@Beta Testers` when you kick off:

1. **First run** — sign up, pick a language, finish onboarding. Did it end with a story unlocked? Anything confusing?
2. **Flashcards** — learn 10+ words; try Flip and Typed modes. Grading feel right? Audio play?
3. **First story** — read one. Do "% known", underlined words, tap-to-reveal, tap-to-add work?
4. **Offline** — airplane mode mid-session; does it keep working and sync on reconnect?
5. **Their device** — note exact device + browser; flag anything broken at their screen size.

## Running the round (keep testers engaged)
- **Reply to every report in-thread** — even just "thanks, fixed in the next build."
- **Post fixes in #announcements** — testers who see their reports ship stay and recruit others.
- **Keep #known-issues current** — stops duplicate reports.
- **Update the roadmap** (`ROADMAP.md`) as you ship — it auto-posts to #roadmap so testers watch progress.
- After ~a week, post a short **"Round 1 recap"**: what you learned, what shipped, what's next.

---

_Once Round 1 feels stable and testers are happy, that's your signal to start marketing._
