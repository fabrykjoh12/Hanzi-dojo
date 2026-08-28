import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  findShellViolations,
  viteOutDir,
  iosBundleIds,
  androidIds,
  capacitorRuntimePackages,
  MAJOR_CHECK_EXCLUDED,
  REQUIRED_NATIVE_FILES,
} from './tools/verify-native-shell.mjs'

// The Capacitor shell's cross-file agreement. Each rule stands for a real
// failure that only surfaces at a release cut — long after the commit that
// caused it — so the specs drive every failure path with synthetic inputs and
// then confirm the live repository satisfies all of them.

const PKG = JSON.parse(readFileSync('package.json', 'utf8'))
const CAP = JSON.parse(readFileSync('capacitor.config.json', 'utf8'))
const VITE = readFileSync('vite.config.js', 'utf8')
const GRADLE = readFileSync('android/app/build.gradle', 'utf8')
const PBX = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8')

/** A shell that passes every rule, as a base for one-field mutations. */
const good = () => ({
  capacitorConfig: { appId: 'com.example.app', webDir: 'dist/client' },
  viteConfigText: "build: { outDir: 'dist/client' },",
  packageJson: {
    scripts: {
      'build:native': 'cross-env DOJO_PUBLIC_BUILD=1 DOJO_NATIVE_BUILD=1 vite build',
      'cap:sync': 'npm run build:native && cap sync',
    },
    dependencies: {
      '@capacitor/core': '^8.5.0',
      '@capacitor/app': '^8.1.1',
      '@capacitor/browser': '^8.0.4',
      '@capacitor/keyboard': '^8.0.5',
      '@capacitor/status-bar': '^8.0.3',
      '@capacitor-community/apple-sign-in': '^7.1.0',
    },
    devDependencies: {
      '@capacitor/cli': '^8.5.0',
      '@capacitor/android': '^8.5.0',
      '@capacitor/ios': '^8.5.0',
      '@capacitor/assets': '^3.0.5',
    },
  },
  androidGradle: 'namespace = "com.example.app"\n        applicationId "com.example.app"',
  iosPbxproj: 'PRODUCT_BUNDLE_IDENTIFIER = com.example.app;\nPRODUCT_BUNDLE_IDENTIFIER = com.example.app;',
})

describe('parsers', () => {
  it('reads vite outDir', () => {
    expect(viteOutDir(VITE)).toBe('dist/client')
    expect(viteOutDir('nothing here')).toBeNull()
  })

  it('reads every iOS bundle id, deduplicated', () => {
    expect(iosBundleIds(PBX)).toEqual(['com.hanzidojo.app'])
    expect(iosBundleIds('PRODUCT_BUNDLE_IDENTIFIER = a;\nPRODUCT_BUNDLE_IDENTIFIER = b;')).toEqual(['a', 'b'])
  })

  it('reads the Android identifiers', () => {
    expect(androidIds(GRADLE)).toEqual({
      applicationId: 'com.hanzidojo.app',
      namespace: 'com.hanzidojo.app',
    })
  })
})

describe('a coherent shell passes', () => {
  it('the synthetic baseline has no violations', () => {
    expect(findShellViolations(good())).toEqual([])
  })

  it('THIS repository has no violations', () => {
    expect(findShellViolations({
      capacitorConfig: CAP,
      viteConfigText: VITE,
      packageJson: PKG,
      androidGradle: GRADLE,
      iosPbxproj: PBX,
      presentFiles: REQUIRED_NATIVE_FILES,
    })).toEqual([])
  })
})

describe('webDir must follow vite', () => {
  it('catches a webDir that no longer matches outDir', () => {
    // `cap sync` would copy a directory the build no longer writes: the store
    // app ships a stale bundle, or an empty one, with no error anywhere.
    const shell = good()
    shell.viteConfigText = "build: { outDir: 'dist/app' },"
    expect(findShellViolations(shell).join()).toMatch(/webDir .* does not match vite build\.outDir/)
  })

  it('says so when outDir cannot be read at all', () => {
    const shell = good()
    shell.viteConfigText = 'no outDir here'
    expect(findShellViolations(shell).join()).toMatch(/could not read build\.outDir/)
  })
})

