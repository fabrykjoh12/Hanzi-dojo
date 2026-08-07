// Read-only App Store Connect diagnostic — see .github/workflows/ios-signing-check.yml.
//
// Prints what the team has (certificates, devices, bundle IDs, profiles) and
// what the API key is permitted to do. Creates nothing.

import { createSign, createPrivateKey } from 'node:crypto'

const KEY_ID = process.env.ASC_KEY_ID
const ISSUER_ID = process.env.ASC_ISSUER_ID
const PRIVATE_KEY = process.env.ASC_PRIVATE_KEY
const BUNDLE_ID = 'com.hanzidojo.app'

if (!KEY_ID || !ISSUER_ID || !PRIVATE_KEY) {
  console.error('Missing ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY.')
  process.exit(1)
}

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// App Store Connect wants ES256 with the signature as raw r||s, not DER.
function token() {
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }
  const body = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload))
  const signer = createSign('SHA256')
  signer.update(body)
  const sig = signer.sign({ key: createPrivateKey(PRIVATE_KEY), dsaEncoding: 'ieee-p1363' })
  return body + '.' + b64url(sig)
}

const JWT = token()

async function get(path) {
  const res = await fetch('https://api.appstoreconnect.apple.com/v1/' + path, {
    headers: { Authorization: 'Bearer ' + JWT },
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* non-JSON error body */ }
  return { status: res.status, json, text }
}

function fail(label, r) {
  const detail = r.json?.errors?.[0]?.detail || r.json?.errors?.[0]?.title || r.text.slice(0, 200)
  console.log('  ✗ ' + label + ' → HTTP ' + r.status + ': ' + detail)
}

console.log('=== Certificates ===')
const certs = await get('certificates?limit=200')
if (certs.status !== 200) {
  fail('list certificates', certs)
  console.log('  (403 here usually means the API key role is too low — creating and')
  console.log('   listing certificates needs Admin, not App Manager.)')
} else {
  const rows = certs.json.data || []
  console.log('  ' + rows.length + ' certificate(s)')
  for (const c of rows) {
    const a = c.attributes
    console.log('  · ' + a.certificateType + ' — ' + a.name + ' — expires ' + a.expirationDate)
  }
  if (!rows.some(c => /DISTRIBUTION/.test(c.attributes.certificateType))) {
    console.log('  ⚠ No distribution certificate. Nothing can be signed for the App Store yet.')
  }
}

console.log('')
console.log('=== Devices ===')
const devices = await get('devices?limit=200')
if (devices.status !== 200) fail('list devices', devices)
else {
  const rows = devices.json.data || []
  console.log('  ' + rows.length + ' device(s) registered')
  for (const d of rows) console.log('  · ' + d.attributes.name + ' — ' + d.attributes.status)
  if (rows.length === 0) {
    console.log('  ⚠ Zero devices. This is why Xcode cannot create a DEVELOPMENT profile,')
    console.log('    which is what `xcodebuild archive` asks for under automatic signing.')
  }
}

console.log('')
console.log('=== Bundle IDs ===')
const ids = await get('bundleIds?limit=200')
if (ids.status !== 200) fail('list bundle IDs', ids)
else {
  const rows = ids.json.data || []
  for (const b of rows) console.log('  · ' + b.attributes.identifier + '  (' + b.attributes.name + ')')
  if (!rows.some(b => b.attributes.identifier === BUNDLE_ID)) {
    console.log('  ⚠ ' + BUNDLE_ID + ' is NOT registered as a bundle ID.')
  }
}

console.log('')
console.log('=== Provisioning profiles ===')
const profiles = await get('profiles?limit=200')
if (profiles.status !== 200) fail('list profiles', profiles)
else {
  const rows = profiles.json.data || []
  console.log('  ' + rows.length + ' profile(s)')
  for (const p of rows) {
    const a = p.attributes
    console.log('  · ' + a.profileType + ' — ' + a.name + ' — ' + a.profileState)
  }
  if (!rows.some(p => p.attributes.profileType === 'IOS_APP_STORE')) {
    console.log('  ⚠ No IOS_APP_STORE profile. One is required to sign a TestFlight build.')
  }
}

console.log('')
console.log('=== Apps in App Store Connect ===')
const apps = await get('apps?limit=200')
if (apps.status !== 200) fail('list apps', apps)
else for (const a of apps.json.data || []) {
  console.log('  · ' + a.attributes.bundleId + ' — ' + a.attributes.name)
}
