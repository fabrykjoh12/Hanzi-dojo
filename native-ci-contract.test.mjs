import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

// The native verification TIER's contract: what runs it, what it covers, and
// what it must stay out of.
//
// Two failure modes this exists to prevent, both of which look like nothing is
// wrong until a release cut:
//
//   1. The native tier silently stops covering a native input. `paths:` is an
//      allow-list — a file not named there simply never triggers the job, and
//      no test fails. So the list is pinned here.
//   2. Native work creeps into `npm run verify:pr`, making every documentation
//      typo pay for a store build and a Chromium download.

const NATIVE_WF = '.github/workflows/native.yml'
const NATIVE = readFileSync(NATIVE_WF, 'utf8')
const CI = readFileSync('.github/workflows/ci.yml', 'utf8')
const ANDROID = readFileSync('.github/workflows/android-build.yml', 'utf8')
const PKG = JSON.parse(readFileSync('package.json', 'utf8'))

const executable = text => text.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')
const NATIVE_YAML = executable(NATIVE)

const stagesOf = script => script.split('&&').map(s => s.trim()).filter(Boolean)

/**
 * Every repository input that can change what the store app contains or how it
 * is assembled. A native-sensitive file missing from native.yml's `paths:` is a
 * silent coverage hole, so this list is the contract.
 */
const NATIVE_SENSITIVE_PATHS = [
  'package.json',
  'package-lock.json',
  'vite.config.js',
  'index.html',
  'nativeFonts.mjs',
  'fetch-webfonts.mjs',
  'src/webfonts.css',
  'src/fontLoader.js',
  'src/main.jsx',
  'capacitor.config.json',
  'src/nativeShell.js',
  'android/**',
  'ios/**',
  'tools/verify-native-fonts.mjs',
  'tools/verify-native-shell.mjs',
  'tools/verify-app-icons.mjs',
  '.github/workflows/native.yml',
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
    // ci.yml's check job is a required status check and runs on every PR. The
    // native tier is path-filtered and must not be attached to it.
    expect(executable(CI)).not.toContain('verify:native')
    expect(executable(CI)).not.toContain('build:native')
  })

  it('the two tiers are different workflows', () => {
    // `paths:` applies per workflow, not per job, so a path-filtered native job
    // inside ci.yml would filter the required `check` job too.
    expect(existsSync(NATIVE_WF)).toBe(true)
    expect(NATIVE_YAML).toContain('npm run verify:native')
  })
})

describe('the path filter is the coverage contract', () => {
  it('filters pull requests by path at all', () => {
    expect(NATIVE_YAML).toMatch(/pull_request:\s*\n\s*paths:/)
  })

  it('covers every native-sensitive input', () => {
    // The silent-hole check. Adding a native input without adding it here means
    // changes to it never run the native tier, and nothing else notices.
    const missing = NATIVE_SENSITIVE_PATHS.filter(p => !NATIVE_YAML.includes('- ' + p))
    expect(missing, 'native.yml paths: is missing ' + missing.join(', ')).toEqual([])
  })

  it('every filtered path still exists in the repository', () => {
    // A filter entry for a file that was renamed or deleted is dead weight that
    // reads like coverage.
    for (const p of NATIVE_SENSITIVE_PATHS) {
      if (p.includes('*')) { expect(existsSync(p.split('/**')[0])).toBe(true); continue }
      expect(existsSync(p), 'filtered path no longer exists: ' + p).toBe(true)
    }
  })

  it('runs unfiltered on main and on manual dispatch', () => {
    // Path filters apply to the PR trigger only: a merge to main must verify
    // the native tier regardless of which files moved.
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
