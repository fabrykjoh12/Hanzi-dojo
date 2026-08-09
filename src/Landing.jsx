import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Auth from './Auth'
import { track, EVENTS } from './analytics'
import logo from './assets/Hanzi-logo.png'
import bgLogin from './assets/bg-login.webp'
import { BRAND_INK, BRAND_NAME, heroWordmarkStyle } from './brand'
import { availableLanguages, ink, languageTheme } from './languageTheme'
import PathBuilding from './PathBuilding'
import FlashcardIntro from './FlashcardIntro'
import MicroStory from './MicroStory'
import EncounterComplete from './EncounterComplete'
import {
  EXPERIENCE_LEVELS, DEFAULT_EXPERIENCE, PURPOSES, primaryReason,
  DEFAULT_STYLE, DAILY_PLANS, DEFAULT_MINUTES, planEstimate,
} from './onboardingPath'
import { FLAGS } from './flags'
import { useIsMobile } from './useIsMobile'
import { encouragementFor, savePreloginPrefs, readPreloginPrefs, initialLandingMode } from './prelogin'
import { isNativeApp } from './nativeShell'
import NativeWelcome from './NativeWelcome'
import {
  ArrowLeft, ArrowRight, BookOpen, GraduationCap, Layers, PenLine, Play, Sparkles,
  MessagesSquare,
} from 'lucide-react'
import { DISCORD_INVITE_URL, isDiscordConfigured } from './community'
import { externalLinkProps } from './externalLink'

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

