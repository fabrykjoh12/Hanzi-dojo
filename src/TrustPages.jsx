import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { BRAND_NAME, BRAND_URL } from './brand'
import { DISCORD_INVITE_URL, isDiscordConfigured } from './community'

// The public trust pages: Privacy, Terms, Support, Methodology. Reachable
// signed-out (linked from the Landing footer and the signup screen) and
// signed-in. Content is plain prose — factual statements about what the app
// actually does, written from the code, not aspirations.
//
// ⚠️ The Privacy and Terms texts are drafts scaffolded for owner review. They
// must be reviewed (and, where it matters, professionally checked) before the
// beta is announced — see the beta note rendered on those pages.

const PAGE_TITLES = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Use',
  support: 'Support & Contact',
  methodology: 'How ' + BRAND_NAME + ' teaches',
}

function H2({ children }) {
  return <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', margin: '28px 0 8px' }}>{children}</h2>
}

function P({ children }) {
  return <p style={{ fontSize: '14.5px', lineHeight: 1.7, color: 'var(--text)', margin: '0 0 12px' }}>{children}</p>
}

function Li({ children }) {
  return <li style={{ fontSize: '14.5px', lineHeight: 1.7, color: 'var(--text)', marginBottom: '6px' }}>{children}</li>
}

function A({ href, children, external }) {
  const navigate = useNavigate()
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      // Internal links navigate client-side (the app is already loaded); the
      // href stays real for middle-click / open-in-new-tab. External links are
      // real navigations by design.
      onClick={external ? undefined : (e) => { e.preventDefault(); navigate(href) }}
      style={{ color: 'var(--text)', fontWeight: 600, textDecorationColor: 'var(--text-faint)' }}
    >{children}</a>
  )
}

function BetaNote() {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px',
      background: 'var(--surface-2)', fontSize: '13px', color: 'var(--text-muted)',
      lineHeight: 1.6, margin: '0 0 20px',
    }}>
      {BRAND_NAME} is in beta and this document is being finalized. It describes how the
      product actually works today; wording may still be refined. Questions are welcome —
      see <A href="/support">Support</A>.
    </div>
  )
}

function Privacy() {
  return (
    <>
      <BetaNote />
      <P>
        {BRAND_NAME} is a free language-learning app. This page explains what data the app
        stores and why. The short version: we store your account and your learning progress
        so the app can work, we run no third-party trackers and show no ads, and we never
        sell data.
      </P>

      <H2>What we store</H2>
      <ul style={{ paddingLeft: '20px', margin: '0 0 12px' }}>
        <Li><strong>Account:</strong> your email address and a password (stored hashed by our
          authentication provider), or your Google account identity if you sign in with Google.</Li>
        <Li><strong>Learning progress:</strong> the words you study, your review history and
          scheduling state, the stories you read, test attempts, and your preferences
          (theme, fonts, reading settings, daily new-card count, timezone for reminders).</Li>
        <Li><strong>Feedback you send:</strong> the text of in-app feedback, so we can act on it.</Li>
      </ul>

      <H2>Product analytics</H2>
      <P>
        We record usage events (for example “a story was opened”) in our own database to
        understand where learning breaks down. Events carry counts, identifiers, and enums
        only — never story text you read, answers you type, or anything you paste. There are
        no third-party analytics or advertising trackers.
      </P>

      <H2>Microphone (speaking practice)</H2>
      <P>
        Speaking practice uses your browser’s built-in speech recognition. The app itself
        never records, stores, or uploads audio. Your browser may use its vendor’s speech
        service to transcribe what you say (for example, Chrome uses Google’s); that
        processing is governed by your browser’s privacy policy. If you deny the microphone
        permission, speaking practice is simply unavailable — everything else works.
      </P>

      <H2>Text you paste into “Analyze text”</H2>
      <P>
        Analysis happens on your device. The pasted text is never stored on our servers or
        sent anywhere; the only thing recorded is an aggregate event (how many words were
        recognized), with none of the text.
      </P>

      <H2>On your device</H2>
      <P>
        {BRAND_NAME} is an offline-capable app: it caches content (stories, audio, artwork)
        and queues your reviews on your device so studying works without a connection. Your
        sign-in session is kept in your browser’s storage. Clearing site data removes all of it.
      </P>

      <H2>Infrastructure</H2>
      <P>
        Your data is processed by the services that run the app: Supabase (database and
        authentication), Vercel (site hosting), Cloudflare (DNS), Brevo (sending sign-up and
        password emails), and Google Fonts (font delivery). Pronunciation audio is generated
        in advance with text-to-speech services from vocabulary text only — never from
        anything you type or say.
      </P>

      <H2>Your rights and choices</H2>
      <ul style={{ paddingLeft: '20px', margin: '0 0 12px' }}>
        <Li>You can reset your learning progress for your language from Profile at any time.</Li>
        <Li>You can ask for a copy of your data, ask us to correct it, or ask us to delete
          your account and everything in it — see <A href="/support">Support</A>. Deletion
          removes your account data; we don’t keep it beyond that.</Li>
        <Li>Your data is kept for as long as you have an account, so your progress is there
          when you come back.</Li>
        <Li>Reminders and audio autoplay are opt-in preferences you control in the app.</Li>
      </ul>

      <H2>Contact</H2>
      <P>
        During the beta, the contact channel is the community Discord and the in-app feedback
        button (see <A href="/support">Support</A>). A dedicated support email is coming and
        will be listed here.
      </P>
    </>
  )
}

