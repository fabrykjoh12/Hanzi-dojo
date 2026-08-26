// Push the canonical ROADMAP.md / docs/BACKLOG.md into their pinned Discord
// messages. Run by .github/workflows/roadmap-live-sync.yml, from a checkout of
// main and nowhere else.
//
// THE RULE THIS SCRIPT EXISTS TO ENFORCE
//
// A non-main branch must never mutate main, directly or indirectly. The old
// version of this sync copied a working branch's doc files onto main with
// `git checkout <branch> -- ROADMAP.md docs/BACKLOG.md` and pushed. That is a
// whole-file replacement with no merge, so whichever branch pushed last won —
// and it demonstrably lost work: commit 42e367a deleted 83 lines of
// docs/BACKLOG.md that another branch had added an hour earlier, and 015fe1e
// put them back. Discord and main disagreed for most of a day.
//
// So this script:
//   * reads only from the checked-out canonical revision,
//   * writes nothing — no files, no git, no commits, no pushes,
//   * only ever EDITS an existing Discord message, by an id kept in the repo as
//     configuration.
//
// It never creates a message. Creating one means learning an id that must then
// be committed, and a workflow that commits to main is the thing we removed.
// If an id is missing or the edit is rejected, this fails loudly and a human
// makes an explicit maintenance change (see MISSING_ID_HELP below).
//
// Usage:
//   node .github/scripts/roadmap-sync.mjs             # edit both messages
//   node .github/scripts/roadmap-sync.mjs --dry-run   # render, print, send nothing
//   node .github/scripts/roadmap-sync.mjs --bootstrap=roadmap
//        ^ maintenance only, never from CI: posts a NEW message and prints its
//          id so a human can commit it. Still writes no files.

import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { renderCondensed } from './roadmap-render.mjs'

/**
 * The only documents that may feed the renderer. Anything not listed here
 * cannot reach Discord through this script — asserted by roadmap-sync.test.mjs.
 */
export const TARGETS = [
  {
    key: 'roadmap',
    file: 'ROADMAP.md',
    idFile: '.github/roadmap-message.id',
    webhookEnv: 'DISCORD_ROADMAP_WEBHOOK',
    title: '🗺️ Hanzi Dojo Roadmap',
    color: 12073508,
  },
  {
    key: 'backlog',
    file: 'docs/BACKLOG.md',
    idFile: '.github/backlog-message.id',
    webhookEnv: 'DISCORD_BACKLOG_WEBHOOK',
    title: '🛠️ Engineering backlog',
    color: 6982195,
  },
]

export const FOOTER_TEXT = 'Updates automatically when the roadmap changes'

/** A Discord snowflake: 17–20 digits, nothing else. */
export const SNOWFLAKE = /^[0-9]{17,20}$/

export function isValidMessageId(value) {
  return SNOWFLAKE.test(String(value ?? '').trim())
}

export function embedPayload(target, description) {
  return {
    embeds: [{
      title: target.title,
      description,
      color: target.color,
      footer: { text: FOOTER_TEXT },
    }],
  }
}

function missingIdHelp(target) {
  return [
    'No usable Discord message id for ' + target.key + ' (' + target.idFile + ').',
    'This sync only ever EDITS an existing message — it will not post a new one,',
    'because that would mean committing the new id back to main from CI.',
    'To fix, as a deliberate maintenance change:',
    '  1. run  node .github/scripts/roadmap-sync.mjs --bootstrap=' + target.key,
    '     locally, with ' + target.webhookEnv + ' set to the channel webhook;',
    '  2. commit the printed id to ' + target.idFile + ' via a normal PR.',
  ].join('\n')
}

async function readIfPresent(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') return null
    throw err
  }
}

/**
 * Render one target, or throw with a message a maintainer can act on.
 * Returns null when the target is not configured (no webhook secret), which is
 * a skip rather than a failure — it is how a channel gets wired up one at a time.
 */
export async function prepare(target, env) {
  const webhook = (env[target.webhookEnv] || '').trim()
  if (!webhook) return { target, skipped: target.webhookEnv + ' is not set' }

  const markdown = await readIfPresent(target.file)
  if (markdown === null) {
    throw new Error(target.file + ' is missing from the canonical checkout. ' +
      'If it was renamed, update TARGETS in this script in the same change.')
  }

  const description = renderCondensed(markdown)
  if (!description) {
    throw new Error(target.file + ' rendered to nothing. The document shape ' +
      'changed (the renderer needs "## " headings before the first "---" rule). ' +
      'Fix the document or the renderer — do not let the channel go stale silently.')
  }

  return { target, webhook, description, payload: embedPayload(target, description) }
}

/** PATCH an existing message. Never POSTs. */
async function editMessage(job, id) {
  const response = await fetch(job.webhook + '/messages/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job.payload),
  })
  if (!response.ok) {
    // The webhook URL carries a token, so it is never echoed — only the target
    // key, the status, and Discord's own explanation.
    const detail = (await response.text().catch(() => '')).slice(0, 300)
    throw new Error('Discord refused the ' + job.target.key + ' edit: HTTP ' +
      response.status + '. ' + detail + '\nIf the message was deleted, ' +
      'bootstrap a new one and commit its id (see ' + job.target.idFile + ').')
  }
}

/** Maintenance path: POST a new message and report its id. Writes no files. */
async function bootstrapMessage(job) {
  const response = await fetch(job.webhook + '?wait=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job.payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.id) {
    throw new Error('Could not post a new ' + job.target.key + ' message: HTTP ' + response.status)
  }
  process.stdout.write(
    '\nPosted a new ' + job.target.key + ' message.\n' +
    'Commit this id to ' + job.target.idFile + ' in a normal PR:\n\n  ' + body.id + '\n\n',
  )
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const dryRun = argv.includes('--dry-run')
  const bootstrap = (argv.find(a => a.startsWith('--bootstrap=')) || '').split('=')[1] || ''

  const failures = []
  for (const target of TARGETS) {
    if (bootstrap && bootstrap !== target.key) continue

    let job
    try {
      job = await prepare(target, env)
    } catch (err) {
      failures.push(err.message)
      continue
    }

    if (job.skipped) {
      process.stdout.write('skip  ' + target.key + ' — ' + job.skipped + '\n')
      continue
    }

    if (dryRun) {
      process.stdout.write('\n--- ' + target.key + ' (' + job.description.length +
        ' chars, dry run) ---\n' + job.description + '\n')
      continue
    }

    if (bootstrap === target.key) {
      await bootstrapMessage(job)
      continue
    }

    const id = (await readIfPresent(target.idFile) || '').trim()
    if (!isValidMessageId(id)) {
      failures.push(missingIdHelp(target))
      continue
    }

    try {
      await editMessage(job, id)
      process.stdout.write('ok    ' + target.key + ' — edited message ' + id +
        ' (' + job.description.length + ' chars)\n')
    } catch (err) {
      failures.push(err.message)
    }
  }

  if (failures.length) {
    // Every target is attempted before failing, so one broken channel never
    // silently blocks the other.
    process.stderr.write('\nroadmap-sync: ' + failures.length + ' failure(s)\n\n' +
      failures.join('\n\n') + '\n')
    process.exitCode = 1
  }
}

// Only run when executed directly, so the specs can import the pure parts.
if (process.argv[1] && process.argv[1].endsWith('roadmap-sync.mjs')) {
  main().catch(err => {
    process.stderr.write(String((err && err.stack) || err) + '\n')
    process.exitCode = 1
  })
}
