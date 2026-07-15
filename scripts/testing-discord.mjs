#!/usr/bin/env node
// Beta-testing layer for the Hanzi Dojo Discord. Run AFTER setup + style.
// Adds a dedicated 🧪 TESTING area and posts clear, branded guidance so testers
// know exactly what to do, what to test, and where to report.
//
// Creates (idempotent — skips anything that already exists):
//   🧪 TESTING category with:
//     • tester-start-here (read-only) — the tester playbook
//     • test-missions     (read-only) — the current round's focus
//     • known-issues      (read-only) — check before reporting (no duplicates)
//     • tester-lounge     (chat)      — testers talk to each other
//   Plus a pinned "how to report" starter post in #bug-reports and
//   #feedback-and-ideas so every report follows the same format.
//
// ── Run (same token/guild as before) ────────────────────────────────────────
//   $env:DISCORD_BOT_TOKEN = "your_bot_token"
//   $env:DISCORD_GUILD_ID  = "your_server_id"
//   $env:APP_URL           = "https://your-live-app-url"   # optional, shown to testers
//   node scripts/testing-discord.mjs
//
//   Optional: $env:TESTING_PRIVATE = "1"  # make TESTING visible to the
//   "Beta Testers" role + staff only (default: visible to everyone).

const TOKEN = process.env.DISCORD_BOT_TOKEN
const GUILD = process.env.DISCORD_GUILD_ID
const APP_URL = process.env.APP_URL || '(add your app link here)'
const PRIVATE = process.env.TESTING_PRIVATE === '1'
const BASE = 'https://discord.com/api/v10'
const BRAND = 0xb83a24

if (!TOKEN || !GUILD) {
  console.error('Missing env. Usage:\n  DISCORD_BOT_TOKEN=xxx DISCORD_GUILD_ID=123 node scripts/testing-discord.mjs')
  process.exit(1)
}

const T = { TEXT: 0, CATEGORY: 4, FORUM: 15 }
const P = { VIEW: 1n << 10n, SEND: 1n << 11n }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const baseName = (n) => n.split('┃').pop().trim().toLowerCase().replace(/\s+/g, '-')

