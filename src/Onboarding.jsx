import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getLevels } from './utils'
import { track, EVENTS } from './analytics'
import { availableLanguages, languageTheme } from './languageTheme'
import { resolveTiers, TIER_META } from './tiers'
import { PACING } from './priorKnowledge'
import { seedClaim } from './priorKnowledgeSeed'
import { readPreloginPrefs, clearPreloginPrefs } from './prelogin'
import { useIsMobile } from './useIsMobile'
import PlacementTest from './PlacementTest'
import logo from './assets/Hanzi-logo.png'
import bgLogin from './assets/bg-login.webp'
import { BRAND_NAME, heroWordmarkStyle } from './brand'
import { BookOpen, GraduationCap, Lock, Play } from 'lucide-react'

// Setup, after the account. ONE question.
//
// This used to be four screens: a language picker, a tier grid, a daily-goal
// picker and a diagram of the daily loop. The learner had already answered two
// of them before signing up, in different words, and the answers were thrown
// away (docs/ONBOARDING-AUDIT.md). The tutorial now teaches the loop by running
// it, so the only thing left that the app genuinely cannot work out for itself
// is where to start.
//
// Three answers, and only the third one asks anything more:
//
//   new       HSK 1. Nothing else to decide.
//   some      HSK 1 as well — starting a level low costs a few easy reviews,
//             starting it high costs comprehension — with the placement test
//             offered as a link rather than imposed as a step.
//   know      the existing tier rows, including the test that higher tiers have
//             always had to pass. Nothing about that changed.
//
// The daily goal is seeded at the same 10 it always defaulted to and is Settings'
// business from then on; the first session is capped at five cards by
// firstRun.js regardless, from the account's own card count.

const LANGUAGE = availableLanguages(false)[0].key

const ANSWERS = [
  { key: 'new', label: "I'm new to Chinese", level: 1 },
  { key: 'some', label: 'I know some Chinese', level: 1, offerTest: true },
  { key: 'know', label: 'I know my HSK level', tiers: true },
]

// What every new account starts with. Settings owns it afterwards.
export const DEFAULT_DAILY_NEW_CARDS = 10

