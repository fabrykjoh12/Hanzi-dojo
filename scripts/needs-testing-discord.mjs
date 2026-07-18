// Mirrors docs/TESTING.md to a Discord **Forum** channel: one thread per item,
// so testers can comment/react per item. Each item is tracked by a stable id so
// the thread is edited in place (✅ when checked off) instead of re-posted.
//
// TESTING.md item format (the first backticked token is the stable id):
//   - [ ] `speaking` **Speaking drill** — read a word aloud on Android; scores ✓?
//   - [x] `chinese-tts` **Chinese TTS** — 长/行/银行 sound right after a hard refresh
//
// Env: DISCORD_TESTING_WEBHOOK (a webhook on a FORUM channel). Skips if unset.
// Persists thread/message ids in .github/needs-testing.ids.json.

import { readFile, writeFile } from 'node:fs/promises'

// Pure: parse the checklist into { id, checked, title, body } items. Exported for
// unit testing without any network.
export function parseTestingItems(md) {
  const items = []
  for (const raw of (md || '').split('\n')) {
    const m = raw.match(/^\s*- \[( |x|X)\]\s+`([^`]+)`\s+(.*\S)\s*$/)
    if (!m) continue
    const checked = m[1].toLowerCase() === 'x'
    const id = m[2].trim()
    const rest = m[3].trim()
    let title = rest
    let body = ''
    const tm = rest.match(/^\*\*(.+?)\*\*\s*(?:[—-]\s*(.*))?$/)
    if (tm) { title = tm[1].trim(); body = (tm[2] || '').trim() }
    else {
      const i = rest.indexOf(' — ')
      if (i !== -1) { title = rest.slice(0, i).trim(); body = rest.slice(i + 3).trim() }
    }
    items.push({ id, checked, title, body })
  }
  return items
}

function embedFor(it) {
  return {
    title: (it.checked ? '✅ ' : '🧪 ') + it.title,
    description: (it.body ? it.body + '\n\n' : '') + '_React ✅ if it works, or reply with what broke._',
    color: it.checked ? 3066993 : 15844367,
  }
}

async function main() {
  const webhook = process.env.DISCORD_TESTING_WEBHOOK
  const file = process.env.TESTING_FILE || 'docs/TESTING.md'
  const idFile = process.env.TESTING_IDS || '.github/needs-testing.ids.json'
  if (!webhook) { console.log('DISCORD_TESTING_WEBHOOK not set — skipping'); return }

  const md = await readFile(file, 'utf8').catch(() => '')
  const items = parseTestingItems(md)
  if (items.length === 0) { console.log('No testing items found — nothing to do'); return }

  let ids = {}
  try { ids = JSON.parse(await readFile(idFile, 'utf8')) } catch { ids = {} }

  let changed = false
  for (const it of items) {
    const embed = embedFor(it)
    const rec = ids[it.id]
    if (!rec) {
      // Forum channels require thread_name; this creates a new thread per item.
      const res = await fetch(webhook + '?wait=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_name: it.title.slice(0, 95), embeds: [embed] }),
      })
      if (!res.ok) { console.error(`POST ${it.id} failed: ${res.status} ${await res.text()}`); continue }
      const msg = await res.json()
      ids[it.id] = { messageId: msg.id, threadId: msg.channel_id }
      changed = true
      console.log(`created thread for ${it.id} (${msg.id})`)
    } else {
      const res = await fetch(`${webhook}/messages/${rec.messageId}?thread_id=${rec.threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      })
      if (!res.ok) { console.error(`PATCH ${it.id} failed: ${res.status} ${await res.text()}`); continue }
      console.log(`updated ${it.id}`)
    }
  }

  if (changed) { await writeFile(idFile, JSON.stringify(ids, null, 2) + '\n'); console.log('wrote id map') }
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1) })
}
