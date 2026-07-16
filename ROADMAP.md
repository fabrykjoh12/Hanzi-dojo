# 🗺️ Hanzi Dojo Roadmap

The living plan for what's next. **Editing this file automatically posts an
update to the `#roadmap` channel in Discord** (via `.github/workflows/discord-notify.yml`),
so the community always sees the latest. Keep it current — move things to
**Shipped** as they land.

## 🚧 Now — in progress
- [ ] Shareable reading-recap card ("I can read 82% of this Chinese story")

## 🔜 Next — planned

**Growth — let the product introduce itself**
- [ ] Public story links — open a story without an account, see "you'd understand ~X%", with a "learn to read this" invite
- [ ] "How much can you read?" — a 60-second public assessment with a shareable result

**Habit & re-engagement**
- [ ] Timezone-correct daily reminders (no more ~1h drift across DST changes)
- [ ] Weekly progress email — "you can now read N% more"

**Depth & reading**
- [ ] Known-Content Analyzer — paste any text, see % known + the words to learn next
- [ ] Known-Word Map & Reading Ladder — visualize what you can read as your vocabulary grows
- [ ] Personalized stories built from the exact words in your deck
- [ ] Word-to-World chat missions expanded across levels
- [ ] More Japanese & Russian content depth (Chinese is furthest along today)

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

---

_Have an idea? Post it in **#feedback-and-ideas** on Discord — we build from there._
