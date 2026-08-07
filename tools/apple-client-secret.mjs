#!/usr/bin/env node
// Generate the Apple "Secret Key (for OAuth)" that Supabase asks for.
//
// Supabase's Apple provider wants a CLIENT SECRET, which Apple defines as a
// short-lived ES256 JWT signed with your .p8 signing key — not the .p8 itself.
// Apple caps its lifetime at 6 months, so this has to be regenerated twice a
// year or web sign-in breaks with no warning (the dashboard says so too).
//
// Run it locally. The .p8 is a private key: whoever holds it can mint Apple
// sign-ins for this app, so it must never be pasted into a web "JWT generator",
// a chat, or a ticket. This script keeps it on your machine and prints only the
// resulting token.
//
// Usage:
//   node tools/apple-client-secret.mjs \
//     --p8 ~/Downloads/AuthKey_ABC123DEFG.p8 \
//     --team-id 9XYZ8ABC7D \
//     --key-id ABC123DEFG \
//     --services-id com.hanzidojo.signin
//
// Then paste the printed token into Supabase → Authentication → Providers →
// Apple → "Secret Key (for OAuth)" and press Save.

import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'
import process from 'node:process'

const APPLE_AUDIENCE = 'https://appleid.apple.com'
// Apple rejects anything longer than 6 months (15777000 seconds).
const MAX_LIFETIME_SECONDS = 15777000

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    args[key] = next && !next.startsWith('--') ? next : 'true'
  }
  return args
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// The signed JWT, given the pieces. Exported-ish shape kept simple so the
// pure part can be exercised by a spec without a real key on disk.
export function buildClientSecret({ privateKey, teamId, keyId, servicesId, now, lifetimeSeconds }) {
  const issuedAt = Math.floor((now || Date.now()) / 1000)
  const lifetime = Math.min(lifetimeSeconds || MAX_LIFETIME_SECONDS, MAX_LIFETIME_SECONDS)

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
  const payload = {
    iss: teamId,
    iat: issuedAt,
    exp: issuedAt + lifetime,
    aud: APPLE_AUDIENCE,
    sub: servicesId,
  }

  const signingInput =
    base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(payload))

  // ES256 signatures must be raw r||s (JOSE), not the DER encoding Node
  // produces by default — a DER signature is silently rejected by Apple.
  const signer = createSign('SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })

  return signingInput + '.' + base64url(signature)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const missing = ['p8', 'team-id', 'key-id', 'services-id'].filter(k => !args[k])
  if (missing.length) {
    console.error('Missing required option(s): ' + missing.map(m => '--' + m).join(', '))
    console.error('\nExample:\n  node tools/apple-client-secret.mjs \\\n' +
      '    --p8 ~/Downloads/AuthKey_ABC123DEFG.p8 \\\n' +
      '    --team-id 9XYZ8ABC7D \\\n' +
      '    --key-id ABC123DEFG \\\n' +
      '    --services-id com.hanzidojo.signin')
    process.exit(1)
  }

  let privateKey
  try {
    privateKey = readFileSync(args.p8.replace(/^~/, process.env.HOME || '~'), 'utf8')
  } catch (err) {
    console.error('Could not read the .p8 file at ' + args.p8 + '\n' + err.message)
    process.exit(1)
  }

  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    console.error('That file does not look like an Apple .p8 signing key ' +
      '(no "-----BEGIN PRIVATE KEY-----" line).')
    process.exit(1)
  }

  let token
  try {
    token = buildClientSecret({
      privateKey,
      teamId: args['team-id'],
      keyId: args['key-id'],
      servicesId: args['services-id'],
    })
  } catch (err) {
    console.error('Could not sign the token: ' + err.message)
    process.exit(1)
  }

  const expires = new Date(Date.now() + MAX_LIFETIME_SECONDS * 1000)
  console.log('\nPaste this into Supabase → Authentication → Providers → Apple')
  console.log('→ "Secret Key (for OAuth)", then press Save:\n')
  console.log(token)
  console.log('\nExpires ' + expires.toISOString().slice(0, 10) +
    ' — Apple\'s 6-month maximum. Set a calendar reminder a week before, and')
  console.log('keep the .p8: regenerating means running this again with the same key.\n')
}

// Only run the CLI when invoked directly, so the builder can be imported.
if (process.argv[1] && process.argv[1].endsWith('apple-client-secret.mjs')) main()
