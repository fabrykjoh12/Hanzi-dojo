import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Auth from './Auth'
import { track, EVENTS } from './analytics'
import logo from './assets/Hanzi-logo.png'
import bgLogin from './assets/bg-login.webp'
import { BRAND_NAME, heroWordmarkStyle } from './brand'
import Tutorial from './Tutorial'
import { useIsMobile } from './useIsMobile'
import { initialLandingMode, landingEntry, isTutorialDone, markTutorialDone } from './prelogin'
import { isNativeApp } from './nativeShell'
import NativeWelcome from './NativeWelcome'
import {
  ArrowRight, BookOpen, GraduationCap, Layers, PenLine, Play,
  MessagesSquare,
} from 'lucide-react'
import { DISCORD_INVITE_URL, isDiscordConfigured } from './community'
import { externalLinkProps } from './externalLink'

const SAGE = '#6E8466'
const SAGE_DARK = '#5C7155'


// ── Small pieces ────────────────────────────────────────────────────────────

function CtaButton({ children, onClick, big }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
        minHeight: big ? '54px' : '42px', padding: big ? '0 28px' : '0 18px',
        borderRadius: '16px', border: 'none',
        background: hovered ? SAGE_DARK : SAGE, color: '#fff',
        fontSize: big ? '16px' : '14px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer', transition: 'background 160ms ease, transform 160ms ease, box-shadow 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered ? '0 12px 28px rgba(110,132,102,0.30)' : '0 6px 18px rgba(110,132,102,0.20)',
      }}
    >
      {children}
      <ArrowRight size={big ? 18 : 16} strokeWidth={2.2} color="#fff" />
    </button>
  )
}

function GhostButton({ children, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        minHeight: '42px', padding: '0 18px', borderRadius: '14px',
        border: '1px solid var(--border)',
        background: hovered ? 'var(--surface-2)' : 'var(--surface)',
        color: 'var(--text)', fontSize: '14px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer', transition: 'background 160ms ease',
      }}
    >
      {children}
    </button>
  )
}

// Stylized flashcard mock — a real-feeling glimpse of the study screen.
function StoryMock() {
  const words = [
    { t: '今天', known: true }, { t: '我', known: true }, { t: '和', known: true },
    { t: '朋友', known: true }, { t: '去', known: true }, { t: '公园', mark: 'new' },
    { t: '散步', mark: 'learning' }, { t: '。', plain: true },
  ]
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '22px',
      padding: '24px', boxShadow: '0 24px 60px rgba(24,24,27,0.10)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 750, color: 'var(--text)' }}>In the Park</span>
        <span style={{ fontSize: '12px', fontWeight: 750, color: '#2F9E6D' }}>82% known</span>
      </div>
      <div style={{ height: '6px', borderRadius: '999px', overflow: 'hidden', display: 'flex', marginBottom: '16px', background: 'var(--border)' }}>
        <div style={{ width: '82%', background: '#2F9E6D' }} />
        <div style={{ width: '10%', background: '#CA8A04' }} />
        <div style={{ width: '8%', background: '#B83A2455' }} />
      </div>
      <div style={{ fontSize: '20px', fontFamily: "'Noto Sans SC'", color: 'var(--text)', lineHeight: 2 }}>
        {words.map((w, i) => (
          <span key={i} style={{
            borderBottom: w.mark === 'new' ? '2px solid #B83A24AA' : w.mark === 'learning' ? '2px solid #CA8A04AA' : 'none',
            background: w.mark === 'new' ? '#B83A2410' : 'transparent',
            borderRadius: '3px', padding: w.plain ? 0 : '0 1px',
          }}>
            {w.t}
          </span>
        ))}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', lineHeight: 1.5 }}>
        Tap an <span style={{ color: '#B83A24', fontWeight: 650 }}>underlined word</span> to see it — one more tap adds it to your deck.
      </div>
    </div>
  )
}

function MethodCard({ icon: Icon, title, children, accent }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px',
      padding: '22px', boxShadow: '0 8px 26px rgba(24,24,27,0.05)', textAlign: 'left',
    }}>
      <div style={{
        width: '42px', height: '42px', borderRadius: '13px',
        background: accent + '12', border: '1px solid ' + accent + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px',
      }}>
        <Icon size={21} strokeWidth={1.85} color={accent} />
      </div>
      <div style={{ fontSize: '16px', fontWeight: 750, color: 'var(--text)', marginBottom: '7px' }}>{title}</div>
      <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

