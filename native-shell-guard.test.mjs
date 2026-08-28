import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  findShellViolations,
  viteOutDir,
  iosBundleIds,
  androidIds,
  LOCKSTEP_PACKAGES,
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
    dependencies: { '@capacitor/core': '^8.5.0' },
    devDependencies: {
      '@capacitor/cli': '^8.5.0',
      '@capacitor/android': '^8.5.0',
      '@capacitor/ios': '^8.5.0',
      '@capacitor/assets': '^3.0.5',
      '@capacitor-community/apple-sign-in': '^7.1.0',
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

describe('Capacitor packages move in lockstep', () => {
  it('catches a mixed major', () => {
    const shell = good()
    shell.devDependencies = undefined
    shell.packageJson.devDependencies['@capacitor/android'] = '^7.4.0'
    expect(findShellViolations(shell).join()).toMatch(/span majors 7 and 8/)
  })

  it('catches a missing Capacitor package', () => {
    const shell = good()
    delete shell.packageJson.devDependencies['@capacitor/ios']
    expect(findShellViolations(shell).join()).toMatch(/missing Capacitor package: @capacitor\/ios/)
  })

  it('does not drag in the independently-versioned packages', () => {
    // @capacitor/assets is tooling at 3.x and @capacitor-community/* ships on
    // its own train at 7.x. Both sit beside core at 8.x in the real repo, so a
    // naive "all @capacitor* agree" rule would fail permanently and be deleted.
    expect(LOCKSTEP_PACKAGES).not.toContain('@capacitor/assets')
    const shell = good()
    shell.packageJson.devDependencies['@capacitor/assets'] = '^3.0.5'
    shell.packageJson.devDependencies['@capacitor-community/apple-sign-in'] = '^7.1.0'
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
