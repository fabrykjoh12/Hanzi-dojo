import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import {
  TARGETS,
  isValidMessageId,
  embedPayload,
  prepare,
} from './.github/scripts/roadmap-sync.mjs'

// Structural guards on the Discord sync.
//
// The invariant these protect is narrow and absolute: A NON-MAIN BRANCH MUST
// NEVER MUTATE MAIN, DIRECTLY OR INDIRECTLY. The previous version of this
// workflow ran on branch pushes and copied that branch's ROADMAP.md and
// docs/BACKLOG.md onto main with a whole-file `git checkout` + `git push` — no
// PR, no review, no merge, last writer wins. It lost real work: 42e367a
// removed 83 lines of docs/BACKLOG.md that 27358b5 had added from a different
// branch, and 015fe1e put them back.
//
// A YAML edit can reintroduce any part of that silently, and no unit test would
// otherwise notice — so, like gate3-workflows.test.mjs, these assert on the
// workflow text itself. Dependency-free on purpose: the repo has no YAML
// parser, and "this string must not appear" is exactly the assertion needed.

const WORKFLOW_PATH = '.github/workflows/roadmap-live-sync.yml'
const SYNC = readFileSync(WORKFLOW_PATH, 'utf8')
const SCRIPT = readFileSync('.github/scripts/roadmap-sync.mjs', 'utf8')
const NOTIFY = readFileSync('.github/workflows/discord-notify.yml', 'utf8')

