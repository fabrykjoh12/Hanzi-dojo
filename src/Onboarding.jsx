import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel, getLevels } from './utils'
import { track, EVENTS } from './analytics'
import { availableLanguages, languageTheme, LANGUAGES } from './languageTheme'
import { resolveTiers, TIER_META } from './tiers'
import { readPreloginPrefs, clearPreloginPrefs, encouragementFor } from './prelogin'
import PlacementTest from './PlacementTest'
import logo from './assets/Hanzi-logo.png'
import bgLogin from './assets/bg-login.webp'
import { BRAND_NAME, heroWordmarkStyle } from './brand'
import { ArrowRight, BookOpen, GraduationCap, Layers, Lock, PenLine, Play } from 'lucide-react'

// Read the pre-login wizard choices, but only trust a known language. Pure and
// idempotent (a plain read), so it's safe to call from useState initializers.
function initialPrefill() {
  const p = readPreloginPrefs()
  return p && LANGUAGES[p.language] ? p : null
}

// The languages onboarding offers. With non-Chinese tracks paused this is a
// single language, so we skip the picker step and start on "What's your level?"
// pre-selected. Un-pausing a track (see languageTheme.js) restores the picker
// automatically — SOLO_LANGUAGE goes null and the language step reappears.
const ONBOARDING_LANGUAGES = availableLanguages(false)
const SOLO_LANGUAGE = ONBOARDING_LANGUAGES.length === 1 ? ONBOARDING_LANGUAGES[0].key : null

