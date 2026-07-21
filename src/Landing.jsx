import { useState, useEffect } from 'react'
import Auth from './Auth'
import { track, EVENTS } from './analytics'
import logo from './assets/Hanzi-logo.png'
import bgLogin from './assets/bg-login.webp'
import { BRAND_NAME, heroWordmarkStyle } from './brand'
import { availableLanguages, languageTheme } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { REASONS, encouragementFor, savePreloginPrefs } from './prelogin'
import {
  ArrowLeft, ArrowRight, BookOpen, GraduationCap, Layers, PenLine, Play, Sparkles,
  MessagesSquare,
} from 'lucide-react'
import { DISCORD_INVITE_URL, isDiscordConfigured } from './community'

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

// Centered, calm frame shared by the pre-login wizard steps (pick language, why).
function WizardShell({ isMobile, back, title, subtitle, children }) {
  return (
    <div style={{ minHeight: '100vh', position: 'relative', background: 'var(--bg)' }}>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'url(' + bgLogin + ')',
        backgroundSize: 'cover', backgroundPosition: 'center',
        opacity: 0.22, pointerEvents: 'none',
      }} />
      <button
        onClick={back}
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
      <div style={{
        position: 'relative', zIndex: 1, minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? '72px 20px 40px' : '80px 32px 56px', textAlign: 'center',
      }}>
        <img src={logo} alt={BRAND_NAME + ' logo'} style={{ width: '46px', height: '46px', objectFit: 'contain', marginBottom: '18px' }} />
        <h1 style={{
          fontSize: isMobile ? '25px' : '32px', fontWeight: 800, color: 'var(--text)',
          lineHeight: 1.2, letterSpacing: '-0.02em', margin: '0 0 10px', fontFamily: 'Inter, sans-serif',
        }}>
          {title}
        </h1>
        <p style={{ fontSize: isMobile ? '14px' : '15px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 auto 28px', maxWidth: '440px' }}>
          {subtitle}
        </p>
        {children}
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
  // Flow: landing → pick a language → why you're learning → auth (signup).
  // "Log in" jumps straight to auth for returning users (no wizard).
  const [mode, setMode] = useState('landing')   // 'landing' | 'lang' | 'why' | 'auth'
  const [pickedLang, setPickedLang] = useState(null)
  const [pickedReason, setPickedReason] = useState(null)
  const isMobile = useIsMobile()
  // Pre-login: no account context yet, so the landing wizard always shows the
  // public set (Chinese-only). Gated tracks appear after sign-in on an admin
  // account via the language switcher.
  const languages = availableLanguages(false)

  useEffect(() => { track(EVENTS.LANDING_VIEWED) }, [])

  // With non-Chinese tracks paused there's a single language, so the picker
  // step is skipped and the wizard goes straight to "why". Un-pausing a track
  // brings the picker back automatically (soloLang goes null).
  const soloLang = languages.length === 1 ? languages[0].key : null

  // Enter the wizard, optionally pre-selecting a language (from a chip tap).
  // Falls back to the sole language when only one is offered.
  const startWizard = (langKey = null) => {
    const chosen = langKey || soloLang
    if (chosen) {
      setPickedLang(chosen)
      track(EVENTS.PRELOGIN_LANGUAGE_PICKED, { language: chosen })
      setMode('why')
    } else {
      setMode('lang')
    }
  }

  const chooseLanguage = (langKey) => {
    setPickedLang(langKey)
    track(EVENTS.PRELOGIN_LANGUAGE_PICKED, { language: langKey })
    setMode('why')
  }

  const chooseReason = (reasonKey) => {
    setPickedReason(reasonKey)
    track(EVENTS.PRELOGIN_REASON_PICKED, { language: pickedLang, reason: reasonKey })
    // Persist for the post-signup Onboarding to pre-fill language + greet by reason.
    savePreloginPrefs({ language: pickedLang, reason: reasonKey })
    track(EVENTS.PRELOGIN_SIGNUP_STARTED, { language: pickedLang, reason: reasonKey })
    setMode('auth')
  }

  const backChip = (onClick) => (
    <button
      onClick={onClick}
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
  )

  if (mode === 'lang') {
    return (
      <WizardShell isMobile={isMobile} back={() => setMode('landing')}
        title="Which language are you learning?"
        subtitle="Pick one to start — you can add the others any time.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '420px' }}>
          {languages.map(lang => (
            <button
              key={lang.key}
              onClick={() => chooseLanguage(lang.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '16px 18px', borderRadius: '16px', cursor: 'pointer',
                background: 'var(--surface)', border: '1px solid ' + lang.accentHex + '33',
                boxShadow: '0 4px 14px rgba(24,24,27,0.05)', textAlign: 'left',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <span style={{ fontSize: '26px' }}>{lang.flag}</span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '17px', fontWeight: 750, color: 'var(--text)' }}>{lang.languageName}</span>
                <span style={{ fontSize: '14px', fontWeight: 650, color: lang.accentHex, fontFamily: lang.font }}>{lang.nativeName}</span>
              </span>
              <ArrowRight size={18} strokeWidth={2} color="var(--text-faint)" style={{ marginLeft: 'auto' }} />
            </button>
          ))}
        </div>
      </WizardShell>
    )
  }

  if (mode === 'why') {
    const lang = languageTheme(pickedLang)
    return (
      <WizardShell isMobile={isMobile} back={() => setMode('lang')}
        title={`Why are you learning ${lang.languageName}?`}
        subtitle="This tailors your first stories and encouragement. There's no wrong answer.">
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '12px', width: '100%', maxWidth: '520px',
        }}>
          {REASONS.map(r => (
            <button
              key={r.key}
              onClick={() => chooseReason(r.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '15px 16px', borderRadius: '15px', cursor: 'pointer',
                background: 'var(--surface)', border: '1px solid var(--border)',
                boxShadow: '0 4px 14px rgba(24,24,27,0.05)', textAlign: 'left',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <span style={{ fontSize: '22px' }}>{r.emoji}</span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{r.label}</span>
            </button>
          ))}
        </div>
      </WizardShell>
    )
  }

  if (mode === 'auth') {
    const intro = pickedLang
      ? encouragementFor(pickedLang, pickedReason, languageTheme(pickedLang).languageName)
      : null
    return (
      <div style={{ position: 'relative' }}>
        {backChip(() => setMode(pickedReason ? 'why' : 'landing'))}
        <Auth intro={intro} />
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
            Reading-first Chinese, Japanese & Russian
          </div>
          <h1 style={{
            fontSize: isMobile ? '34px' : '46px', fontWeight: 800, color: 'var(--text)',
            lineHeight: 1.15, letterSpacing: '-0.02em', margin: '0 0 18px',
            fontFamily: 'Inter, sans-serif',
          }}>
            Learn words. Unlock stories you can actually read.
          </h1>
          <p style={{ fontSize: isMobile ? '15px' : '17px', color: 'var(--text-muted)', lineHeight: 1.65, margin: '0 auto 28px', maxWidth: '560px' }}>
            {BRAND_NAME} pairs FSRS flashcards with graded mini-stories matched to
            your known vocabulary — so every study session turns into real reading,
            not another streak.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
            <CtaButton big onClick={() => startWizard()}>Start your first story</CtaButton>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <a href="/how-much-can-you-read" style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '14px', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
              Or find out how much Chinese you can already read — 60-second test →
            </a>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-faint)', fontWeight: 600, marginBottom: isMobile ? '40px' : '56px' }}>
            Start free. No credit card. Learn your first words and unlock your first story in minutes.
          </div>

          {/* Language chips — a shortcut to start a specific language. Hidden
              when only one is offered (the CTA above already covers it). */}
          {!soloLang && (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: isMobile ? '44px' : '64px' }}>
              {languages.map(lang => (
                <button key={lang.key} onClick={() => startWizard(lang.key)} style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
                  width: isMobile ? '140px' : '160px', height: '46px', padding: '0 16px', borderRadius: '999px',
                  background: 'var(--surface)', border: '1px solid ' + lang.accentHex + '33',
                  boxShadow: '0 4px 14px rgba(24,24,27,0.05)', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}>
                  <span style={{ fontSize: '17px', fontWeight: 700, color: lang.accentHex, fontFamily: lang.font }}>{lang.nativeName}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{SYSTEM_LABELS[lang.key]}</span>
                </button>
              ))}
            </div>
          )}
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
            Fifteen minutes a day. Real reading you can feel.
          </h2>
          <CtaButton big onClick={() => startWizard()}>Build my reading path</CtaButton>
          <div style={{ fontSize: '12.5px', color: 'var(--text-faint)', fontWeight: 600, marginTop: '26px' }}>
            Start free · Core learning is free · No credit card required
          </div>
        </div>

        {/* Footer — community link, hidden until a real Discord invite is set in community.js */}
        {isDiscordConfigured() && (
          <div style={{
            marginTop: isMobile ? '48px' : '72px', paddingTop: '28px',
            borderTop: '1px solid var(--border)', textAlign: 'center',
          }}>
            <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '16px' }}>
              {BRAND_NAME} is community-driven. Join learners shaping what we build next.
            </div>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
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
          </div>
        )}
      </div>
    </div>
  )
}
