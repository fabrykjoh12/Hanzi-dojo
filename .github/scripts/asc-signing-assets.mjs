// Creates the signing assets an App Store build needs, using the App Store
// Connect API, and prints where it put them.
//
// WHY THIS EXISTS
// ---------------
// `xcodebuild archive` under automatic signing asks Apple for an iOS App
// *Development* provisioning profile, and Apple will not issue one to a team
// with no registered devices. Nobody on this project has a Mac or a
// registered iPhone, so that path can never succeed. Manual signing avoids it
// entirely: we ask the API for a distribution certificate and an App Store
// profile, hand both to xcodebuild, and never involve a device.
//
// WHAT IT ASSUMES
// ---------------
// That no human holds a distribution certificate's private key. That is true
// here — there is no Mac on the project, so the only distribution certificates
// that can exist are ones this script made, and their keys died with the
// runner that made them. A certificate whose key is gone cannot sign anything,
// so this script revokes those before creating a fresh one; Apple caps how
// many a team may hold, and without the cleanup the second run would fail.
// Every revocation is logged. If someone ever does get a Mac and a real
// certificate, this assumption stops holding and this script must change.
//
// Revoking a distribution certificate does not affect apps already on the
// App Store or builds already uploaded.
//
// Usage: node asc-signing-assets.mjs <csr-path> <output-dir>
// Writes: <output-dir>/cert.pem and <output-dir>/profile.mobileprovision
// Prints: PROFILE_NAME / PROFILE_UUID lines for the workflow to consume.

import { createSign, createPrivateKey } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const KEY_ID = process.env.ASC_KEY_ID
const ISSUER_ID = process.env.ASC_ISSUER_ID
const PRIVATE_KEY = process.env.ASC_PRIVATE_KEY
const BUNDLE_ID = 'com.hanzidojo.app'
const PROFILE_NAME = 'Hanzi Dojo App Store CI'

const [csrPath, outDir] = process.argv.slice(2)
if (!csrPath || !outDir) {
  console.error('Usage: node asc-signing-assets.mjs <csr-path> <output-dir>')
  process.exit(1)
}
if (!KEY_ID || !ISSUER_ID || !PRIVATE_KEY) {
  console.error('Missing ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY.')
  process.exit(1)
}

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// App Store Connect wants ES256 with the signature as raw r||s, not DER.
function mintToken() {
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }
  const body = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload))
  const signer = createSign('SHA256')
  signer.update(body)
  return body + '.' + b64url(signer.sign({ key: createPrivateKey(PRIVATE_KEY), dsaEncoding: 'ieee-p1363' }))
}

const JWT = mintToken()

async function api(method, path, body) {
  const res = await fetch('https://api.appstoreconnect.apple.com/v1/' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + JWT,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (res.status === 204) return null
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* error bodies are not always JSON */ }
  if (!res.ok) {
    const e = json?.errors?.[0]
    throw new Error(method + ' ' + path + ' → HTTP ' + res.status + ': ' +
      (e ? (e.title + ' — ' + e.detail) : text.slice(0, 300)))
  }
  return json
}

// --- distribution certificate -------------------------------------------

const existing = await api('GET', 'certificates?limit=200')
const staleDist = (existing.data || []).filter(c => /DISTRIBUTION/.test(c.attributes.certificateType))
for (const c of staleDist) {
  console.log('Revoking unusable distribution certificate ' + c.id +
    ' (' + c.attributes.name + ', created ' + c.attributes.expirationDate + ') — its private key is gone.')
  await api('DELETE', 'certificates/' + c.id)
}

const csr = readFileSync(csrPath, 'utf8')
const certRes = await api('POST', 'certificates', {
  data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent: csr } },
})
const certId = certRes.data.id
writeFileSync(outDir + '/cert.cer', Buffer.from(certRes.data.attributes.certificateContent, 'base64'))
console.log('Created distribution certificate ' + certId + ' (' + certRes.data.attributes.name + ')')

// --- App Store provisioning profile --------------------------------------

const bundles = await api('GET', 'bundleIds?limit=200&filter[identifier]=' + BUNDLE_ID)
const bundle = (bundles.data || []).find(b => b.attributes.identifier === BUNDLE_ID)
if (!bundle) throw new Error('Bundle ID ' + BUNDLE_ID + ' is not registered in the developer account.')

// A profile name must be unique, and the old one is bound to the certificate
// we just revoked, so it is dead weight either way.
const profiles = await api('GET', 'profiles?limit=200')
for (const p of profiles.data || []) {
  if (p.attributes.name === PROFILE_NAME) {
    console.log('Deleting previous profile ' + p.id + ' (' + PROFILE_NAME + ')')
    await api('DELETE', 'profiles/' + p.id)
  }
}

const profRes = await api('POST', 'profiles', {
  data: {
    type: 'profiles',
    attributes: { name: PROFILE_NAME, profileType: 'IOS_APP_STORE' },
    relationships: {
      bundleId: { data: { id: bundle.id, type: 'bundleIds' } },
      certificates: { data: [{ id: certId, type: 'certificates' }] },
    },
  },
})
const prof = profRes.data.attributes
writeFileSync(outDir + '/profile.mobileprovision', Buffer.from(prof.profileContent, 'base64'))
console.log('Created profile ' + profRes.data.id + ' — ' + prof.name + ' (' + prof.uuid + ')')

console.log('PROFILE_NAME=' + prof.name)
console.log('PROFILE_UUID=' + prof.uuid)
