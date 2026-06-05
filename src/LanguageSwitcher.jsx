import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const LANGUAGES = [
  {
    code: 'chinese',
    system: 'hsk_3',
    name: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    levels: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    levelLabel: (l) => 'HSK ' + l,
    systemLabel: 'HSK 3.0',
    accent: '#B83A24',
  },
  {
    code: 'japanese',
    system: 'jlpt',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
    levels: [5, 4, 3, 2, 1],
    levelLabel: (l) => 'N' + l,
    systemLabel: 'JLPT',
    accent: '#2E3A6E',
  },
]

function LanguageCard({ lang, track, prog, isActive, saving, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={!isActive && !saving ? onClick : undefined}
      onMouseEnter={() => !isActive && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff', borderRadius: '18px',
        border: '2px solid ' + (isActive ? lang.accent : hovered ? lang.accent + '55' : '#E7E5E4'),
        boxShadow: hovered && !isActive ? '0 8px 24px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hovered && !isActive ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        cursor: isActive ? 'default' : 'pointer',
        padding: '22px 24px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: prog ? '16px' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '28px' }}>{lang.flag}</span>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#18181B' }}>{lang.name}</div>
            <div style={{ fontSize: '13px', color: '#71717A' }}>
              {lang.systemLabel} · {lang.levelLabel(track.current_level)}
            </div>
          </div>
        </div>
        {isActive ? (
          <span style={{
            fontSize: '11px', fontWeight: 700, color: lang.accent,
            background: lang.accent + '15', padding: '4px 10px',
            borderRadius: '20px', border: '1px solid ' + lang.accent + '30',
          }}>
            ACTIVE
          </span>
        ) : (
          <span style={{ color: lang.accent, fontSize: '16px' }}>→</span>
        )}
      </div>
      {prog && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px' }}>
            <span style={{ color: '#71717A' }}>Words mastered</span>
            <span style={{ fontWeight: 600, color: '#18181B' }}>{prog.easyCount} / {prog.totalWords}</span>
          </div>
          <div style={{ height: '5px', background: '#E7E5E4', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '3px',
              background: 'linear-gradient(90deg, ' + lang.accent + ', ' + lang.accent + 'aa)',
              width: prog.pct + '%', transition: 'width .6s ease',
            }} />
          </div>
        </>
      )}
    </div>
  )
}

function NotStartedCard({ lang, onStart }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff', borderRadius: '18px',
        border: '2px dashed ' + (hovered ? lang.accent + '66' : '#E7E5E4'),
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.06)' : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        cursor: 'pointer', padding: '22px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '28px', opacity: 0.6 }}>{lang.flag}</span>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#18181B' }}>{lang.name}</div>
          <div style={{ fontSize: '13px', color: '#71717A' }}>Not started yet</div>
        </div>
      </div>
      <span style={{
        fontSize: '13px', fontWeight: 600, color: lang.accent,
        background: lang.accent + '10', padding: '6px 14px',
        borderRadius: '20px', border: '1px solid ' + lang.accent + '30',
        whiteSpace: 'nowrap',
      }}>
        Start →
      </span>
    </div>
  )
}

