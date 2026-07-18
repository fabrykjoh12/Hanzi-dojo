# 🗺️ Hanzi Dojo Roadmap

The living plan for what's next. **Editing this file automatically posts an
update to the `#roadmap` channel in Discord** (via `.github/workflows/discord-notify.yml`),
so the community always sees the latest. Keep it current — move things to
**Shipped** as they land.

> **What we're building toward:** *No streaks. No leagues. No guilt. Just real
> progress* — a memory engine, graded stories, and a tutor that only speaks words
> you know, in one calm app. The theme running through the plan below: go deeper on
> reading, add speaking and grammar practice, and let your word knowledge follow
> you everywhere.

## 🚧 Now — in progress
- [ ] _Between milestones — picking the next focus from **Next — planned** below. Ideas? Drop them in **#feedback-and-ideas**._

## 🔜 Next — planned

**Read more, read deeper**
- [ ] **Word-by-word read-along** — each word lights up as it's spoken, and you can tap any word to start the audio from there (with speed control).
- [ ] **Pinyin only when you need it** — show pinyin just for words above your level, not all-or-nothing.
- [ ] **Definitions that fit the sentence** — the meaning actually used here, not a dictionary dump.
- [ ] **One "% known" everywhere** — your word knowledge follows you across stories, your own text, and (later) video.

**Speak & be understood**
- [ ] **Tone trainer** — see your tone shape vs. the target for Mandarin's four tones.
- [ ] **Shadowing** — repeat-after-the-story practice built from audio you've already heard.

**Grammar that sticks** *(new)*
- [ ] **Grammar as spaced practice** — turn the grammar guides into quick fill-in-the-blank reviews, scheduled by the same memory engine.
- [ ] **Grammar in context** — each story flags the pattern it introduces ("this one uses 把…"), so grammar is learned from real sentences.

**Smarter, calmer review**
- [ ] **Stuck-word help** — a word that keeps slipping gets flagged and taught a different way, instead of endlessly re-appearing.
- [ ] **A gentle forecast** — "next 7 days: ~N cards a day," plus a dial to set how hard you want to remember.
- [ ] **Cram mode** — temporarily study ahead for a trip or an exam.

**Characters & memory** *(new)*
- [ ] **Build characters from parts** — learn shared components and sound-families (声旁) so new hanzi rest on ones you already know.
- [ ] **Mnemonic hints** — an optional memory story or breakdown on tricky, easily-confused characters.
- [ ] **Handwriting that fades its training wheels** — trace → dotted guide → blank as a character matures, with feedback on *which* stroke went wrong.

**A tutor that only speaks your words**
- [ ] **Comprehensible chat** — Chat Missions constrained to words you actually know (+ a few new ones), so conversation is always readable.
- [ ] **End-of-chat recap → review** — new words and gentle corrections from a chat flow straight into your queue.
- [ ] **Recurring characters with real goals** — "order dumplings from 老王," and the tutor knows when you've done it.

**Content & languages**
- [ ] **Make a story from your words** — generate a story from your deck or weak words, on a topic you pick ("a detective story," "about cooking").
- [ ] **Browse by interest** — topic tags, plus multi-chapter serials with recurring characters so vocabulary recycles across an arc.
- [ ] **A fresh story every day** at your level (a calm daily ritual, delivered by a gentle nudge — not a streak nag).
- [ ] Expand Chinese into **HSK 3** (and higher bands over time).
- [ ] More levels for **Japanese** (JLPT N4+) and **Russian** (A2+); more graded stories at every level.
- [ ] **Pictures on flashcards** — a visual memory hook alongside the word.
- [ ] **Higher-quality TTS voices** — research + regenerate more natural narration.
- [ ] **Spanish** track (future).

**Reading & video**
- [ ] **Graded YouTube** — turn any video into a lesson matched to your vocabulary: see "% you'll understand," tap words in a transcript synced to playback, pre-learn the key new words, then watch.
- [ ] Known-Word Map & Reading Ladder — visualize what you can read as your vocabulary grows.

**Your words & tools**
- [ ] **Add your own flashcards** — custom cards / decks, scheduled by the same FSRS engine.
- [ ] **Import a word list** — bring a CSV / Anki deck ("my textbook, chapter 5") into the same engine, and it unlocks stories too.
- [ ] **Add a phrase, not just a word** — save a whole chunk or idiom from any text.
- [ ] **Built-in dictionary** — search any word, hear it, and add it to your deck.

**Grow calmly — honest mechanics, not fear**
- [ ] **Study rhythm, not a chain** — "you studied 4 of the last 7 days" as a quiet ring; nothing to protect, nothing to lose.
- [ ] **A mastery ladder** — words you've truly locked in reach a permanent "mastered" state (the reward is real progress, not a number).
- [ ] **Gentle return** — come back after a break to a right-sized queue ("welcome back — 12 words are ready"), never a 300-card wall.
- [ ] **Your month in review** — a calm, shareable recap of what you learned.

**Let the product introduce itself (growth)**
- [ ] **Free public level test** — an open-web HSK / JLPT / CEFR placement quiz that ends in a shareable result and "your first stories are ready" (builds on "How much can you read?").
- [ ] **Word & story pages on the open web** — look up any word or read a taster, then sign up free to keep going.
- [ ] **Weekly progress email** — "you can now read N% more."
- [ ] **Give-a-friend** — share a month of Pro, get a month.
- [ ] **Timezone-correct daily reminders** (no ~1h drift across DST), with gentle, value-based copy.

**Polish**
- [ ] Cleaner sign-in emails — branded sender from hanzi-dojo.com, links that stay on the domain.

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
- [ ] Global word-status model — one FSRS-driven new/learning/known status per word, powering "% known" across stories, your own text, and video (the foundation for "One '% known' everywhere")

**Accessibility (WCAG 2.2 AA)**
- [ ] Flashcard reveal surface as a fully focusable control (answer `aria-live` announcements have shipped)
- [ ] `ChatMission` overlay: `role="dialog"` + focus trap (the mobile "More" sheet is done)

## ✅ Shipped
- [x] **Read your own text** — paste any text and read it with tap-to-define + add-to-deck against your known words, plus a live "% you can read" (an upgrade of *Analyze text*).
- [x] **Speaking practice** — a new "Speaking" drill: read a word aloud and get an instant ✓ from on-device speech recognition (Chrome/Android/desktop; graceful fallback elsewhere).
- [x] **"How much can you read?"** — a 60-second public reading test with a shareable result, no account needed.
- [x] **Reading feeds review** — words you save while reading carry that story's own sentence onto the review card, so you review real context.
- [x] **Practice from what you just read** — finish a story and drill its new words with fill-in-the-blank.
- [x] **More accurate Chinese pronunciation** — pinyin-guided audio so tricky multi-reading characters (长, 行, 银行, 重, 觉 …) are spoken correctly (all HSK vocab re-recorded).
- [x] **Understand-check after every story** — a few quick comprehension questions at the end of a story, in every reading format (paced, chat, scene, and reply).
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
