# 🧪 Needs testing

Things that shipped and need a real-device / real-account pass before we call them
truly done. **This file mirrors to the `#needs-testing` Discord forum** (one thread
per item) via `.github/workflows/needs-testing-sync.yml` — testers react ✅ when an
item works, or reply with what broke. Check an item off (`- [x]`) once it's verified;
the thread flips to ✅.

Item format: `- [ ] ` + `` `stable-id` `` + `**Title**` + ` — what to check`.

## Open
- [ ] `chinese-tts` **Chinese pronunciation** — on a flashcard, do 长 / 行 / 银行 / 重 / 觉 sound correct? Hard-refresh first (the service worker caches audio).
- [ ] `assessment` **"How much can you read?"** — open `/how-much-can-you-read`, finish the quiz; does the % and level feel about right at both extremes (all-right vs all-wrong)?
- [ ] `comprehension` **Story comprehension check** — finish a story in each format (paced / chat / scene / reply); do the end-of-story questions appear and score correctly?
- [ ] `story-practice` **Practice from a story** — after finishing a story with ≥4 new words, does "Practice the N new words" open a fill-in-the-blank drill?
- [ ] `review-mining` **Story sentence on cards** — add a word while reading, then review it; does the card show "From a story you read" with that sentence?
- [ ] `speaking` **Speaking drill** — Practice → Speaking on Chrome (Android/desktop): say a word, do you get a ✓? On iOS it should show the friendly "not supported" fallback.
- [ ] `read-own-text` **Read your own text** — Practice → Analyze text: paste a paragraph, Analyze, then tap words in the "Read it" view to look up and add them.
- [ ] `email-sender` **Sign-in email** — request a magic link to an external inbox; does it arrive from `no-reply@hanzi-dojo.com` (not the Supabase default) and land in the inbox?
- [ ] `oauth-branding` **Google sign-in branding** — does the Google consent screen say "Hanzi Dojo" (after the OAuth app-name + publish change) instead of the Supabase URL?
