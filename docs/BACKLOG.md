# 🛠️ Engineering backlog

Granular fixes, tech-debt, and ops tasks. **Internal — not community-facing.**
The public plan lives in [`ROADMAP.md`](../ROADMAP.md), which auto-posts to the
`#roadmap` Discord channel; keep raw bug detail and dashboard-only steps here so
that stays clean. Move items to **Done** as they land (or promote user-facing
ones to the roadmap).

## Auth / email / hosting
- [ ] **Custom SMTP** — send auth mail from `no-reply@hanzi-dojo.com` (add SPF/DKIM/DMARC DNS) so sign-in emails aren't the default `mail.app.supabase.io` sender. Supabase → Authentication → Emails → SMTP Settings. *(dashboard)*
- [ ] **Auth URL config** — set Site URL = `https://hanzi-dojo.com` and add redirect allowlist `https://hanzi-dojo.com/**` + `http://localhost:5173/**`. Fixes the login redirect that jumps to the raw github.io host. *(dashboard)*
- [ ] **Turn off the retired GitHub Pages site** — repo Settings → Pages → Source → None. The deploy workflow is already removed; this disables the last-built site.
- Code half already shipped: `signUp` now sends `emailRedirectTo`; hardcoded github.io links replaced with `BRAND_URL`; app consolidated on Vercel (base `/`).

## Data safety
- [ ] **Transactional grading** — collapse the separate writes (card update, review log, daily activity, XP) into a single Supabase RPC/transaction so a mid-write failure can't leave partial state. See the data-safety note in `README.md` and `src/syncQueue.js`.
- [ ] **Real-device verification pass** — offline grade replay + XP-delta reconcile, iOS/Safari flashcard + reader audio, and Web Push reminders end-to-end. All built and unit-tested but never exercised on a live device.

## Scheduling
- [ ] **Timezone-correct reminders** — `send-review-reminders.mjs` fires on a plain UTC hour, so it drifts ~1h across DST. Schedule per user timezone.

## Learning quality
- [ ] **FSRS parameter tuning** — optimize scheduler parameters beyond library defaults once `review_logs` + analytics have real data.

## Content
- [ ] Grow **Japanese (JLPT)** and **Russian (CEFR)** vocabulary + story depth toward parity with Chinese (HSK), which is the most mature track.

## Frontend cleanup
- [ ] Continue extracting the large `Study` screen into focused hooks/components.
- [ ] Supabase generated types (gradual TypeScript adoption).
- [ ] Centralize design tokens (colors/spacing/shadows) beyond the current shared primitives.

## Done
- [x] Onboarding language cards render equal width — the longer "Русский" label no longer stretches the Russian card past the two CJK cards (`src/Onboarding.jsx`).
- [x] Story reader no longer dead-ends: "learn N more to unlock the next tier" hook (`src/StoryReaderImmersive.jsx`, `nextLockedTier`).
