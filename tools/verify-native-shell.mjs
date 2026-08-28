// Structural checks on the Capacitor shell — the facts that must agree across
// capacitor.config.json, vite.config.js, package.json and the two native
// projects, and that nothing else verifies.
//
// None of this needs Xcode, the Android SDK, gradle or a device. It is pure
// cross-file agreement, which is exactly the class of native breakage a PR can
// introduce and nobody notices until a release cut fails — by which point the
// change is a hundred commits back.
//
// What each rule is actually protecting:
//
//   webDir            `cap sync` copies webDir into both native projects. If
//                     vite's outDir moves and this does not, sync silently
//                     ships whatever was in the old directory — a stale bundle,
//                     or nothing.
//
//   appId             Capacitor writes appId into the native configs, but the
//                     Android applicationId/namespace and the iOS bundle id are
//                     edited by hand. A mismatch is not caught until the store
//                     rejects the upload, or worse, until it is accepted as a
//                     DIFFERENT app.
//
//   plugin majors     EVERY first-party @capacitor/* package — the platforms
//                     AND the plugins — must agree with core's major. They are
//                     one product released in lockstep, and a plugin bumped
//                     alone is the likeliest skew of all: undefined behaviour
//                     that surfaces as a crash on device, not a build error.
//
//   build:native      MUST also set DOJO_PUBLIC_BUILD=1. Without it the native
//                     bundle is a SITES build, which carries Dojo HQ and its
//                     localhost bridge into the store app. That is the exact
//                     leak tools/verify-public-bundle.mjs exists to prevent,
//                     arriving through the one build that guard never inspects.
//
//   cap:sync          MUST build before syncing, or it copies whatever happened
//                     to be in dist/ — frequently the Sites build.
//
// Exported as pure functions over already-read text so the specs can drive
// every failure path without a repository that is actually broken.

import { readFile } from 'node:fs/promises'
import process from 'node:process'

/**
 * First-party Capacitor packages that must exist. Their absence is a broken
 * shell, not a version question.
 */
export const REQUIRED_CAPACITOR_PACKAGES = [
  '@capacitor/core',
  '@capacitor/cli',
  '@capacitor/android',
  '@capacitor/ios',
]

/**
 * Excluded from the major-agreement rule, for a stated reason:
 *
 *   @capacitor/assets   build-time tooling on its own release train (3.x
 *                       against an 8.x runtime), never shipped in the app.
 *
 * Anything else under `@capacitor/` is first-party runtime and IS checked —
 * deliberately including the plugins (app, browser, keyboard, status-bar),
 * which load into the same native runtime as core and are the packages most
 * likely to be bumped alone.
 */
export const MAJOR_CHECK_EXCLUDED = ['@capacitor/assets']

/**
 * `@capacitor-community/*` is a different scope: third-party plugins on
 * independent release trains. Never part of this rule.
 */
export const THIRD_PARTY_SCOPE = '@capacitor-community/'

/** Every first-party runtime @capacitor/* package in the manifest. */
export function capacitorRuntimePackages(deps) {
  return Object.keys(deps || {})
    .filter(name => name.startsWith('@capacitor/'))
    .filter(name => !MAJOR_CHECK_EXCLUDED.includes(name))
    .sort()
}

export const REQUIRED_NATIVE_FILES = [
  'capacitor.config.json',
  'android/app/build.gradle',
  'ios/App/App.xcodeproj/project.pbxproj',
]

const majorOf = (range) => {
  const m = String(range || '').match(/(\d+)\./)
  return m ? m[1] : null
}

/** vite.config.js declares `outDir: 'dist/client'`. Read it rather than assume. */
export function viteOutDir(viteConfigText) {
  const m = String(viteConfigText || '').match(/outDir:\s*['"]([^'"]+)['"]/)
  return m ? m[1] : null
}

/** Every PRODUCT_BUNDLE_IDENTIFIER in the pbxproj, deduplicated. */
export function iosBundleIds(pbxprojText) {
  return [...new Set(
    [...String(pbxprojText || '').matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;\s]+);/g)].map(m => m[1]),
  )]
}

export function androidIds(gradleText) {
  const text = String(gradleText || '')
  const app = text.match(/applicationId\s+["']([^"']+)["']/)
  const ns = text.match(/namespace\s*=?\s*["']([^"']+)["']/)
  return { applicationId: app ? app[1] : null, namespace: ns ? ns[1] : null }
}

/**
 * Every rule, over already-read inputs. Returns a list of violation strings —
 * empty means the shell is coherent.
 */
