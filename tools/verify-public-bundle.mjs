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

  // ── Credentials ───────────────────────────────────────────────────────────
  //
  // This is the LAST gate before the artifact ships, and until now it looked
  // for four internal-tooling giveaways and nothing else — no service-role key,
  // no JWT, no secret key. `src/tts/serverOnly.test.js` guards the SOURCE well,
  // but a guard on the source is not a guard on the thing that ships.
  //
  // The obvious move — reuse ops/leakGuard.mjs's rules wholesale — is wrong
  // here, and the reason is worth writing down:
  //
  //   * its `uuid` rule would fail every build. `src/firstEncounter.js`
  //     hardcodes onboarding vocabulary ids, which are public curriculum
  //     content. leakGuard is tuned for LOGS, where a bare UUID is alarming.
  //   * its `jwt` rule would fail every build too, because the Supabase
  //     publishable key IS a JWT and belongs in the bundle by design.
  //
  // So the credential rules below are bundle-specific: they name the things
  // that are never legitimate in a browser artifact, and for the one credential
  // that IS legitimate they check WHICH credential it is rather than banning
  // the shape.
  {
    id: 'service-role-marker',
    // A service-role key bypasses RLS entirely. NOT because the marker appears
    // in the key itself — a JWT payload ships base64url-encoded, so this cannot
    // see inside one; `privileged-jwt` below is what catches a leaked key. This
    // catches the string written in PLAIN TEXT: a variable named for it, a
    // comment, a fetch header assembled in source, a fixture. Cheap, and it has
    // no overlap with the JWT rule rather than being a weaker version of it.
    test: ({ text }) => text != null && /\bservice_role\b/.test(text),
    message: 'the service_role marker is in the public bundle — a service-role key bypasses every RLS policy',
  },
  {
    id: 'supabase-secret-key',
    // `sb_secret_` only. `sb_publishable_` is the new-style public key and is
    // meant to ship, so matching both (as the log guard does) would be wrong.
    test: ({ text }) => text != null && /\bsb_secret_[A-Za-z0-9_-]{8,}/.test(text),
    message: 'a Supabase secret key is in the public bundle',
  },
  {
    id: 'privileged-jwt',
    // A JWT is EXPECTED here — the legacy publishable key is one. What must
    // never ship is a privileged one, so this decodes each token's payload and
    // checks the role rather than banning the shape.
    //
    // BE PRECISE ABOUT WHAT THIS DOES AND DOES NOT ANSWER. An earlier version
    // of this comment claimed it closed the manual check "confirm the key baked
    // into the PRODUCTION build really is the anon key". It does not, and the
    // reason is worth writing down so nobody cites it as assurance:
    //
    //   * CI builds with no VITE_SUPABASE_* set at all (.github/workflows/ci.yml
    //     says so in its own comment), so the artifact this scans in CI contains
    //     no Supabase key and this rule iterates zero tokens.
    //   * The build that DOES carry the real key is Vercel's — vercel.json runs
    //     `DOJO_PUBLIC_BUILD=1 npm run build` (the public build, not the Sites
    //     one) and never invokes this guard.
    //
    // What it genuinely catches is a privileged key HARDCODED IN SOURCE —
    // pasted into a constant or a fallback — which is the leak that has actually
    // happened in this repo (see the devTools.js incident in the header) and the
    // one case caught with no env at all. A key supplied through a VITE_-named
    // variable (CLAUDE.md §7.4's other prohibition) is caught only in a build
    // that had that variable set, which by the two bullets above is not the CI
    // build. Confirming the production artifact's key remains a console check,
    // and docs/BACKLOG.md says so rather than letting this line imply otherwise.
    test: ({ text }) => text != null && privilegedJwtIn(text),
    message: 'a JWT in the public bundle carries a role other than anon — only the publishable key may ship',
  },
  {
    id: 'credential-assignment',
    // Matches the NAME next to a value. Worth being honest about its reach:
    // Vite substitutes `import.meta.env.VITE_*` with the value and drops the
    // identifier, and minification renames locals — so this cannot fire on a
    // value that arrived through the env. It fires on a name written in source
    // and carried into the bundle, which is how a hand-pasted credential
    // usually looks. The prefix rules below are what cover the value-only case.
    //
    // The names include all three that src/tts/serverOnly.test.js guards at the
    // source level (SUPABASE_SERVICE_KEY, VAPID_PRIVATE_KEY, AZURE_SPEECH_KEY)
    // plus two more this artifact can carry — a superset, deliberately, because
    // two lists naming DIFFERENT secrets would be worse than one long one.
    test: ({ text }) => text != null &&
      /\b(?:SUPABASE_SERVICE_KEY|SUPABASE_SERVICE_ROLE_KEY|GATE3_MANIFEST_PASSPHRASE|VAPID_PRIVATE_KEY|AZURE_SPEECH_KEY)\s*[:=]\s*["']?\S{8,}/.test(text),
    message: 'a privileged environment value is assigned in the public bundle',
  },
  {
    id: 'provider-key-prefix',
    // Unambiguous provider prefixes, which survive the bundler because they are
    // part of the VALUE. Deliberately NOT `sk-`: lucide ships `flask-conical`
    // and the codebase has `mask-`, so that one cries wolf and a guard that
    // cries wolf gets disabled. `AIza` (Google) and `gsk_` (Groq) have no such
    // collision — the audit lists both as hand-checked today.
    test: ({ text }) => text != null && (/\bAIza[A-Za-z0-9_-]{20,}/.test(text) || /\bgsk_[A-Za-z0-9]{20,}/.test(text)),
    message: 'a provider API key is in the public bundle',
  },
  {
    id: 'postgres-credential-url',
    test: ({ text }) => text != null && /\bpostgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/i.test(text),
    message: 'a Postgres connection string with credentials is in the public bundle',
  },
]

// Does this text contain a JWT whose payload claims a role other than `anon`?
//
// Deliberately conservative in one direction and strict in the other: a token
// that cannot be decoded is NOT reported (it is probably not a JWT at all —
// `eyJ` is just base64 for `{"`), while a token that decodes and names a role
// we do not expect IS. Anything unparseable being treated as a violation would
// make this rule fire on ordinary minified JSON.
export function privilegedJwtIn(text) {
  const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})(?:\.[A-Za-z0-9_-]+)?/g
  for (const m of text.matchAll(JWT)) {
    let payload
    try {
      payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'))
    } catch {
      continue                       // not a JWT payload; not our business
    }
    if (!payload || typeof payload !== 'object') continue
    // No role claim at all is not a Supabase key — leave it alone.
    if (typeof payload.role !== 'string') continue
    if (payload.role !== 'anon') return true
  }
  return false
}

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

  // A guard that scans nothing and prints "clean" is the worst result this file
  // can produce: in a CI log it is indistinguishable from a pass. A real public
  // build always emits an index.html and at least one JavaScript chunk, so
  // require both before believing a clean verdict. That is what stops an
  // emptied dist/, a half-written build, or a root repointed at dist/server
  // from passing vacuously — none of which a missing-directory check catches.
  const paths = entries.map(entry => entry.path)
  const absent = []
  if (!paths.includes('index.html')) absent.push('index.html')
  if (!paths.some(path => path.endsWith('.js'))) absent.push('a JavaScript chunk')
  if (absent.length) {
    console.error('verify-public-bundle: ' + root + ' holds ' + entries.length
      + ' file(s) but no ' + absent.join(' and no ') + ' — that is not a public build.')
    console.error('  Refusing to report clean on an artifact this guard cannot have inspected.')
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
