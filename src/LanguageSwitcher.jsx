import { useState, useEffect } from 'react'
import { fetchPagedSafe } from './supabasePaging'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel, getLevels, metaLine} from './utils'
import { languageList, availableLanguages } from './languageTheme'
import { isMastered } from './mastery'
import { useIsMobile } from './useIsMobile'
import { ArrowLeft, ArrowRight, Globe2, Plus, RefreshCw } from 'lucide-react'
import { track, EVENTS } from './analytics'
import AppBar from './AppBar'

// Built from the shared language config so a new language shows up here for free.
const LANGUAGES = languageList().map(t => ({
  code: t.key,
  system: t.system,
  name: t.languageName,
  nativeName: t.nativeName,
  flag: t.flag,
  levels: getLevels(t.key, t.system),
  levelLabel: (l) => getLevelLabel(t.key, t.system, l),
  systemLabel: getSystemLabel(t.system),
  accent: t.accentHex,
}))

function Shell({ children }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}

function IconButton({ icon: Icon, label, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        height: '40px', padding: '0 14px', borderRadius: '12px',
        border: '1px solid var(--border)',
        background: hovered ? 'var(--surface-2)' : 'var(--surface)',
        color: 'var(--text-muted)',
        fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        transition: 'background 160ms ease, transform 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <Icon size={17} strokeWidth={1.85} color="var(--text-muted)" />
      {label}
    </button>
  )
}

