# 🗺️ Hanzi Dojo Roadmap

The living plan for what's next. **Editing this file automatically posts an
update to the `#roadmap` channel in Discord** (via `.github/workflows/discord-notify.yml`),
so the community always sees the latest. Keep it current — move things to
**Shipped** as they land.

## 🚧 Now — in progress
- [ ] **More accurate Chinese pronunciation** — pinyin-guided audio so tricky multi-reading characters (长, 行, 银行 …) are spoken correctly.
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
- [ ] Home bootstrap RPC — replace the 4-query load waterfall (profile → track → counts) with one call, and stop refetching it on every return to Home
- [ ] Finish the bundle/font diet — load only the active language's font family (the `vendor-supabase` chunk split has shipped)
- [ ] Data-cache correctness — normalize the column-keyed cache in `data.js` and invalidate/patch on writes
- [ ] Centralize direct `supabase.from(...)` calls (esp. in `Study`) into a thin per-table data layer
- [ ] Server-authoritative progression — move level-unlock / test-pass / XP writes into a validating RPC
- [ ] Split the story reader into a shared "story engine" + swappable presentation modes (unlocks Paced Reveal now, chat & scene formats later)

**Accessibility (WCAG 2.2 AA)**
- [ ] Flashcard reveal surface as a fully focusable control (answer `aria-live` announcements have shipped)
- [ ] `ChatMission` overlay: `role="dialog"` + focus trap (the mobile "More" sheet is done)

## ✅ Shipped
- [x] **More accurate Japanese vocabulary** — N5 flashcards and example sentences now show the correct kanji (去年, 部屋, 映画, 病院 …) instead of kana
- [x] **Interactive chat stories** — reply inside a chat story by picking the right response (retry until it clicks); your choice becomes your message and the conversation keeps going
- [x] **Scene stories** — read a story as a picture-book: each beat is a big emoji illustration above one short line, revealed a tap at a time (with the same read-along audio and tap-a-word lookup as every story)
- [x] **Chat-format stories** — read a story as a messaging conversation that reveals one bubble at a time (tap to continue), with the same read-along audio and tap-a-word lookup as every story
- [x] **A calmer, guided story reader** — stories now play one line at a time ("Paced Reveal") with a one-tap start and read-along audio, so a page of text never feels like a wall (classic scroll still available)
- [x] Reviews now arrive together at the start of your day (matching new cards), instead of trickling in at odd times
- [x] A clear "what to do next" after every review session — always a direct next step, never a dead end
- [x] Cleaner, calmer story-reading screen — less clutter above the story so you get to reading faster
- [x] Reader comfort — optional serif "book" font for stories, and a one-time tip teaching tap-to-focus a line
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