async function api(method, path, body) {
  while (true) {
    const res = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}))
      await sleep(Math.ceil((j.retry_after || 1) * 1000) + 300)
      continue
    }
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`)
    return res.status === 204 ? null : res.json()
  }
}

// ── Content ─────────────────────────────────────────────────────────────────
const EMBEDS = {
  'tester-start-here': {
    color: BRAND,
    title: '🧪 Welcome, Beta Tester',
    description:
      "You're here early — thank you. Your job is simple: **use Hanzi Dojo like a real learner and tell us everything that feels off.** " +
      "Rough edges are expected; finding them is the whole point.",
    fields: [
      { name: '① Get set up', value: `Sign up and start a language track:\n${APP_URL}\nUse it like you actually want to learn — daily if you can.` },
      { name: '② What to test', value: 'See **#test-missions** for this round\'s focus. Do what you can and note anything that breaks or confuses you.' },
      { name: '③ Found a bug?', value: 'Check **#known-issues** first, then post in **#bug-reports**. Use the pinned template.' },
      { name: '④ Have an idea?', value: 'Post it in **#feedback-and-ideas** — one idea per post. Upvote 👍 ones you want.' },
      { name: '⑤ What you get back', value: 'We read everything, reply in-thread, and post fixes in **#announcements**. You\'ll see your reports ship.' },
      { name: '⭐ Golden rule', value: 'Specific beats polite. *"Continue did nothing after I passed the test — iPhone, Safari"* is worth 10× *"onboarding felt weird."*' },
    ],
    footer: { text: "You're shaping the product before anyone else. 🙏" },
  },
  'test-missions': {
    color: BRAND,
    title: '🎯 Test Missions — Round 1',
    description: 'The things we most need eyes on right now. Report anything that breaks, confuses, or feels slow.',
    fields: [
      { name: '🚀 First run', value: 'Create an account, pick a language, complete onboarding. Did it end with a story unlocked? Was anything confusing?' },
      { name: '🃏 Flashcards', value: 'Learn 10+ words. Try both **Flip** and **Typed** modes (Settings). Does grading feel right? Does audio play?' },
      { name: '📖 First story', value: 'Reach and read a story. Do "% known", underlined words, tap-to-reveal and tap-to-add all work?' },
      { name: '📴 Offline', value: 'Turn on airplane mode mid-session. Does it keep working and sync when you reconnect?' },
      { name: '📱 Your device', value: 'Tell us your exact device + browser, and flag anything that looks broken at your screen size.' },
    ],
    footer: { text: 'New missions each round. Report in #bug-reports and #feedback-and-ideas.' },
  },
  'known-issues': {
    color: BRAND,
    title: '🐞 Known Issues',
    description: 'Check here before reporting — if it\'s listed, we already know and don\'t need a duplicate. Updated as things come in.',
    fields: [{ name: 'Currently tracking', value: "Nothing yet — you're early! Be the first to find something. 🔍" }],
    footer: { text: 'Staff updates this list. Not sure if it counts? Report it anyway.' },
  },
}

// Pinned starter posts for the two forum channels
const FORUM_POSTS = {
  'bug-reports': {
    name: '📌 How to report a bug (read first)',
    embed: {
      color: BRAND,
      title: '🐛 Reporting a bug',
      description:
        'Good reports get fixed fast. Please include:\n\n' +
        '**What you did** — the steps you took\n' +
        '**What happened** — the actual result\n' +
        '**What you expected** — instead\n' +
        '**Device & browser** — e.g. iPhone 14, Safari · Windows, Chrome\n' +
        '**Screenshot / video** — if you can\n\n' +
        'Check **#known-issues** first, and keep it to **one bug per post**. 🙏',
    },
  },
  'feedback-and-ideas': {
    name: '📌 How to suggest an idea (read first)',
    embed: {
      color: BRAND,
      title: '💡 Suggesting an idea',
      description:
        '**One idea per post.** Describe the *problem*, not just the feature — ' +
        '*"I keep losing my place in long stories"* helps us more than *"add bookmarks."*\n\n' +
        'Upvote 👍 ideas you want to see. We build from the top.',
    },
  },
}

async function main() {
  console.log(`\n🧪 Adding tester layer to Hanzi Dojo (${GUILD})${PRIVATE ? ' — Beta-only' : ''}\n`)
  const me = await api('GET', '/users/@me')
  const roles = await api('GET', `/guilds/${GUILD}/roles`)
  const channels = await api('GET', `/guilds/${GUILD}/channels`)
  const roleId = (n) => roles.find((r) => r.name === n)?.id
  const byBase = new Map(channels.map((c) => [baseName(c.name), c]))
  const everyone = GUILD

  // Permission overwrites for the TESTING category / channels
  const gate = (readOnly) => {
    const ov = []
    if (PRIVATE) {
      ov.push({ id: everyone, type: 0, allow: '0', deny: P.VIEW.toString() })
      for (const rn of ['Beta Testers', 'Sensei', 'Moderator']) {
        const id = roleId(rn)
        if (id) ov.push({ id, type: 0, allow: P.VIEW.toString(), deny: '0' })
      }
    }
    if (readOnly) {
      // testers can read but not send; @everyone (or Beta Testers if private) blocked from sending
      const target = PRIVATE ? roleId('Beta Testers') : everyone
      if (target) ov.push({ id: target, type: 0, allow: '0', deny: P.SEND.toString() })
      for (const rn of ['Sensei', 'Moderator']) {
        const id = roleId(rn)
        if (id) ov.push({ id, type: 0, allow: P.SEND.toString(), deny: '0' })
      }
    }
    return ov.length ? ov : undefined
  }

  // 1. TESTING category
  let cat = channels.find((c) => c.type === T.CATEGORY && baseName(c.name) === 'testing')
  if (!cat) {
    cat = await api('POST', `/guilds/${GUILD}/channels`, { name: '🧪 ┃ TESTING', type: T.CATEGORY, permission_overwrites: gate(false) })
    console.log('+ category 🧪 TESTING')
    await sleep(350)
  } else console.log('= category TESTING (exists)')

  // 2. Channels in TESTING
  const CHANS = [
    { key: 'tester-start-here', label: '🧭┃tester-start-here', readOnly: true },
    { key: 'test-missions', label: '🎯┃test-missions', readOnly: true },
    { key: 'known-issues', label: '🐞┃known-issues', readOnly: true },
    { key: 'tester-lounge', label: '🧪┃tester-lounge', readOnly: false },
  ]
  console.log('Channels:')
  for (const c of CHANS) {
    let ch = byBase.get(c.key)
    if (!ch) {
      ch = await api('POST', `/guilds/${GUILD}/channels`, {
        name: c.label, type: T.TEXT, parent_id: cat.id, permission_overwrites: gate(c.readOnly),
      })
      byBase.set(c.key, ch)
      console.log(`  + #${c.key}${c.readOnly ? ' (read-only)' : ''}`)
      await sleep(350)
    } else console.log(`  = #${c.key} (exists)`)
  }

  // 3. Embeds
  console.log('Guidance embeds:')
  for (const [key, embed] of Object.entries(EMBEDS)) {
    const ch = byBase.get(key)
    if (!ch) { console.log(`  ! #${key} not found`); continue }
    const recent = await api('GET', `/channels/${ch.id}/messages?limit=20`)
    if (recent.some((m) => m.author?.id === me.id)) { console.log(`  = #${key} (already posted)`); continue }
    const msg = await api('POST', `/channels/${ch.id}/messages`, { embeds: [embed] })
    await api('PUT', `/channels/${ch.id}/pins/${msg.id}`).catch(() => {})
    console.log(`  + #${key} guidance posted & pinned`)
    await sleep(400)
  }

  // 4. Pinned starter posts in the forum channels
  console.log('Forum guides:')
  const active = await api('GET', `/guilds/${GUILD}/threads/active`).catch(() => ({ threads: [] }))
  const threadNames = new Set((active.threads || []).map((t) => t.name))
  for (const [key, post] of Object.entries(FORUM_POSTS)) {
    const ch = byBase.get(key)
    if (!ch || ch.type !== T.FORUM) { console.log(`  ! #${key} not a forum — skipped`); continue }
    if (threadNames.has(post.name)) { console.log(`  = #${key} guide (exists)`); continue }
    await api('POST', `/channels/${ch.id}/threads`, { name: post.name, message: { embeds: [post.embed] } })
      .then(() => console.log(`  + #${key} guide posted`))
      .catch((e) => console.log(`  ! #${key} guide: ${e.message}`))
    await sleep(400)
  }

  console.log('\n✅ Done. Your server is now set up for beta testing.')
  console.log('   • Point testers to #tester-start-here first.')
  console.log('   • Update #test-missions each round and @Beta Testers to notify them.')
  console.log('   • Keep #known-issues current so you stop duplicate reports.\n')
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1) })