// Comments explain the old behaviour at length; the assertions below must not
// trip over that prose. This strips comment lines and leaves the executable YAML.
const withoutComments = text => text
  .split('\n')
  .filter(line => !/^\s*#/.test(line))
  .join('\n')

const SYNC_YAML = withoutComments(SYNC)
const NOTIFY_YAML = withoutComments(NOTIFY)

describe('the sync workflow cannot write to the repository', () => {
  it('does not request contents: write', () => {
    expect(SYNC_YAML).not.toContain('contents: write')
  })

  it('requests contents: read explicitly', () => {
    // An absent `permissions:` block inherits the repository default, which may
    // be write. Least privilege has to be stated, not assumed.
    expect(SYNC_YAML).toMatch(/permissions:\s*\n\s*contents: read/)
  })

  it('runs no git command that could change history or refs', () => {
    for (const forbidden of [
      'git push', 'git commit', 'git add', 'git checkout', 'git config',
      'git merge', 'git rebase', 'git cherry-pick', 'git apply',
    ]) {
      expect(SYNC_YAML).not.toContain(forbidden)
    }
  })

  it('uses no action that writes to the repository on its behalf', () => {
    for (const forbidden of [
      'create-pull-request', 'add-and-commit', 'git-auto-commit',
      'peter-evans', 'stefanzweifel', 'GITHUB_TOKEN',
    ]) {
      expect(SYNC_YAML).not.toContain(forbidden)
    }
  })
})

describe('only main can trigger a canonical sync', () => {
  it('takes pushes from main and nothing else', () => {
    expect(SYNC_YAML).toMatch(/push:\s*\n\s*branches: \[main\]/)
  })

  it('has no branches-ignore trigger — the old branch-push entry point', () => {
    expect(SYNC_YAML).not.toContain('branches-ignore')
  })

  it('keeps workflow_dispatch for a manual re-sync', () => {
    expect(SYNC_YAML).toContain('workflow_dispatch')
  })

  it('refuses a manual dispatch aimed at any ref but main', () => {
    // workflow_dispatch can be pointed at any branch from the Actions UI, which
    // would otherwise let a branch put its own text into the community channel.
    expect(SYNC_YAML).toContain("github.ref != 'refs/heads/main'")
    expect(SYNC_YAML).toMatch(/github\.ref != 'refs\/heads\/main'[\s\S]*?exit 1/)
  })

  it('renders the checked-out canonical revision, not a branch', () => {
    expect(SYNC_YAML).toContain('actions/checkout@v4')
    // No `ref:` override — checkout defaults to the commit that triggered the
    // run, which for a main push is the canonical revision itself.
    expect(SYNC_YAML).not.toMatch(/^\s*ref:/m)
  })
})

describe('a newer main push always wins', () => {
  it('serialises runs and cancels an older one', () => {
    expect(SYNC_YAML).toMatch(/concurrency:\s*\n\s*group: roadmap-live-sync/)
    expect(SYNC_YAML).toMatch(/concurrency:[\s\S]*?cancel-in-progress: true/)
  })
})

describe('only the canonical documents feed the renderer', () => {
  it('sources exactly ROADMAP.md and docs/BACKLOG.md', () => {
    expect(TARGETS.map(t => t.file).sort()).toEqual(['ROADMAP.md', 'docs/BACKLOG.md'])
  })

  it('reads message ids only from .github', () => {
    for (const target of TARGETS) expect(target.idFile).toMatch(/^\.github\/[a-z-]+\.id$/)
  })

  it('delegates rendering to the tested module rather than inlining it again', () => {
    expect(SYNC_YAML).toContain('node .github/scripts/roadmap-sync.mjs')
    expect(SYNC_YAML).not.toContain('awk')
    expect(SCRIPT).toContain("from './roadmap-render.mjs'")
  })

  it('never passes the maintenance bootstrap flag from CI', () => {
    expect(SYNC_YAML).not.toContain('--bootstrap')
  })
})

describe('the sync script itself writes nothing', () => {
  it('imports no filesystem write and no process spawn', () => {
    expect(SCRIPT).toContain("from 'node:fs/promises'")
    for (const forbidden of ['writeFile', 'appendFile', 'mkdir', 'rm(', 'unlink', 'child_process', 'execSync', 'spawn']) {
      expect(SCRIPT).not.toContain(forbidden)
    }
  })

  it('only ever PATCHes on the automatic path', () => {
    // A POST exists solely behind --bootstrap, which CI never passes (above).
    const postCount = (SCRIPT.match(/method: 'POST'/g) || []).length
    expect(postCount).toBe(1)
    expect(SCRIPT).toMatch(/bootstrap[\s\S]*?method: 'POST'/)
    expect(SCRIPT).toContain("method: 'PATCH'")
  })
})

describe('message ids are configuration, read but never written', () => {
  it('accepts a Discord snowflake and rejects anything else', () => {
    expect(isValidMessageId('1527075325425750067')).toBe(true)
    expect(isValidMessageId(' 1527075325425750067 ')).toBe(true)
    expect(isValidMessageId('')).toBe(false)
    expect(isValidMessageId(null)).toBe(false)
    expect(isValidMessageId(undefined)).toBe(false)
    expect(isValidMessageId('not-an-id')).toBe(false)
    expect(isValidMessageId('12345')).toBe(false)
    expect(isValidMessageId('1527075325425750067\n1527075325425750068')).toBe(false)
  })

  it('the committed roadmap id is a valid snowflake', () => {
    const target = TARGETS.find(t => t.key === 'roadmap')
    expect(existsSync(target.idFile)).toBe(true)
    expect(isValidMessageId(readFileSync(target.idFile, 'utf8'))).toBe(true)
  })

  it('an id file that exists is always valid', () => {
    // The backlog id does not exist yet; that target fails loudly at runtime
    // rather than posting a new message. Whichever exist must parse.
    for (const target of TARGETS) {
      if (existsSync(target.idFile)) {
        expect(isValidMessageId(readFileSync(target.idFile, 'utf8'))).toBe(true)
      }
    }
  })
})

describe('rendering a target', () => {
  it('skips a target whose webhook secret is not set', async () => {
    const target = TARGETS.find(t => t.key === 'roadmap')
    const result = await prepare(target, {})
    expect(result.skipped).toBeTruthy()
    expect(result.payload).toBeUndefined()
  })

  it('builds a Discord embed from the live roadmap', async () => {
    const target = TARGETS.find(t => t.key === 'roadmap')
    const result = await prepare(target, { DISCORD_ROADMAP_WEBHOOK: 'https://example.invalid/webhook' })
    expect(result.skipped).toBeUndefined()
    expect(result.payload.embeds[0].title).toBe('🗺️ Hanzi Dojo Roadmap')
    expect(result.payload.embeds[0].description.length).toBeGreaterThan(200)
    expect(result.payload.embeds[0].description.length).toBeLessThanOrEqual(4096)
  })

  it('fails loudly when the document is missing rather than skipping', async () => {
    const target = { ...TARGETS[0], file: 'docs/NOPE-does-not-exist.md' }
    await expect(prepare(target, { DISCORD_ROADMAP_WEBHOOK: 'x' })).rejects.toThrow(/missing/)
  })

  it('fails loudly when the document renders to nothing', async () => {
    const target = { ...TARGETS[0], file: '.github/roadmap-message.id' }
    await expect(prepare(target, { DISCORD_ROADMAP_WEBHOOK: 'x' })).rejects.toThrow(/rendered to nothing/)
  })

  it('carries the footer and colour into the embed', () => {
    const payload = embedPayload(TARGETS[0], 'body')
    expect(payload.embeds[0].color).toBe(12073508)
    expect(payload.embeds[0].footer.text).toMatch(/Updates automatically/)
  })
})

describe('discord-notify.yml no longer owns #roadmap or #backlog', () => {
  it('has one owner per channel — no second renderer editing the same messages', () => {
    expect(NOTIFY_YAML).not.toContain('DISCORD_ROADMAP_WEBHOOK')
    expect(NOTIFY_YAML).not.toContain('DISCORD_BACKLOG_WEBHOOK')
    expect(NOTIFY_YAML).not.toContain('roadmap-message.id')
    expect(NOTIFY_YAML).not.toContain('backlog-message.id')
  })

  it('no longer commits a message id to main', () => {
    for (const forbidden of ['git push', 'git commit', 'git add', 'contents: write']) {
      expect(NOTIFY_YAML).not.toContain(forbidden)
    }
  })

  it('still posts the changelog to #announcements', () => {
    expect(NOTIFY_YAML).toContain('DISCORD_ANNOUNCE_WEBHOOK')
    expect(NOTIFY_YAML).toContain('Update shipped')
  })
})
