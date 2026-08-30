import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// The native verification TIER's contract: what runs it, what it covers, what
// it must stay out of, and — the part that took a correction — the shape that
// lets it be required without deadlocking unrelated pull requests.
//
// Three failure modes this exists to prevent, all of which look like nothing is
// wrong until a release cut:
//
//   1. The tier stops covering a native input. Coverage is an allow-list; a
//      file nobody listed never triggers it, and no test fails. That is exactly
//      how src/App.jsx — compiled into the store bundle — sat outside native
//      coverage while a hand-picked list of "native-looking" files sat inside.
//   2. Native work creeps into `npm run verify:pr`, making every documentation
//      typo pay for a store build and a Chromium download.
//   3. The gate becomes unrequireable. A workflow-level `paths:` filter posts
//      no status at all on a non-native pull request, so requiring it blocks
//      that pull request forever.

const NATIVE_WF = '.github/workflows/native.yml'
const NATIVE = readFileSync(NATIVE_WF, 'utf8')
const CI = readFileSync('.github/workflows/ci.yml', 'utf8')
const ANDROID = readFileSync('.github/workflows/android-build.yml', 'utf8')
const PKG = JSON.parse(readFileSync('package.json', 'utf8'))

const executable = text => text.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')
const NATIVE_YAML = executable(NATIVE)

const stagesOf = script => script.split('&&').map(s => s.trim()).filter(Boolean)

/**
 * Directory-level coverage, on purpose. `src/` is the whole app — every screen
 * in it compiles into the store bundle — and `public/` ships verbatim. Naming
 * individual source files here is the narrowing this contract forbids.
 */
const REQUIRED_DIRECTORY_COVERAGE = ['^src/', '^public/', '^android/', '^ios/']

const REQUIRED_FILE_COVERAGE = [
  '^package\\.json$',
  '^package-lock\\.json$',
  '^vite\\.config\\.js$',
  '^index\\.html$',
  '^capacitor\\.config\\.json$',
  '^nativeFonts\\.mjs$',
  '^fetch-webfonts\\.mjs$',
  '^tools/verify-native-fonts\\.mjs$',
  '^tools/verify-native-shell\\.mjs$',
  '^tools/verify-app-icons\\.mjs$',
]

const REQUIRED_NATIVE_STAGES = [
  'node tools/verify-native-shell.mjs',
  'npm run build:native',
  'npm run verify:native-fonts',
]

describe('the verify:native script', () => {
  it('exists', () => {
    expect(PKG.scripts).toHaveProperty('verify:native')
  })

  it('runs the shell check, the native build, and the font proof, in that order', () => {
    // Shell check first: it needs no build and fails in milliseconds, so a
    // mismatched bundle id does not cost a full native build to discover.
    // The font proof last: it inspects whatever build:native just produced.
    expect(stagesOf(PKG.scripts['verify:native'])).toEqual(REQUIRED_NATIVE_STAGES)
  })

  it('names only scripts and files that exist', () => {
    for (const stage of stagesOf(PKG.scripts['verify:native'])) {
      const npmScript = stage.match(/^npm run ([\w:-]+)$/)
      if (npmScript) { expect(PKG.scripts).toHaveProperty(npmScript[1]); continue }
      const nodeScript = stage.match(/^node (\S+)/)
      expect(nodeScript, 'unrecognised stage: ' + stage).not.toBeNull()
      expect(existsSync(nodeScript[1]), 'missing file: ' + nodeScript[1]).toBe(true)
    }
  })
})

describe('native stays out of the fast PR gate', () => {
  it('verify:pr runs no native stage', () => {
    const pr = PKG.scripts['verify:pr']
    for (const stage of REQUIRED_NATIVE_STAGES) {
      expect(pr, 'verify:pr absorbed a native stage: ' + stage).not.toContain(stage)
    }
    expect(pr).not.toContain('verify:native')
  })

  it('ci.yml does not run the native tier', () => {
    // ci.yml's check job is a required status check on every PR; the expensive
    // native work must not be attached to it.
    expect(executable(CI)).not.toContain('verify:native')
    expect(executable(CI)).not.toContain('build:native')
  })

  it('the two tiers are different workflows', () => {
    expect(existsSync(NATIVE_WF)).toBe(true)
    expect(NATIVE_YAML).toContain('npm run verify:native')
  })
})

