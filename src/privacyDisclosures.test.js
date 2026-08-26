import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Content guard for the privacy policy (FAB-19 Stage 2).
//
// The policy is prose in a component, so nothing stops a future refactor from
// quietly deleting a section — and the sections added here are not decoration:
// they are what GDPR Articles 13 and 15-21 require a reader in the EEA to be
// told. A missing "Your rights" block is not a visual regression, it is a
// compliance one, and the visual baseline would not catch it because the
// baseline gets regenerated to match whatever the page now says.
//
// So this asserts on the SOURCE text rather than a render. It is deliberately
// coarse — it pins that each disclosure is present, not how it is worded, so
// the policy can still be edited freely without fighting a spec.
//
// If you are deleting one of these on purpose, delete its assertion in the same
// commit. That is the point: it forces the removal to be visible in review.

const SOURCE = readFileSync(new URL('./TrustPages.jsx', import.meta.url), 'utf8')

// Just the Privacy component, so a phrase living in Terms cannot satisfy a
// privacy-policy assertion by accident.
const PRIVACY = SOURCE.slice(SOURCE.indexOf('function Privacy()'), SOURCE.indexOf('function Terms()'))

function heading(title) {
  return PRIVACY.includes('<H2>' + title)
}

describe('privacy policy — GDPR disclosure completeness', () => {
  it('identifies who is responsible for the data', () => {
    expect(heading('Who is responsible for your data')).toBe(true)
    expect(PRIVACY).toContain('controller')
    // The contact route has to be a real one, not prose.
    expect(PRIVACY).toContain('SUPPORT_EMAIL')
  })

  it('names the controller from a single constant, so it cannot drift', () => {
    // The owner's legal name lives in brand.js and is rendered here. Inlining it
    // as a literal would let the policy and any future store metadata disagree.
    expect(PRIVACY).toContain('CONTROLLER_NAME')
    expect(PRIVACY).toContain('CONTROLLER_COUNTRY')
  })

  it('states the controller is an individual, not a company', () => {
    // Hanzi Dojo has no AS and no enkeltpersonforetak. Saying or implying
    // otherwise would misidentify the controller.
    expect(PRIVACY).toContain('is not a company')
    expect(PRIVACY).toContain('an individual')
  })

  it('does not publish a street address, and says how to get one', () => {
    // GDPR Art. 13(1)(a) asks for identity and contact details, not a street
    // address; the controller is a person, so publishing a home address is a
    // real harm with no legal upside. The offer to provide one on request is
    // what keeps the contact details adequate.
    expect(PRIVACY).toContain('don’t publish a street address')
    expect(PRIVACY).toContain('ask at that address and you will get it')
  })

  it('states a legal basis for each meaningful kind of processing', () => {
    expect(heading('Why we are allowed to process it')).toBe(true)
    for (const basis of ['perform our agreement', 'legitimate interest', 'your consent']) {
      expect(PRIVACY).toContain(basis)
    }
  })

  it('says where the data is stored and how transfers out of the EEA are covered', () => {
    expect(heading('Where your data is stored')).toBe(true)
    expect(PRIVACY).toContain('EEA')
    expect(PRIVACY).toContain('standard contractual clauses')
  })

  it('lists every data-subject right, not just deletion', () => {
    expect(heading('Your rights')).toBe(true)
    for (const right of [
      'Access',        // Art. 15
      'Rectification', // Art. 16
      'Erasure',       // Art. 17
      'Restriction',   // Art. 18
      'Portability',   // Art. 20
      'Objection',     // Art. 21
      'Withdraw consent',
    ]) {
      expect(PRIVACY).toContain('<strong>' + right + '</strong>')
    }
  })

  it('tells the reader they can complain to a supervisory authority, and names Norway’s', () => {
    expect(PRIVACY).toContain('complain to a data-protection authority')
    expect(PRIVACY).toContain('Datatilsynet')
  })

  it('states retention, including that server logs expire', () => {
    expect(heading('How long we keep things')).toBe(true)
    expect(heading('Server logs')).toBe(true)
    expect(PRIVACY).toContain('7 days')
  })

  it('names the recipients that receive or can see data', () => {
    expect(heading('Infrastructure')).toBe(true)
    for (const processor of ['Supabase', 'Vercel', 'Cloudflare', 'Brevo', 'jsDelivr', 'YouTube']) {
      expect(PRIVACY).toContain(processor)
    }
  })

  it('has an age section', () => {
    expect(heading('Age')).toBe(true)
  })
})

describe('privacy policy — claims that must not come back', () => {
  // Each of these was in the policy and was false. A regression would be a
  // published untruth, so they are pinned rather than trusted to memory.

  it('does not claim pasted text is never stored', () => {
    expect(PRIVACY).not.toContain('The pasted text is never stored')
  })

  it('does not claim APNs/FCM push tokens are collected — native push does not exist', () => {
    expect(PRIVACY).not.toContain('APNs')
    expect(PRIVACY).not.toContain('Firebase Cloud Messaging')
  })

  it('does not call pre-account events anonymous', () => {
    // The distinction that matters: the event row carries no account id, but the
    // server logs record the IP of the same request separately.
    expect(PRIVACY).toContain('not linked to a {BRAND_NAME} account')
    expect(PRIVACY).not.toMatch(/\banonymous usage events\b/)
  })

  it('does not scope Google Fonts as web-only without saying the apps bundle their own', () => {
    expect(PRIVACY).toContain('carry their own copies of the fonts')
  })

  it('discloses that sign-in sessions record an IP address', () => {
    expect(PRIVACY).toContain('sign-in sessions')
    expect(PRIVACY).toContain('IP address')
  })
})