export default function Onboarding({ session, onComplete }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(LANGUAGE)
  const accentHex = theme.accentHex
  const system = theme.system

  const [answer, setAnswer] = useState(null)
  const [tier, setTier] = useState(null)
  const [placement, setPlacement] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // The public reading test (/how-much-can-you-read) is the one thing outside
  // this screen that can know a starting level. If a visitor took it, their
  // estimate is the starting point — still a choice, never a silent decision.
  const [suggested] = useState(() => {
    const lv = readPreloginPrefs()?.level
    return Number.isInteger(lv) && lv >= 1 && lv <= 9 ? lv : null
  })

  useEffect(() => { track(EVENTS.ONBOARDING_STARTED) }, [])

  // Which levels actually have vocabulary seeded — a level with no content
  // would drop a new learner into an empty queue. Fails open.
  const [seeded, setSeeded] = useState(null)
  useEffect(() => {
    let cancelled = false
    supabase
      .from('vocabulary')
      .select('level')
      .eq('language', LANGUAGE)
      .eq('system', system)
      .eq('is_active', true)
      .then(({ data }) => {
        if (cancelled) return
        setSeeded(data ? Array.from(new Set(data.map(r => r.level))) : null)
      })
    return () => { cancelled = true }
  }, [system])

  const availableLevels = seeded || getLevels(LANGUAGE, system)
  const tiers = resolveTiers(availableLevels)

  async function finish(level) {
    setSaving(true)
    setError('')
    try {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: session.user.id,
        active_language: LANGUAGE,
        daily_new_cards: DEFAULT_DAILY_NEW_CARDS,
      })
      if (profileError) throw profileError

      const { error: trackError } = await supabase.from('language_tracks').upsert({
        user_id: session.user.id,
        language: LANGUAGE,
        system,
        current_level: level,
        is_active: true,
      })
      if (trackError) throw trackError

      // Someone who placed above the first level is treated as already knowing
      // the levels below it, so those words come back as spread-out check-ups
      // rather than vanishing. This used to be a question on a fourth screen;
      // it is now simply what placing high means. Best-effort — a failed seed
      // must never block setup.
      if (level > 1) {
        try {
          const { data: earlier } = await supabase
            .from('vocabulary')
            .select('id')
            .eq('language', LANGUAGE)
            .eq('system', system)
            .eq('is_active', true)
            .lt('level', level)
            .not('level', 'is', null)
            .order('level').order('sort_order')
          const ids = (earlier || []).map(v => v.id)
          if (ids.length) {
            await seedClaim({
              userId: session.user.id,
              vocabIds: ids,
              perDay: PACING[1].perDay,
              source: 'placement',
            })
          }
        } catch (seedErr) {
          console.error('prior-knowledge seed failed', seedErr)
        }
      }

      track(EVENTS.ONBOARDING_COMPLETED, { language: LANGUAGE, level })
      // Only now. The handoff has actually happened — a profile and a track
      // exist — so the transitional state that got the learner here has done
      // its job. Clearing it any earlier (this screen used to do it on mount)
      // meant an app killed mid-setup lost the reading test's estimate and
      // restarted with nothing.
      clearPreloginPrefs()
      onComplete()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const rowStyle = (selected) => ({
    display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left',
    width: '100%', padding: '17px 18px', borderRadius: '16px',
    border: '1.5px solid ' + (selected ? accentHex : 'var(--border)'),
    background: selected
      ? 'color-mix(in srgb, ' + accentHex + ' 9%, var(--surface))'
      : 'var(--surface)',
    cursor: 'pointer', transition: 'border-color 140ms ease, background 140ms ease',
    fontFamily: 'Inter, sans-serif', minHeight: '58px',
  })

  const primary = {
    width: '100%', minHeight: '54px', borderRadius: '16px', border: 'none',
    background: accentHex, color: '#fff', marginTop: '24px',
    fontSize: '16.5px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
    cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
  }

  if (placement && tier) {
    return (
      <div style={shell(isMobile)}>
        <Backdrop />
        <div style={card(isMobile)}>
          <PlacementTest
            language={LANGUAGE}
            system={system}
            level={tier.level}
            accentHex={accentHex}
            fontFamily={theme.font}
            tierLabel={TIER_META[tier.key].label}
            levelLabel={getLevelLabel(LANGUAGE, system, tier.level)}
            onPass={(lvl) => finish(lvl)}
            onCancel={() => { setPlacement(false); setTier(null) }}
            onFallback={() => finish(tiers[0] ? tiers[0].level : 1)}
          />
        </div>
      </div>
    )
  }

  const showTiers = answer === 'know'

  return (
    <div style={shell(isMobile)}>
      <Backdrop />
      <div style={card(isMobile)}>
        <div style={{ textAlign: 'center', marginBottom: '22px' }}>
          <img src={logo} alt="" style={{ width: '42px', height: '42px', objectFit: 'contain', marginBottom: '4px' }} />
          <div style={{ ...heroWordmarkStyle('28px'), margin: 0 }}>{BRAND_NAME}</div>
        </div>

        <h1 id="onboarding-level-prompt" style={{
          fontSize: '22px', fontWeight: 800, textAlign: 'center', color: 'var(--text)',
          margin: '0 0 20px', fontFamily: 'Inter, sans-serif', letterSpacing: '-0.01em',
        }}>
          Where should we start you?
        </h1>

        <div role="radiogroup" aria-labelledby="onboarding-level-prompt" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {ANSWERS.map(a => (
            <button
              key={a.key}
              role="radio"
              aria-checked={answer === a.key}
              onClick={() => { setAnswer(a.key); setTier(null) }}
              style={rowStyle(answer === a.key)}
            >
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{a.label}</span>
            </button>
          ))}
        </div>

        {showTiers && (
          <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tiers.map(t => {
              const meta = TIER_META[t.key]
              const TierIcon = t.key === 'beginner' ? Play : t.key === 'intermediate' ? BookOpen : GraduationCap
              const selected = tier && tier.key === t.key
              return (
                <button key={t.key} onClick={() => setTier(t)} aria-pressed={Boolean(selected)} style={rowStyle(selected)}>
                  <span style={{
                    width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
                    background: 'color-mix(in srgb, ' + accentHex + ' 11%, var(--surface))',
                    border: '1px solid color-mix(in srgb, ' + accentHex + ' 24%, var(--border))',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <TierIcon size={19} strokeWidth={1.85} color={accentHex} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{meta.label}</span>
                      {t.test && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '3px',
                          fontSize: '10px', fontWeight: 700, color: accentHex,
                          background: 'color-mix(in srgb, ' + accentHex + ' 12%, var(--surface))',
                          borderRadius: '999px', padding: '2px 7px',
                        }}>
                          <Lock size={9} strokeWidth={2.4} color={accentHex} /> Quick test
                        </span>
                      )}
                    </span>
                    <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.4 }}>
                      {meta.blurb}
                    </span>
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {getLevelLabel(LANGUAGE, system, t.level)}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {answer === 'some' && (
          <p style={{ margin: '14px 2px 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            We&apos;ll start at {getLevelLabel(LANGUAGE, system, suggested || 1)} — the words you already know
            will go by quickly.{' '}
            <button
              onClick={() => { setAnswer('know'); setTier(null) }}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: accentHex, fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                textDecoration: 'underline', textUnderlineOffset: '3px',
              }}
            >
              Take a quick test instead
            </button>
          </p>
        )}

        {error && <p style={{ color: '#DC2626', fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>{error}</p>}

        <button
          disabled={saving || !answer || (showTiers && !tier)}
          onClick={() => {
            if (!answer) return
            if (showTiers) {
              if (!tier) return
              if (tier.test) { setPlacement(true); return }
              finish(tier.level)
              return
            }
            const chosen = ANSWERS.find(a => a.key === answer)
            // The reading test's estimate wins for someone who says they know
            // some Chinese — they took a test that measured it.
            finish(answer === 'some' && suggested ? suggested : chosen.level)
          }}
          style={{
            ...primary,
            background: (!answer || (showTiers && !tier)) ? 'var(--border)' : accentHex,
            color: (!answer || (showTiers && !tier)) ? 'var(--text-muted)' : '#fff',
          }}
        >
          {saving ? 'Setting up…' : 'Start learning'}
        </button>
      </div>
    </div>
  )
}

function Backdrop() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 0,
      backgroundImage: 'url(' + bgLogin + ')',
      backgroundSize: 'cover', backgroundPosition: 'center',
      opacity: 0.35, pointerEvents: 'none',
    }} />
  )
}

const shell = (isMobile) => ({
  minHeight: '100dvh',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  position: 'relative', background: 'var(--bg)',
  // Rendered outside the shell's <main>, so both insets are this screen's own.
  padding: 'calc(24px + env(safe-area-inset-top, 0px)) ' + (isMobile ? '16px' : '24px')
    + ' calc(24px + env(safe-area-inset-bottom, 0px))',
})

const card = (isMobile) => ({
  position: 'relative', zIndex: 1, width: '100%', maxWidth: '440px',
  background: 'var(--surface)', borderRadius: '20px',
  boxShadow: '0 4px 40px rgba(0,0,0,0.10)',
  padding: isMobile ? '26px 18px 22px' : '34px 34px 30px',
})
