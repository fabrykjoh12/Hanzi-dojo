import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { BRAND_NAME, BRAND_URL, SUPPORT_EMAIL } from './brand'
import { DISCORD_INVITE_URL, isDiscordConfigured } from './community'
import { externalLinkProps } from './externalLink'

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
      // Internal links navigate client-side (the app is already loaded); the
      // href stays real for middle-click / open-in-new-tab. External links go
      // through externalLinkProps so the native shell hands them to the system
      // browser instead of replacing the app with a foreign page.
      {...(external ? externalLinkProps(href) : { href, onClick: (e) => { e.preventDefault(); navigate(href) } })}
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
        {BRAND_NAME} is a free language-learning app, available on the web at {BRAND_URL} and
        as an app for iPhone and Android. This policy covers all three — they are the same
        product, using the same account and the same data. Where the apps and the website
        genuinely differ, it says so. The short version: we store your account and your
        learning progress so the app can work, we run no third-party trackers and show no
        ads, we never sell data, and nothing you write is shared outside the services listed
        below.
      </P>

      <H2>Who is responsible for your data</H2>
      <P>
        {BRAND_NAME} decides what data is collected and why — in data-protection terms, it is
        the <strong>controller</strong> for everything described on this page. The way to
        reach us about any of it, including the requests listed under “Your rights” below, is{' '}
        <a href={'mailto:' + SUPPORT_EMAIL} style={{ color: 'var(--text)', fontWeight: 600 }}>{SUPPORT_EMAIL}</a>.
        We answer data requests at that address within one month.
      </P>

      <H2>What we store</H2>
      <ul style={{ paddingLeft: '20px', margin: '0 0 12px' }}>
        <Li><strong>Account:</strong> your email address and a password (stored hashed by our
          authentication provider), or your Google or Apple account identity if you sign in
          with one of those. If you use Sign in with Apple and choose to hide your address,
          we only ever see Apple’s relay address.</Li>
        <Li><strong>Learning progress:</strong> the words you study, your review history and
          scheduling state, the stories you read, test attempts, and your preferences
          (theme, fonts, reading settings, daily new-card count). When you save a word while
          reading, we also keep the one sentence you found it in, so the review card can show
          you that context again.</Li>
        <Li><strong>Your timezone:</strong> read automatically from your device when the app
          loads, and updated if it changes. It is used to time reminders sensibly; you are
          never asked to enter it.</Li>
        <Li><strong>Feedback you send:</strong> the message text, your account email, which
          screen you were on, your active language, the app version, and — if you sent it
          from a story — which story. It stays in our database; it is not forwarded anywhere.</Li>
        <Li><strong>Your sign-in sessions:</strong> for each device you are signed in on, our
          authentication provider records the IP address and browser/app description that
          session was created from. This is how you stay signed in, and how a session can be
          recognised. These records last as long as the session does, and are deleted with
          your account.</Li>
      </ul>

      <H2>Product analytics</H2>
      <P>
        We record usage events (for example “a story was opened”) in our own database to
        understand where learning breaks down. Events carry counts, identifiers and short
        enums only — never story text you read, answers you type, or anything you paste; the
        code enforces this by dropping anything longer than a short label. There are no
        third-party analytics and no advertising trackers.
      </P>
      <P>
        Some of these events happen <em>before</em> you have an account — opening the landing
        page, trying the reading check, reading a shared story link. Those event rows are{' '}
        <strong>not linked to a {BRAND_NAME} account</strong>, because there isn’t one yet.
        We avoid calling them anonymous, because that would overstate it: the server logs
        described below record the IP address of the same requests separately, and we would
        rather say so than imply an anonymity we cannot guarantee. There is currently no way
        to opt out of this basic usage measurement; if that matters to you,{' '}
        <A href="/support">Support</A> will tell you what we can do.
      </P>

      <H2>Crash and error reports</H2>
      <P>
        When something breaks in the app, we record the error’s name, the first 40 characters
        of its message, and which screen you were on — capped at a few reports per session.
        We deliberately do not collect stack traces or anything you typed. These go to the
        same database as the usage events above, not to a third-party crash service.
      </P>

      <H2>Microphone (speaking practice, web only)</H2>
      <P>
        On the website, speaking practice uses your browser’s built-in speech recognition.
        The app itself never records, stores or uploads audio. Your browser may use its
        vendor’s speech service to transcribe what you say (for example, Chrome uses
        Google’s); that processing is governed by your browser’s privacy policy. If you deny
        the microphone permission, speaking practice is simply unavailable — everything else
        works. <strong>In the iPhone and Android apps the drill is switched off entirely</strong>,
        because the system web view provides no working speech recognition. Those apps never
        ask for microphone permission and never capture audio.
      </P>

      <H2>Text you paste into “Analyze text”</H2>
      <P>
        The analysis itself happens on your device, and we do not keep the text you pasted.
        One exception, so it is not a surprise: if you tap a word in that text and add it to
        your deck, we save <em>that one sentence</em> along with the card, exactly as we do
        when you save a word from a story — it is what lets the review show you real context
        later. Nothing else from the passage is stored, and the aggregate event we record
        (how many words were recognised) contains none of the text.
      </P>

      <H2>On your device</H2>
      <P>
        {BRAND_NAME} is an offline-capable app: it caches content (stories, audio, artwork)
        and queues your reviews on your device so studying works without a connection. It
        also keeps a few small conveniences locally — your sign-in session, your reading and
        study preferences, and the last handful of words you looked up in the dictionary, so
        they are there when you come back. The dictionary history never leaves your device.
        Clearing site data (or deleting the app) removes all of it from that device; your
        account and progress stay safe on our servers.
      </P>

      <H2>Reminders (web only, for now)</H2>
      <P>
        Review reminders are off until you turn them on. They currently work on the website
        only: turning them on registers a web-push subscription with your browser, and we
        store that subscription along with the hour you chose. Turning reminders off removes
        the subscription; deleting your account removes it too.
      </P>
      <P>
        <strong>The iPhone and Android apps do not send reminders yet</strong>, and collect no
        push token of any kind. When native notifications ship, this section will be updated
        before they are switched on.
      </P>

      <H2>Infrastructure</H2>
      <P>
        Your account, learning progress and review history are stored in Supabase, the
        database and authentication service the app is built on. The other services involved
        in running the product: Vercel (website hosting), Cloudflare (DNS), and Brevo
        (sending sign-up and password emails).
      </P>
      <P>
        Three services are contacted directly by your browser or app as you use it, which
        means they can see your IP address:
      </P>
      <ul style={{ paddingLeft: '20px', margin: '0 0 12px' }}>
        <Li><strong>jsDelivr</strong> — stroke-order data for the character animations, fetched
          per character when you open one.</Li>
        <Li><strong>YouTube</strong> — only on Practice → Videos: thumbnails load with the
          screen, and playing a video uses YouTube’s privacy-enhanced embed.</Li>
        <Li><strong>Google Fonts</strong> — <strong>on the website only</strong>. The iPhone and
          Android apps carry their own copies of the fonts and never contact Google for them.</Li>
      </ul>
      <P>
        Pronunciation audio is generated in advance, before anyone hears it, using Microsoft
        Azure’s speech service (and Google’s in parts of the older content pipeline), from
        vocabulary and story text we wrote — never from anything you type or say. Those
        services never see your data.
      </P>

      <H2>Server logs</H2>
      <P>
        Separately from the usage events above, the platform our backend runs on keeps
        ordinary operational logs of the requests your device makes. These are produced by
        the infrastructure rather than by our code, and we do not control their contents. On
        our current plan they are retained for <strong>7 days</strong> and then discarded.
      </P>
      <P>
        Each request log line can contain your IP address, your browser or app’s
        user-agent string, the coarse location your network resolves to (city, region and
        country), your network operator, a technical fingerprint of the connection, and —
        when you are signed in — your account id alongside them. We use these only to keep
        the service running and secure: diagnosing errors, and spotting abuse. Sign-in
        events additionally record the address you signed in with.
      </P>

      <H2>How long we keep things</H2>
      <ul style={{ paddingLeft: '20px', margin: '0 0 12px' }}>
        <Li><strong>Your account and everything attached to it</strong> — progress, cards,
          review history, feedback, sign-in sessions — for as long as you have an account, so
          your progress is there when you come back. All of it is deleted when you delete the
          account.</Li>
        <Li><strong>Server logs</strong> — 7 days, then discarded automatically.</Li>
        <Li><strong>Usage events not linked to an account</strong> — currently kept without a
          fixed end date. We are not comfortable with that as a permanent answer and intend
          to set a limit; until we do, this page will keep saying so rather than implying a
          policy we don’t have.</Li>
      </ul>

      <H2>Age</H2>
      <P>
        {BRAND_NAME} is not directed at children. You must be at least 13 years old — or older,
        if your country sets a higher minimum age for online accounts — to create one, as the{' '}
        <A href="/terms">Terms</A> say. We do not knowingly collect data from anyone younger.
        If you believe a child has created an account, email us and we will delete it.
      </P>

      <H2>Why we are allowed to process it</H2>
      <P>
        If you are in the EEA or the UK, the law asks us to name a legal basis for each kind
        of processing. Ours are:
      </P>
      <ul style={{ paddingLeft: '20px', margin: '0 0 12px' }}>
        <Li><strong>Your account and your learning data</strong> — to perform our agreement
          with you. Without this there is no app: the whole product is your progress.</Li>
        <Li><strong>Usage events, crash reports and server logs</strong> — our legitimate
          interest in understanding where learning breaks down, keeping the service working,
          and keeping it secure. We have kept these deliberately thin (counts and short
          labels, never your text) so that interest does not override yours. You can object —
          see below.</Li>
        <Li><strong>Feedback you send</strong> — our legitimate interest in answering you and
          fixing what you report.</Li>
        <Li><strong>Reminders</strong> — your consent, given by turning them on, and
          withdrawable at any time by turning them off.</Li>
      </ul>

      <H2>Where your data is stored</H2>
      <P>
        The database holding your account and learning data is hosted <strong>inside the
        EEA</strong>, in Paris, France. It is not copied outside the EEA as part of normal
        operation.
      </P>
      <P>
        Some of the companies listed under Infrastructure are established outside the EEA,
        mainly in the United States, and their staff or systems may access data from there
        for support and operation. Where that happens, the transfer relies on the European
        Commission’s standard contractual clauses and, where the provider is certified, the
        EU–US Data Privacy Framework. If you want to know exactly which mechanism applies to
        a particular provider, ask us and we will tell you.
      </P>

      <H2>Your rights</H2>
      <P>
        Wherever you live, you can email us and we will do these. If you are in the EEA or
        the UK, they are rights you hold under the GDPR, and they are free.
      </P>
      <ul style={{ paddingLeft: '20px', margin: '0 0 12px' }}>
        <Li><strong>Access</strong> — ask what we hold about you and get a copy. There is no
          self-service export button yet, so we put it together by hand; that is why we ask
          for up to a month.</Li>
        <Li><strong>Rectification</strong> — have anything wrong about you corrected. Most of
          it you can already edit yourself in the app.</Li>
        <Li><strong>Erasure</strong> — delete your account and everything in it, yourself, at
          any time: Profile → Delete account. Deletion is immediate and permanent —
          flashcards, review history, story progress, test results, feedback, sign-in
          sessions and the login itself. If you would rather we did it, ask us.</Li>
        <Li><strong>Restriction</strong> — ask us to pause processing while something is
          disputed, instead of deleting it.</Li>
        <Li><strong>Portability</strong> — receive the data you gave us, and your learning
          history, in a structured machine-readable file you can take elsewhere.</Li>
        <Li><strong>Objection</strong> — object to the processing we base on legitimate
          interests, which in practice means the usage events, crash reports and logs. Tell
          us and we will stop measuring you rather than argue about it.</Li>
        <Li><strong>Withdraw consent</strong> — turn reminders off, in the app or in your
          browser’s settings. Withdrawing does not undo what was already sent.</Li>
      </ul>
      <P>
        You can also <strong>complain to a data-protection authority</strong>. In Norway that
        is Datatilsynet; elsewhere in the EEA it is your country’s equivalent, and you may
        complain to the one where you live or work. We would rather you came to us first, but
        you are not required to.
      </P>

      <H2>Other choices in the app</H2>
      <ul style={{ paddingLeft: '20px', margin: '0 0 12px' }}>
        <Li>You can reset your learning progress for your language from Profile at any time,
          without deleting your account.</Li>
        <Li>Reminders and audio autoplay are opt-in preferences you control in the app.</Li>
      </ul>

      <H2>Contact</H2>
      <P>
        Email <a href={'mailto:' + SUPPORT_EMAIL} style={{ color: 'var(--text)', fontWeight: 600 }}>{SUPPORT_EMAIL}</a>{' '}
        for anything in this policy — data questions, corrections, copies, deletion requests.
        The community Discord and the in-app feedback button also reach us
        (see <A href="/support">Support</A>).
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
        <Li>The {BRAND_NAME} app — its software, interface and design — is our own work and
          isn’t licensed for reuse. The stories and illustrations we publish are ours to
          publish, and are provided for your personal learning use, not for republication.
          Some of the artwork was produced with AI image tools; where the law of your country
          doesn’t recognise copyright in machine-generated images, we make no claim it
          doesn’t give us.</Li>
        <Li>Third-party material we build on stays under its own license — the dictionary and
          example sentences below, plus the HSK word lists, the stroke-order data used for
          character animations, the icon set, and the fonts. Each is credited with its license
          in the attribution notice published alongside the app’s source.</Li>
        <Li>Dictionary definitions incorporate <A external href="https://cc-cedict.org/">CC-CEDICT</A>,
          used under <A external href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</A>.
          We have changed it: entries are corrected and curated for learners — pinyin readings
          fixed, definitions trimmed, and a per-level study order applied. That adapted
          dictionary data is itself available under CC BY-SA 4.0. This applies to the
          dictionary data only; it does not place the {BRAND_NAME} app, its stories or its
          artwork under that license.</Li>
        <Li>Some example sentences come from <A external href="https://tatoeba.org/">Tatoeba</A>,
          used under <A external href="https://creativecommons.org/licenses/by/2.0/fr/deed.en">CC BY 2.0 FR</A>.</Li>
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
        this page. Questions or problems:{' '}
        <a href={'mailto:' + SUPPORT_EMAIL} style={{ color: 'var(--text)', fontWeight: 600 }}>{SUPPORT_EMAIL}</a>{' '}
        or <A href="/support">Support</A>.
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
        <Li><strong>Email</strong> — <a href={'mailto:' + SUPPORT_EMAIL} style={{ color: 'var(--text)', fontWeight: 600 }}>{SUPPORT_EMAIL}</a>.
          Works whether or not you have an account, and it is the address for anything
          formal: data requests, deletion, account problems.</Li>
        {isDiscordConfigured() && (
          <Li><strong>Discord</strong> — <A external href={DISCORD_INVITE_URL}>join the community server</A>.
            Bug reports go to #feedback-and-ideas; they’re triaged from there.</Li>
        )}
        <Li><strong>In-app feedback</strong> — signed in, use the floating feedback button
          (visible on every screen). It lands directly with the maintainers.</Li>
      </ul>
      <H2>Account deletion</H2>
      <P>
        You can delete your account yourself: sign in, open <strong>Profile</strong>, and
        choose <strong>Delete account</strong> at the bottom. It asks you to confirm, then
        permanently removes your account and all its data — this works the same in the app
        and on the web at hanzi-dojo.com. Progress for a single language can be reset from
        Profile without deleting the account. If you can’t sign in, email{' '}
        <a href={'mailto:' + SUPPORT_EMAIL} style={{ color: 'var(--text)', fontWeight: 600 }}>{SUPPORT_EMAIL}</a>{' '}
        and we’ll handle it after confirming the account is yours.
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
        Dictionary data incorporates <A external href="https://cc-cedict.org/">CC-CEDICT</A>,
        used under <A external href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</A>{' '}
        and adapted by us — readings corrected, definitions trimmed for learners, study order
        applied — with the adapted data available under the same license. Some example
        sentences come from <A external href="https://tatoeba.org/">Tatoeba</A>, under{' '}
        <A external href="https://creativecommons.org/licenses/by/2.0/fr/deed.en">CC BY 2.0 FR</A>.
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
          Last updated 26 August 2026
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