// Calm frame shared by the pre-login wizard steps. Header is IN FLOW — a back
// button and progress dots on one row — so nothing ever overlaps the content
// (the old fixed chip sat on top of whatever scrolled under it). Content is
// top-aligned: vertically centring a short list leaves the screen looking
// half-loaded on a phone. Inside the app the ground stays flat, matching the
// welcome screen; the texture is web garnish.
function WizardShell({ isMobile, back, step, steps = 3, title, subtitle, children }) {
  return (
    <div style={{ minHeight: '100dvh', position: 'relative', background: 'var(--bg)' }}>
      {!isNativeApp() && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0,
          backgroundImage: 'url(' + bgLogin + ')',
          backgroundSize: 'cover', backgroundPosition: 'center',
          opacity: 0.22, pointerEvents: 'none',
        }} />
      )}
      <div style={{
        position: 'relative', zIndex: 1, minHeight: '100dvh',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 'calc(10px + env(safe-area-inset-top, 0px)) 20px calc(28px + env(safe-area-inset-bottom, 0px))',
        textAlign: 'center',
      }}>
        {/* Header row: back on the left, dots dead centre, spacer on the right
            so the dots stay centred. */}
        <div style={{
          width: '100%', maxWidth: '520px', display: 'flex', alignItems: 'center',
          minHeight: '44px', marginBottom: isMobile ? '18px' : '30px',
        }}>
          <button
            onClick={back}
            aria-label="Back"
            style={{
              width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '12px', border: 'none', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '-8px',
            }}
          >
            <ArrowLeft size={22} strokeWidth={2} color="var(--text-muted)" />
          </button>
          {step ? (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '7px' }} aria-hidden="true">
              {Array.from({ length: steps }, (_, i) => (
                <span key={i} style={{
                  width: i + 1 === step ? '22px' : '7px', height: '7px', borderRadius: '999px',
                  background: i + 1 <= step ? BRAND_INK : 'var(--border)',
                  transition: 'width 200ms ease',
                }} />
              ))}
            </div>
          ) : <div style={{ flex: 1 }} />}
          <div style={{ width: '40px', marginRight: '-8px' }} />
        </div>

        {title ? (
          <h1 style={{
            fontSize: isMobile ? '24px' : '30px', fontWeight: 800, color: 'var(--text)',
            lineHeight: 1.25, letterSpacing: '-0.02em', margin: '0 0 8px',
            fontFamily: 'Inter, sans-serif', maxWidth: '420px',
          }}>
            {title}
          </h1>
        ) : null}
        {subtitle ? (
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.55, margin: '0 auto 24px', maxWidth: '400px' }}>
            {subtitle}
          </p>
        ) : null}
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
// `authNotice` — set when the visitor arrived from an auth link that could not
// be completed (an expired or wrong-device password-reset link). It skips the
// wizard entirely: someone who came here to finish resetting a password should
// land on the form, with the reason, not at the top of an onboarding funnel.
export default function Landing({ authNotice = null }) {
  // The first-encounter flow (owner's design, 2026-08-08): entrance →
  // flashcard (你好, flipped) → micro-story (met in a tea shop, used once) →
  // completion → the three setup questions → the assembled path → THEN the
  // account. Demonstration before questions, questions before the ask: by the
  // time anyone is asked to type an email they have learned a word, used it,
  // and watched a plan assemble from their own answers. Every question is
  // skippable. FLAGS.WOW_ONBOARDING off collapses it to entrance → auth.
  // 'landing' (web marketing page) | 'welcome' (the app's own first screen)
  // | 'lang' | 'flashcard' | 'story' | 'firstdone' | 'experience'
  // | 'purpose' | 'minutes' | 'building' | 'auth'
  //
  // The current step persists through prelogin prefs, so an accidental app
  // close resumes where the visitor was instead of forcing a restart. Only
  // wizard steps resume — never 'auth' (a returning visitor who bailed at
  // the form should land on the welcome, not be trapped at signup).
  const RESUMABLE = ['flashcard', 'story', 'firstdone', 'experience', 'purpose', 'minutes', 'building']
  const [mode, setModeRaw] = useState(() => {
    if (authNotice) return 'auth'
    const saved = readPreloginPrefs()
    if (saved && RESUMABLE.indexOf(saved.wizardStep) !== -1) return saved.wizardStep
    return initialLandingMode(isNativeApp())
  })
  const setMode = (next) => {
    setModeRaw(next)
    // Merge, never replace: the step must not wipe answers saved so far.
    const prior = readPreloginPrefs() || {}
    savePreloginPrefs({ ...prior, wizardStep: RESUMABLE.indexOf(next) !== -1 ? next : null })
  }
  const [pickedLang, setPickedLang] = useState(() => readPreloginPrefs()?.language || null)
  const [experience, setExperience] = useState(() => readPreloginPrefs()?.experience || null)
  const [purposes, setPurposes] = useState(() => readPreloginPrefs()?.purposes || [])
  const [style] = useState(DEFAULT_STYLE)   // the style question was cut 2026-08-08; the pref stays for downstream compat
  const [minutes, setMinutes] = useState(() => readPreloginPrefs()?.minutesPerDay || DEFAULT_MINUTES)
  const isMobile = useIsMobile()
  const navigate = useNavigate()
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
      setMode(FLAGS.WOW_ONBOARDING ? 'flashcard' : 'auth')
    } else {
      setMode('lang')
    }
  }

  const chooseLanguage = (langKey) => {
    setPickedLang(langKey)
    track(EVENTS.PRELOGIN_LANGUAGE_PICKED, { language: langKey })
    setMode(FLAGS.WOW_ONBOARDING ? 'flashcard' : 'auth')
  }

  const chooseExperience = (key) => {
    setExperience(key)
    setMode('purpose')
  }

  const togglePurpose = (key) => {
    setPurposes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  // Questions answered (or skipped — the defaults are real answers). Persist
  // everything the post-signup onboarding can use, then assemble the path.
  // The story is done — 你好 was discovered and used. Record the encounter in
  // the structure the post-signup flow already reads (tastedWords), so the
  // first-mission welcome can greet by it. Recorded at the moment it became
  // true, not at signup: an accidental close between here and the form must
  // not lose the fact.
  const finishEncounter = () => {
    const prior = readPreloginPrefs() || {}
    savePreloginPrefs({ ...prior, language: pickedLang, tastedWords: ['你好'], wizardStep: 'firstdone' })
    track(EVENTS.TASTE_COMPLETED, { reason: primaryReason(purposes), revealed: true, count: 1 })
    setModeRaw('firstdone')
  }

  const finishQuestions = (chosenMinutes) => {
    const exp = EXPERIENCE_LEVELS.find(e => e.key === experience) || null
    const reason = primaryReason(purposes)
    track(EVENTS.PRELOGIN_REASON_PICKED, {
      language: pickedLang, reason,
      purposes: purposes.length, experience: experience || 'skipped',
      style, minutes: chosenMinutes,
    })
    const prior = readPreloginPrefs() || {}
    savePreloginPrefs({
      ...prior,
      language: pickedLang, reason,
      experience: experience || DEFAULT_EXPERIENCE,
      startLevel: exp ? exp.startLevel : 1,
      placementLater: Boolean(exp && exp.placementLater),
      purposes, style, minutesPerDay: chosenMinutes,
      wizardStep: 'building',
    })
    setModeRaw('building')
  }


  // The store apps open here instead of the marketing page.
  if (mode === 'welcome') {
    return (
      <NativeWelcome
        onStart={() => startWizard()}
        onLogIn={() => setMode('auth')}
      />
    )
  }

  // Row style shared by the question screens: one lane of identical rows,
  // one ink accent, selection shown with a tint + check.
  const questionRow = (selected) => ({
    display: 'flex', alignItems: 'center', gap: '14px',
    minHeight: '58px', padding: '10px 14px',
    borderRadius: '16px', cursor: 'pointer',
    background: selected
      ? 'color-mix(in srgb, ' + BRAND_INK + ' 8%, var(--surface))'
      : 'var(--surface)',
    border: '1px solid ' + (selected ? BRAND_INK : 'var(--border)'),
    boxShadow: '0 1px 4px rgba(24,24,27,0.04)', textAlign: 'left',
    fontFamily: 'Inter, sans-serif',
    transition: 'background 140ms ease, border-color 140ms ease',
  })

  const continueBtn = (onClick, label = 'Continue') => (
    <button
      onClick={onClick}
      style={{
        width: '100%', minHeight: '54px', borderRadius: '999px', border: 'none',
        background: 'var(--text)', color: 'var(--bg)',
        fontSize: '16.5px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer', marginTop: '6px',
      }}
    >
      {label}
    </button>
  )

  const skipBtn = (onClick) => (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', color: 'var(--text-faint)',
        fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', padding: '6px',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      Skip — you can change this later
    </button>
  )

  if (mode === 'lang') {
    return (
      <WizardShell isMobile={isMobile} back={() => setMode(initialLandingMode(isNativeApp()))}
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

  if (mode === 'flashcard') {
    return (
      <WizardShell isMobile={isMobile} back={() => setMode(initialLandingMode(isNativeApp()))}
        title="Your first flashcard"
        subtitle="This is how every word starts.">
        <FlashcardIntro onSeeStory={() => { track(EVENTS.TASTE_SHOWN, { reason: 'encounter' }); setMode('story') }} />
      </WizardShell>
    )
  }

  if (mode === 'story') {
    return (
      <WizardShell isMobile={isMobile} back={() => setMode('flashcard')}
        title="Now meet it in a story"
        subtitle="A tea shop, a shopkeeper, and the word you just learned.">
        <MicroStory onComplete={finishEncounter} />
      </WizardShell>
    )
  }

  if (mode === 'firstdone') {
    return (
      <WizardShell isMobile={isMobile} back={() => setMode('story')}
        title=""
        subtitle="">
        <EncounterComplete onContinue={() => setMode('experience')} />
      </WizardShell>
    )
  }

  if (mode === 'experience') {
    return (
      <WizardShell isMobile={isMobile} back={() => setMode('firstdone')} step={1} steps={3}
        title="How much Chinese do you know?"
        subtitle="An honest guess is plenty — nothing here is locked in.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '400px' }}>
          {EXPERIENCE_LEVELS.map(e => (
            <button key={e.key} onClick={() => chooseExperience(e.key)} style={questionRow(false)}>
              <span style={{ fontSize: '16px', fontWeight: 650, color: 'var(--text)' }}>{e.label}</span>
            </button>
          ))}
          {skipBtn(() => chooseExperience(DEFAULT_EXPERIENCE))}
        </div>
      </WizardShell>
    )
  }

  if (mode === 'purpose') {
    return (
      <WizardShell isMobile={isMobile} back={() => setMode('experience')} step={2} steps={3}
        title="Why are you learning Chinese?"
        subtitle="Pick everything that applies — it tunes your stories and examples.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '400px' }}>
          {PURPOSES.map(pp => {
            const selected = purposes.includes(pp.key)
            return (
              <button key={pp.key} onClick={() => togglePurpose(pp.key)} aria-pressed={selected} style={questionRow(selected)}>
                <span aria-hidden="true" lang="zh-Hans" style={{
                  width: '42px', height: '42px', borderRadius: '13px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'color-mix(in srgb, ' + BRAND_INK + ' 9%, var(--surface))',
                  color: ink(BRAND_INK), fontSize: '21px', fontWeight: 600,
                  fontFamily: "'Noto Sans SC', sans-serif", lineHeight: 1,
                }}>
                  {pp.hanzi}
                </span>
                <span style={{ flex: 1, fontSize: '16px', fontWeight: 650, color: 'var(--text)' }}>{pp.label}</span>
                {selected && <Sparkles size={17} strokeWidth={2} color={ink(BRAND_INK)} />}
              </button>
            )
          })}
          {continueBtn(() => setMode('minutes'))}
        </div>
      </WizardShell>
    )
  }

  if (mode === 'minutes') {
    return (
      <WizardShell isMobile={isMobile} back={() => setMode('purpose')} step={3} steps={3}
        title="How much would you like to train each day?"
        subtitle={planEstimate(minutes)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '400px' }}>
          {DAILY_PLANS.map(plan => {
            const selected = minutes === plan.minutes
            return (
              <button key={plan.minutes} onClick={() => setMinutes(plan.minutes)} aria-pressed={selected} style={questionRow(selected)}>
                <span style={{ flex: 1, fontSize: '16px', fontWeight: 650, color: 'var(--text)' }}>
                  {plan.minutes} minutes
                </span>
                <span style={{ fontSize: '13.5px', fontWeight: 650, color: selected ? ink(BRAND_INK) : 'var(--text-muted)' }}>
                  {plan.label}
                </span>
              </button>
            )
          })}
          {continueBtn(() => finishQuestions(minutes))}
        </div>
      </WizardShell>
    )
  }

  if (mode === 'building') {
    return (
      <WizardShell isMobile={isMobile} back={() => setMode('minutes')}
        title="Preparing your training path…"
        subtitle="Built from your answers — every line of it is changeable later.">
        <PathBuilding
          ctaLabel="Save my path"
          choices={{ experience, purposes, minutes }}
          onContinue={() => {
            track(EVENTS.PRELOGIN_SIGNUP_STARTED, { language: pickedLang, reason: primaryReason(purposes) })
            setMode('auth')
          }}
        />
      </WizardShell>
    )
  }

  if (mode === 'auth') {
    const intro = pickedLang
      ? encouragementFor(pickedLang, primaryReason(purposes), languageTheme(pickedLang).languageName)
      : null
    return (
      <Auth
        intro={intro}
        notice={authNotice}
        onBack={() => setMode(experience ? 'minutes' : initialLandingMode(isNativeApp()))}
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
            <CtaButton big onClick={() => startWizard()}>Start your first story</CtaButton>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <a href="/how-much-can-you-read" style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '14px', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
              Or find out how much Chinese you can already read — free 3-minute test →
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