describe('the gate is always present and safe to require', () => {
  it('has no workflow-level paths filter on pull_request', () => {
    // THE correction. A `paths:` filter means the workflow does not run at all
    // on a non-native pull request, so no status is posted, so requiring it
    // blocks that pull request forever. Filtering must happen INSIDE instead.
    const prBlock = NATIVE_YAML.slice(NATIVE_YAML.indexOf('pull_request:'), NATIVE_YAML.indexOf('concurrency:'))
    expect(prBlock).not.toContain('paths:')
  })

  it('declares the three jobs the design needs', () => {
    for (const job of ['changes:', 'verify:', 'native-gate:']) {
      expect(NATIVE_YAML).toContain(job)
    }
  })

  it('runs native-gate unconditionally, after both other jobs', () => {
    const gate = NATIVE_YAML.slice(NATIVE_YAML.indexOf('native-gate:'))
    expect(gate).toMatch(/needs: \[changes, verify\]/)
    expect(gate).toMatch(/if: always\(\)/)
  })

  it('gates the expensive job on the detector, not on a path filter', () => {
    expect(NATIVE_YAML).toMatch(/if: needs\.changes\.outputs\.native == 'true'/)
  })

  it('fails the gate when verification failed or was cancelled', () => {
    const gate = NATIVE_YAML.slice(NATIVE_YAML.indexOf('native-gate:'))
    expect(gate).toContain('native verification did not pass')
    expect(gate).toMatch(/exit 1/)
  })

  it('fails the gate when change detection itself failed', () => {
    // A broken detector must never read as "nothing to do".
    const gate = NATIVE_YAML.slice(NATIVE_YAML.indexOf('native-gate:'))
    expect(gate).toContain('native change detection did not succeed')
  })

  it('refuses a skip that contradicts the detector', () => {
    const gate = NATIVE_YAML.slice(NATIVE_YAML.indexOf('native-gate:'))
    expect(gate).toContain('skipped even though native changes were detected')
  })

  it('verifies unconditionally when the event is not a pull request', () => {
    expect(NATIVE_YAML).toMatch(/github\.event_name.*!=.*pull_request/)
  })
})

/**
 * The native-gate step's shell body, lifted out of the YAML so the truth table
 * can be EXECUTED rather than pattern-matched. The body reads $DETECT, $VERIFY
 * and $NATIVE from the environment and contains no `${{ }}` expressions, so it
 * runs as-is under bash.
 */
function gateScript() {
  const lines = NATIVE.split('\n')
  const start = lines.findIndex(l => l.includes('Report the native gate'))
  expect(start, 'native-gate step not found').toBeGreaterThan(-1)
  const runAt = lines.findIndex((l, i) => i > start && /^\s*run: \|/.test(l))
  expect(runAt, 'native-gate has no run block').toBeGreaterThan(-1)
  const indent = lines[runAt].match(/^\s*/)[0].length + 2
  const body = []
  for (let i = runAt + 1; i < lines.length; i++) {
    const l = lines[i]
    if (l.trim() === '') { body.push(''); continue }
    if (l.match(/^\s*/)[0].length < indent) break
    body.push(l.slice(indent))
  }
  const script = body.join('\n')
  expect(script, 'extracted gate script looks empty').toContain('native gate')
  expect(script, 'gate script must not depend on workflow expressions').not.toContain('${{')
  return script
}

