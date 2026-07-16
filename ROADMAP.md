# 🗺️ Hanzi Dojo Roadmap

The living plan for what's next. **Editing this file automatically posts an
update to the `#roadmap` channel in Discord** (via `.github/workflows/discord-notify.yml`),
so the community always sees the latest. Keep it current — move things to
**Shipped** as they land.

## 🚧 Now — in progress
- [ ] "How much can you read?" — a 60-second public assessment with a shareable result (builds on public story links)

## 🔜 Next — planned

**Growth — let the product introduce itself**

**Habit & re-engagement**
- [ ] Timezone-correct daily reminders (no more ~1h drift across DST changes)
- [ ] Weekly progress email — "you can now read N% more"

**Content & languages**
- [ ] Expand Chinese into **HSK 3** (and higher bands over time)
- [ ] More levels for **Japanese** (JLPT N4+) and **Russian** (A2+)
- [ ] More graded stories at every level and language
- [ ] **Pictures on flashcards** — a visual memory hook alongside the word
- [ ] **Higher-quality TTS voices** — research + regenerate more natural narration
- [ ] **Spanish** track (future)

**Reading & video**
- [ ] **Graded YouTube** — turn any video into a lesson matched to your vocabulary: see "% you'll understand," tap words in a transcript synced to playback, pre-learn the key new words, then watch. (Not just recommended videos — the video version of graded stories.)
- [ ] Known-Word Map & Reading Ladder — visualize what you can read as your vocabulary grows
- [ ] Personalized stories built from the exact words in your deck
- [ ] Word-to-World chat missions expanded across levels

**Your words & tools**
- [ ] **Add your own flashcards** — custom cards / decks for words the app doesn't have yet, scheduled by the same FSRS engine
- [ ] **Built-in dictionary** — search any word, hear it, and add it to your deck (future)

**Polish**
- [ ] Cleaner sign-in emails — branded sender from hanzi-dojo.com, links that stay on the domain

## 🧱 Technical
- [ ] Collapse the multi-write grading path into a single Supabase RPC/transaction
- [ ] Real-device verification pass — offline replay, iOS audio, push reminders end-to-end
- [ ] Tune the FSRS scheduler from real review data
- [ ] Continue extracting the large `Study` screen into focused hooks/components
- [ ] Supabase generated types; centralize design tokens

## ✅ Shipped
- [x] Graded mini-stories with live "% known"
- [x] Offline-first PWA with a durable sync outbox
- [x] Real TTS audio for vocabulary and stories
- [x] Community Discord + in-app "Join our Discord" links
- [x] Auto-posting of releases and roadmap updates to Discord
- [x] Admin analytics dashboard — activation funnel, DAU/WAU, story completion, retention cohorts & per-language views (internal, admin-only `/dashboard`)
- [x] First-session onboarding that ends in an unlocked story + recap ("First story unlocked")
- [x] In-app feedback → Discord auto-posting (Supabase trigger → #feedback-feed)
- [x] Story-reader polish — book-like chapter header + clearer "learn N more to unlock the next story"
- [x] Onboarding polish — equal-width language cards
- [x] Shareable reading-recap card — share "I can read N% of this story" as a branded image
- [x] Known-Content Analyzer — paste any text, see how much you can read + the words to learn next (Practice → Analyze text)
- [x] Public story links — open a shared story without an account, pick your level, see "you'd understand ~X%" + a taste of the story, then sign up free to read the rest

---

_Have an idea? Post it in **#feedback-and-ideas** on Discord — we build from there._
