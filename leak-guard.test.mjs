import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanText, formatReport, WITHHELD_MESSAGE, RULES } from './ops/leakGuard.mjs'

// The leak guard stands between a production migration run and a PUBLIC
// Actions log. Hanzi-dojo's repository is public, so job logs and artifacts are
// readable by anyone on the internet, and a leaked identifier cannot be
// un-published.
//
// `--redact` in migrate-legacy-claims.mjs is the first line of defence, but it
// is code and code regresses. These specs cover the second line: read the whole
// output into a file, scan it, and refuse to print ANY of it if something
// identifier-shaped got through.

const UUID = '3f9a1c2e-7b41-4d8e-9a03-1b2c3d4e5f60'

function withTempFile(contents, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leakguard-'))
  const file = path.join(dir, 'raw.log')
  fs.writeFileSync(file, contents)
  try {
    return fn(file)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// Run the CLI exactly as the workflow does.
function runGuard(file) {
  try {
    const stdout = execFileSync('node', ['ops/leakGuard.mjs', file], { encoding: 'utf8' })
    return { code: 0, stdout, stderr: '' }
  } catch (err) {
    return { code: err.status, stdout: err.stdout || '', stderr: err.stderr || '' }
  }
}

describe('what the guard rejects', () => {
  it('a UUID — the shape of every card, account and vocab id', () => {
    const res = scanText('  processing card ' + UUID + ' ok')
    expect(res.clean).toBe(false)
    expect(res.findings.map(f => f.name)).toContain('uuid')
  })

  it('a JWT, which is what the legacy anon/service keys are', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJlX2hlcmU'
    expect(scanText('key=' + jwt).clean).toBe(false)
  })

  it('a Supabase secret or publishable key', () => {
    expect(scanText('sb_secret_NwSspA0U9nlbty0SVXF8Ao1oVQyT').clean).toBe(false)
    expect(scanText('sb_publishable_NwSspA0U9nlbty0SVXF8Ao1').clean).toBe(false)
  })

  it('the service_role marker', () => {
    expect(scanText('"role":"service_role"').clean).toBe(false)
  })

  it('a bearer/apikey credential', () => {
    expect(scanText('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456').clean).toBe(false)
    expect(scanText('apikey: abcdefghijklmnopqrstuvwxyz123456').clean).toBe(false)
  })

  it('an environment assignment that looks like a credential', () => {
    expect(scanText('SUPABASE_SERVICE_KEY=hunter2hunter2hunter2').clean).toBe(false)
    expect(scanText('GATE3_MANIFEST_PASSPHRASE=correct-horse').clean).toBe(false)
  })

  it('a Postgres URL carrying credentials', () => {
    expect(scanText('postgresql://user:pw@db.example.com:5432/postgres').clean).toBe(false)
  })

  it('finds every occurrence, not just the first', () => {
    const two = UUID + ' and ' + '11111111-2222-4333-8444-555555555555'
    const uuid = scanText(two).findings.find(f => f.name === 'uuid')
    expect(uuid.count).toBe(2)
  })
})

describe('what the guard must NOT reject', () => {
  it('a redacted migration report', () => {
    const redacted = [
      'CLASSIFICATION',
      '  convert_legacy_claim      588',
      '  replay_reviewed_seed      207',
      '  excluded_foreign           37',
      'AFFECTED ACCOUNTS (2)',
      '  account#1   convert  482   replay  15',
      '  account#2   convert  106   replay 192',
      'REPLAY PREVIEW (first 5 of 207)',
      '  card#1  stability 21 -> 8.30, reps 0 -> 1 (1 real review)',
    ].join('\n')
    const res = scanText(redacted)
    expect(res.clean).toBe(true)
  })

  it('a bare SHA-256 digest — those are printed on purpose and are not sensitive', () => {
    const digest = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    expect(scanText('  sha256        ' + digest).clean).toBe(true)
    expect(scanText('0:' + digest).clean).toBe(true)
  })

  it('a git commit SHA', () => {
    expect(scanText('migration commit: 472619f8b760c9ed4161b3d9c6ea7b8f3403510a').clean).toBe(true)
  })

  it('an ISO timestamp and a bulk-cohort line', () => {
    expect(scanText('  2026-08-19T10:22:10.003419Z  untouched   482  reviewed    15').clean).toBe(true)
  })

  it('empty output', () => {
    expect(scanText('').clean).toBe(true)
  })
})

describe('the guard never reveals what it found', () => {
  it('the report names the rule and a count, never the matched text', () => {
    const { findings } = scanText('card ' + UUID)
    const report = formatReport(findings)
    expect(report).toContain('uuid')
    expect(report).toContain('1 occurrence')
    expect(report).not.toContain(UUID)
  })

  it('no rule description contains anything sensitive', () => {
    for (const rule of RULES) {
      expect(typeof rule.what).toBe('string')
      expect(rule.what).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
    }
  })
})

describe('the CLI fails closed', () => {
  it('exits 0 and says so for clean output', () => {
    const out = withTempFile('convert 588\nreplay 207\n', runGuard)
    expect(out.code).toBe(0)
    expect(out.stdout).toContain('clean')
  })

  // THE regression: a UUID is injected, and the guard must withhold the log
  // rather than print it. This is the exact failure the design exists for.
  it('withholds a log containing an injected UUID instead of printing it', () => {
    const poisoned = [
      'CLASSIFICATION',
      '  convert_legacy_claim      588',
      'unexpected error while updating card ' + UUID,
    ].join('\n')
    const out = withTempFile(poisoned, runGuard)

    expect(out.code).toBe(1)
    const everythingPrinted = out.stdout + out.stderr
    // The generic refusal is shown...
    expect(everythingPrinted).toContain(WITHHELD_MESSAGE)
    expect(everythingPrinted).toContain('uuid')
    // ...and NOTHING of the raw log escapes — not the UUID, not the line
    // around it.
    expect(everythingPrinted).not.toContain(UUID)
    expect(everythingPrinted).not.toContain('unexpected error while updating')
    expect(everythingPrinted).not.toContain('convert_legacy_claim')
  })

  it('refuses an unreadable file rather than treating it as clean', () => {
    const out = runGuard('/tmp/definitely-not-a-real-leakguard-file.log')
    expect(out.code).toBe(1)
    expect(out.stderr).toContain('refusing to treat it as clean')
  })

  it('exits 2 when given no file at all', () => {
    let code
    try {
      execFileSync('node', ['ops/leakGuard.mjs'], { encoding: 'utf8' })
      code = 0
    } catch (err) { code = err.status }
    expect(code).toBe(2)
  })

  it('checks every file it is given and fails if ANY is dirty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leakguard-multi-'))
    const clean = path.join(dir, 'a.log')
    const dirty = path.join(dir, 'b.log')
    fs.writeFileSync(clean, 'convert 588\n')
    fs.writeFileSync(dirty, 'card ' + UUID + '\n')
    try {
      let code
      let stderr = ''
      try {
        execFileSync('node', ['ops/leakGuard.mjs', clean, dirty], { encoding: 'utf8' })
        code = 0
      } catch (err) { code = err.status; stderr = err.stderr || '' }
      expect(code).toBe(1)
      // One dirty file poisons the whole run — and still nothing leaks.
      expect(stderr).not.toContain(UUID)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