describe('the app identity must agree in all four places', () => {
  it('catches a mismatched Android applicationId', () => {
    const shell = good()
    shell.androidGradle = 'namespace = "com.example.app"\n applicationId "com.example.OTHER"'
    expect(findShellViolations(shell).join()).toMatch(/android applicationId .* does not match/)
  })

  it('catches a mismatched Android namespace', () => {
    const shell = good()
    shell.androidGradle = 'namespace = "com.example.OTHER"\n applicationId "com.example.app"'
    expect(findShellViolations(shell).join()).toMatch(/android namespace .* does not match/)
  })

  it('catches an iOS bundle id that drifted in only one build configuration', () => {
    // The pbxproj carries one per configuration; changing Release and missing
    // Debug is the realistic mistake.
    const shell = good()
    shell.iosPbxproj = 'PRODUCT_BUNDLE_IDENTIFIER = com.example.app;\nPRODUCT_BUNDLE_IDENTIFIER = com.example.OTHER;'
    expect(findShellViolations(shell).join()).toMatch(/iOS bundle id\(s\) com\.example\.OTHER/)
  })

  it('catches an iOS project with no bundle id at all', () => {
    const shell = good()
    shell.iosPbxproj = ''
    expect(findShellViolations(shell).join()).toMatch(/no PRODUCT_BUNDLE_IDENTIFIER/)
  })
})

describe('every first-party Capacitor package agrees with core', () => {
  it('covers the platforms AND the plugins, not just the four obvious ones', () => {
    // The correction: the rule used to check only core/cli/android/ios, so a
    // plugin bumped alone — the likeliest skew of all — passed silently.
    const deps = { ...PKG.dependencies, ...PKG.devDependencies }
    const covered = capacitorRuntimePackages(deps)
    for (const plugin of ['@capacitor/app', '@capacitor/browser', '@capacitor/keyboard', '@capacitor/status-bar']) {
      expect(covered, 'plugin not covered by the major rule: ' + plugin).toContain(plugin)
    }
    for (const platform of ['@capacitor/core', '@capacitor/cli', '@capacitor/android', '@capacitor/ios']) {
      expect(covered).toContain(platform)
    }
  })

  it('catches a platform bumped away from core', () => {
    const shell = good()
    shell.packageJson.devDependencies['@capacitor/android'] = '^7.4.0'
    expect(findShellViolations(shell).join())
      .toMatch(/disagree with @capacitor\/core@8: @capacitor\/android@7/)
  })

  it('catches a PLUGIN bumped away from core', () => {
    // A plugin loads into the same native runtime as core; a major behind is
    // undefined behaviour that surfaces as a crash on device, not a build error.
    const shell = good()
    shell.packageJson.dependencies['@capacitor/keyboard'] = '^7.0.1'
    expect(findShellViolations(shell).join())
      .toMatch(/disagree with @capacitor\/core@8: @capacitor\/keyboard@7/)
  })

  it('reports every skewed package, not just the first', () => {
    const shell = good()
    shell.packageJson.dependencies['@capacitor/app'] = '^7.0.0'
    shell.packageJson.dependencies['@capacitor/browser'] = '^6.0.0'
    const found = findShellViolations(shell).join()
    expect(found).toMatch(/@capacitor\/app@7/)
    expect(found).toMatch(/@capacitor\/browser@6/)
  })

  it('catches a missing Capacitor package', () => {
    const shell = good()
    delete shell.packageJson.devDependencies['@capacitor/ios']
    expect(findShellViolations(shell).join()).toMatch(/missing Capacitor package: @capacitor\/ios/)
  })

  it('FAILS CLOSED on an unreadable version rather than skipping it', () => {
    // workspace:* has no major to compare. Silently ignoring it would let the
    // one package most likely to be pinned oddly — a local override during
    // debugging, say — slip out of the rule entirely and get committed.
    const shell = good()
    shell.packageJson.dependencies['@capacitor/keyboard'] = 'workspace:*'
    const found = findShellViolations(shell).join()
    expect(found).toMatch(/unreadable Capacitor version/)
    expect(found).toMatch(/@capacitor\/keyboard@workspace:\*/)
  })

  it('fails closed on every unreadable spec form, not just workspace:', () => {
    for (const spec of ['file:../local-capacitor', 'github:owner/repo', '*', 'latest', 'npm:alias@1']) {
      const shell = good()
      shell.packageJson.dependencies['@capacitor/browser'] = spec
      expect(findShellViolations(shell).join(), 'not caught: ' + spec)
        .toMatch(/unreadable Capacitor version/)
    }
  })

  it('fails when CORE itself has an unreadable version', () => {
    // Without a core major there is no baseline, so the rule cannot run at all
    // — which must be a violation, not a silent pass for every package.
    const shell = good()
    shell.packageJson.dependencies['@capacitor/core'] = 'workspace:*'
    expect(findShellViolations(shell).join())
      .toMatch(/could not read a major version from @capacitor\/core/)
  })

  it('still accepts the ordinary range spellings', () => {
    for (const spec of ['^8.5.0', '~8.1', '8', '8.x', '>=8.0.0', 'v8.1.0']) {
      const shell = good()
      shell.packageJson.dependencies['@capacitor/app'] = spec
      expect(findShellViolations(shell), 'wrongly rejected: ' + spec).toEqual([])
    }
  })

  it('excludes @capacitor/assets, which is tooling on its own train', () => {
    // 3.x against an 8.x runtime in the real repo — including it would make the
    // rule fail permanently, and a permanently-failing rule gets deleted.
    expect(MAJOR_CHECK_EXCLUDED).toContain('@capacitor/assets')
    expect(capacitorRuntimePackages({ '@capacitor/assets': '^3.0.5' })).toEqual([])
    const shell = good()
    shell.packageJson.devDependencies['@capacitor/assets'] = '^3.0.5'
    expect(findShellViolations(shell)).toEqual([])
  })

  it('never considers the @capacitor-community scope', () => {
    // A third-party plugin at 7.x beside core at 8.x. The Capacitor CLI warns
    // about it during `cap sync`, which is the right place for it — this rule
    // is about packages whose version we control.
    expect(capacitorRuntimePackages({ '@capacitor-community/apple-sign-in': '^7.1.0' })).toEqual([])
    const shell = good()
    shell.packageJson.dependencies['@capacitor-community/apple-sign-in'] = '^7.1.0'
    expect(findShellViolations(shell)).toEqual([])
  })
})

