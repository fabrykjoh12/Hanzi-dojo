#!/usr/bin/env node
// Professional polish pass for the Hanzi Dojo Discord — the calm, branded layer
// on top of scripts/setup-discord.mjs. Run this AFTER the server is built.
//
// What it does:
//   • Posts brand-coloured EMBEDS (the cards with a red bar) into #welcome,
//     #rules, #roadmap and #announcements, and pins them. Looks designed, not typed.
//   • Adds a ✅ reaction to the rules card.
//   • (opt-in) Renames channels/categories with tidy emoji labels + dividers.
//   • (opt-in) Turns on Discord AutoMod so the server stays clean by itself.
//
// It is idempotent for the embeds: if the bot has already posted in a channel,
// it skips it, so re-running won't spam duplicates.
//
// ── Run (same token/guild as before) ────────────────────────────────────────
//   $env:DISCORD_BOT_TOKEN = Read-Host "Paste bot token"
//   $env:DISCORD_GUILD_ID  = "your_server_id"
//   node scripts/style-discord.mjs
//
//   Optional extras (set before running):
//     $env:STYLE_RENAME  = "1"   # add emoji labels to channels & categories
//     $env:STYLE_AUTOMOD = "1"   # enable spam / mention / keyword AutoMod rules
//
// NOTE: if you use STYLE_RENAME, don't re-run setup-discord.mjs afterward — it
// matches channels by plain name and would recreate the renamed ones.

const TOKEN = process.env.DISCORD_BOT_TOKEN
const GUILD = process.env.DISCORD_GUILD_ID
const DO_RENAME = process.env.STYLE_RENAME === '1'
const DO_AUTOMOD = process.env.STYLE_AUTOMOD === '1'
const BASE = 'https://discord.com/api/v10'
const BRAND = 0xb83a24 // Hanzi Dojo vermillion, as an integer for embed colors

if (!TOKEN || !GUILD) {
  console.error('Missing env. Usage:\n  DISCORD_BOT_TOKEN=xxx DISCORD_GUILD_ID=123 node scripts/style-discord.mjs')
  process.exit(1)
}

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

// Strip emoji/divider prefixes so we can match channels whether or not they've
// been relabelled (e.g. "👋┃welcome" → "welcome").
const baseName = (n) => n.split('┃').pop().trim().toLowerCase().replace(/\s+/g, '-')

// ── Embeds ──────────────────────────────────────────────────────────────────
const EMBEDS = {
  welcome: {
    color: BRAND,
    title: '🥋 Welcome to Hanzi Dojo',
    description:
      'Learn words. Unlock stories you can actually read.\n\n' +
      'Hanzi Dojo pairs FSRS spaced-repetition flashcards with graded mini-stories ' +
      'matched to your known vocabulary — so every session turns into real reading.',
    fields: [
      { name: '🌏 Pick your track', value: 'Grab a language role in **Onboarding** — Chinese, Japanese or Russian.' },
      { name: '👋 Say hi', value: 'Introduce yourself in **#introductions**.' },
      { name: '🎉 Share progress', value: 'Post streaks and "% known" wins in **#wins**.' },
      { name: '💡 Shape the app', value: 'Bugs → **#bug-reports**, ideas → **#feedback-and-ideas**. We build from these.' },
    ],
    footer: { text: 'This community shapes the app. Thanks for helping us make it perfect. 🙏' },
  },
  rules: {
    color: BRAND,
    title: '📜 Community Rules',
    description:
      'A few house rules keep the dojo calm:\n\n' +
      '**1.** Be respectful. No harassment, hate, or gatekeeping — everyone’s a beginner at something.\n' +
      '**2.** Stay on topic per channel. Language help in the language channels, bugs in #bug-reports.\n' +
      '**3.** No spam, ads, or self-promo without a mod’s OK.\n' +
      '**4.** English is our common language, but practicing your target language is very welcome.\n' +
      '**5.** No piracy or sharing paid content you don’t own.\n' +
      '**6.** Search #feedback-and-ideas and #bug-reports before posting — one thread per topic.\n' +
      '**7.** Follow Discord’s Terms of Service and Community Guidelines.',
    footer: { text: 'React ✅ to agree and unlock the server.' },
  },
  roadmap: {
    color: BRAND,
    title: '🗺️ What we’re building',
    description: 'A living list of what’s next. Have an idea? Post it in **#feedback-and-ideas** and we’ll pull it in.',
    fields: [
      { name: 'Product', value: '• First-session onboarding that ends in an unlocked story\n• Story-reader polish & book-like typography\n• Shareable reading-recap card ("I can read 82% of this")\n• Known-Content Analyzer — paste text, see % known' },
      { name: 'Recently shipped', value: '• Graded mini-stories with live "% known"\n• Offline-first PWA with sync outbox\n• Real TTS audio for words & stories' },
    ],
    footer: { text: 'Updated as we ship. 🥋' },
  },
  announcements: {
    color: BRAND,
    title: '📣 The dojo is open',
    description:
      'Welcome to the official Hanzi Dojo community! This is where we share new ' +
      'stories, features and fixes — and where your feedback turns into what we build next.\n\n' +
      'Turn on notifications for this channel so you never miss an update.',
    footer: { text: 'Hanzi Dojo · learn words, unlock stories' },
  },
}

