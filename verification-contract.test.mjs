import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

// The verification contract: ONE definition of "is this change good enough to
// merge", used by CI, by /ship and by any agent checking its own work.
//
// It is `npm run verify:pr` in package.json. Everything else points at it.
//
// This module exists because the previous arrangement drifted in exactly the
// way an untested convention always does. CI's `check` job grew from three
// open-coded commands to six, while CLAUDE.md §8 and .claude/commands/ship.md
// both went on describing "the three checks CI runs" — so an agent could run
// the documented gate, watch it pass, and still be red on CI. Every assertion
// below is one way that gap could reopen.
//
// Structural where possible: the stage list is parsed out of the npm script and
// compared as data, and CI's commands are extracted from the YAML rather than
// pattern-matched as prose.

const PKG = JSON.parse(readFileSync('package.json', 'utf8'))
const CI = readFileSync('.github/workflows/ci.yml', 'utf8')
const SHIP = readFileSync('.claude/commands/ship.md', 'utf8')
const PARALLEL = readFileSync('.claude/commands/parallel.md', 'utf8')
const CLAUDE_MD = readFileSync('CLAUDE.md', 'utf8')
const SETTINGS = JSON.parse(readFileSync('.claude/settings.json', 'utf8'))

const CANONICAL = 'npm run verify:pr'

/** The gate, in the order the build variants require. */
const REQUIRED_STAGES = [
  'npm run lint',
  'npm test',
  'npm run build',
  'npm run build:public',
  'npm run verify:public-bundle',
  'node tools/verify-app-icons.mjs',
]

/** Stages of the npm script, as data. */
const stagesOf = script => script.split('&&').map(s => s.trim()).filter(Boolean)

/** YAML comments carry example commands; only executable lines are the contract. */
const withoutComments = text => text.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')

/** Every `run:` value in the workflow, single-line form (all this file uses). */
const runCommands = yaml => [...withoutComments(yaml).matchAll(/^\s*(?:- )?run:\s*(.+?)\s*$/gm)].map(m => m[1])

