// The leak guard: nothing produced by a production migration run reaches a
// public Actions log until this has read it and passed it.
//
// WHY IT EXISTS. Hanzi-dojo is a PUBLIC repository, so Actions job logs and
// artifacts are readable by anyone on the internet. `--redact` already replaces
// account and card ids in the migration script's own output — but redaction is
// code, and code regresses. An unhandled exception, a new console.log written
// months from now, or a Postgres error string echoing a row is enough to put a
// real UUID into a world-readable log, and a log cannot be un-published.
//
// So the pipeline is never `node … | tee`. It is:
//
//     node … > raw.log 2>&1        # nothing printed yet
//     node ops/leakGuard.mjs raw.log   # fails closed
//     cat raw.log                  # only if the guard passed
//
// The guard NEVER prints the offending text. It reports which rule fired and
// how many times — enough to debug, useless to an attacker.
//
// Deliberately NOT rejected: bare 64-character hex. Those are the SHA-256
// digests the snapshot and manifest steps are supposed to print, and they are
// not sensitive. UUIDs are a different shape and are rejected.

import fs from 'node:fs'

// Each rule names what it protects, so a failure is actionable without showing
// the match. Order is stable for readable reports.
export const RULES = [
  {
    name: 'uuid',
    what: 'a UUID-shaped identifier (card id, account id, vocab id)',
    // 8-4-4-4-12 hex. This is the shape of every id in `cards`, `review_logs`
    // and `profiles`, and the single most likely thing to leak.
    re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  },
  {
    name: 'jwt',
    what: 'a JWT (the legacy anon/service keys are JWTs)',
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)?/g,
  },
  {
    name: 'supabase_secret_key',
    what: 'a Supabase secret/publishable key',
    re: /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/g,
  },
  {
    name: 'service_role',
    what: 'the literal service_role marker',
    re: /\bservice_role\b/g,
  },
  {
    name: 'bearer_token',
    what: 'an Authorization/Bearer credential',
    re: /\b(?:Bearer\s+|apikey["\s:=]+)[A-Za-z0-9._-]{16,}/gi,
  },
  {
    name: 'assigned_secret',
    what: 'an environment assignment that looks like a credential',
    re: /\b(?:SUPABASE_SERVICE_KEY|SUPABASE_SERVICE_ROLE_KEY|GATE3_MANIFEST_PASSPHRASE)\s*=\s*\S+/g,
  },
  {
    name: 'postgres_url',
    what: 'a Postgres connection string with credentials',
    re: /\bpostgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/gi,
  },
]

// scanText(text) → { clean, findings: [{ name, what, count }] }
//
// Counts only. The matched text is never returned, never logged, and never
// stored, so the guard's own output can be printed safely.
export function scanText(text) {
  const findings = []
  for (const rule of RULES) {
    // Fresh lastIndex each time: these are /g regexes and are module-level.
    rule.re.lastIndex = 0
    const matches = String(text || '').match(rule.re)
    if (matches && matches.length > 0) {
      findings.push({ name: rule.name, what: rule.what, count: matches.length })
    }
  }
  return { clean: findings.length === 0, findings }
}

// The message a failing guard is allowed to print. Generic by construction.
export const WITHHELD_MESSAGE = 'Sensitive-looking output detected; raw log withheld'

export function formatReport(findings) {
  return findings.map(f => '  - ' + f.name + ': ' + f.what + ' (' + f.count + ' occurrence(s))').join('\n')
}

// CLI: `node ops/leakGuard.mjs <file> [...files]`
// Exit 0 = safe to print. Exit 1 = withhold. Exit 2 = could not check, which
// is also a refusal: an unreadable log is not a clean log.
function main(argv) {
  const files = argv.slice(2)
  if (files.length === 0) {
    console.error('usage: node ops/leakGuard.mjs <file> [...]')
    return 2
  }
  let failed = false
  for (const file of files) {
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch (err) {
      console.error('leak guard: cannot read ' + file + ' (' + err.code + ') — refusing to treat it as clean')
      failed = true
      continue
    }
    const { clean, findings } = scanText(text)
    if (clean) {
      console.log('leak guard: ' + file + ' clean (' + text.length + ' bytes checked)')
    } else {
      failed = true
      console.error('leak guard: ' + file + ' FAILED')
      console.error(formatReport(findings))
    }
  }
  if (failed) {
    console.error('')
    console.error(WITHHELD_MESSAGE)
    return 1
  }
  return 0
}

// Only run as a CLI, never on import (the tests import it).
if (process.argv[1] && process.argv[1].endsWith('leakGuard.mjs')) {
  process.exit(main(process.argv))
}