export function findShellViolations({
  capacitorConfig,
  viteConfigText,
  packageJson,
  androidGradle,
  iosPbxproj,
  presentFiles = REQUIRED_NATIVE_FILES,
}) {
  const out = []
  const scripts = (packageJson && packageJson.scripts) || {}
  const deps = { ...(packageJson?.dependencies || {}), ...(packageJson?.devDependencies || {}) }

  for (const file of REQUIRED_NATIVE_FILES) {
    if (!presentFiles.includes(file)) out.push('missing native project file: ' + file)
  }

  const outDir = viteOutDir(viteConfigText)
  if (!outDir) {
    out.push('could not read build.outDir from vite.config.js — the webDir check cannot run')
  } else if (capacitorConfig?.webDir !== outDir) {
    out.push('capacitor webDir (' + capacitorConfig?.webDir + ') does not match vite build.outDir (' +
      outDir + ') — `cap sync` would copy the wrong directory')
  }

  const appId = capacitorConfig?.appId
  if (!appId) {
    out.push('capacitor.config.json has no appId')
  } else {
    const { applicationId, namespace } = androidIds(androidGradle)
    if (applicationId !== appId) {
      out.push('android applicationId (' + applicationId + ') does not match capacitor appId (' + appId + ')')
    }
    if (namespace !== appId) {
      out.push('android namespace (' + namespace + ') does not match capacitor appId (' + appId + ')')
    }
    const ids = iosBundleIds(iosPbxproj)
    const wrong = ids.filter(id => id !== appId)
    if (ids.length === 0) out.push('no PRODUCT_BUNDLE_IDENTIFIER found in the iOS project')
    else if (wrong.length) {
      out.push('iOS bundle id(s) ' + wrong.join(', ') + ' do not match capacitor appId (' + appId + ')')
    }
  }

  for (const pkg of REQUIRED_CAPACITOR_PACKAGES) {
    if (!(pkg in deps)) out.push('missing Capacitor package: ' + pkg)
  }

  // Every first-party runtime @capacitor/* package is measured against core,
  // not merely against each other — core is the runtime the rest load into.
  const coreMajor = majorOf(deps['@capacitor/core'])
  if (!coreMajor) {
    if ('@capacitor/core' in deps) out.push('could not read a major version from @capacitor/core')
  } else {
    const skewed = capacitorRuntimePackages(deps)
      .filter(name => name !== '@capacitor/core')
      .map(name => ({ name, major: majorOf(deps[name]) }))
      .filter(p => p.major && p.major !== coreMajor)
    if (skewed.length) {
      out.push('Capacitor packages disagree with @capacitor/core@' + coreMajor + ': ' +
        skewed.map(p => p.name + '@' + p.major).join(', '))
    }
  }

  const buildNative = scripts['build:native'] || ''
  if (!buildNative) out.push('package.json has no build:native script')
  else {
    if (!/DOJO_PUBLIC_BUILD=1/.test(buildNative)) {
      out.push('build:native does not set DOJO_PUBLIC_BUILD=1 — the store bundle would carry Dojo HQ')
    }
    if (!/DOJO_NATIVE_BUILD=1/.test(buildNative)) {
      out.push('build:native does not set DOJO_NATIVE_BUILD=1 — the bundled fonts would not be switched on')
    }
  }

  const capSync = scripts['cap:sync'] || ''
  if (!capSync) out.push('package.json has no cap:sync script')
  else if (capSync.indexOf('build:native') === -1 ||
           capSync.indexOf('build:native') > capSync.indexOf('cap sync')) {
    out.push('cap:sync does not run build:native before `cap sync` — it would sync whatever is already in dist/')
  }

  return out
}

async function main() {
  const readIfPresent = async (p) => {
    try { return await readFile(p, 'utf8') } catch { return null }
  }
  const [capRaw, viteConfigText, pkgRaw, androidGradle, iosPbxproj] = await Promise.all(
    ['capacitor.config.json', 'vite.config.js', 'package.json',
      'android/app/build.gradle', 'ios/App/App.xcodeproj/project.pbxproj'].map(readIfPresent),
  )
  const contents = {
    'capacitor.config.json': capRaw,
    'android/app/build.gradle': androidGradle,
    'ios/App/App.xcodeproj/project.pbxproj': iosPbxproj,
  }
  const presentFiles = REQUIRED_NATIVE_FILES.filter(f => contents[f] !== null)

  const violations = findShellViolations({
    capacitorConfig: capRaw ? JSON.parse(capRaw) : null,
    viteConfigText,
    packageJson: pkgRaw ? JSON.parse(pkgRaw) : null,
    androidGradle,
    iosPbxproj,
    presentFiles,
  })

  if (violations.length) {
    process.stderr.write('verify-native-shell: ' + violations.length + ' problem(s)\n\n' +
      violations.map(v => '  FAIL  ' + v).join('\n') + '\n')
    process.exitCode = 1
    return
  }
  process.stdout.write('verify-native-shell: clean — capacitor.config.json, vite, package.json ' +
    'and both native projects agree.\n')
}

if (process.argv[1] && process.argv[1].endsWith('verify-native-shell.mjs')) {
  main().catch(err => {
    process.stderr.write(String((err && err.stack) || err) + '\n')
    process.exitCode = 1
  })
}