describe('package.json defines the canonical gate', () => {
  it('has a verify:pr script', () => {
    expect(PKG.scripts).toHaveProperty('verify:pr')
    expect(typeof PKG.scripts['verify:pr']).toBe('string')
  })

  it('runs every required stage', () => {
    const stages = stagesOf(PKG.scripts['verify:pr'])
    for (const stage of REQUIRED_STAGES) expect(stages).toContain(stage)
  })

  it('runs them in the order dist/ requires', () => {
    // `build` and `build:public` both write dist/client, and the bundle guard
    // inspects whatever built last. Reordering these makes the guard check the
    // wrong artifact and pass for the wrong reason.
    const stages = stagesOf(PKG.scripts['verify:pr'])
    const positions = REQUIRED_STAGES.map(s => stages.indexOf(s))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('puts nothing between the store build and the guard that inspects it', () => {
    const stages = stagesOf(PKG.scripts['verify:pr'])
    const build = stages.indexOf('npm run build:public')
    const guard = stages.indexOf('npm run verify:public-bundle')
    expect(guard).toBe(build + 1)
  })

  it('every stage it names actually exists', () => {
    for (const stage of stagesOf(PKG.scripts['verify:pr'])) {
      const npmScript = stage.match(/^npm run ([\w:-]+)$/)
      if (npmScript) {
        expect(PKG.scripts, 'verify:pr calls a missing npm script: ' + stage).toHaveProperty(npmScript[1])
        continue
      }
      if (stage === 'npm test') continue
      const nodeScript = stage.match(/^node (\S+)/)
      expect(nodeScript, 'unrecognised stage shape: ' + stage).not.toBeNull()
      expect(existsSync(nodeScript[1]), 'verify:pr runs a missing file: ' + nodeScript[1]).toBe(true)
    }
  })

  it('does not absorb the jobs that are deliberately separate', () => {
    // Playwright stays its own CI job (sandbox-flaky, needs a browser install),
    // and native ARTIFACT verification — the Capacitor wrapper and the
    // iOS/Android builds — is separate too. Note the store *web bundle* is not
    // in that carve-out: `build:public` is a stage above. Folding either of
    // these in would make every local /ship pay for them and blur what a green
    // run actually means.
    const script = PKG.scripts['verify:pr']
    expect(script).not.toContain('playwright')
    expect(script).not.toContain('npm run e2e')
    expect(script).not.toContain('build:native')
    expect(script).not.toContain('verify:native')
  })
})

describe('CI runs the canonical gate and nothing of its own', () => {
  it('invokes verify:pr', () => {
    expect(runCommands(CI)).toContain(CANONICAL)
  })

  it('does not open-code the individual stages', () => {
    // The failure mode this prevents: someone adds a stage to CI only, and the
    // command an agent runs locally silently stops matching the merge gate.
    const commands = runCommands(CI)
    for (const stage of REQUIRED_STAGES) {
      expect(commands, 'ci.yml open-codes a verify:pr stage: ' + stage).not.toContain(stage)
    }
  })

  it('runs only dependency install and the gate', () => {
    expect(runCommands(CI).filter(c => c !== 'npm ci')).toEqual([CANONICAL])
  })

  it('still installs dependencies first', () => {
    const commands = runCommands(CI)
    expect(commands.indexOf('npm ci')).toBeLessThan(commands.indexOf(CANONICAL))
  })

  it('does not re-create the stage list in its comments either', () => {
    // A comment listing all six stages is not executable, but it is still a
    // second description of the gate, and second descriptions drift — that is
    // the whole failure this PR is fixing. Naming ONE stage in passing is fine
    // (a comment may need to explain a particular guard); enumerating them is
    // rebuilding the list package.json already owns.
    const named = REQUIRED_STAGES.filter(stage => CI.includes(stage))
    expect(named, 'ci.yml re-enumerates the gate: ' + named.join(', ')).toHaveLength(0)
  })
})

describe('the docs point at the gate instead of restating it', () => {
  it('/ship runs it', () => {
    expect(SHIP).toContain(CANONICAL)
  })

  it('/parallel runs it', () => {
    expect(PARALLEL).toContain(CANONICAL)
  })

  it('CLAUDE.md names it as the gate', () => {
    expect(CLAUDE_MD).toContain(CANONICAL)
  })

  it('no command doc restates the stage list', () => {
    // "Run lint, then test, then build" in a command doc is a second gate
    // definition, and second definitions go stale. Naming one stage is fine
    // (e.g. explaining what a guard covers); reproducing the sequence is not.
    for (const [name, doc] of [['ship.md', SHIP], ['parallel.md', PARALLEL]]) {
      const restated = REQUIRED_STAGES.filter(stage => doc.includes(stage))
      expect(restated, name + ' restates verify:pr stages: ' + restated.join(', ')).toHaveLength(0)
    }
  })

  it('CLAUDE.md does not copy the shell implementation', () => {
    expect(CLAUDE_MD).not.toContain(PKG.scripts['verify:pr'])
  })

  it('CLAUDE.md says what stays outside the gate', () => {
    // A green verify:pr must not be mistaken for e2e or native coverage.
    const section = CLAUDE_MD.slice(CLAUDE_MD.indexOf('## 8.'), CLAUDE_MD.indexOf('## 9.'))
    expect(section.toLowerCase()).toContain('playwright')
    expect(section.toLowerCase()).toContain('native')
  })

  it('does not describe the carve-out as covering the store build', () => {
    // "native/store build verification is separate" was the original wording
    // and it is false: `build:public` IS the store web bundle and IS a stage of
    // verify:pr. What is separate is the native ARTIFACT — the Capacitor
    // wrapper and the iOS/Android builds. Reading it the wrong way would send
    // someone re-verifying a bundle the gate already covers, or worse, assuming
    // the store bundle is unguarded.
    for (const [name, doc] of [['CLAUDE.md', CLAUDE_MD], ['ship.md', SHIP], ['parallel.md', PARALLEL]]) {
      expect(doc.toLowerCase(), name + ' calls the store build unverified').not.toContain('native/store')
    }
  })
})

describe('agent-dispatching docs defer to CLAUDE.md for the rules', () => {
  it('/parallel sends agents to CLAUDE.md', () => {
    expect(PARALLEL).toContain('CLAUDE.md')
  })

  it('carries no retracted prohibition', () => {
    // Each of these was a real rule that CLAUDE.md §6 has since corrected —
    // regex literals, device storage through the helpers, and a <form> with
    // onSubmit + preventDefault are all fine now. /parallel went on teaching
    // the old version to every agent it dispatched.
    const RETRACTED = [
      'no complex regex',
      'no `localStorage`',
      'no localStorage',
      'no `<form>`',
      'no <form>',
    ]
    for (const [name, doc] of [['ship.md', SHIP], ['parallel.md', PARALLEL]]) {
      for (const phrase of RETRACTED) {
        expect(doc.toLowerCase(), name + ' still teaches a retracted rule: ' + phrase)
          .not.toContain(phrase.toLowerCase())
      }
    }
  })

  it('keeps the orchestration knowledge that lives nowhere else', () => {
    // The point of the dedup is to remove DUPLICATED general rules, not to
    // hollow out /parallel. These are specific to running agents in parallel
    // and are not stated in CLAUDE.md.
    for (const bigComponent of ['Study.jsx', 'DojoHQ.jsx', 'StoryReaderImmersive.jsx']) {
      expect(PARALLEL).toContain(bigComponent)
    }
    for (const sharedCore of ['srs.js', 'storyReading.js', 'languageTheme.js']) {
      expect(PARALLEL).toContain(sharedCore)
    }
    expect(PARALLEL).toContain('supabase/migrations/')
    expect(PARALLEL).toContain('ROADMAP.md')
  })
})

describe('the harness can run the gate without a prompt', () => {
  it('allow-lists the canonical command', () => {
    // A remote session cannot answer a permission prompt, so a missing entry
    // here does not mean "ask" — it means the gate can never run.
    expect(SETTINGS.permissions.allow).toContain('Bash(' + CANONICAL + ')')
  })

  it('did not broaden anything else to get there', () => {
    const npmAllows = SETTINGS.permissions.allow.filter(p => p.startsWith('Bash(npm'))
    for (const entry of npmAllows) expect(entry).not.toContain('*')
  })
})