export default function Onboarding({ session, onComplete }) {
  // Skip the language step (start on "What's your level?") when the visitor
  // already picked a language before signing up, OR when only one language is
  // offered — in both cases the choice is already made.
  const [step, setStep] = useState(() => (initialPrefill() || SOLO_LANGUAGE ? 2 : 1))
  const [language, setLanguage] = useState(() => initialPrefill()?.language || SOLO_LANGUAGE || null)
  const [level, setLevel] = useState(null)
  const [tier, setTier] = useState(null)         // selected tier { key, level, test }
  const [placement, setPlacement] = useState(false)  // showing the placement test
  const [goal, setGoal] = useState(10)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // A one-line, reason-aware greeting shown atop the level step for pre-login users.
  const [greeting] = useState(() => {
    const p = initialPrefill()
    return p ? encouragementFor(p.language, p.reason, languageTheme(p.language).languageName) : null
  })

  useEffect(() => { track(EVENTS.ONBOARDING_STARTED) }, [])
  // Consume the pre-login prefs once so returning to onboarding later starts clean.
  useEffect(() => { clearPreloginPrefs() }, [])

  // Data-driven: the language cards + level grid come from the shared config.
  // New signups get the public set (Chinese-only); un-pausing a track restores
  // the picker automatically.
  const languages = ONBOARDING_LANGUAGES
  const selectedTheme = language ? languageTheme(language) : null
  const accentHex = selectedTheme ? selectedTheme.accentHex : '#B83A24'

  // Which levels actually have vocabulary seeded. Levels without content are
  // shown as "Coming soon" instead of dropping a new user into an empty queue.
  // Keyed by language so a stale result never gates the wrong language; while
  // loading (or on fetch failure) everything stays selectable (fail open).
  const [seededData, setSeededData] = useState(null)   // { lang, levels: Set|null }
  useEffect(() => {
    if (!language) return
    let cancelled = false
    supabase
      .from('vocabulary')
      .select('level')
      .eq('language', language)
      .eq('system', languageTheme(language).system)
      .eq('is_active', true)
      .then(({ data }) => {
        if (cancelled) return
        // On a fetch failure, record levels: null (unknown) so the UI fails open
        // to the full level range instead of getting stuck on a spinner.
        setSeededData({ lang: language, levels: data ? new Set(data.map(r => r.level)) : null })
      })
    return () => { cancelled = true }
  }, [language])
  const seededResolved = Boolean(seededData && seededData.lang === language)
  const seededLevels = seededResolved ? seededData.levels : null

  // The proficiency tiers (Beginner / Intermediate / Professional) offered for
  // this language, derived from the levels that actually have seeded content.
  // While the seeded set is still loading we fall back to the full level range.
  const availableLevels = seededLevels
    ? Array.from(seededLevels)
    : (selectedTheme ? getLevels(language, selectedTheme.system) : [])
  const tiers = resolveTiers(availableLevels)
  const tierLevelLabel = (t) => getLevelLabel(language, selectedTheme.system, t.level)

  const handleFinish = async () => {
    setSaving(true)
    setError('')

    try {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: session.user.id,
        active_language: language,
        daily_new_cards: goal,
      })
      if (profileError) throw profileError

      const system = languageTheme(language).system
      const { error: trackError } = await supabase.from('language_tracks').upsert({
        user_id: session.user.id,
        language,
        system,
        current_level: level,
        is_active: true,
      })
      if (trackError) throw trackError

      track(EVENTS.ONBOARDING_COMPLETED, { language, level, goal })
      onComplete()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      padding: '24px',
      background: 'var(--bg)',
    }}>
      {/* Background image */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        backgroundImage: 'url(' + bgLogin + ')',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: 0.35,
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth: '460px',
        background: 'var(--surface)',
        borderRadius: '20px',
        boxShadow: '0 4px 40px rgba(0,0,0,0.10)',
        padding: '40px 40px 36px',
      }}>
        {/* Progress dots — the language step (1) is hidden when only one
            language is offered, so the dots start at the level step. */}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '32px' }}>
          {(SOLO_LANGUAGE ? [2, 3, 4] : [1, 2, 3, 4]).map(n => (
            <div key={n} style={{
              width: step === n ? '24px' : '8px',
              height: '8px',
              borderRadius: '4px',
              background: step >= n ? accentHex : 'var(--border)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        {/* STEP 1: Language */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '6px' }}>
              <img src={logo} alt={BRAND_NAME} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '4px' }} />
              <h1 style={{ ...heroWordmarkStyle('40px'), margin: 0 }}>
                {BRAND_NAME}
              </h1>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>Welcome</div>
            </div>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '28px', marginTop: '8px', fontSize: '14px' }}>
              Which language do you want to learn?
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              {languages.map(lang => {
                const selected = language === lang.key
                return (
                  <button
                    key={lang.key}
                    onClick={() => { setLanguage(lang.key); setLevel(null); setTier(null); setPlacement(false) }}
                    style={{
                      // flex-basis 0 + minWidth 0 keeps all three cards exactly
                      // equal; without it the wider "Русский" label stretched the
                      // Russian card past the two CJK ones.
                      flex: '1 1 0',
                      minWidth: 0,
                      padding: '24px 12px',
                      borderRadius: '14px',
                      border: selected ? ('2px solid ' + lang.accentHex) : '2px solid var(--border)',
                      background: selected ? (lang.accentHex + '0D') : 'var(--surface)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontSize: '34px', lineHeight: 1 }}>{lang.flag}</span>
                    {/* Native name sizes down a touch and never wraps, so a longer
                        label (Русский) fits the equal-width card like the CJK ones. */}
                    <span style={{ fontSize: '23px', fontWeight: 700, color: lang.accentHex, fontFamily: lang.font + ', sans-serif', lineHeight: 1, whiteSpace: 'nowrap', maxWidth: '100%' }}>{lang.nativeName}</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}>{lang.languageName}</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!language}
              style={{
                width: '100%',
                marginTop: '28px',
                padding: '13px',
                borderRadius: '12px',
                border: 'none',
                background: language ? accentHex : 'var(--border)',
                color: language ? 'var(--surface)' : 'var(--text-muted)',
                fontSize: '15px',
                fontWeight: 600,
                cursor: language ? 'pointer' : 'not-allowed',
                fontFamily: 'Inter, sans-serif',
                transition: 'all 0.2s',
              }}
            >
              Continue
            </button>
          </div>
        )}

        {/* STEP 2: Proficiency tier (+ placement test to prove higher tiers) */}
        {step === 2 && (
          <div>
            {placement && tier ? (
              <PlacementTest
                language={language}
                system={selectedTheme.system}
                level={tier.level}
                accentHex={accentHex}
                fontFamily={selectedTheme.font}
                tierLabel={TIER_META[tier.key].label}
                levelLabel={tierLevelLabel(tier)}
                onPass={(lvl) => { setLevel(lvl); setPlacement(false); setStep(3) }}
                onCancel={() => { setPlacement(false); setTier(null); setLevel(null) }}
                onFallback={() => {
                  // Failed the placement — start at the Beginner tier's level.
                  const beginner = tiers[0]
                  setTier(beginner)
                  setLevel(beginner.level)
                  setPlacement(false)
                  setStep(3)
                }}
              />
            ) : (
              <>
                {/* Solo-language direct signups skip the branded step 1, so give
                    the level step a compact welcome. Pre-login users already saw
                    the brand on the landing wizard (they have a greeting). */}
                {SOLO_LANGUAGE && !greeting && (
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <img src={logo} alt={BRAND_NAME} style={{ width: '44px', height: '44px', objectFit: 'contain', marginBottom: '4px' }} />
                    <div style={{ ...heroWordmarkStyle('30px'), margin: 0 }}>{BRAND_NAME}</div>
                  </div>
                )}
                {greeting && (
                  <div style={{
                    fontSize: '13px', color: accentHex, fontWeight: 650, textAlign: 'center',
                    background: accentHex + '0D', border: '1px solid ' + accentHex + '22',
                    borderRadius: '12px', padding: '10px 14px', marginBottom: '18px', lineHeight: 1.5,
                  }}>
                    {greeting}
                  </div>
                )}
                <h1 style={{ fontSize: '22px', fontWeight: 700, textAlign: 'center', color: 'var(--text)', marginBottom: '8px', fontFamily: 'Inter, sans-serif' }}>
                  What's your level?
                </h1>
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '22px', fontSize: '14px', lineHeight: 1.5 }}>
                  Choose where to start. Higher tiers assume you already know the earlier {getSystemLabel(selectedTheme.system)} vocabulary — a quick test proves it.
                </p>

                {!seededResolved ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '14px' }}>
                    Loading levels…
                  </div>
                ) : tiers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6 }}>
                    Content for {selectedTheme.languageName} is coming soon — check back shortly.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {tiers.map(t => {
                      const meta = TIER_META[t.key]
                      const TierIcon = t.key === 'beginner' ? Play : t.key === 'intermediate' ? BookOpen : GraduationCap
                      const selected = tier && tier.key === t.key
                      return (
                        <button
                          key={t.key}
                          onClick={() => setTier(t)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left',
                            padding: '16px 18px', borderRadius: '14px',
                            border: selected ? ('2px solid ' + accentHex) : '2px solid var(--border)',
                            background: selected ? (accentHex + '0D') : 'var(--surface)',
                            cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'Inter, sans-serif',
                          }}
                        >
                          <span style={{
                            width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
                            background: accentHex + '12', border: '1px solid ' + accentHex + '22',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <TierIcon size={20} strokeWidth={1.85} color={accentHex} />
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '15px', fontWeight: 700, color: selected ? accentHex : 'var(--text)' }}>{meta.label}</span>
                              {t.test && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                                  fontSize: '10px', fontWeight: 700, color: accentHex,
                                  background: accentHex + '14', borderRadius: '999px', padding: '2px 7px',
                                }}>
                                  <Lock size={9} strokeWidth={2.4} color={accentHex} /> Placement test
                                </span>
                              )}
                            </span>
                            <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.4 }}>
                              {meta.blurb}
                            </span>
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {tierLevelLabel(t)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
                  {!SOLO_LANGUAGE && (
                    <button onClick={() => { setStep(1); setTier(null); setLevel(null) }} style={backBtn}>Back</button>
                  )}
                  <button
                    onClick={() => {
                      if (!tier) return
                      if (tier.test) { setPlacement(true); return }
                      setLevel(tier.level)
                      setStep(3)
                    }}
                    disabled={!tier}
                    style={{
                      flex: 2,
                      padding: '13px',
                      borderRadius: '12px',
                      border: 'none',
                      background: tier ? accentHex : 'var(--border)',
                      color: tier ? 'var(--surface)' : 'var(--text-muted)',
                      cursor: tier ? 'pointer' : 'not-allowed',
                      fontSize: '15px',
                      fontWeight: 600,
                      fontFamily: 'Inter, sans-serif',
                      transition: 'all 0.2s',
                    }}
                  >
                    {tier && tier.test ? 'Take placement test' : 'Continue'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 3: Daily goal */}
        {step === 3 && (
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, textAlign: 'center', color: 'var(--text)', marginBottom: '8px', fontFamily: 'Inter, sans-serif' }}>
              Set your daily goal
            </h1>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '28px', fontSize: '14px' }}>
              How many new words do you want to learn each day?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { val: 5, label: 'Casual', cards: '5 cards / day', desc: 'A little each day' },
                { val: 10, label: 'Regular', cards: '10 cards / day', desc: 'Steady progress' },
                { val: 15, label: 'Intensive', cards: '15 cards / day', desc: 'Fast track' },
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setGoal(opt.val)}
                  style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: goal === opt.val ? ('2px solid ' + accentHex) : '2px solid var(--border)',
                    background: goal === opt.val ? (accentHex + '0D') : 'var(--surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: goal === opt.val ? accentHex : 'var(--text)', fontFamily: 'Inter, sans-serif' }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.desc}</div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: goal === opt.val ? accentHex : 'var(--text-muted)' }}>
                    {opt.cards}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
              <button onClick={() => setStep(2)} style={backBtn}>Back</button>
              <button
                onClick={() => setStep(4)}
                style={{
                  flex: 2,
                  padding: '13px',
                  borderRadius: '12px',
                  border: 'none',
                  background: accentHex,
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  transition: 'opacity 0.2s',
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: What happens next */}
        {step === 4 && (
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, textAlign: 'center', color: 'var(--text)', marginBottom: '8px', fontFamily: 'Inter, sans-serif' }}>
              Here's your daily loop
            </h1>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '26px', fontSize: '14px', lineHeight: 1.6 }}>
              Review your flashcards, then read a story with the words you just
              practiced. About 15 focused minutes a day.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', flexWrap: 'wrap', marginBottom: '26px' }}>
              {[
                { icon: Layers, label: 'Flashcards' },
                { icon: BookOpen, label: 'Stories' },
                { icon: Play, label: 'Videos' },
                { icon: PenLine, label: 'Writing' },
              ].map((s, i, arr) => (
                <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '7px', minWidth: '66px' }}>
                    <span style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: accentHex + '10', border: '1px solid ' + accentHex + '22',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <s.icon size={19} strokeWidth={1.8} color={accentHex} />
                    </span>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)' }}>{s.label}</span>
                  </span>
                  {i < arr.length - 1 && <ArrowRight size={14} strokeWidth={2} color="var(--text-faint)" />}
                </span>
              ))}
            </div>

            <div style={{
              padding: '14px 16px', borderRadius: '12px', marginBottom: '4px',
              background: accentHex + '0A', border: '1px solid ' + accentHex + '20',
              fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, textAlign: 'center',
            }}>
              Your first session starts with 5 words — just enough to unlock your
              first story. After that you'll learn {goal} new words a day, and each
              word comes back for review right before you'd forget it.
            </div>

            {error && <p style={{ color: '#DC2626', fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setStep(3)} style={backBtn}>Back</button>
              <button
                onClick={handleFinish}
                disabled={saving}
                style={{
                  flex: 2,
                  padding: '13px',
                  borderRadius: '12px',
                  border: 'none',
                  background: accentHex,
                  color: '#fff',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  opacity: saving ? 0.7 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {saving ? 'Setting up...' : 'Start your first session'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const backBtn = {
  flex: 1,
  padding: '13px',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
  fontSize: '15px',
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
  color: 'var(--text)',
}
