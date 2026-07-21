# 🧪 Needs testing

Things that shipped and need a real-device / real-account pass before we call them
truly done. **This file mirrors to the `#needs-testing` Discord forum** (one thread
per item) via `.github/workflows/needs-testing-sync.yml` — testers react ✅ when an
item works, or reply with what broke. Check an item off (`- [x]`) once it's verified;
the thread flips to ✅.

Item format: `- [ ] ` + `` `stable-id` `` + `**Title**` + ` — what to check`.

## Open
- [ ] `calm-home-recap` **Calmer Home & session recap** — open Home: no "day streak" badge or "study today to keep it" line anywhere, and the "Today's Dojo" card itself is tappable (whole card, not just a small pill) and opens your cards. Finish a study session: no XP or accuracy number, just two calm tiles ("Today: N reviewed, M new" / "Tomorrow: N due, M new"), then straight into the unlocked story.
- [ ] `wow-onboarding` **First-run wow moment** — sign out (or a fresh browser) → start sign-up → pick a reason. Do you read a real Chinese sentence (tap words for pinyin + meaning; the "you understand %" meter fills to 100), then tap "Save these words" straight into sign-up (no repeat screen)? After creating the account: does the first-session welcome say "You already met …", and does the goal step read "~N days to unlock more stories"? (Audio uses the browser voice until TTS clips are generated.)
- [ ] `dict-search` **Dictionary search** — Practice → Dictionary: search by hanzi (中文), toneless pinyin (zhongwen), and English (friend). Fast results, tone-colored pinyin, and the `Full dictionary` / `My syllabus` toggle both work?
- [ ] `dict-entry` **Dictionary entry** — open a word: numbered definitions, a tappable **Chars** breakdown (tap a character to drill into its own entry), "words containing", and an **Examples** tab (sentence + pinyin + English, with the word highlighted)?
- [ ] `dict-strokes` **Stroke order** — in an entry, tap **Strokes**: does an animated stroke-order diagram play for each character?
- [ ] `dict-add-deck` **Save any word (flashcard anything)** — add a word that isn't in your HSK level to your deck from the dictionary. Does it flip to "In deck", show up in your reviews, and NOT get counted in a level test?
- [ ] `dict-recent` **Recent lookups** — open the Dictionary with the search box empty: do recently-viewed words appear under "Recent" (tap to reopen, Clear to empty)?
- [ ] `hsk-3-6` **HSK 3–6 levels** — the new Chinese levels: can you study them (flashcards showing example sentences + audio), do their level tests work, and does onboarding/placement offer them?
- [ ] `chinese-tts` **Chinese pronunciation** — on a flashcard, do 长 / 行 / 银行 / 重 / 觉 sound correct? Hard-refresh first (the service worker caches audio).
- [ ] `assessment` **"How much can you read?"** — open `/how-much-can-you-read`, finish the quiz; does the % and level feel about right at both extremes (all-right vs all-wrong)?
- [ ] `comprehension` **Story comprehension check** — finish a story in each format (paced / chat / scene / reply); do the end-of-story questions appear and score correctly?
- [ ] `story-practice` **Practice from a story** — after finishing a story with ≥4 new words, does "Practice the N new words" open a fill-in-the-blank drill?
- [ ] `review-mining` **Story sentence on cards** — add a word while reading, then review it; does the card show "From a story you read" with that sentence?
- [ ] `speaking` **Speaking drill** — Practice → Speaking on Chrome (Android/desktop): say a word, do you get a ✓? On iOS it should show the friendly "not supported" fallback.
- [ ] `read-own-text` **Read your own text** — Practice → Analyze text: paste a paragraph, Analyze, then tap words in the "Read it" view to look up and add them.
- [ ] `email-sender` **Sign-in email** — request a magic link to an external inbox; does it arrive from `no-reply@hanzi-dojo.com` (not the Supabase default) and land in the inbox?
- [ ] `oauth-branding` **Google sign-in branding** — does the Google consent screen say "Hanzi Dojo" (after the OAuth app-name + publish change) instead of the Supabase URL?