// Optional emoji labels (STYLE_RENAME=1)
const CATEGORY_LABELS = {
  'START HERE': '🏮 ┃ START HERE',
  COMMUNITY: '🌿 ┃ COMMUNITY',
  LEARNING: '📚 ┃ LEARNING',
  PRODUCT: '🛠 ┃ PRODUCT',
  STAFF: '🔒 ┃ STAFF',
}
const CHANNEL_LABELS = {
  welcome: '👋┃welcome', announcements: '📣┃announcements', rules: '📜┃rules',
  introductions: '🙋┃introductions', general: '💬┃general', wins: '🎉┃wins',
  'study-hall': '🎧 Study Hall',
  chinese: '🇨🇳┃chinese', japanese: '🇯🇵┃japanese', russian: '🇷🇺┃russian',
  'reading-club': '📖┃reading-club', resources: '🔖┃resources',
  'feedback-and-ideas': '💡┃feedback-and-ideas', 'bug-reports': '🐛┃bug-reports',
  help: '🆘┃help', roadmap: '🗺┃roadmap', 'feedback-feed': '📥┃feedback-feed',
  'mod-chat': '🛡┃mod-chat', triage: '📌┃triage',
}

async function main() {
  console.log(`\n🎨 Styling Hanzi Dojo server (${GUILD})\n`)
  const me = await api('GET', '/users/@me')
  const channels = await api('GET', `/guilds/${GUILD}/channels`)
  const byBase = new Map(channels.map((c) => [baseName(c.name), c]))

  // 1. Post + pin branded embeds
  console.log('Embeds:')
  for (const [name, embed] of Object.entries(EMBEDS)) {
    const ch = byBase.get(name)
    if (!ch) { console.log(`  ! #${name} not found — skipped`); continue }
    const recent = await api('GET', `/channels/${ch.id}/messages?limit=20`)
    if (recent.some((m) => m.author?.id === me.id)) { console.log(`  = #${name} (already posted)`); continue }
    const msg = await api('POST', `/channels/${ch.id}/messages`, { embeds: [embed] })
    await api('PUT', `/channels/${ch.id}/pins/${msg.id}`).catch(() => {})
    if (name === 'rules') {
      await api('PUT', `/channels/${ch.id}/messages/${msg.id}/reactions/${encodeURIComponent('✅')}/@me`).catch(() => {})
    }
    console.log(`  + #${name} embed posted & pinned`)
    await sleep(400)
  }

  // 2. Optional emoji labels
  if (DO_RENAME) {
    console.log('\nLabels:')
    for (const c of channels) {
      const target = c.type === 4 ? CATEGORY_LABELS[c.name] : CHANNEL_LABELS[baseName(c.name)]
      if (!target || c.name === target) continue
      await api('PATCH', `/channels/${c.id}`, { name: target }).catch((e) => console.log(`  ! ${c.name}: ${e.message}`))
      console.log(`  ~ ${c.name} → ${target}`)
      await sleep(400)
    }
  } else {
    console.log('\nLabels: skipped (set STYLE_RENAME=1 to add emoji labels)')
  }

  // 3. Optional AutoMod
  if (DO_AUTOMOD) {
    console.log('\nAutoMod:')
    const rules = [
      { name: 'Block spam', event_type: 1, trigger_type: 3, actions: [{ type: 1 }], enabled: true },
      { name: 'Block mention spam', event_type: 1, trigger_type: 5, trigger_metadata: { mention_total_limit: 5 }, actions: [{ type: 1 }], enabled: true },
      { name: 'Block harmful words', event_type: 1, trigger_type: 4, trigger_metadata: { presets: [1, 3] }, actions: [{ type: 1 }], enabled: true },
    ]
    for (const r of rules) {
      await api('POST', `/guilds/${GUILD}/auto-moderation/rules`, r)
        .then(() => console.log(`  + ${r.name}`))
        .catch((e) => console.log(`  ! ${r.name}: ${e.message}`))
      await sleep(400)
    }
  } else {
    console.log('\nAutoMod: skipped (set STYLE_AUTOMOD=1 to enable)')
  }

  console.log('\n✅ Done. Your server now reads as a calm, branded, professional space.')
  console.log('   Tip: upload the new logo (Server Settings → Overview) to finish the look.\n')
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1) })