/** Run the real gate body with a given detect/native/verify combination. */
function runGate({ DETECT, VERIFY, NATIVE: nativeOut }) {
  const env = { PATH: process.env.PATH, DETECT, VERIFY }
  if (nativeOut !== undefined) env.NATIVE = nativeOut
  const r = spawnSync('bash', ['-c', gateScript()], { env, encoding: 'utf8' })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

describe('the gate enforces an exact truth table, fail-closed', () => {
  it('PASSES the two legitimate combinations, and only those', () => {
    expect(runGate({ DETECT: 'success', NATIVE: 'true', VERIFY: 'success' }).code).toBe(0)
    expect(runGate({ DETECT: 'success', NATIVE: 'false', VERIFY: 'skipped' }).code).toBe(0)
  })

  it('FAILS every other combination of the three known values', () => {
    const DETECTS = ['success', 'failure', 'cancelled', 'skipped', '']
    const NATIVES = ['true', 'false', '', 'TRUE', 'yes', 'maybe', '1']
    const VERIFIES = ['success', 'failure', 'cancelled', 'skipped', '']
    const PASSING = new Set(['success|true|success', 'success|false|skipped'])
    const wrongly = []
    for (const d of DETECTS) {
      for (const n of NATIVES) {
        for (const v of VERIFIES) {
          const key = [d, n, v].join('|')
          const { code } = runGate({ DETECT: d, NATIVE: n, VERIFY: v })
          const shouldPass = PASSING.has(key)
          if (shouldPass && code !== 0) wrongly.push('should PASS but failed: ' + key)
          if (!shouldPass && code === 0) wrongly.push('should FAIL but passed: ' + key)
        }
      }
    }
    expect(wrongly, wrongly.join('; ')).toEqual([])
  })

  it('FAILS when the detector output is missing entirely', () => {
    // What you get when the detect step is deleted, renamed, or dies before
    // writing GITHUB_OUTPUT. An unset output must never read as "nothing to do".
    const r = runGate({ DETECT: 'success', VERIFY: 'skipped' })   // NATIVE unset
    expect(r.code).not.toBe(0)
    expect(r.out).toMatch(/no usable answer|FAIL/)
  })

  it('FAILS on an unknown detector value', () => {
    const r = runGate({ DETECT: 'success', NATIVE: 'probably', VERIFY: 'skipped' })
    expect(r.code).not.toBe(0)
    expect(r.out).toMatch(/no usable answer/)
  })

  it('FAILS when verification was skipped despite native changes', () => {
    const r = runGate({ DETECT: 'success', NATIVE: 'true', VERIFY: 'skipped' })
    expect(r.code).not.toBe(0)
    expect(r.out).toMatch(/skipped even though native changes were detected/)
  })

  it('FAILS when verification ran despite no native changes', () => {
    // The two jobs disagreeing in either direction is a broken gate.
    const r = runGate({ DETECT: 'success', NATIVE: 'false', VERIFY: 'success' })
    expect(r.code).not.toBe(0)
  })

  it('FAILS when change detection itself did not succeed', () => {
    for (const d of ['failure', 'cancelled', 'skipped']) {
      const r = runGate({ DETECT: d, NATIVE: 'false', VERIFY: 'skipped' })
      expect(r.code, 'detect=' + d + ' should fail').not.toBe(0)
      expect(r.out).toMatch(/change detection did not succeed/)
    }
  })
})

describe('coverage is conservative and cannot be narrowed', () => {
  it('covers whole source directories rather than named files', () => {
    for (const dir of REQUIRED_DIRECTORY_COVERAGE) {
      expect(NATIVE_YAML, 'detector lost directory coverage: ' + dir).toContain(dir)
    }
  })

  it('names no individual file under src/ or public/', () => {
    // The anti-narrowing rule, and the point of the correction. Replacing
    // `^src/` with "the native-looking ones" is how src/App.jsx and
    // src/Auth.jsx ended up uncovered while shipping in the store bundle.
    const detector = NATIVE_YAML.slice(NATIVE_YAML.indexOf('PATTERNS='), NATIVE_YAML.indexOf('CHANGED='))
    const narrowed = [...detector.matchAll(/\^(src|public)\/\S+/g)].map(m => m[0])
    expect(narrowed, 'detector narrowed to individual files: ' + narrowed.join(', ')).toEqual([])
  })

  it('covers the build, manifest and verifier inputs', () => {
    for (const file of REQUIRED_FILE_COVERAGE) {
      expect(NATIVE_YAML, 'detector lost coverage: ' + file).toContain(file)
    }
  })

  it('every covered path still exists in the repository', () => {
    const real = p => p.replace(/^\^/, '').replace(/\$$/, '').replace(/\\/g, '')
    for (const p of [...REQUIRED_DIRECTORY_COVERAGE, ...REQUIRED_FILE_COVERAGE]) {
      expect(existsSync(real(p)), 'covered path no longer exists: ' + real(p)).toBe(true)
    }
  })

  it('diffs against the pull request base to decide', () => {
    expect(NATIVE_YAML).toContain('git diff --name-only')
    expect(NATIVE_YAML).toContain('fetch-depth: 0')
  })

  it('still runs on main and on manual dispatch', () => {
    expect(NATIVE_YAML).toMatch(/push:\s*\n\s*branches: \[main\]/)
    expect(NATIVE_YAML).toContain('workflow_dispatch')
  })
})

describe('the native job can actually run its own checks', () => {
  it('installs a browser before the font proof needs one', () => {
    // verify-native-fonts.mjs loads the built bundle in a real browser. Its
    // `playwright` import resolves from @playwright/test, so the "skip if
    // playwright is missing" branch never fires — it goes straight to
    // chromium.launch(), which throws UNCAUGHT when no browser was downloaded.
    // Without this step the job fails with a missing-executable stack trace
    // that looks nothing like a font problem.
    expect(NATIVE_YAML).toContain('playwright install --with-deps chromium')
    const install = NATIVE_YAML.indexOf('playwright install')
    const verify = NATIVE_YAML.indexOf('npm run verify:native')
    expect(install).toBeGreaterThan(-1)
    expect(install).toBeLessThan(verify)
  })

  it('installs dependencies first', () => {
    expect(NATIVE_YAML.indexOf('npm ci')).toBeLessThan(NATIVE_YAML.indexOf('npm run verify:native'))
  })

  it('syncs both native platforms after building the store bundle', () => {
    // `cap sync` copies webDir into the native projects, so it has to follow
    // the build or it assembles whatever was in dist/ already.
    expect(NATIVE_YAML).toContain('npx cap sync android')
    expect(NATIVE_YAML).toContain('npx cap sync ios')
    expect(NATIVE_YAML.indexOf('npm run verify:native'))
      .toBeLessThan(NATIVE_YAML.indexOf('npx cap sync android'))
  })

  it('proves the sync produced no tracked changes', () => {
    // A successful `cap sync` only proves the command ran. If it CHANGED
    // tracked files, the committed native projects were stale relative to the
    // config that generates them — ios/App/CapApp-SPM/Package.swift is tracked
    // and regenerated on every sync, so this is a live risk.
    expect(NATIVE_YAML).toMatch(/git diff --quiet -- android ios/)
    const proof = NATIVE_YAML.slice(NATIVE_YAML.indexOf('git diff --quiet -- android ios'))
    expect(proof).toMatch(/exit 1/)
    expect(NATIVE_YAML.indexOf('npx cap sync ios'))
      .toBeLessThan(NATIVE_YAML.indexOf('git diff --quiet -- android ios'))
  })

  it('is read-only and cancels superseded runs off main', () => {
    expect(NATIVE_YAML).toMatch(/permissions:\s*\n\s*contents: read/)
    expect(NATIVE_YAML).not.toContain('contents: write')
    expect(NATIVE_YAML).toMatch(/group: native-\$\{\{ github\.ref \}\}/)
    expect(NATIVE_YAML).toMatch(/cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}/)
  })
})