// ── Landing ─────────────────────────────────────────────────────────────────
//
// Shown to signed-out visitors instead of a bare login card: states what the
// product is, who it's for, and why it's different — then hands off to the
// existing Auth screen. Returning users get there in one click ("Log in").
// `authNotice` — set when the visitor arrived from an auth link that could not
// be completed (an expired or wrong-device password-reset link). It skips the
// wizard entirely: someone who came here to finish resetting a password should
// land on the form, with the reason, not at the top of an onboarding funnel.
export default function Landing({ authNotice = null }) {
  // Three screens, and one of them is the tutorial.
  //
  //   'landing'  the public marketing page (web only)
  //   'welcome'  the app's own first screen (native only)
  //   'tutorial' the Mini First Session — see Tutorial.jsx
  //   'auth'     sign in / create account
  //
  // What used to live here was a nine-screen wizard: a flashcard, a tea-shop
  // story, a completion card, three questions and an animated "building your
  // path". Four of its six answers were never read by anything, so a learner
  // was asked their level twice and their daily commitment twice in two
  // different units. The tutorial replaces all of it and teaches rather than
  // asks — see docs/ONBOARDING-AUDIT.md.
  //
  // A tutorial that has already been finished on this device is not shown
  // again: Start goes straight to the account, because the second thing a
  // returning visitor wants is never the introduction.
  const [mode, setMode] = useState(() => landingEntry({
    native: isNativeApp(),
    tutorialDone: isTutorialDone(),
    authNotice,
  }))
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  useEffect(() => { track(EVENTS.LANDING_VIEWED) }, [])

  const beginTraining = () => {
    if (isTutorialDone()) {
      track(EVENTS.PRELOGIN_SIGNUP_STARTED, { language: 'chinese' })
      setMode('auth')
      return
    }
    setMode('tutorial')
  }

  // The tutorial finished. It has taught what it was going to teach, so it is
  // marked done before the account ask — a learner who bails at the signup
  // form and comes back should land on the form, not on the introduction.
  const finishTutorial = () => {
    markTutorialDone()
    track(EVENTS.PRELOGIN_SIGNUP_STARTED, { language: 'chinese' })
    setMode('auth')
  }

  // The store apps open here instead of the marketing page.
  if (mode === 'welcome') {
    return (
      <NativeWelcome
        onStart={beginTraining}
        onLogIn={() => setMode('auth')}
      />
    )
  }

  if (mode === 'tutorial') {
    return <Tutorial onComplete={finishTutorial} />
  }

  if (mode === 'auth') {
    return (
      <Auth
        notice={authNotice}
        onBack={() => setMode(initialLandingMode(isNativeApp()))}
      />
    )
  }

  const loop = [
    { icon: Layers, label: 'Flashcards' },
    { icon: BookOpen, label: 'Stories' },
    { icon: Play, label: 'Videos' },
    { icon: PenLine, label: 'Writing' },
  ]

  return (
    <div style={{ minHeight: '100vh', position: 'relative', background: 'var(--bg)' }}>
      {/* Faint brush-painting backdrop, same asset as auth/onboarding. */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'url(' + bgLogin + ')',
        backgroundSize: 'cover', backgroundPosition: 'center',
        opacity: 0.22, pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '980px', margin: '0 auto', padding: isMobile ? '18px 18px 48px' : '22px 32px 72px' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '40px' : '64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={logo} alt={BRAND_NAME + ' logo'} style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
            <span style={{ ...heroWordmarkStyle('26px') }}>{BRAND_NAME}</span>
          </div>
          <GhostButton onClick={() => setMode('auth')}>Log in</GhostButton>
        </div>

        {/* Hero */}
        <div style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            padding: '6px 14px', borderRadius: '999px',
            background: '#6E846614', border: '1px solid #6E846630',
            color: SAGE_DARK, fontSize: '12.5px', fontWeight: 700, marginBottom: '22px',
          }}>
            Reading-first Chinese
          </div>
          <h1 style={{
            fontSize: isMobile ? '34px' : '46px', fontWeight: 800, color: 'var(--text)',
            lineHeight: 1.15, letterSpacing: '-0.02em', margin: '0 0 18px',
            fontFamily: 'Inter, sans-serif',
          }}>
            Learn words. Unlock stories you can actually read.
          </h1>
          <p style={{ fontSize: isMobile ? '15px' : '17px', color: 'var(--text-muted)', lineHeight: 1.65, margin: '0 auto 28px', maxWidth: '560px' }}>
            Read real Chinese in your first minute. No streaks. No leagues. No
            guilt — just real progress: {BRAND_NAME} pairs a proven memory engine
            with graded stories matched to the words you know.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
            <CtaButton big onClick={beginTraining}>Start your first story</CtaButton>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <a href="/how-much-can-you-read" style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '14px', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
              Or find out how much Chinese you can already read — free 3-minute test →
            </a>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-faint)', fontWeight: 600, marginBottom: isMobile ? '40px' : '56px' }}>
            Start free. No credit card. Learn your first words and unlock your first story in minutes.
          </div>

        </div>

        {/* Product mocks */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr',
          gap: '20px', maxWidth: '420px', margin: '0 auto', marginBottom: isMobile ? '44px' : '72px',
          alignItems: 'start',
        }}>
          <StoryMock />
        </div>

        {/* Method */}
        <div style={{ textAlign: 'center', marginBottom: '22px' }}>
          <h2 style={{ fontSize: isMobile ? '24px' : '30px', fontWeight: 800, color: 'var(--text)', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
            No shortcuts — that's the point.
          </h2>
          <p style={{ fontSize: '14.5px', color: 'var(--text-muted)', maxWidth: '540px', margin: '0 auto', lineHeight: 1.6 }}>
            Most apps optimize for streaks. {BRAND_NAME} optimizes for memory.
          </p>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: '16px', marginBottom: isMobile ? '44px' : '72px',
        }}>
          <MethodCard icon={Layers} title="Real spaced repetition" accent="#B83A24">
            FSRS schedules each word for the moment you're about to forget it.
            Mastery means the algorithm predicts you'll still know a word three
            weeks out — it can't be faked by tapping buttons.
          </MethodCard>
          <MethodCard icon={BookOpen} title="Stories you can read" accent="#2E3A6E">
            Every story shows how much of it you already know. New words are
            underlined; one tap shows the meaning, one more adds it to your
            deck. Comprehensible input without the hunting.
          </MethodCard>
          <MethodCard icon={GraduationCap} title="Honest progression" accent="#2563C9">
            Levels unlock through a real test, available at 90% mastery and
            passed only at 100%. When you move up, you've genuinely earned it.
          </MethodCard>
        </div>

        {/* Daily loop */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px',
          padding: isMobile ? '22px 18px' : '28px 32px', marginBottom: isMobile ? '40px' : '64px',
          boxShadow: '0 8px 26px rgba(24,24,27,0.05)', textAlign: 'center',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 750, color: 'var(--text)', marginBottom: '18px' }}>
            Your daily loop — about 15 focused minutes
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? '6px' : '14px', flexWrap: 'wrap' }}>
            {loop.map((step, i) => (
              <span key={step.label} style={{ display: 'inline-flex', alignItems: 'center', gap: isMobile ? '6px' : '14px' }}>
                <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: isMobile ? '56px' : '72px' }}>
                  <span style={{
                    width: '42px', height: '42px', borderRadius: '12px',
                    background: SAGE + '14', border: '1px solid ' + SAGE + '2A',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <step.icon size={20} strokeWidth={1.8} color={SAGE_DARK} />
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-muted)' }}>{step.label}</span>
                </span>
                {i < loop.length - 1 && <ArrowRight size={15} strokeWidth={2} color="var(--text-faint)" />}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: isMobile ? '22px' : '26px', fontWeight: 800, color: 'var(--text)', margin: '0 0 20px', letterSpacing: '-0.01em' }}>
            Fifteen minutes a day. Real reading you can feel.
          </h2>
          <CtaButton big onClick={beginTraining}>Build my reading path</CtaButton>
          <div style={{ fontSize: '12.5px', color: 'var(--text-faint)', fontWeight: 600, marginTop: '26px' }}>
            Start free · Core learning is free · No credit card required
          </div>
        </div>

        {/* Footer — community link (hidden until a real Discord invite is set in
            community.js) plus the trust links, which always render: Privacy and
            Terms must be reachable before registration. */}
        <div style={{
          marginTop: isMobile ? '48px' : '72px', paddingTop: '28px',
          borderTop: '1px solid var(--border)', textAlign: 'center',
        }}>
          {isDiscordConfigured() && (
            <>
              <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '16px' }}>
                {BRAND_NAME} is community-driven. Join learners shaping what we build next.
              </div>
              <a
                {...externalLinkProps(DISCORD_INVITE_URL)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  minHeight: '42px', padding: '0 18px', borderRadius: '14px',
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', fontSize: '14px', fontWeight: 650,
                  fontFamily: 'Inter, sans-serif', textDecoration: 'none',
                }}
              >
                <MessagesSquare size={16} strokeWidth={2} color={SAGE_DARK} />
                Join our Discord
              </a>
            </>
          )}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap',
            marginTop: '22px', fontSize: '13px',
          }}>
            {[['/methodology', 'How it teaches'], ['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/support', 'Support']].map(([href, label]) => (
              <a
                key={href}
                href={href}
                // Client-side navigation (the app is already loaded); the href
                // stays real for middle-click / open-in-new-tab.
                onClick={(e) => { e.preventDefault(); navigate(href) }}
                style={{ color: 'var(--text-muted)', fontWeight: 600, textDecoration: 'none' }}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