function LanguageCard({ lang, track, prog, levelProgress, isActive, saving, onClick, onLevelSelect }) {
  const isMobile = useIsMobile()
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={!isActive && !saving ? onClick : undefined}
      onMouseEnter={() => !isActive && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--surface)',
        borderRadius: '22px',
        border: '1.5px solid ' + (isActive ? lang.accent : hovered ? lang.accent + '55' : 'var(--border)'),
        boxShadow: hovered && !isActive ? '0 16px 36px rgba(24,24,27,0.09)' : '0 8px 26px rgba(24,24,27,0.05)',
        transform: hovered && !isActive ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        cursor: isActive ? 'default' : 'pointer',
        padding: '24px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: prog ? '18px' : 0, gap: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', minWidth: 0 }}>
          <div style={{
            width: '54px', height: '54px', borderRadius: '18px',
            background: lang.accent + '10',
            border: '1px solid ' + lang.accent + '20',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '25px', flexShrink: 0,
          }}>
            {lang.flag}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '19px', fontWeight: 850, color: 'var(--text)' }}>{lang.name}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 600 }}>
              {metaLine(lang.systemLabel, lang.levelLabel(track.current_level))}
            </div>
          </div>
        </div>
        {isActive ? (
          <span style={pillStyle(lang.accent, lang.accent + '12', lang.accent + '30')}>
            Active
          </span>
        ) : (
          <ArrowRight size={20} strokeWidth={2} color={lang.accent} />
        )}
      </div>

      {prog && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '9px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Words mastered</span>
            <span style={{ fontWeight: 750, color: 'var(--text)' }}>{prog.masteredCount} / {prog.totalWords}</span>
          </div>
          <div style={{ height: '7px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, ' + lang.accent + ', ' + lang.accent + 'AA)',
              width: prog.pct + '%',
              transition: 'width 600ms ease',
            }} />
          </div>
        </>
      )}

      {isActive && levelProgress && (
        <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '10px' }}>
            Study level
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '8px' }}>
            {lang.levels.map(lvl => {
              const levelProg = levelProgress[lvl] || { masteredCount: 0, totalWords: 0, unlocked: false }
              const current = track.current_level === lvl
              // Levels with no seeded vocabulary are "Coming soon" — switching
              // into one would land the user in an empty study queue.
              const hasContent = (levelProg.totalWords || 0) > 0
              return (
                <button
                  key={lvl}
                  onClick={e => {
                    e.stopPropagation()
                    if (!current && !saving && hasContent) onLevelSelect(lvl)
                  }}
                  disabled={current || saving || !hasContent}
                  style={{
                    minHeight: '60px',
                    padding: '8px 6px',
                    borderRadius: '13px',
                    border: '1.5px solid ' + (current ? lang.accent : 'var(--border)'),
                    background: current ? lang.accent + '10' : 'var(--surface)',
                    color: current ? lang.accent : (hasContent ? 'var(--text)' : 'var(--text-faint)'),
                    cursor: current || saving || !hasContent ? 'default' : 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    textAlign: 'center',
                    opacity: (saving && !current) || !hasContent ? 0.55 : 1,
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 800, lineHeight: 1.2 }}>
                    {lang.levelLabel(lvl)}
                  </div>
                  <div style={{ fontSize: '12px', color: levelProg.unlocked ? '#2F9E6D' : 'var(--text-muted)', marginTop: '5px', fontWeight: 700 }}>
                    {!hasContent ? 'Coming soon' : levelProg.unlocked ? 'Passed' : levelProg.masteredCount + '/' + (levelProg.totalWords || 0)}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
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
        background: 'var(--surface)',
        borderRadius: '22px',
        border: '1.5px dashed ' + (hovered ? lang.accent + '66' : 'var(--border)'),
        boxShadow: hovered ? '0 16px 36px rgba(24,24,27,0.08)' : '0 8px 26px rgba(24,24,27,0.05)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        cursor: 'pointer',
        padding: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <div style={{
          width: '54px', height: '54px', borderRadius: '18px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '25px', opacity: 0.75,
        }}>
          {lang.flag}
        </div>
        <div>
          <div style={{ fontSize: '19px', fontWeight: 850, color: 'var(--text)' }}>{lang.name}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Not started yet</div>
        </div>
      </div>
      <span style={pillStyle(lang.accent, lang.accent + '10', lang.accent + '30')}>
        Start
      </span>
    </div>
  )
}

export default function LanguageSwitcher({ session, profile, onSwitch, onBack }) {
  const isMobile = useIsMobile()
  const [tracks, setTracks] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(null)
  const [selectedLevel, setSelectedLevel] = useState(null)
  const [saving, setSaving] = useState(false)
  // The track list failed to load — without it the picker renders empty and
  // looks like the user has no languages, so show a calm retry instead.
  const [loadError, setLoadError] = useState(false)
  // A switch/start write failed. Shown inline; the user stays on this screen
  // instead of landing on Home still in the old language.
  const [actionError, setActionError] = useState(null)
  // Levels with seeded vocabulary for the language being started. Keyed by
  // language code so a stale result never gates the wrong language; while
  // loading (or on fetch failure) everything stays selectable (fail open).
  const [seededData, setSeededData] = useState(null)   // { lang, levels: Set }

  useEffect(() => {
    if (!starting) return
    let cancelled = false
    const lang = LANGUAGES.find(l => l.code === starting)
    // Paged for the same reason: unpaged, a level whose words all sat past the
    // first 1000 rows would look unseeded and be offered as "Coming soon".
    fetchPagedSafe(() => supabase
      .from('vocabulary')
      .select('level')
      .eq('language', lang.code)
      .eq('system', lang.system)
      .eq('is_active', true)
      .order('level', { ascending: true }))
      .then((data) => {
        if (cancelled || !data) return
        setSeededData({ lang: lang.code, levels: new Set(data.map(r => r.level).filter(l => l != null)) })
      })
    return () => { cancelled = true }
  }, [starting])
  const seededLevels = seededData && seededData.lang === starting ? seededData.levels : null

  const activeLang = LANGUAGES.find(lang => lang.code === profile.active_language) || LANGUAGES[0]

  // Which languages appear in the picker grid. Regular accounts see the public
  // set (Chinese-only); admins additionally see the gated tracks. Any language
  // the user already has a track in stays visible regardless, so an existing
  // track is never orphaned. Display lookups above still use the full LANGUAGES
  // list so any code resolves.
  const allowedCodes = new Set(availableLanguages(!!profile?.is_admin).map(l => l.key))
  const visibleLanguages = LANGUAGES.filter(
    l => allowedCodes.has(l.code) || tracks.some(t => t.language === l.code)
  )

  async function loadTracks() {
    setLoading(true)
    setLoadError(false)

    const { data: tracksData, error: tracksError } = await supabase
      .from('language_tracks')
      .select('*')
      .eq('user_id', session.user.id)

    // A failed read here would render an empty picker that looks like the user
    // has no languages — surface it as a retry state instead.
    if (tracksError) {
      setLoadError(true)
      setLoading(false)
      return
    }

    setTracks(tracksData || [])

    const { data: allCards } = await supabase
      .from('cards')
      .select('vocab_id, stability')
      .eq('user_id', session.user.id)

    const { data: unlocks } = await supabase
      .from('level_unlocks')
      .select('language, system, level')
      .eq('user_id', session.user.id)

    const progressMap = {}
    for (const track of (tracksData || [])) {
      const lang = LANGUAGES.find(l => l.code === track.language)
      if (!lang) continue

      // Paged: a whole track is past PostgREST's 1000-row cap, and an unpaged
      // read here is what made every level show a fraction of its real size.
      const vocab = await fetchPagedSafe(() => supabase
        .from('vocabulary')
        .select('id, level')
        .eq('language', track.language)
        .eq('system', track.system)
        .eq('is_active', true)
        .order('id', { ascending: true }))

      progressMap[track.language] = {}

      for (const lvl of lang.levels) {
        const vocabIds = new Set((vocab || []).filter(v => v.level === lvl).map(v => v.id))
        const levelCards = (allCards || []).filter(c => vocabIds.has(c.vocab_id))
        const masteredCount = levelCards.filter(isMastered).length
        const totalWords = vocabIds.size
        const unlocked = (unlocks || []).some(u =>
          u.language === track.language &&
          u.system === track.system &&
          u.level === lvl
        )

        progressMap[track.language][lvl] = {
          masteredCount,
          totalWords,
          unlocked,
          pct: totalWords > 0 ? Math.round(masteredCount / totalWords * 100) : 0,
        }
      }
    }

    setProgress(progressMap)
    setLoading(false)
  }

  // A failed write must not fall through to onSwitch — that navigates Home and
  // makes the failure look exactly like success. Stay here and say so instead.
  const switchTo = async (langCode) => {
    setActionError(null)
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ active_language: langCode })
      .eq('id', session.user.id)
    if (error) {
      setSaving(false)
      setActionError("That switch didn't save — check your connection and try again.")
      return
    }
    if (langCode !== profile.active_language) track(EVENTS.LANGUAGE_SWITCHED, { from: profile.active_language, to: langCode })
    onSwitch(langCode)
  }

  useEffect(() => {
    const timer = setTimeout(loadTracks, 0)
    return () => clearTimeout(timer)
  }, [])

  const switchLevel = async (track, level) => {
    if (track.current_level === level) return
    setActionError(null)
    setSaving(true)

    const { error: levelError } = await supabase
      .from('language_tracks')
      .update({ current_level: level })
      .eq('id', track.id)
      .eq('user_id', session.user.id)

    if (levelError) {
      setSaving(false)
      setActionError("That level change didn't save — check your connection and try again.")
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ active_language: track.language })
      .eq('id', session.user.id)

    if (profileError) {
      setSaving(false)
      setActionError("That switch didn't save — check your connection and try again.")
      return
    }

    onSwitch(track.language)
  }

  const startLanguage = async (lang) => {
    if (!selectedLevel) return
    setActionError(null)
    setSaving(true)

    const { error: insertError } = await supabase.from('language_tracks').insert({
      user_id: session.user.id,
      language: lang.code,
      system: lang.system,
      current_level: selectedLevel,
      is_active: true,
    })

    // A duplicate row (23505) means the track already exists — e.g. a retry
    // after the profile update below failed — so carry on to that update.
    if (insertError && insertError.code !== '23505') {
      setSaving(false)
      setActionError("That didn't save — check your connection and try again.")
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ active_language: lang.code })
      .eq('id', session.user.id)

    if (profileError) {
      setSaving(false)
      setActionError("That didn't save — check your connection and try again.")
      return
    }

    if (lang.code !== profile.active_language) track(EVENTS.LANGUAGE_SWITCHED, { from: profile.active_language, to: lang.code })
    onSwitch(lang.code)
  }

  if (loading) {
    return (
      <Shell accentHex={activeLang.accent}>
        <div style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '88px', height: '88px', borderRadius: '26px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 16px 40px rgba(24,24,27,0.06)',
          }}>
            <Globe2 size={34} strokeWidth={1.75} color={activeLang.accent} />
          </div>
        </div>
      </Shell>
    )
  }

  if (loadError) {
    return (
      <Shell accentHex={activeLang.accent}>
        <AppBar kind="back" onBack={onBack} sticky={false} />
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: '380px' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '24px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 18px', boxShadow: '0 16px 40px rgba(24,24,27,0.06)',
            }}>
              <Globe2 size={30} strokeWidth={1.75} color={activeLang.accent} />
            </div>
            <div style={{ fontSize: '19px', fontWeight: 850, color: 'var(--text)' }}>
              Couldn't load your languages
            </div>
            <p style={{ margin: '10px 0 20px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Check your connection and try again — nothing has changed.
            </p>
            <IconButton icon={RefreshCw} label="Try again" onClick={loadTracks} />
          </div>
        </div>
      </Shell>
    )
  }

  if (starting) {
    const lang = LANGUAGES.find(l => l.code === starting)
    return (
      <Shell accentHex={lang.accent}>
        <IconButton icon={ArrowLeft} label="Back" onClick={() => { setStarting(null); setSelectedLevel(null); setActionError(null) }} />

        <div style={{ margin: '32px 0 28px', textAlign: 'center' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '24px',
            background: lang.accent + '10',
            border: '1px solid ' + lang.accent + '20',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
            fontSize: '34px',
          }}>
            {lang.flag}
          </div>
          <div style={{ color: lang.accent, fontSize: '13px', fontWeight: 850, marginBottom: '8px' }}>
            {lang.nativeName}
          </div>
          <h1 style={{ margin: 0, color: 'var(--text)', fontSize: '34px', fontWeight: 850, lineHeight: 1.1 }}>
            Start {lang.name}
          </h1>
          <p style={{ margin: '12px auto 0', color: 'var(--text-muted)', fontSize: '15px', lineHeight: 1.6, maxWidth: '520px' }}>
            Choose your starting level. Starting higher assumes you already know the earlier levels.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '10px', marginBottom: '22px' }}>
          {lang.levels.map(lvl => {
            const seeded = !seededLevels || seededLevels.has(lvl)
            return (
              <button
                key={lvl}
                onClick={() => seeded && setSelectedLevel(lvl)}
                disabled={!seeded}
                style={{
                  minHeight: '68px',
                  borderRadius: '16px',
                  border: '1.5px solid ' + (selectedLevel === lvl ? lang.accent : 'var(--border)'),
                  background: selectedLevel === lvl ? lang.accent + '10' : 'var(--surface)',
                  color: selectedLevel === lvl ? lang.accent : (seeded ? 'var(--text)' : 'var(--text-faint)'),
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: seeded ? 'pointer' : 'not-allowed',
                  opacity: seeded ? 1 : 0.6,
                  transition: 'all 180ms ease',
                  fontFamily: 'Inter, sans-serif',
                  boxShadow: '0 8px 22px rgba(24,24,27,0.04)',
                }}
              >
                {lang.levelLabel(lvl)}
                {!seeded && (
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-faint)', marginTop: '4px' }}>
                    Coming soon
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <button
          onClick={() => startLanguage(lang)}
          disabled={!selectedLevel || saving || (seededLevels && !seededLevels.has(selectedLevel))}
          style={{
            width: '100%',
            minHeight: '52px',
            borderRadius: '16px',
            border: 'none',
            background: lang.accent,
            color: '#fff',
            fontSize: '15px',
            fontWeight: 800,
            fontFamily: 'Inter, sans-serif',
            cursor: selectedLevel && !saving ? 'pointer' : 'default',
            opacity: selectedLevel && !saving ? 1 : 0.4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <Plus size={18} strokeWidth={2} color="#fff" />
          {saving ? 'Starting...' : 'Start ' + lang.name}
        </button>

        {actionError && (
          <div style={{ fontSize: '13px', color: 'var(--danger)', marginTop: '12px', lineHeight: 1.5, textAlign: 'center' }}>
            {actionError}
          </div>
        )}
      </Shell>
    )
  }

  return (
    <Shell accentHex={activeLang.accent}>
      <AppBar kind="back" onBack={onBack} sticky={false} />

      <div style={{ margin: '32px 0 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: activeLang.accent, fontSize: '13px', fontWeight: 850, marginBottom: '10px' }}>
          <Globe2 size={17} strokeWidth={1.85} color={activeLang.accent} />
          Language tracks
        </div>
        <h1 style={{ margin: 0, color: 'var(--text)', fontSize: '38px', fontWeight: 850, lineHeight: 1.1 }}>
          Your languages
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Switch between active tracks, replay a previous level, or start a new language.
        </p>
        {actionError && (
          <div style={{ fontSize: '13px', color: 'var(--danger)', marginTop: '12px', lineHeight: 1.5 }}>
            {actionError}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: '14px' }}>
        {visibleLanguages.map(lang => {
          const track = tracks.find(t => t.language === lang.code)
          const levelProgress = progress[lang.code]
          const prog = levelProgress?.[track?.current_level]
          const isActive = profile.active_language === lang.code

          if (track) {
            return (
              <LanguageCard
                key={lang.code}
                lang={lang}
                track={track}
                prog={prog}
                levelProgress={levelProgress}
                isActive={isActive}
                saving={saving}
                onClick={() => switchTo(lang.code)}
                onLevelSelect={(level) => switchLevel(track, level)}
              />
            )
          }

          return (
            <NotStartedCard
              key={lang.code}
              lang={lang}
              onStart={() => { setStarting(lang.code); setSelectedLevel(null); setActionError(null) }}
            />
          )
        })}
      </div>
    </Shell>
  )
}

function pillStyle(color, background, border) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    color,
    background,
    border: '1px solid ' + border,
    borderRadius: '999px',
    padding: '6px 11px',
    fontSize: '12px',
    fontWeight: 850,
    whiteSpace: 'nowrap',
  }
}
