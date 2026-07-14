# 🥋 Hanzi Dojo — Discord server blueprint

A ready-to-build layout for the community server. Everything here is copy‑paste:
channel names, channel **topics** (the description line under each channel name),
roles, the welcome/rules text, and the onboarding questions. Build it top to
bottom and you'll have a clean, spam‑resistant server in ~30 minutes.

Once the permanent invite exists, paste it into [`src/community.js`](../src/community.js)
(`DISCORD_INVITE_URL`) and the in‑app links light up automatically.

---

## 0. First: server-wide settings

Do these once, in **Server Settings**, before making channels.

- [ ] **Enable Community** (Server Settings → Enable Community). This unlocks
      Announcement channels, the Rules screening gate, Server Guide, and
      onboarding — all used below.
- [ ] **Verification level: Medium** (must be registered on Discord >5 min).
      Cuts drive‑by spam without annoying real users.
- [ ] **Explicit media content filter: scan messages from all members.**
- [ ] **Default notifications: Only @mentions** (Server Settings → Overview).
      Keeps a busy server from nuking everyone's notification tray.
- [ ] Upload the **ensō logo** as the server icon and set an accent color
      (brand red `#B83A24` or sage `#6E8466`).

---

## 1. Roles

Create these in **Server Settings → Roles**, in this order (top = most power).
Colors are suggestions.

| Role | Color | Who | Key permissions |
| --- | --- | --- | --- |
| **Sensei** | red `#B83A24` | You / founders | Administrator |
| **Moderator** | sage `#6E8466` | Trusted helpers | Manage Messages, Kick, Timeout, Manage Threads |
| **Dojo Bot** | grey | Webhooks / bots | Send Messages, Embed Links in bot channels only |
| **Contributor** | blue `#2E3A6E` | People who ship PRs / lots of good feedback | Cosmetic — a thank‑you badge |
| **Verified** | none | Everyone who passes the rules gate | The baseline; grants access to the server |

**Interest roles** (self‑assigned in onboarding — cosmetic, used for pings):

| Role | Color | Purpose |
| --- | --- | --- |
| **中文 Chinese** | `#B83A24` | Ping when new HSK content ships |
| **日本語 Japanese** | `#2E3A6E` | Ping when new JLPT content ships |
| **Русский Russian** | `#2563C9` | Ping when new CEFR content ships |
| **Beta Testers** | gold `#CA8A04` | Opt‑in to try unreleased features |

> Tip: keep interest‑role permissions identical to `@Verified`. They exist only
> so you can `@中文 Chinese` a subset instead of `@everyone`.

---

## 2. Onboarding (Server Settings → Onboarding)

Turn on onboarding and add **one question** so new members self‑select a track:

- **Question:** "Which language are you studying?"  ·  *Multiple choice, pick as many as you like*
  - 🇨🇳 Chinese → grants **中文 Chinese**
  - 🇯🇵 Japanese → grants **日本語 Japanese**
  - 🇷🇺 Russian → grants **Русский Russian**
  - 🧪 "I want to help test new features" → grants **Beta Testers**

Set **Default channels** (what a new member sees first) to: `#welcome`,
`#announcements`, `#introductions`, `#general`.

---

## 3. Channel layout

Categories are shown as **▸ HEADERS**. Each channel lists the **topic** to paste
into its description, and any non‑default posting permission.

### ▸ START HERE  *(read‑only for @Verified)*

| Channel | Type | Topic (paste as the channel description) | Permissions |
| --- | --- | --- | --- |
| `#welcome` | Text | Welcome to the Hanzi Dojo dojo. Learn words → unlock stories you can actually read. Grab your language role above and say hi in #introductions. | @Verified: **cannot** send |
| `#announcements` | **Announcement** | Release notes, new stories & features. Follow this channel to get updates in your own server. | @Verified: cannot send |
| `#rules` | Text | The house rules. React ✅ at the bottom to unlock the rest of the server. | @Verified: cannot send |

### ▸ COMMUNITY

| Channel | Type | Topic | Permissions |
| --- | --- | --- | --- |
| `#introductions` | Text | New here? Tell us: which language, your goal, and how far along you are. | default |
| `#general` | Text | Off‑topic hangout for Hanzi Dojo learners. Be kind. | default |
| `#wins` | Text | Celebrate progress — streaks, first story read, a level test passed, "82% known!" screenshots welcome. | default |
| `#study-hall` | Voice | Silent co‑study / body‑doubling. Hop in, mute, and do your reps. | default |

### ▸ LEARNING

