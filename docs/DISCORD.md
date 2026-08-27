# 🥋 Hanzi Dojo — Discord server blueprint

A ready-to-build layout for the community server. Everything here is copy‑paste:
channel names, channel **topics** (the description line under each channel name),
roles, the welcome/rules text, and the onboarding questions. Build it top to
bottom and you'll have a clean, spam‑resistant server in ~30 minutes.

Once the permanent invite exists, paste it into [`src/community.js`](../src/community.js)
(`DISCORD_INVITE_URL`) and the in‑app links light up automatically.

> **Want it built automatically?** Skip the clicking — run
> [`scripts/setup-discord.mjs`](../scripts/setup-discord.mjs) and it creates
> every role, category, channel, topic and permission below in one pass. See
> [§7 Automated setup](#7-automated-setup-optional). You'll still do the
> Community-mode toggle, onboarding question, and rules text by hand (those
> aren't exposed to bots).

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

---

## 7. Automated setup (optional)

[`scripts/setup-discord.mjs`](../scripts/setup-discord.mjs) builds the roles and
the whole channel tree above for you — no manual clicking. It's idempotent
(skips anything that already exists), so you can tweak the config in the script
and re‑run safely.

**1. Create a bot.** Go to <https://discord.com/developers/applications> → **New
Application** → **Bot** → **Reset Token** and copy the token.

**2. Invite the bot** to your server with **Administrator** permission (OAuth2 →
URL Generator → scope `bot`, permission `Administrator`, open the generated URL).

**3. Get the server ID.** Discord → Settings → Advanced → **Developer Mode** on,
then right‑click the server icon → **Copy Server ID**.

**4. Run it** (Node 18+):

```bash
# Preview without changing anything:
DISCORD_BOT_TOKEN=your_token DISCORD_GUILD_ID=your_server_id DRY_RUN=1 node scripts/setup-discord.mjs

# For real:
DISCORD_BOT_TOKEN=your_token DISCORD_GUILD_ID=your_server_id node scripts/setup-discord.mjs
```

**What the bot can't do (do these by hand afterward — 5 min):**

- Enabling **Community mode** and the **rules screening gate** (§0).
- The **onboarding question** that assigns language roles (§2).
- Posting the **welcome / rules / intro** message text (§4).
- Generating the **permanent invite** (§5).

> The bot token is a password for your server — never commit it. Pass it as an
> environment variable as shown, and reset it in the Developer Portal if it
> ever leaks.

---

## 8. What posts to Discord automatically

Two workflows, one channel each, and **both fire only on a push to `main`.**
Nothing on a feature branch reaches Discord — the docs go through
branch → PR → merge like every other file.

| Workflow | Channel | Trigger | What it does |
| --- | --- | --- | --- |
| `discord-notify.yml` | `#announcements` | any push to `main` | Posts a new "🚀 Update shipped" card listing that push's non-merge commit titles. This is why commit and PR titles get written for a reader. |
| `roadmap-live-sync.yml` | `#roadmap`, `#backlog` | a push to `main` touching `ROADMAP.md` or `docs/BACKLOG.md` (plus manual re-run) | **Edits one pinned message per channel in place**, so each channel stays a single current post rather than a wall of history. |

**Secrets** (each step skips if its secret is absent, so they can be added one at
a time): `DISCORD_ANNOUNCE_WEBHOOK`, `DISCORD_ROADMAP_WEBHOOK`,
`DISCORD_BACKLOG_WEBHOOK`. Use a **private** channel for `#backlog` — it carries
internal bug and ops detail.

### The webhooks are scoped to `main`, not to the repository

`roadmap-live-sync.yml` runs in the **`roadmap-discord`** GitHub Environment,
restricted to `main` with no bypass branches, and the two webhooks are
**environment** secrets rather than repository secrets.

That is deliberate and load-bearing. GitHub runs a workflow from the tree of the
ref that was pushed, so the ~75 branches created before the sync was fixed still
carry a version that posts to Discord and pushes to `main` — and always will. An
environment scoped to `main` is a boundary they cannot cross: a run on any other
ref is never granted the webhook, so the old workflow executes, finds nothing to
authenticate with, and skips. Full reasoning in
[`docs/AUTOMATION-AUTHORITY.md`](AUTOMATION-AUTHORITY.md).

### The pinned messages are addressed by a committed id

`roadmap-live-sync.yml` edits an existing message; it never creates one. The
message ids live in `.github/roadmap-message.id` and `.github/backlog-message.id`
and are read as **configuration** — the workflow has `contents: read` and cannot
write them back.

If an id file is missing or Discord rejects the edit (usually: someone deleted
the message), **the run fails with instructions instead of quietly posting a
replacement.** Getting a new id is a deliberate maintenance step:

```bash
DISCORD_ROADMAP_WEBHOOK=<the webhook URL> \
  node .github/scripts/roadmap-sync.mjs --bootstrap=roadmap
```

That posts one new message and prints its id; commit the id to the matching
`.id` file in a normal PR. `--dry-run` renders both documents and sends nothing,
which is the fastest way to see what a roadmap edit will actually look like.

> `.github/backlog-message.id` does not exist yet, so the `#backlog` sync fails
> loudly whenever `DISCORD_BACKLOG_WEBHOOK` is set. Bootstrap it as above. The
> `#roadmap` sync is unaffected — every target is attempted before a run fails.

### Why nothing syncs from a branch

Until 2026-08-26, `roadmap-live-sync.yml` ran on **branch** pushes and copied
that branch's `ROADMAP.md` and `docs/BACKLOG.md` directly onto `main`. It bought
a few hours of Discord latency and cost correctness: the copy was a whole-file
replacement, so whichever branch pushed last silently reverted the other's work
on `main`. It happened repeatedly — commit `42e367a` deleted 83 lines of
`docs/BACKLOG.md` that another branch had added an hour earlier.

The rendering (`.github/scripts/roadmap-render.mjs`) is a condensed view —
headings and item titles, descriptions dropped after the ` — `, long Shipped
lists capped — because a Discord embed description stops at 4096 characters and
both documents are several times that. It is covered by `roadmap-render.test.mjs`,
and the workflow's own invariants by `roadmap-sync.test.mjs`; both run in
`npm test`.
