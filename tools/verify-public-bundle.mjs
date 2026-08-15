// Gate on the bundle the App Store and Play actually ship.
//
// `npm run build:public` (DOJO_PUBLIC_BUILD=1) is the store/native bundle. Three
// things must never be inside it, and each of them has already been inside it
// once:
//
//   1. Dojo HQ. It is internal tooling — workspaces, member management, and the
//      localhost Claude bridge. `/hq` was gated on `profile.is_admin` at the
//      route, but the module was still code-split into the public bundle, so
//      124 kB of internal UI and a hardcoded `http://127.0.0.1:43127` shipped to
//      every learner's phone. Route gating is not build-time exclusion; this
//      checks the artifact, which is the only thing that can't be argued with.
//   2. A personal identifier. `devTools.js` once had a hardcoded personal email
//      as the /dev allowlist fallback, and Vite inlined it because the env var
//      was unset (docs/RELEASE-BLOCKER-REMEDIATION.md §3). The gate is now
//      `profile.is_admin`. `support@hanzi-dojo.com` is the published support
//      address and is expected to be present — only the personal one is banned.
//   3. The Sites-only artifacts: `hq.html` and the copied cloud bridge script.
//
// Pure `findViolations` so the rules are unit-testable without running a build;
// `main` walks dist/ and applies them. Run: `npm run verify:public-bundle`.

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import process from 'node:process'

// Only text-ish files are scanned for strings. Fonts, images and the like can't
// carry a leaked identifier in any form grep would find anyway.
const TEXT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.map', '.txt', '.webmanifest', '.svg']

export const RULES = [
  {
    id: 'dojohq-chunk',
    // Matches the Rollup chunk name (`DojoHQ-<hash>.js`) in any casing of the
    // path separator, and the standalone HQ entry point.
    test: ({ path }) => /(^|\/)DojoHQ-[^/]*\.js$/.test(path) || path === 'hq.html',
    message: 'internal Dojo HQ artifact is present in the public bundle',
  },
  {
    id: 'cloud-bridge-script',
    test: ({ path }) => /dojo-cloud-bridge\.mjs$/.test(path),
    message: 'the Dojo cloud bridge script is a Sites-only artifact',
  },
  {
    id: 'claude-bridge-url',
    // The port, not the bare loopback address: `127.0.0.1` on its own appears
    // inside the Supabase SDK for legitimate reasons.
    test: ({ text }) => text != null && text.includes('43127'),
    message: 'the localhost Claude bridge URL (port 43127) is in the public bundle',
  },
  {
    id: 'personal-identifier',
    test: ({ text }) => text != null && text.includes('fabrykjoh'),
    message: 'a personal identifier is in the public bundle',
  },
]

// entries: [{ path, text }] — path is bundle-relative with '/' separators,
// text is null for files that were not read as text.
export function findViolations(entries, rules = RULES) {
  const out = []
  for (const entry of entries) {
    for (const rule of rules) {
      if (rule.test(entry)) out.push({ rule: rule.id, path: entry.path, message: rule.message })
    }
  }
  return out
}

async function collect(root, directory = root) {
  const entries = []
  for (const name of await readdir(directory)) {
    const full = join(directory, name)
    const info = await stat(full)
    if (info.isDirectory()) {
      entries.push(...await collect(root, full))
      continue
    }
    const path = relative(root, full).split(sep).join('/')
    const isText = TEXT_EXTENSIONS.some(extension => path.endsWith(extension))
    entries.push({ path, text: isText ? await readFile(full, 'utf8') : null })
  }
  return entries
}

async function main() {
  const root = process.argv[2] || 'dist/client'
  let entries
  try {
    entries = await collect(root)
  } catch {
    console.error('verify-public-bundle: no build at ' + root + ' — run `npm run build:public` first.')
    process.exit(1)
  }

  const violations = findViolations(entries)
  if (violations.length) {
    console.error('verify-public-bundle: ' + violations.length + ' violation(s) in ' + root)
    for (const violation of violations) {
      console.error('  ✗ [' + violation.rule + '] ' + violation.path + ' — ' + violation.message)
    }
    process.exit(1)
  }
  console.log('verify-public-bundle: clean — ' + entries.length + ' files, ' + RULES.length + ' rules, 0 violations.')
}

// Only run the CLI when executed directly, so the test can import the rules.
if (process.argv[1] && process.argv[1].endsWith('verify-public-bundle.mjs')) await main()
