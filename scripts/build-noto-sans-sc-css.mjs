// Regenerates src/notoSansSC.css from the installed @fontsource-variable
// package.
//
// Why this exists: the app refers to its Chinese face as `'Noto Sans SC'` in
// ~30 places — languageTheme.js, several screens, and DojoHQ.css — while the
// fontsource *variable* package declares the family as
// `'Noto Sans SC Variable'`. Importing their stylesheet directly would mean
// renaming the family at every one of those call sites, which is a 30-file
// visual-risk diff in a phase that is supposed to change nothing visual.
//
// So we emit our own @font-face rules: same files, same unicode-ranges, same
// 100–900 weight axis, declared under the name the app already uses. Nothing
// else changes, and a missing font file would be a build error rather than a
// silent fallback to a system CJK face.
//
// Run after bumping @fontsource-variable/noto-sans-sc:
//   node scripts/build-noto-sans-sc-css.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const PKG = 'node_modules/@fontsource-variable/noto-sans-sc'
const SOURCE = join(repo, PKG, 'index.css')
const OUT = join(repo, 'src', 'notoSansSC.css')

const FAMILY_FROM = "'Noto Sans SC Variable'"
const FAMILY_TO = "'Noto Sans SC'"

const source = readFileSync(SOURCE, 'utf8')

if (source.indexOf(FAMILY_FROM) === -1) {
  throw new Error('Expected ' + FAMILY_FROM + ' in ' + PKG + '/index.css — has the package changed?')
}

// The package's urls are relative to the package root; ours are relative to
// src/. A relative path (rather than a bare specifier) so the CSS resolver
// never has to guess.
const rewritten = source
  .split(FAMILY_FROM).join(FAMILY_TO)
  .split('url(./files/').join('url(../' + PKG + '/files/')

const faces = (rewritten.match(/@font-face/g) || []).length
if (faces < 50) {
  throw new Error('Only ' + faces + ' @font-face rules found — the subset split looks wrong')
}

const header = [
  '/* GENERATED — do not edit by hand.',
  ' * Source: ' + PKG + '/index.css',
  ' * Regenerate: node scripts/build-noto-sans-sc-css.mjs',
  ' *',
  ' * Noto Sans SC as one variable face (weights 100-900) across its ' + faces,
  ' * unicode-range subsets, declared under the family name the app already',
  ' * uses. The browser downloads only the subsets a screen actually contains.',
  ' */',
  '',
].join('\n')

writeFileSync(OUT, header + rewritten)
console.log('Wrote ' + OUT + ' — ' + faces + ' @font-face rules')
