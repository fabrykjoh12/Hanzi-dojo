#!/usr/bin/env node
// One-shot Discord server builder for the Hanzi Dojo community.
//
// Creates every role, category, channel, topic and permission from the
// blueprint in docs/DISCORD.md — so you don't have to click through Discord by
// hand. Dependency-free: uses Node 18+ built-in fetch against the Discord API.
//
// It is IDEMPOTENT: it skips any role or channel that already exists by name,
// so it is safe to re-run after tweaking the config below.
//
// ── Setup ─────────────────────────────────────────────────────────────────
//   1. Create a bot: https://discord.com/developers/applications → New
//      Application → Bot → Reset Token (copy it).
//   2. Invite the bot to your server with Administrator permission. Use the
//      OAuth2 URL Generator: scopes = "bot", bot permission = "Administrator".
//   3. Enable Developer Mode in Discord (Settings → Advanced), right-click your
//      server icon → Copy Server ID.
//   4. Run:
//        DISCORD_BOT_TOKEN=xxxxx DISCORD_GUILD_ID=123456 node scripts/setup-discord.mjs
//      Add DRY_RUN=1 to preview what it would create without touching anything.
//
// After it finishes: create a permanent invite (Never expire, no max uses) and
// paste it into src/community.js → DISCORD_INVITE_URL.

const TOKEN = process.env.DISCORD_BOT_TOKEN
const GUILD = process.env.DISCORD_GUILD_ID
const DRY_RUN = process.env.DRY_RUN === '1'
const BASE = 'https://discord.com/api/v10'

if (!TOKEN || !GUILD) {
  console.error('Missing env. Usage:\n  DISCORD_BOT_TOKEN=xxx DISCORD_GUILD_ID=123 node scripts/setup-discord.mjs')
  process.exit(1)
}

// Discord channel types
const T = { TEXT: 0, VOICE: 2, CATEGORY: 4, ANNOUNCEMENT: 5, FORUM: 15 }

// Permission bits (BigInt)
const P = {
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  ADMINISTRATOR: 1n << 3n,
  KICK_MEMBERS: 1n << 1n,
  MANAGE_MESSAGES: 1n << 13n,
  MANAGE_THREADS: 1n << 34n,
  MODERATE_MEMBERS: 1n << 40n,
}
const MOD_PERMS = P.KICK_MEMBERS | P.MANAGE_MESSAGES | P.MANAGE_THREADS | P.MODERATE_MEMBERS

const hex = (h) => parseInt(h.replace('#', ''), 16)

// ── Roles ───────────────────────────────────────────────────────────────────
const ROLES = [
  { key: 'sensei', name: 'Sensei', color: '#B83A24', hoist: true, permissions: P.ADMINISTRATOR },
  { key: 'mod', name: 'Moderator', color: '#6E8466', hoist: true, permissions: MOD_PERMS },
  { key: 'bot', name: 'Dojo Bot', color: '#95A5A6' },
  { key: 'contributor', name: 'Contributor', color: '#2E3A6E', hoist: true, mentionable: true },
  { key: 'zh', name: '中文 Chinese', color: '#B83A24', mentionable: true },
  { key: 'ja', name: '日本語 Japanese', color: '#2E3A6E', mentionable: true },
  { key: 'ru', name: 'Русский Russian', color: '#2563C9', mentionable: true },
  { key: 'beta', name: 'Beta Testers', color: '#CA8A04', mentionable: true },
]

// ── Channel tree ──────────────────────────────────────────────────────────
// readOnly → @everyone can view but not send. private → staff-only category.
const TREE = [
  {
    category: 'START HERE',
    channels: [
      { name: 'welcome', type: T.TEXT, readOnly: true, topic: 'Welcome to the Hanzi Dojo dojo. Learn words → unlock stories you can actually read. Grab your language role and say hi in #introductions.' },
      { name: 'announcements', type: T.ANNOUNCEMENT, readOnly: true, topic: 'Release notes, new stories & features. Follow this channel to get updates in your own server.' },
      { name: 'rules', type: T.TEXT, readOnly: true, topic: 'The house rules. React ✅ at the bottom to unlock the rest of the server.' },
    ],
  },
  {
    category: 'COMMUNITY',
    channels: [
      { name: 'introductions', type: T.TEXT, topic: 'New here? Tell us: which language, your goal, and how far along you are.' },
      { name: 'general', type: T.TEXT, topic: 'Off-topic hangout for Hanzi Dojo learners. Be kind.' },
      { name: 'wins', type: T.TEXT, topic: 'Celebrate progress — streaks, first story read, a level test passed, "82% known!" screenshots welcome.' },
      { name: 'study-hall', type: T.VOICE, topic: 'Silent co-study / body-doubling. Hop in, mute, and do your reps.' },
    ],
  },
  {
    category: 'LEARNING',
    channels: [
      { name: 'chinese', type: T.TEXT, topic: "HSK 3.0 track. Vocab questions, tone struggles, hanzi you can't shake." },
      { name: 'japanese', type: T.TEXT, topic: 'JLPT track. Kanji readings, kana, grammar particles, furigana debates.' },
      { name: 'russian', type: T.TEXT, topic: 'CEFR track. Cases, Cyrillic, stress marks, the perfective/imperfective abyss.' },
      { name: 'reading-club', type: T.TEXT, topic: 'Discuss the mini-stories — favorite lines, tricky sentences, what unlocked next.' },
      { name: 'resources', type: T.TEXT, topic: 'Share dictionaries, input methods, keyboards, podcasts. No piracy.' },
    ],
  },
  {
    category: 'PRODUCT',
    channels: [
      { name: 'feedback-and-ideas', type: T.FORUM, topic: 'One post per idea. Search before posting; upvote 👍 ideas you want. We build from here.' },
      { name: 'bug-reports', type: T.FORUM, topic: 'One post per bug. Include: what you did, what happened, what you expected, device/browser. Screenshots help.' },
      { name: 'help', type: T.TEXT, topic: 'Stuck? Ask here — account, sync, offline, audio, install.' },
      { name: 'roadmap', type: T.TEXT, readOnly: true, topic: "What we're building next and what recently shipped. Read-only; discuss in the linked forum posts." },
      { name: 'feedback-feed', type: T.TEXT, readOnly: true, botCanSend: true, topic: 'Auto-feed of in-app feedback (via Supabase webhook). Bot-only.' },
    ],
  },
  {
    category: 'STAFF',
    private: true,
    channels: [
      { name: 'mod-chat', type: T.TEXT, topic: 'Team coordination.' },
      { name: 'triage', type: T.TEXT, topic: 'Sort incoming bugs/ideas → GitHub issues; assign owners.' },
    ],
  },
]