describe('the harness can run the native tier without a prompt', () => {
  it('allow-lists verify:native', () => {
    // A remote session cannot answer a permission prompt, so a missing entry
    // does not mean "ask" — it means the tier can never run there.
    const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8'))
    expect(settings.permissions.allow).toContain('Bash(npm run verify:native)')
  })
})

describe('the Android release build is ref-scoped', () => {
  it('does not share one concurrency group across the whole repository', () => {
    // A bare `android-build` group meant a dispatch from any branch queued
    // behind every other, and any future PR trigger would queue behind a
    // release build.
    expect(executable(ANDROID)).toMatch(/group: android-build-\$\{\{ github\.ref \}\}/)
    expect(executable(ANDROID)).not.toMatch(/group: android-build\s*$/m)
  })

  it('still refuses to cancel a signed build in flight', () => {
    expect(executable(ANDROID)).toMatch(/concurrency:[\s\S]*?cancel-in-progress: false/)
  })

  it('remains dispatch-only', () => {
    // Deliberate: a full gradle build on every native PR is a cost decision the
    // owner has not made. If a PR trigger is added later it needs its own
    // paths filter, and this assertion is where that decision gets recorded.
    const on = executable(ANDROID).slice(0, executable(ANDROID).indexOf('jobs:'))
    expect(on).toContain('workflow_dispatch')
    expect(on).not.toContain('pull_request')
  })
})
