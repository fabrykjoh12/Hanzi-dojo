import { useState, useEffect, useRef } from 'react'
import HanziWriter from 'hanzi-writer'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { useIsMobile } from './useIsMobile'
import { cleanMeaning } from './cleanMeaning'
import { languageTheme } from './languageTheme'
import { ArrowLeft, Brush, Play, PenLine, Eye, EyeOff } from 'lucide-react'

function isIdeograph(ch) {
  const c = ch.charCodeAt(0)
  return c >= 0x3400 && c <= 0x9FFF
}

export default function Writer({ profile, track, onBack }) {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [chars, setChars] = useState([])
  const [info, setInfo] = useState({})        // char → { reading, meaning }
  const [selected, setSelected] = useState(null)
  const [loadState, setLoadState] = useState('loading')  // loading | ready | error
  const [showOutline, setShowOutline] = useState(true)
  const targetRef = useRef(null)
  const writerRef = useRef(null)

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const langFont = theme.font
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)
  const kindLabel = profile.active_language === 'japanese' ? 'kanji' : 'characters'

  useEffect(() => {
    let active = true
    supabase
      .from('vocabulary')
      .select('word, reading, meaning, sort_order')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (!active) return
        const seen = new Set()
        const list = []
        const infoMap = {}
        ;(data || []).forEach(v => {
          const w = v.word || ''
          if (w.length === 1 && isIdeograph(w) && !infoMap[w]) infoMap[w] = { reading: v.reading, meaning: v.meaning }
          for (let i = 0; i < w.length; i += 1) {
            const ch = w[i]
            if (isIdeograph(ch) && !seen.has(ch)) { seen.add(ch); list.push(ch) }
          }
        })
        setChars(list)
        setInfo(infoMap)
        setLoading(false)
      })
    return () => { active = false }
  }, [track.language, track.system, track.current_level])

  // Build the HanziWriter whenever the selected character changes.
  useEffect(() => {
    if (!selected || !targetRef.current) return
    const target = targetRef.current
    target.innerHTML = ''
    setLoadState('loading')
    let cancelled = false
    const size = isMobile ? 240 : 300
    const writer = HanziWriter.create(target, selected, {
      width: size, height: size, padding: 10,
      showOutline,
      strokeColor: accentHex,
      radicalColor: '#2F9E6D',
      delayBetweenStrokes: 180,
      strokeAnimationSpeed: 1,
      onLoadCharDataSuccess: function () {
        if (cancelled) return
        setLoadState('ready')
        writer.animateCharacter()
      },
      onLoadCharDataError: function () {
        if (!cancelled) setLoadState('error')
      },
    })
    writerRef.current = writer
    return () => { cancelled = true; writerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  function animate() {
    if (writerRef.current && loadState === 'ready') writerRef.current.animateCharacter()
  }
  function practice() {
    if (writerRef.current && loadState === 'ready') writerRef.current.quiz({ showHintAfterMisses: 2 })
  }
  function toggleOutline() {
    setShowOutline(prev => {
      const nextVal = !prev
      if (writerRef.current && loadState === 'ready') {
        if (nextVal) writerRef.current.showOutline()
        else writerRef.current.hideOutline()
      }
      return nextVal
    })
  }

  const pageShell = {
    minHeight: '100vh', position: 'relative', overflow: 'hidden',
    padding: isMobile ? '16px 14px 28px' : '20px 32px 36px',
  }

  // Stroke order is a CJK-only mode (hanzi / kanji). Alphabetic languages
  // (e.g. Russian) get an empty state pointing back home.
  if (!theme.cjk) {
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '520px', margin: '0 auto', paddingTop: isMobile ? '8px' : '20px' }}>
          <Ghost onClick={onBack} icon={ArrowLeft} label="Back home" />
          <div style={{
            marginTop: '18px', textAlign: 'center', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: '24px', padding: '42px 30px',
            boxShadow: '0 22px 60px rgba(24,24,27,0.07)',
          }}>
            <Brush size={30} strokeWidth={1.8} color={accentHex} style={{ marginBottom: '14px' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 750, color: 'var(--text)', marginBottom: '8px' }}>
              Stroke order is for Chinese &amp; Japanese
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6 }}>
              {theme.languageName} uses an alphabet, so there is no character stroke-order drill. Try the alphabet practice instead.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Focused character view ──
  if (selected) {
    const meta = info[selected]
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
          <Ghost onClick={() => setSelected(null)} icon={ArrowLeft} label="All characters" />
          <div style={{
            marginTop: '16px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '24px', padding: isMobile ? '22px 18px' : '30px', boxShadow: '0 22px 60px rgba(24,24,27,0.07)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{
              position: 'relative', width: isMobile ? 240 : 300, height: isMobile ? 240 : 300,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {/* Faint grid guide */}
              <div aria-hidden style={{ position: 'absolute', inset: 0, border: '1px solid var(--border)', borderRadius: '12px', backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '50% 50%', opacity: 0.5 }} />
              <div ref={targetRef} style={{ position: 'relative', zIndex: 1 }} />
              {loadState === 'loading' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px', color: 'var(--text-faint)', fontFamily: langFont }}>{selected}</div>
              )}
              {loadState === 'error' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '64px', color: 'var(--text)', fontFamily: langFont }}>{selected}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Stroke data unavailable for this character.</div>
                </div>
              )}
            </div>

            {meta && (
              <div style={{ textAlign: 'center', marginTop: '14px' }}>
                <div style={{ fontSize: '16px', color: accentHex, fontWeight: 650 }}>{meta.reading}</div>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '2px' }}>{cleanMeaning(meta.meaning)}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '22px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Action onClick={animate} icon={Play} label="Animate" accentHex={accentHex} primary />
              <Action onClick={practice} icon={PenLine} label="Practice" accentHex={accentHex} />
              <Action onClick={toggleOutline} icon={showOutline ? EyeOff : Eye} label={showOutline ? 'Hide guide' : 'Show guide'} accentHex={accentHex} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Character grid ──
  return (
    <div style={pageShell}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <Ghost onClick={onBack} icon={ArrowLeft} label="Home" />
        <div style={{ textAlign: 'center', margin: '18px 0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: accentHex, fontSize: '13px', fontWeight: 750 }}>
            <Brush size={17} strokeWidth={1.8} color={accentHex} /> Stroke order
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 780, color: 'var(--text)', marginTop: '8px' }}>Writing practice</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '5px' }}>{systemLabel} · {levelLabel} · {chars.length} {kindLabel}</div>
        </div>

        {loading ? (
          <div style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brush size={32} strokeWidth={1.75} color={accentHex} />
          </div>
        ) : chars.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', marginTop: '40px' }}>
            No {kindLabel} to practice at this level yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(' + (isMobile ? '58px' : '68px') + ', 1fr))', gap: '10px' }}>
            {chars.map(ch => (
              <button key={ch} onClick={() => setSelected(ch)} style={{
                aspectRatio: '1', borderRadius: '14px', border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: 'pointer',
                fontSize: isMobile ? '28px' : '34px', color: 'var(--text)', fontFamily: langFont,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 140ms ease, transform 140ms ease',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = accentHex; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                {ch}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Ghost({ onClick, icon: Icon, label }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      minHeight: '40px', padding: '0 14px', borderRadius: '12px',
      border: '1px solid var(--border)', background: h ? 'var(--surface-2)' : 'var(--surface)',
      color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
    }}>
      <Icon size={17} strokeWidth={1.85} color="var(--text-muted)" /> {label}
    </button>
  )
}

function Action({ onClick, icon: Icon, label, primary }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      minHeight: '44px', padding: '0 18px', borderRadius: '12px', cursor: 'pointer',
      border: primary ? 'none' : '1px solid var(--border)',
      background: primary ? (h ? '#5C7155' : '#6E8466') : (h ? 'var(--surface-2)' : 'var(--surface)'),
      color: primary ? '#fff' : 'var(--text-muted)',
      fontSize: '14px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
    }}>
      <Icon size={17} strokeWidth={2} color={primary ? '#fff' : 'var(--text-muted)'} /> {label}
    </button>
  )
}