// ── API helpers ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(method, path, body) {
  while (true) {
    const res = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}))
      const wait = Math.ceil((j.retry_after || 1) * 1000) + 300
      console.log(`  ⏳ rate limited, waiting ${wait}ms`)
      await sleep(wait)
      continue
    }
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`)
    return res.status === 204 ? null : res.json()
  }
}

async function main() {
  console.log(`\n🥋 Building Hanzi Dojo server (${GUILD})${DRY_RUN ? ' — DRY RUN' : ''}\n`)

  // Existing state, so re-runs skip what's already there.
  const existingRoles = await api('GET', `/guilds/${GUILD}/roles`)
  const existingChannels = await api('GET', `/guilds/${GUILD}/channels`)
  const roleByName = new Map(existingRoles.map((r) => [r.name, r.id]))
  const channelNames = new Set(existingChannels.map((c) => c.name))
  const everyoneId = GUILD // @everyone role id === guild id

  // 1. Roles
  console.log('Roles:')
  const ids = {}
  for (const r of ROLES) {
    if (roleByName.has(r.name)) {
      ids[r.key] = roleByName.get(r.name)
      console.log(`  = ${r.name} (exists)`)
      continue
    }
    if (DRY_RUN) { console.log(`  + ${r.name}`); continue }
    const created = await api('POST', `/guilds/${GUILD}/roles`, {
      name: r.name,
      color: hex(r.color),
      hoist: !!r.hoist,
      mentionable: !!r.mentionable,
      permissions: (r.permissions || 0n).toString(),
    })
    ids[r.key] = created.id
    console.log(`  + ${r.name}`)
    await sleep(350)
  }

  // 2. Categories + channels
  for (const cat of TREE) {
    console.log(`\n▸ ${cat.category}`)
    const catOverwrites = cat.private
      ? [
          { id: everyoneId, type: 0, allow: '0', deny: P.VIEW_CHANNEL.toString() },
          ids.sensei && { id: ids.sensei, type: 0, allow: P.VIEW_CHANNEL.toString(), deny: '0' },
          ids.mod && { id: ids.mod, type: 0, allow: P.VIEW_CHANNEL.toString(), deny: '0' },
        ].filter(Boolean)
      : undefined

    let parentId = existingChannels.find((c) => c.type === T.CATEGORY && c.name === cat.category)?.id
    if (!parentId && !DRY_RUN) {
      const created = await api('POST', `/guilds/${GUILD}/channels`, {
        name: cat.category, type: T.CATEGORY, permission_overwrites: catOverwrites,
      })
      parentId = created.id
      await sleep(350)
    }
    console.log(parentId ? `  category ready` : `  + category ${cat.category}`)

    for (const ch of cat.channels) {
      if (channelNames.has(ch.name)) { console.log(`  = #${ch.name} (exists)`); continue }
      const overwrites = []
      if (cat.private && catOverwrites) overwrites.push(...catOverwrites)
      if (ch.readOnly) overwrites.push({ id: everyoneId, type: 0, allow: '0', deny: P.SEND_MESSAGES.toString() })
      if (ch.botCanSend && ids.bot) overwrites.push({ id: ids.bot, type: 0, allow: P.SEND_MESSAGES.toString(), deny: '0' })

      if (DRY_RUN) { console.log(`  + #${ch.name}${ch.readOnly ? ' (read-only)' : ''}`); continue }
      await api('POST', `/guilds/${GUILD}/channels`, {
        name: ch.name,
        type: ch.type,
        topic: ch.topic,
        parent_id: parentId,
        permission_overwrites: overwrites.length ? overwrites : undefined,
      })
      console.log(`  + #${ch.name}${ch.readOnly ? ' (read-only)' : ''}`)
      await sleep(350)
    }
  }

  console.log('\n✅ Done. Next:')
  console.log('  1. Server Settings → Enable Community (unlocks onboarding + rules gate)')
  console.log('  2. Server Settings → Onboarding → add the "Which language?" question (see docs/DISCORD.md)')
  console.log('  3. Paste the #rules / #welcome text from docs/DISCORD.md')
  console.log('  4. Create a permanent invite → paste into src/community.js\n')
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1) })