function Terms() {
  return (
    <>
      <BetaNote />
      <P>
        Welcome to {BRAND_NAME} ({BRAND_URL}). By creating an account you agree to these
        terms. They are deliberately plain.
      </P>

      <H2>The service</H2>
      <P>
        {BRAND_NAME} is a free language-learning app, currently in beta. Core learning
        features are free. The service is provided as-is: we work to keep it reliable and to
        keep your progress safe, but a beta can have bugs, and features may change as the
        product develops.
      </P>

      <H2>Your account</H2>
      <P>
        You must be at least 13 years old (or the minimum age for online accounts in your
        country, if higher) to create an account. You are responsible for your account
        credentials. One account per person; use a real email you control so password
        recovery works. We may close accounts that abuse the service (for example attempting
        to access other users’ data or internal tooling).
      </P>

      <H2>Content and licenses</H2>
      <ul style={{ paddingLeft: '20px', margin: '0 0 12px' }}>
        <Li>Stories, artwork, and app design are © {BRAND_NAME}. They are for your personal
          learning use, not for republication.</Li>
        <Li>Dictionary definitions incorporate <A external href="https://cc-cedict.org/">CC-CEDICT</A>,
          used under CC BY-SA 4.0.</Li>
        <Li>Some example sentences come from <A external href="https://tatoeba.org/">Tatoeba</A>,
          used under CC-BY 2.0 FR.</Li>
        <Li>Your learning data is yours. We use it to run the product (scheduling, progress,
          recommendations), not to sell.</Li>
      </ul>

      <H2>Fair use of the service</H2>
      <P>
        Don’t attempt to disrupt the service, scrape it at scale, probe other users’ data, or
        misuse the anonymous endpoints. Automated access beyond normal app use isn’t permitted.
      </P>

      <H2>Liability</H2>
      <P>
        {BRAND_NAME} is a free service provided as-is, without warranties of any kind. To the
        extent permitted by law, we are not liable for indirect or consequential damages
        arising from your use of the service. Nothing here limits liability that cannot be
        limited by law.
      </P>

      <H2>Changes and contact</H2>
      <P>
        We may update these terms as the beta evolves; meaningful changes will be visible on
        this page. Questions or problems: <A href="/support">Support</A>.
      </P>
    </>
  )
}

