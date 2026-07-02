import { useState } from 'react'
import Auth from './Auth'
import logo from './assets/Hanzi-logo.png'
import bgLogin from './assets/bg-login.webp'
import { BRAND_NAME, heroWordmarkStyle } from './brand'
import { languageList } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import {
  ArrowLeft, ArrowRight, BookOpen, GraduationCap, Layers, PenLine, Play, Sparkles,
} from 'lucide-react'

const SAGE = '#6E8466'
const SAGE_DARK = '#5C7155'
const SYSTEM_LABELS = { chinese: 'HSK 3.0', japanese: 'JLPT', russian: 'CEFR' }

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
function FlashcardMock() {
  const grades = [
    { label: 'Again', color: '#DC2626' },
    { label: 'Hard', color: '#D97706' },
    { label: 'Good', color: '#3E63DD' },
    { label: 'Easy', color: '#2F9E6D' },
  ]
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '22px',
      padding: '26px 24px 20px', boxShadow: '0 24px 60px rgba(24,24,27,0.10)', textAlign: 'center',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 11px',
        borderRadius: '999px', background: '#B83A2410', border: '1px solid #B83A2418',
        color: '#B83A24', fontSize: '11px', fontWeight: 750, marginBottom: '14px',
      }}>
        <Sparkles size={12} strokeWidth={2} color="#B83A24" /> Review · due now
      </div>
      <div style={{ fontSize: '56px', color: 'var(--text)', fontFamily: "'Noto Sans SC'", lineHeight: 1.1 }}>朋友</div>
      <div style={{ fontSize: '15px', color: '#B83A24', fontWeight: 650, marginTop: '8px' }}>péngyou</div>
      <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '18px' }}>friend</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '7px' }}>
        {grades.map(g => (
          <div key={g.label} style={{
            padding: '9px 4px', borderRadius: '11px',
            background: g.color + '0D', border: '1px solid ' + g.color + '30',
            color: g.color, fontSize: '12px', fontWeight: 750,
          }}>
            {g.label}
          </div>
        ))}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '12px', fontWeight: 600 }}>
        Intervals predicted by FSRS — 10 min · 1 day · 4 days · 9 days
      </div>
    </div>
  )
}

// Stylized story-reader mock — the "% known" differentiator, made visible.
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
export default function Landing() {
  const [mode, setMode] = useState('landing')   // 'landing' | 'auth'
  const isMobile = useIsMobile()
  const languages = languageList()

  if (mode === 'auth') {
    return (
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setMode('landing')}
          style={{
            position: 'fixed', top: '18px', left: '18px', zIndex: 5,
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            padding: '9px 14px', borderRadius: '12px',
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650,
            fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(24,24,27,0.08)',
          }}
        >
          <ArrowLeft size={15} strokeWidth={2} color="var(--text-muted)" />
          Back
        </button>
        <Auth />
      </div>
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
            Free forever · No ads · No paywall
          </div>
          <h1 style={{
            fontSize: isMobile ? '34px' : '46px', fontWeight: 800, color: 'var(--text)',
            lineHeight: 1.15, letterSpacing: '-0.02em', margin: '0 0 18px',
            fontFamily: 'Inter, sans-serif',
          }}>
            Learn Chinese, Japanese, and Russian the way that actually works.
          </h1>
          <p style={{ fontSize: isMobile ? '15px' : '17px', color: 'var(--text-muted)', lineHeight: 1.65, margin: '0 auto 28px', maxWidth: '560px' }}>
            {BRAND_NAME} pairs real spaced repetition (FSRS) with stories matched
            to the words you already know — every session builds memory, and
            every story is one you can actually read.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
            <CtaButton big onClick={() => setMode('auth')}>Start learning free</CtaButton>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-faint)', fontWeight: 600, marginBottom: isMobile ? '40px' : '56px' }}>
            No credit card. No trial clock. Sign up and study.
          </div>

          {/* Language chips */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: isMobile ? '44px' : '64px' }}>
            {languages.map(lang => (
              <div key={lang.key} style={{
                display: 'inline-flex', alignItems: 'center', gap: '9px',
                padding: '9px 16px', borderRadius: '999px',
                background: 'var(--surface)', border: '1px solid ' + lang.accentHex + '33',
                boxShadow: '0 4px 14px rgba(24,24,27,0.05)',
              }}>
                <span style={{ fontSize: '17px', fontWeight: 700, color: lang.accentHex, fontFamily: lang.font }}>{lang.nativeName}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{SYSTEM_LABELS[lang.key]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Product mocks */}
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '20px', maxWidth: '820px', margin: '0 auto', marginBottom: isMobile ? '44px' : '72px',
          alignItems: 'start',
        }}>
          <FlashcardMock />
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
            Fifteen minutes a day. Genuinely free.
          </h2>
          <CtaButton big onClick={() => setMode('auth')}>Start learning free</CtaButton>
          <div style={{ fontSize: '12.5px', color: 'var(--text-faint)', fontWeight: 600, marginTop: '26px' }}>
            {BRAND_NAME} is a community project. If it ever needs money, it will ask for donations — never put learning behind a paywall.
          </div>
        </div>
      </div>
    </div>
  )
}