describe('the native build must not become a Sites build', () => {
  it('catches build:native losing DOJO_PUBLIC_BUILD=1', () => {
    // This is the severe one. Without it the native bundle is a SITES build,
    // which carries Dojo HQ and its localhost bridge into the App Store binary
    // — and verify:public-bundle never inspects the native build, so nothing
    // else would notice.
    const shell = good()
    shell.packageJson.scripts['build:native'] = 'cross-env DOJO_NATIVE_BUILD=1 vite build'
    expect(findShellViolations(shell).join()).toMatch(/does not set DOJO_PUBLIC_BUILD=1 .* Dojo HQ/)
  })

  it('catches build:native losing DOJO_NATIVE_BUILD=1', () => {
    const shell = good()
    shell.packageJson.scripts['build:native'] = 'cross-env DOJO_PUBLIC_BUILD=1 vite build'
    expect(findShellViolations(shell).join()).toMatch(/does not set DOJO_NATIVE_BUILD=1/)
  })

  it('catches cap:sync syncing without building first', () => {
    const shell = good()
    shell.packageJson.scripts['cap:sync'] = 'cap sync'
    expect(findShellViolations(shell).join()).toMatch(/does not run build:native before/)
  })

  it('catches cap:sync building AFTER the sync', () => {
    const shell = good()
    shell.packageJson.scripts['cap:sync'] = 'cap sync && npm run build:native'
    expect(findShellViolations(shell).join()).toMatch(/does not run build:native before/)
  })
})

describe('the native projects must exist', () => {
  it('reports each missing project file', () => {
    const shell = good()
    shell.presentFiles = ['capacitor.config.json']
    const found = findShellViolations(shell).join()
    expect(found).toMatch(/missing native project file: android\/app\/build\.gradle/)
    expect(found).toMatch(/missing native project file: ios\/App\/App\.xcodeproj\/project\.pbxproj/)
  })
})