function Support() {
  return (
    <>
      <P>
        {BRAND_NAME} is built in the open with its community. The fastest ways to reach a
        human:
      </P>
      <ul style={{ paddingLeft: '20px', margin: '0 0 12px' }}>
        {isDiscordConfigured() && (
          <Li><strong>Discord</strong> — <A external href={DISCORD_INVITE_URL}>join the community server</A>.
            Bug reports go to #feedback-and-ideas; they’re triaged from there.</Li>
        )}
        <Li><strong>In-app feedback</strong> — signed in, use the floating feedback button
          (visible on every screen). It lands directly with the maintainers.</Li>
      </ul>
      <H2>Account deletion</H2>
      <P>
        To delete your account and its data, ask in Discord or via in-app feedback from the
        account you want removed, and we’ll confirm and handle it. Progress for a single
        language can be reset yourself from Profile without deleting the account.
      </P>
      <H2>Data questions</H2>
      <P>
        What the app stores and why is documented in the <A href="/privacy">Privacy Policy</A>.
      </P>
    </>
  )
}

function Methodology() {
  return (
    <>
      <P>
        {BRAND_NAME} is built on the two techniques with the strongest evidence in language
        learning: <strong>spaced repetition</strong> and <strong>comprehensible input</strong> —
        and on connecting them, so what you review is what you read.
      </P>

      <H2>Spaced repetition (FSRS)</H2>
      <P>
        Flashcards are scheduled by FSRS, a modern open scheduling algorithm that models how
        memories actually decay, targeting about 90% recall. Grading yourself Again / Hard /
        Good / Easy adjusts each word’s schedule individually. There are no streaks, leagues,
        or XP — the return hook is the work waiting, not guilt.
      </P>

      <H2>Reading you can actually read</H2>
      <P>
        Every story is written inside a known vocabulary band and matched against the words
        <em> you</em> know, so you read at the edge of your level instead of hunting for
        material. Words you tap while reading can join your review deck with their story
        sentence attached — reading feeds review, review unlocks reading.
      </P>

      <H2>Mastery, honestly measured</H2>
      <P>
        A word counts as <strong>learned</strong> once it has genuinely entered review, and as
        <strong> mastered</strong> only when its memory stability passes 21 days — a measured
        property of your review history, not a self-graded button. Level progression gates on
        that mastery, so a passed level means something.
      </P>

      <H2>Where the vocabulary comes from</H2>
      <P>
        Chinese vocabulary follows the HSK 3.0 level sequence, ordered frequency-first so the
        most useful words come earliest. Our per-level word lists are curated study sets and
        do not yet mirror the official per-level word counts one-to-one; a precise published
        mapping to the official standard is planned, and this page will state it when it ships.
        Dictionary data incorporates CC-CEDICT; some example sentences come from Tatoeba.
      </P>

      <H2>Audio</H2>
      <P>
        Words, example sentences, and story lines carry recorded neural text-to-speech audio,
        generated in advance with pinyin-guided pronunciation for ambiguous characters, plus
        slow variants for words that won’t stick.
      </P>
    </>
  )
}

const PAGE_BODIES = { privacy: Privacy, terms: Terms, support: Support, methodology: Methodology }

export default function TrustPages({ page, onBack }) {
  const Body = PAGE_BODIES[page] || Support
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '28px 20px 64px' }}>
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'none',
            border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px',
            fontWeight: 600, padding: '6px 0', fontFamily: 'Inter, sans-serif',
          }}
        >
          <ArrowLeft size={16} strokeWidth={2} /> {BRAND_NAME}
        </button>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', margin: '18px 0 6px' }}>
          {PAGE_TITLES[page] || 'Support'}
        </h1>
        <p style={{ fontSize: '12.5px', color: 'var(--text-faint)', margin: '0 0 22px' }}>
          Last updated 1 August 2026
        </p>
        <Body />
        <div style={{
          marginTop: '36px', paddingTop: '18px', borderTop: '1px solid var(--border)',
          fontSize: '13px', color: 'var(--text-muted)', display: 'flex', gap: '14px', flexWrap: 'wrap',
        }}>
          <A href="/privacy">Privacy</A>
          <A href="/terms">Terms</A>
          <A href="/support">Support</A>
          <A href="/methodology">Methodology</A>
        </div>
      </div>
    </div>
  )
}
