# 🗺️ Hanzi Dojo Roadmap

The living plan for what's next. **Editing this file automatically posts an
update to the `#roadmap` channel in Discord** (via `.github/workflows/discord-notify.yml`),
so the community always sees the latest. Keep it current — move things to
**Shipped** as they land.

## 🚧 Now — in progress
- [ ] First-session onboarding that ends in an unlocked story + recap ("First story unlocked")
- [ ] Story-reader polish — book-like typography, clearer "learn N more to unlock the next story"
- [ ] In-app feedback → Discord auto-posting (Supabase trigger → #feedback-feed)

## 🔜 Next — planned
- [ ] Shareable reading-recap card ("I can read 82% of this Chinese story")
- [ ] Known-Word Map & Reading Ladder (visualize what you can read as vocabulary grows)
- [ ] Word-to-World chat missions expanded across levels
- [ ] Known-Content Analyzer — paste text, see % known + words to learn next

## 🧱 Technical
- [ ] Collapse the multi-write grading path into a single Supabase RPC/transaction
- [ ] Continue extracting the large `Study` screen into focused hooks/components
- [ ] Supabase generated types (gradual TypeScript adoption)
- [ ] Centralize design tokens (colors/spacing/shadows)

## ✅ Shipped
- [x] Graded mini-stories with live "% known"
- [x] Offline-first PWA with a durable sync outbox
- [x] Real TTS audio for vocabulary and stories
- [x] Community Discord + in-app "Join our Discord" links
- [x] Auto-posting of releases and roadmap updates to Discord

---

_Have an idea? Post it in **#feedback-and-ideas** on Discord — we build from there._