| Channel | Type | Topic | Permissions |
| --- | --- | --- | --- |
| `#chinese` | Text | HSK 3.0 track. Vocab questions, tone struggles, hanzi you can't shake. | default |
| `#japanese` | Text | JLPT track. Kanji readings, kana, grammar particles, furigana debates. | default |
| `#russian` | Text | CEFR track. Cases, Cyrillic, stress marks, the perfective/imperfective abyss. | default |
| `#reading-club` | Text | Discuss the mini‑stories — favorite lines, tricky sentences, what unlocked next. | default |
| `#resources` | Text | Share dictionaries, input methods, keyboards, podcasts. No piracy. | @Verified: react only *(optional)* |

> Add each language channel only once that track has a few active learners —
> three empty channels look deader than one busy one. Start with `#chinese`
> (the flagship) and open the others on demand.

### ▸ PRODUCT  *(this is what makes the app community‑driven)*

| Channel | Type | Topic | Permissions |
| --- | --- | --- | --- |
| `#feedback-and-ideas` | **Forum** | One post per idea. Search before posting; upvote 👍 ideas you want. We build from here. | Post = create thread |
| `#bug-reports` | **Forum** | One post per bug. Include: what you did, what happened, what you expected, device/browser. Screenshots help. | Post = create thread |
| `#help` | Text | Stuck? Ask here — account, sync, offline, audio, install. | default |
| `#roadmap` | Text | What we're building next and what recently shipped. Read‑only; discuss in the linked forum posts. | @Verified: cannot send |
| `#feedback-feed` | Text | Auto‑feed of in‑app feedback (via Supabase webhook). Bot‑only. | @Verified: cannot send; Dojo Bot: send |

> `#feedback-feed` pairs with the existing in‑app Feedback widget — a Supabase
> Database Webhook on `INSERT` into the `feedback` table posts each submission
> here. (Ask me to wire that up — it's the "Feedback → Discord webhook" option.)

### ▸ STAFF  *(private — Sensei + Moderator only)*

| Channel | Type | Topic |
| --- | --- | --- |
| `#mod-chat` | Text | Team coordination. |
| `#triage` | Text | Sort incoming bugs/ideas → GitHub issues; assign owners. |

Set this whole category to **deny View Channel for @everyone**, allow for
`@Moderator` and `@Sensei`.

---

## 4. Copy‑paste text

### `#rules`

```
🥋 Welcome to Hanzi Dojo — a few house rules keep the dojo calm:

1. Be respectful. No harassment, hate, or gatekeeping. Everyone's a beginner at something.
2. Stay on topic per channel. Language help in the language channels, bugs in #bug-reports.
3. No spam, ads, or self‑promo without a mod's OK.
4. English is our common language, but practicing your target language is very welcome.
5. No piracy or sharing paid content you don't own.
6. Search #feedback-and-ideas and #bug-reports before posting — one thread per topic.
7. Follow Discord's Terms of Service and Community Guidelines.

React ✅ below to agree and unlock the server.
```

### `#welcome` (pinned)

```
👋 Welcome to the Hanzi Dojo community!

Hanzi Dojo pairs FSRS spaced‑repetition flashcards with graded mini‑stories
matched to your known vocabulary — so every session turns into real reading.

Get started:
• Pick your language role above (Chinese / Japanese / Russian) 🇨🇳🇯🇵🇷🇺
• Say hi in #introductions
• Share progress in #wins
• Found a bug or have an idea? → #bug-reports / #feedback-and-ideas — we build from these.

This community shapes the app. Thanks for helping us make it perfect. 🙏
```

### `#introductions` starter prompt (pinned)

```
Introduce yourself! Copy & fill:

🌏 Language(s):
🎯 Goal (why you're learning):
📈 Level / how far along:
🔥 Current streak:
💬 One thing you want from Hanzi Dojo:
```

### `#announcements` — release template

```
🚀 **Hanzi Dojo update — <date>**

**New**
• …

**Improved**
• …

**Fixed**
• …

Shipped from your feedback: <@user / idea link>. Keep it coming in #feedback-and-ideas 🙏
@中文 Chinese / @日本語 Japanese / @Русский Russian
```

---

## 5. Launch checklist

Don't share the invite until the server feels alive:

- [ ] Roles, onboarding question, and channels created
- [ ] `#rules`, `#welcome`, `#introductions` prompt pinned
- [ ] `#roadmap` seeded from the README roadmap
- [ ] You post your own intro + 2–3 starter questions in `#general` and a language channel
- [ ] One item in `#feedback-and-ideas` and one in `#wins` so they're not empty
- [ ] Create a **permanent invite** (Invite People → Edit → Expire: **Never**, Max uses: **No limit**)
- [ ] Paste that invite into `src/community.js` → `DISCORD_INVITE_URL`
- [ ] Add the same link to the README and share it

---

## 6. Growth — where to put the invite

The in‑app links (Settings + landing footer) are already wired. Also add it to:
the README (badge + Community section), the session‑recap screen ("share your
win in Discord"), and any email/push reminders. Meet learners where they already are.
