import { describe, it, expect } from 'vitest'
import { findViolations, RULES } from './tools/verify-public-bundle.mjs'

// The rules that keep internal tooling out of the store bundle. The build-side
// half (Vite's __DOJO_INTERNAL_BUILD__ define dropping the DojoHQ import) is
// asserted by CI running the verifier against a real `build:public`; this pins
// the rules themselves, including the two things that must NOT trip them.

const clean = [
  { path: 'index.html', text: '<div id="root"></div>' },
  { path: 'assets/main-abc123.js', text: 'const support = "support@hanzi-dojo.com"' },
  { path: 'assets/vendor-supabase-def456.js', text: 'const local = "http://127.0.0.1:54321"' },
  { path: 'assets/logo-xyz.woff2', text: null },
]

describe('public bundle guard', () => {
  it('passes a bundle with nothing internal in it', () => {
    expect(findViolations(clean)).toEqual([])
  })

  it('catches the DojoHQ chunk', () => {
    const found = findViolations([...clean, { path: 'assets/DojoHQ-DC7iEGyg.js', text: 'hq' }])
    expect(found.map(v => v.rule)).toContain('dojohq-chunk')
  })

  it('catches the standalone HQ entry point', () => {
    expect(findViolations([{ path: 'hq.html', text: '' }]).map(v => v.rule)).toContain('dojohq-chunk')
  })

  it('catches the copied cloud bridge script', () => {
    const found = findViolations([{ path: 'dojo-cloud-bridge.mjs', text: 'x' }])
    expect(found.map(v => v.rule)).toContain('cloud-bridge-script')
  })

  it('catches the localhost Claude bridge URL wherever it is inlined', () => {
    const found = findViolations([{ path: 'assets/main-abc123.js', text: 'fetch("http://127.0.0.1:43127/x")' }])
    expect(found.map(v => v.rule)).toContain('claude-bridge-url')
  })

  it('does not fire on the loopback address the Supabase SDK carries', () => {
    expect(findViolations([clean[2]])).toEqual([])
  })

  it('catches a personal identifier but allows the published support address', () => {
    expect(findViolations([clean[1]])).toEqual([])
    const found = findViolations([{ path: 'assets/main-abc123.js', text: 'fabrykjoh12@gmail.com' }])
    expect(found.map(v => v.rule)).toContain('personal-identifier')
  })

  it('reports every rule it breaks, not just the first', () => {
    const found = findViolations([{ path: 'assets/DojoHQ-1.js', text: 'http://127.0.0.1:43127 fabrykjoh' }])
    expect(new Set(found.map(v => v.rule)).size).toBe(3)
  })

  it('is exactly this set of rules', () => {
    // The ids rather than a count. `RULES.length` was 4 here, and a bare number
    // is the assertion that goes stale silently: adding a rule fails it with
    // "expected 9 to be 4", which says nothing about whether the new rule was
    // wanted. Naming the set means a change to it has to be stated.
    expect(RULES.map(r => r.id)).toEqual([
      'dojohq-chunk',
      'cloud-bridge-script',
      'claude-bridge-url',
      'personal-identifier',
      'service-role-marker',
      'supabase-secret-key',
      'privileged-jwt',
      'credential-assignment',
      'postgres-credential-url',
    ])
  })
})

// ── Credentials ─────────────────────────────────────────────────────────────
// FAB-26 finding 4: this guard is the last gate before the store artifact
// ships, and it had no credential rule at all — no service-role key, no JWT, no
// secret key. A source-level guard (src/tts/serverOnly.test.js) is not a guard
// on the thing that ships.

const jwt = (payload) =>
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
  + Buffer.from(JSON.stringify(payload)).toString('base64url')
  + '.fakesignature'

const inBundle = (text) => findViolations([{ path: 'assets/main-abc123.js', text }])
const rulesFor = (text) => inBundle(text).map(v => v.rule)

describe('the bundle guard refuses credentials', () => {
  it('catches the service_role marker', () => {
    // The highest-value string here: a service-role key bypasses every RLS
    // policy in the database.
    expect(rulesFor('const k="...service_role..."')).toContain('service-role-marker')
  })

  it('catches a Supabase SECRET key but not a publishable one', () => {
    expect(rulesFor('sb_secret_AbCdEfGhIjKlMnOp')).toContain('supabase-secret-key')
    // sb_publishable_ is the new-style public key and is MEANT to ship.
    // ops/leakGuard.mjs matches both, which is right for logs and wrong here.
    expect(rulesFor('sb_publishable_AbCdEfGhIjKlMnOp')).toEqual([])
  })

  it('catches a privileged JWT while letting the anon key through', () => {
    // The subtlety this rule exists for. A JWT is EXPECTED in the bundle — the
    // legacy publishable key is one — so banning the shape would fail every
    // build. The role is what matters, so the payload is decoded.
    expect(rulesFor(jwt({ iss: 'supabase', role: 'anon' }))).toEqual([])
    expect(rulesFor(jwt({ iss: 'supabase', role: 'service_role' })))
      .toContain('privileged-jwt')
    expect(rulesFor(jwt({ iss: 'supabase', role: 'authenticated' })))
      .toContain('privileged-jwt')
  })

  it('ignores anything that merely looks like a JWT', () => {
    // `eyJ` is just base64 for `{"`, so minified JSON produces it constantly.
    // A token that cannot be decoded, or that carries no role claim, is not
    // reported — otherwise this rule would fire on ordinary bundle content.
    expect(rulesFor('eyJabcdefgh.ijklmnopq')).toEqual([])
    expect(rulesFor(jwt({ iss: 'someone-else', sub: 'x' }))).toEqual([])
    expect(rulesFor('const x = "eyJhbGciOiJIUzI1NiJ9.@@@not-base64@@@.sig"')).toEqual([])
  })

  it('catches a privileged environment assignment and a Postgres URL', () => {
    expect(rulesFor('SUPABASE_SERVICE_KEY="abcdefghijkl"')).toContain('credential-assignment')
    expect(rulesFor('VAPID_PRIVATE_KEY: "abcdefghijkl"')).toContain('credential-assignment')
    expect(rulesFor('postgres://user:hunter2@db.example.com:5432/x'))
      .toContain('postgres-credential-url')
  })

  it('does NOT reuse the log guard wholesale, and the reason is load-bearing', () => {
    // ops/leakGuard.mjs is tuned for LOGS. Two of its rules would fail every
    // build here:
    //   uuid — src/firstEncounter.js hardcodes onboarding vocabulary ids, which
    //          are public curriculum content.
    //   jwt  — the publishable key is a JWT and belongs in the bundle.
    // Both are asserted rather than left as a comment, so a future "just import
    // the rules" refactor fails here instead of in CI on a green build.
    expect(rulesFor('7f3d1c2a-4b5e-6789-abcd-0123456789ef')).toEqual([])
    expect(rulesFor(jwt({ iss: 'supabase', role: 'anon' }))).toEqual([])
  })

  it('every credential rule is reachable and named', () => {
    // A rule that no input can trigger is worse than no rule: it reads as
    // coverage. Each is driven above; this pins the set so one cannot be
    // dropped silently.
    const ids = RULES.map(r => r.id)
    for (const id of ['service-role-marker', 'supabase-secret-key', 'privileged-jwt',
      'credential-assignment', 'postgres-credential-url']) {
      expect(ids, 'credential rule missing from RULES').toContain(id)
    }
  })
})