export default function LanguageSwitcher({ session, profile, onSwitch, onBack }) {
  const [tracks, setTracks] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(null)
  const [selectedLevel, setSelectedLevel] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadTracks() }, [])

  const loadTracks = async () => {
    setLoading(true)

    const { data: tracksData } = await supabase
      .from('language_tracks')
      .select('*')
      .eq('user_id', session.user.id)

    setTracks(tracksData || [])

    const { data: allCards } = await supabase
      .from('cards')
      .select('vocab_id, is_easy')
      .eq('user_id', session.user.id)

    const progressMap = {}
    for (const track of (tracksData || [])) {
      const { data: vocab } = await supabase
        .from('vocabulary')
        .select('id')
        .eq('language', track.language)
        .eq('system', track.system)
        .eq('level', track.current_level)
        .eq('is_active', true)

      const vocabIds = new Set((vocab || []).map(v => v.id))
      const levelCards = (allCards || []).filter(c => vocabIds.has(c.vocab_id))
      const easyCount = levelCards.filter(c => c.is_easy).length
      const totalWords = vocabIds.size

      progressMap[track.language] = {
        easyCount,
        totalWords,
        pct: totalWords > 0 ? Math.round(easyCount / totalWords * 100) : 0,
      }
    }

    setProgress(progressMap)
    setLoading(false)
  }

  const switchTo = async (langCode) => {
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ active_language: langCode })
      .eq('id', session.user.id)
    onSwitch(langCode)
  }

  const startLanguage = async (lang) => {
    if (!selectedLevel) return
    setSaving(true)

    await supabase.from('language_tracks').insert({
      user_id: session.user.id,
      language: lang.code,
      system: lang.system,
      current_level: selectedLevel,
      is_active: true,
    })

    await supabase
      .from('profiles')
      .update({ active_language: lang.code })
      .eq('id', session.user.id)

    onSwitch(lang.code)
  }

  if (loading) {
    return (
      <div style={center}>
        <div style={{ fontSize: '32px', color: '#B83A24', fontFamily: "'Noto Sans SC'" }}>学</div>
      </div>
    )
  }

  // ── Mini level picker ──────────────────────────────────────────────────
  if (starting) {
    const lang = LANGUAGES.find(l => l.code === starting)
    return (
      <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 24px 60px' }}>
          <button
            onClick={() => { setStarting(null); setSelectedLevel(null) }}
            style={backBtnStyle}
          >
            ← Back
          </button>

          <div style={{ marginTop: '28px', marginBottom: '32px' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>{lang.flag}</div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#18181B', marginBottom: '6px' }}>
              Start {lang.name}
            </h1>
            <p style={{ fontSize: '14px', color: '#71717A' }}>
              Choose your starting level. Starting higher assumes you already know the earlier levels.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '32px' }}>
            {lang.levels.map(lvl => (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                style={{
                  padding: '18px 8px', borderRadius: '12px',
                  border: '2px solid ' + (selectedLevel === lvl ? lang.accent : '#E7E5E4'),
                  background: selectedLevel === lvl ? lang.accent + '10' : '#fff',
                  color: selectedLevel === lvl ? lang.accent : '#18181B',
                  fontSize: '15px', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 180ms ease', fontFamily: 'Inter, sans-serif',
                }}
              >
                {lang.levelLabel(lvl)}
              </button>
            ))}
          </div>

          <button
            onClick={() => startLanguage(lang)}
            disabled={!selectedLevel || saving}
            style={{
              width: '100%', padding: '14px', borderRadius: '12px',
              border: 'none', background: lang.accent, color: '#fff',
              fontSize: '15px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
              cursor: selectedLevel && !saving ? 'pointer' : 'default',
              opacity: selectedLevel && !saving ? 1 : 0.4,
            }}
          >
            {saving ? 'Starting...' : 'Start ' + lang.name}
          </button>
        </div>
      </div>
    )
  }

  // ── Language list ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 24px 60px' }}>
        <button onClick={onBack} style={backBtnStyle}>← Back</button>

        <div style={{ marginTop: '28px', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#18181B', marginBottom: '6px' }}>
            Your languages
          </h1>
          <p style={{ fontSize: '14px', color: '#71717A' }}>
            Switch between languages or start a new one.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {LANGUAGES.map(lang => {
            const track = tracks.find(t => t.language === lang.code)
            const prog = progress[lang.code]
            const isActive = profile.active_language === lang.code

            if (track) {
              return (
                <LanguageCard
                  key={lang.code}
                  lang={lang}
                  track={track}
                  prog={prog}
                  isActive={isActive}
                  saving={saving}
                  onClick={() => switchTo(lang.code)}
                />
              )
            }

            return (
              <NotStartedCard
                key={lang.code}
                lang={lang}
                onStart={() => { setStarting(lang.code); setSelectedLevel(null) }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF8' }
const backBtnStyle = { background: 'none', border: 'none', color: '#71717A', cursor: 'pointer', fontSize: '14px', padding: 0 }