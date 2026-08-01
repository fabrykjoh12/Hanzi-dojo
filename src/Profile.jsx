import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { languageTheme, availableLanguages } from './languageTheme'
import { PageHeader } from './panels'
import { isMastered } from './mastery'
import { cleanMeaning } from './cleanMeaning'
import { evaluateAchievements } from './achievements'
import { todayStr } from './streak'
import { monthReview, monthHeadline, monthShareText } from './monthReview'
import { knownWordMap, readableSummary, rowA11yLabel } from './knownWordMap'
import { last30A11yLabel } from './reviewAccuracy'
import { useIsMobile } from './useIsMobile'
import InfoTip from './InfoTip'
import StuckWordCoach from './StuckWordCoach'
import { STUCK_LAPSES } from './stuckWord'
import { BRAND_URL } from './brand'
import {
  ArrowLeft, Layers, LogOut, RotateCcw, Save,
  Sparkles, Award, Share2, Check, Trash2, BookOpen,
} from 'lucide-react'

const ACH_ICONS = { layers: Layers, sparkles: Sparkles, calendar: Award, book: BookOpen }

function getLanguageDetails(profile) {
  const t = languageTheme(profile.active_language)
  return {
    accentHex: t.accentHex,
    fontFamily: t.font,
    nativeName: t.nativeName,
  }
}

function Shell({ children }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ maxWidth: '820px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
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
        height: '44px', padding: '0 16px', borderRadius: '12px',
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

// The one heading style used everywhere on this screen: a small, quiet label
// with an optional right-hand slot for a count/action. Hierarchy comes from
// this staying tiny and uniform, not from boxes or icons.
function Eyebrow({ children, right, style = {} }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px', ...style }}>
      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {children}
      </span>
      {right}
    </div>
  )
}

function wallColor(status, accentHex) {
  if (status === 'mastered') return { color: 'var(--text)', opacity: 1 }
  if (status === 'known') return { color: accentHex, opacity: 1 }
  if (status === 'learning') return { color: accentHex, opacity: 0.45 }
  return { color: 'var(--text-faint)', opacity: 0.28 }
}

// The hero: every word at the current level, rendered as its first character
// and tinted by how well it's known. The one loud thing on this screen —
// everything else is quiet by comparison.
function CharacterWall({ words, levelLabel, accentHex, fontFamily }) {
  const total = words.length
  let mastered = 0, known = 0, learning = 0
  for (const w of words) {
    if (w.status === 'mastered') mastered += 1
    else if (w.status === 'known') known += 1
    else if (w.status === 'learning') learning += 1
  }
  const readable = mastered + known
  const notStarted = total - readable - learning
  const label = readable + ' of ' + total + ' words readable at ' + levelLabel + ' — '
    + mastered + ' mastered, ' + known + ' known, ' + learning + ' learning, ' + notStarted + ' not started'

  return (
    <div style={{ marginBottom: '34px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '46px', fontWeight: 600, color: 'var(--text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {readable}
        </span>
        <span style={{ fontSize: '15px', color: 'var(--text-muted)' }}>
          of {total} words at {levelLabel}
        </span>
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: '4px' }}>
        {mastered} locked in · {learning} still settling
      </div>
      <div
        role="img"
        aria-label={label}
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(26px, 1fr))',
          gap: '6px 4px', marginTop: '18px',
        }}
      >
        {words.map(w => {
          const st = wallColor(w.status, accentHex)
          return (
            <span key={w.id} aria-hidden style={{
              fontSize: '20px', fontFamily, textAlign: 'center', lineHeight: 1.3,
              color: st.color, opacity: st.opacity,
            }}>
              {w.word ? w.word.slice(0, 1) : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function Profile({ session, profile, track, onBack, onNavigate, onUpdate }) {
  const [stats, setStats] = useState({ learned: 0, totalCards: 0, masteredCount: 0, totalWords: 0 })
  const [wall, setWall] = useState([])
  const [showAllAch, setShowAllAch] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)
  const [newGoal, setNewGoal] = useState(profile.daily_new_cards)
  const [saving, setSaving] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [tracks, setTracks] = useState([])
  // Which language the reset will clear. Defaults to the one being studied;
  // only becomes a choice for accounts that have started a second track.
  const [resetTarget, setResetTarget] = useState(track.language)
  // Study history and streak are account-wide (daily_activity has no language
  // column), so clearing them is a separate, explicit decision — never a side
  // effect of resetting one language.
  const [clearHistory, setClearHistory] = useState(false)
  // A track for a language that's since been paused (not in availableLanguages)
  // stays on the account so it's never silently orphaned — see LanguageSwitcher.
  // This lets the learner actually drop it instead of it just sitting there.
  const [removeTarget, setRemoveTarget] = useState(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activity, setActivity] = useState({})
  const [shared, setShared] = useState(false)
  const [leeches, setLeeches] = useState([])
  const [coachVocab, setCoachVocab] = useState(null)   // stuck-word coach target
  const [reviewStats, setReviewStats] = useState({ total: 0, correct: 0, days: {} })
  const [wordMap, setWordMap] = useState({ levels: [], totals: { total: 0, mastered: 0, known: 0, learning: 0, new: 0, readable: 0 } })

  const isMobile = useIsMobile()
  const { accentHex, fontFamily } = getLanguageDetails(profile)
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  async function loadStats() {
    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('id, word')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)

    const { data: cards } = await supabase
      .from('cards')
      .select('vocab_id, learned, stability')
      .eq('user_id', session.user.id)

    const cardById = {}
    for (const c of (cards || [])) cardById[c.vocab_id] = c

    const vocabIds = new Set((vocab || []).map(v => v.id))
    const levelCards = (cards || []).filter(c => vocabIds.has(c.vocab_id))

    // The character wall: one entry per word at this level, coloured by how
    // well it's known — the single visual the rest of the screen defers to.
    const wallWords = (vocab || []).map(v => {
      const c = cardById[v.id]
      let status = 'new'
      if (c) {
        if (isMastered(c)) status = 'mastered'
        else if (c.learned) status = 'known'
        else status = 'learning'
      }
      return { id: v.id, word: v.word, status }
    })
    setWall(wallWords)

    // Known-Word Map: bucket every active word in the language (all levels) by
    // how well the learner knows it, so reading reach is visible as it grows.
    const { data: allVocab } = await supabase
      .from('vocabulary')
      .select('id, level')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('is_active', true)
    setWordMap(knownWordMap(allVocab || [], cardById))

    // Stories finished (lifetime, all languages) — drives the Reading achievements.
    const { count: storiesRead } = await supabase
      .from('story_reads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)

    setStats({
      learned: levelCards.filter(c => c.learned).length,
      totalCards: levelCards.length,
      masteredCount: levelCards.filter(c => isMastered(c)).length,
      totalWords: vocabIds.size,
      // Lifetime counts (across all levels) for achievements.
      lifetimeLearned: (cards || []).filter(c => c.learned).length,
      lifetimeMastered: (cards || []).filter(c => isMastered(c)).length,
      storiesRead: storiesRead || 0,
    })

    const { data: acts } = await supabase
      .from('daily_activity')
      .select('activity_date, studied_cards')
      .eq('user_id', session.user.id)
    const actMap = {}
    ;(acts || []).forEach(a => { if (a.studied_cards > 0) actMap[a.activity_date] = a.studied_cards })
    setActivity(actMap)

    // Leeches: the words that keep lapsing, scoped to the current track.
    const { data: leechData } = await supabase
      .from('cards')
      .select('lapses, vocabulary(id, word, reading, meaning, language, system, level, audio_path, example_sentence, example_reading, example_translation)')
      .eq('user_id', session.user.id)
      .gte('lapses', STUCK_LAPSES)
      .order('lapses', { ascending: false })
    const leechList = (leechData || [])
      .filter(l => l.vocabulary
        && l.vocabulary.language === track.language
        && l.vocabulary.system === track.system
        && l.vocabulary.level === track.current_level)
      .slice(0, 6)
    setLeeches(leechList)

    // Retention (item #17b): grade 0 = "Again" (forgotten), grades 1–3 all
    // count as a successful recall. Scoped to the current track, same as
    // everything else on this page. review_logs only started being written
    // recently, so early accounts may simply have nothing yet — that's fine,
    // the panel shows an honest empty state rather than a misleading 0%.
    const { data: reviewLogs } = await supabase
      .from('review_logs')
      .select('grade, reviewed_at, vocabulary!inner(language, system)')
      .eq('user_id', session.user.id)
      .eq('vocabulary.language', track.language)
      .eq('vocabulary.system', track.system)
    const days = {}
    let correct = 0
    ;(reviewLogs || []).forEach(r => {
      if (r.grade > 0) correct += 1
      const d = (r.reviewed_at || '').slice(0, 10)
      if (d) days[d] = (days[d] || 0) + 1
    })
    setReviewStats({ total: (reviewLogs || []).length, correct, days })

    setLoading(false)
  }

  const saveGoal = async () => {
    if (newGoal === profile.daily_new_cards) { setEditingGoal(false); return }
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ daily_new_cards: newGoal })
      .eq('id', session.user.id)
    if (!error && onUpdate) onUpdate({ daily_new_cards: newGoal })
    setSaving(false)
    setEditingGoal(false)
  }

  useEffect(() => {
    const timer = setTimeout(loadStats, 0)
    return () => clearTimeout(timer)
  }, [])

  // Every language track the account owns, so a reset can target one of them
  // rather than whichever happens to be active.
  useEffect(() => {
    let live = true
    supabase
      .from('language_tracks')
      .select('language, system, current_level')
      .eq('user_id', session.user.id)
      .then(({ data }) => { if (live && data) setTracks(data) })
    return () => { live = false }
  }, [session.user.id])

  const targetTrack = tracks.find(t => t.language === resetTarget) || track

  const resetProgress = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true)
      setResetError('')
      return
    }

    setResetting(true)
    setResetError('')

    const { error } = await supabase.rpc('reset_language_progress', {
      p_language: targetTrack.language,
      p_system: targetTrack.system,
      p_reset_account_history: clearHistory,
    })

    if (error) {
      setResetError(error.message)
      setResetting(false)
      return
    }

    setResetting(false)
    setConfirmingReset(false)
    setClearHistory(false)

    // Resetting the language you're on changes the level and empties the queue
    // that Home renders, so send the reload through Home the way Dev does.
    // Any other track only affects data this screen doesn't show.
    if (targetTrack.language === track.language) onNavigate('home')
    else await loadStats()
  }

  // Tracks for a language nobody can start anymore (paused, e.g. Japanese/
  // Russian) — the only ones this account can actually drop. Chinese (or any
  // currently-offered language) never shows here; there's nothing "stuck" to
  // remove.
  const removableTracks = tracks.filter(
    t => !availableLanguages(!!profile?.is_admin).some(l => l.key === t.language)
  )

  const removeLanguageTrack = async (langCode) => {
    if (!confirmingRemove) {
      setConfirmingRemove(true)
      setRemoveError('')
      return
    }

    setRemoving(true)
    setRemoveError('')

    const wasActive = profile.active_language === langCode
    const target = tracks.find(t => t.language === langCode)
    // Fall back to Chinese if the account has it, else whatever track is left.
    const fallback = tracks.find(t => t.language === 'chinese' && t.language !== langCode)
      || tracks.find(t => t.language !== langCode)

    // Same RPC the "Reset a language" panel uses — clears cards, review logs,
    // writing stats, story reads, test attempts and unlocks for this track,
    // so the delete below doesn't leave any of that behind as orphaned rows.
    const { error: resetErr } = await supabase.rpc('reset_language_progress', {
      p_language: langCode,
      p_system: target.system,
    })
    if (resetErr) {
      setRemoveError(resetErr.message)
      setRemoving(false)
      return
    }

    const { error } = await supabase
      .from('language_tracks')
      .delete()
      .eq('user_id', session.user.id)
      .eq('language', langCode)

    if (error) {
      setRemoveError(error.message)
      setRemoving(false)
      return
    }

    if (wasActive && fallback) {
      await supabase.from('profiles').update({ active_language: fallback.language }).eq('id', session.user.id)
    }

    setRemoving(false)
    setConfirmingRemove(false)
    setRemoveTarget(null)
    setTracks(prev => prev.filter(t => t.language !== langCode))

    // Same reasoning as resetProgress: only reload through Home when the
    // change actually affects the active track.
    if (wasActive && fallback) onNavigate('home')
  }

  const masteryPct = stats.totalWords > 0
    ? Math.round((stats.masteredCount / stats.totalWords) * 100)
    : 0

  const achievements = evaluateAchievements({
    learned: stats.lifetimeLearned || 0,
    mastered: stats.lifetimeMastered || 0,
    daysStudied: Object.keys(activity).length,
    storiesRead: stats.storiesRead || 0,
  })
  const earnedCount = achievements.filter(a => a.earned).length
  const railAchievements = [...achievements].sort((a, b) => (b.earned ? 1 : 0) - (a.earned ? 1 : 0))

  // This-month report (from daily_activity; presence is exact, counts approximate).
  const mr = monthReview(activity)
  const monthName = mr.monthName
  const activeDays = mr.activeDays
  const cardsThisMonth = mr.reviews

  const shareReport = async () => {
    const lang = profile.active_language === 'japanese' ? 'Japanese'
      : profile.active_language === 'russian' ? 'Russian' : 'Chinese'
    const text = monthShareText(mr, {
      languageName: lang,
      mastered: stats.lifetimeMastered || 0,
      brandUrl: BRAND_URL,
    })
    try {
      if (navigator.share) { await navigator.share({ text }); return }
    } catch { return /* user cancelled */ }
    try {
      await navigator.clipboard.writeText(text)
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <Shell accentHex={accentHex} fontFamily={fontFamily}>
      <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />

      <PageHeader
        title={profile.display_name || session.user.email}
        meta={`${systemLabel} · ${levelLabel}`}
        style={{ margin: '22px 0 18px' }}
      />

      {!loading && (
        <CharacterWall words={wall} levelLabel={levelLabel} accentHex={accentHex} fontFamily={fontFamily} />
      )}

      {!loading && (
        <div style={{ marginBottom: '34px' }}>
          <Eyebrow right={
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
                {earnedCount}/{achievements.length}
              </span>
              {isMobile && (
                <button
                  onClick={() => setShowAllAch(v => !v)}
                  style={{ background: 'none', border: 'none', padding: 0, color: accentHex, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                >
                  {showAllAch ? 'Less' : 'All'}
                </button>
              )}
            </div>
          }>
            Milestones
          </Eyebrow>

          {isMobile && !showAllAch ? (
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', paddingBottom: '2px' }}>
              {railAchievements.map(a => (
                <Badge key={a.id} compact ach={a} accentHex={accentHex} Icon={ACH_ICONS[a.icon] || Award} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
              {achievements.map(a => (
                <Badge key={a.id} ach={a} accentHex={accentHex} Icon={ACH_ICONS[a.icon] || Award} />
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && leeches.length > 0 && (
        <div style={{ marginBottom: '34px' }}>
          <Eyebrow right={<span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 650 }}>{leeches.length}</span>}>
            Keeps slipping
          </Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {leeches.map((l, i) => (
              <button key={i} onClick={() => setCoachVocab(l.vocabulary)} title="See it a different way" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', width: '100%', textAlign: 'left',
                padding: '11px 0', border: 'none', borderBottom: '1px solid var(--border)',
                background: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', minWidth: 0 }}>
                  <span style={{ fontSize: '20px', fontFamily, color: 'var(--text)', flexShrink: 0 }}>{l.vocabulary.word}</span>
                  <span style={{ fontSize: '12px', color: accentHex, fontWeight: 600, flexShrink: 0 }}>{l.vocabulary.reading}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanMeaning(l.vocabulary.meaning)}</span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {l.lapses}x
                </span>
              </button>
            ))}
          </div>
          {onNavigate && (
            <button onClick={() => onNavigate('weak')} style={{
              width: '100%', minHeight: '44px', borderRadius: '12px', marginTop: '14px',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text)', fontSize: '14px', fontWeight: 700, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}>
              <RotateCcw size={16} strokeWidth={2} color="var(--text)" />
              Drill these
            </button>
          )}
        </div>
      )}

      <StuckWordCoach vocab={coachVocab} onClose={() => setCoachVocab(null)} />

      {!loading && (
        <div style={{ marginBottom: '34px' }}>
          <Eyebrow right={
            <button
              onClick={shareReport}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                minHeight: '44px', padding: '0 13px', borderRadius: '10px',
                border: '1px solid ' + (shared ? '#2F9E6D' : 'var(--border)'),
                background: shared ? 'var(--success-bg)' : 'var(--surface)',
                color: shared ? '#2F9E6D' : 'var(--text-muted)',
                cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
              }}
            >
              {shared
                ? <><Check size={15} strokeWidth={2.4} color="#2F9E6D" /> Copied</>
                : <><Share2 size={15} strokeWidth={2} color="var(--text-muted)" /> Share</>}
            </button>
          }>
            {monthName}
          </Eyebrow>
          <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
            {monthHeadline(mr)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {[
              { label: 'Active days', value: activeDays, color: accentHex },
              { label: 'Reviews', value: cardsThisMonth, color: '#3E63DD' },
              { label: 'Words mastered', value: stats.lifetimeMastered || 0, color: '#2F9E6D' },
            ].map(s => (
              <div key={s.label} style={{ padding: '14px 12px', borderRadius: '14px', background: s.color + '0D', border: '1px solid ' + s.color + '22', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: s.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 650 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {mr.bestDay && mr.bestDay.count > 0 && (
            <div style={{ fontSize: '12.5px', color: 'var(--text-faint)', marginTop: '14px', textAlign: 'center' }}>
              Best day so far — {mr.bestDay.count} review{mr.bestDay.count === 1 ? '' : 's'} on{' '}
              {new Date(mr.bestDay.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}.
            </div>
          )}
        </div>
      )}

      {!loading && wordMap.totals.total > 0 && (
        <div style={{ marginBottom: '34px' }}>
          <KnownWordMap map={wordMap} accentHex={accentHex} language={track.language} system={track.system} />
        </div>
      )}

      {!loading && (
        <div style={{ marginBottom: '34px' }}>
          <StudyCalendar activity={activity} accentHex={accentHex} />
        </div>
      )}

      {!loading && (
        <div style={{ marginBottom: '34px' }}>
          <ReviewAccuracy stats={reviewStats} accentHex={accentHex} />
        </div>
      )}

      {!loading && (
        <div style={{ marginBottom: '34px' }}>
          <Eyebrow right={<span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 650 }}>{stats.masteredCount}/{stats.totalWords} mastered</span>}>
            Level mastery <InfoTip accentHex={accentHex} text="A word is mastered once the app predicts you'll still recall it about three weeks from now. It can't be rushed - mastery comes from reviewing correctly over time, across multiple days." />
          </Eyebrow>
          <div style={{ height: '8px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, ' + accentHex + ', ' + accentHex + 'AA)',
              width: masteryPct + '%',
              transition: 'width 700ms ease',
            }} />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '9px' }}>
            Test unlocks at 90% mastery.
          </div>
        </div>
      )}

      <Panel>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', marginBottom: editingGoal ? '16px' : 0 }}>
          <div>
            <Eyebrow style={{ marginBottom: '4px' }}>Daily new cards</Eyebrow>
            {!editingGoal && (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {profile.daily_new_cards} new cards per day
              </div>
            )}
          </div>
          {!editingGoal ? (
            <SmallButton onClick={() => { setEditingGoal(true); setNewGoal(profile.daily_new_cards) }}>
              Change
            </SmallButton>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <SmallButton onClick={() => setEditingGoal(false)}>Cancel</SmallButton>
              <SmallButton onClick={saveGoal} accentHex={accentHex} filled disabled={saving} icon={Save}>
                {saving ? 'Saving' : 'Save'}
              </SmallButton>
            </div>
          )}
        </div>

        {editingGoal && (
          <div style={{ display: 'grid', gap: '9px' }}>
            {[
              { val: 5, label: 'Casual', desc: '5 cards / day' },
              { val: 10, label: 'Regular', desc: '10 cards / day' },
              { val: 15, label: 'Intensive', desc: '15 cards / day' },
            ].map(opt => (
              <button
                key={opt.val}
                onClick={() => setNewGoal(opt.val)}
                style={{
                  padding: '14px 16px', borderRadius: '14px', textAlign: 'left',
                  border: '1.5px solid ' + (newGoal === opt.val ? accentHex : 'var(--border)'),
                  background: newGoal === opt.val ? accentHex + '08' : 'var(--surface)',
                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                <span style={{ fontWeight: 750, fontSize: '14px', color: newGoal === opt.val ? accentHex : 'var(--text)' }}>
                  {opt.label}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{opt.desc}</span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* Reset is scoped to ONE language. The account-wide part — study history
          and streak — is a separate opt-in below, because daily_activity has no
          language column and so cannot be cleared for one track alone. */}
      <Panel danger>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'center' }}>
          <div>
            <Eyebrow style={{ marginBottom: '4px' }}>Reset a language</Eyebrow>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.45 }}>
              Clears flashcards, tests, story reads and unlocks for{' '}
              <strong style={{ color: 'var(--text)', fontWeight: 700 }}>
                {languageTheme(targetTrack.language).languageName}
              </strong>{' '}
              and puts that track back to{' '}
              {getLevelLabel(targetTrack.language, targetTrack.system, 1)}. Your other
              languages are untouched.
            </div>
          </div>
          <SmallButton onClick={resetProgress} danger filled={confirmingReset} disabled={resetting} icon={RotateCcw}>
            {resetting ? 'Resetting' : confirmingReset ? 'Confirm reset' : 'Reset'}
          </SmallButton>
        </div>

        {/* Only a choice once there is something to choose between. */}
        {tracks.length > 1 && !confirmingReset && (
          <div role="radiogroup" aria-label="Language to reset" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
            {tracks.map(t => {
              const on = t.language === targetTrack.language
              return (
                <button
                  key={t.language}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setResetTarget(t.language)}
                  style={{
                    padding: '7px 13px', borderRadius: '9px', cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif', fontSize: '13px',
                    fontWeight: on ? 700 : 550,
                    border: '1px solid ' + (on ? '#DC2626' : 'var(--border)'),
                    background: on ? 'var(--danger-bg)' : 'var(--surface)',
                    color: on ? '#DC2626' : 'var(--text-muted)',
                  }}
                >
                  {languageTheme(t.language).languageName}
                  <span style={{ opacity: 0.7, fontWeight: 500 }}>
                    {' · ' + getLevelLabel(t.language, t.system, t.current_level)}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: '9px', marginTop: '14px',
          cursor: 'pointer', fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.45,
        }}>
          <span style={{ width: '44px', height: '44px', marginLeft: '-11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={clearHistory}
              onChange={e => setClearHistory(e.target.checked)}
              style={{ width: '20px', height: '20px', margin: 0, accentColor: '#DC2626', cursor: 'pointer' }}
            />
          </span>
          <span>
            Also clear my study history and streak.{' '}
            <span style={{ color: '#DC2626', fontWeight: 650 }}>
              This one covers every language
            </span>{' '}
            — the calendar records days you studied, not which language you studied.
          </span>
        </label>

        {confirmingReset && !resetting && (
          <button
            onClick={() => { setConfirmingReset(false); setResetError('') }}
            style={{
              marginTop: '12px', background: 'none', border: 'none',
              padding: 0, color: 'var(--text-muted)', cursor: 'pointer',
              fontSize: '13px', fontFamily: 'Inter, sans-serif',
            }}
          >
            Cancel reset
          </button>
        )}

        {resetError && (
          <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '10px', lineHeight: 1.4 }}>
            {resetError}
          </div>
        )}
      </Panel>

      {/* Only shows up for a track whose language has since been paused (e.g.
          Japanese/Russian) — it stuck around so it's never silently orphaned,
          but the learner can choose to actually drop it here. */}
      {removableTracks.length > 0 && (
        <Panel danger>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <Eyebrow style={{ marginBottom: '4px' }}>Remove a language</Eyebrow>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.45 }}>
                {removeTarget
                  ? <>Deletes your <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{languageTheme(removeTarget).languageName}</strong> track and its flashcards, tests, story reads and unlocks. This can't be undone.</>
                  : "These tracks are for a language that's not offered right now — pick one to remove it."}
              </div>
            </div>
            {removeTarget && (
              <SmallButton onClick={() => removeLanguageTrack(removeTarget)} danger filled={confirmingRemove} disabled={removing} icon={Trash2}>
                {removing ? 'Removing' : confirmingRemove ? 'Confirm remove' : 'Remove'}
              </SmallButton>
            )}
          </div>

          <div role="radiogroup" aria-label="Language to remove" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
            {removableTracks.map(t => {
              const on = t.language === removeTarget
              return (
                <button
                  key={t.language}
                  role="radio"
                  aria-checked={on}
                  disabled={confirmingRemove}
                  onClick={() => { setRemoveTarget(t.language); setConfirmingRemove(false); setRemoveError('') }}
                  style={{
                    padding: '7px 13px', borderRadius: '9px', cursor: confirmingRemove ? 'default' : 'pointer',
                    fontFamily: 'Inter, sans-serif', fontSize: '13px',
                    fontWeight: on ? 700 : 550,
                    border: '1px solid ' + (on ? '#DC2626' : 'var(--border)'),
                    background: on ? 'var(--danger-bg)' : 'var(--surface)',
                    color: on ? '#DC2626' : 'var(--text-muted)',
                    opacity: confirmingRemove && !on ? 0.5 : 1,
                  }}
                >
                  {languageTheme(t.language).languageName}
                  <span style={{ opacity: 0.7, fontWeight: 500 }}>
                    {' · ' + getLevelLabel(t.language, t.system, t.current_level)}
                  </span>
                </button>
              )
            })}
          </div>

          {confirmingRemove && !removing && (
            <button
              onClick={() => { setConfirmingRemove(false); setRemoveError('') }}
              style={{
                marginTop: '12px', background: 'none', border: 'none',
                padding: 0, color: 'var(--text-muted)', cursor: 'pointer',
                fontSize: '13px', fontFamily: 'Inter, sans-serif',
              }}
            >
              Cancel remove
            </button>
          )}

          {removeError && (
            <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '10px', lineHeight: 1.4 }}>
              {removeError}
            </div>
          )}
        </Panel>
      )}

      <button
        onClick={() => supabase.auth.signOut()}
        style={{
          width: '100%',
          minHeight: '52px',
          borderRadius: '16px',
          border: '1px solid var(--danger-border)',
          background: 'var(--danger-bg)',
          color: '#DC2626',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 750,
          fontFamily: 'Inter, sans-serif',
          marginTop: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        <LogOut size={18} strokeWidth={1.9} color="#DC2626" />
        Sign out
      </button>
    </Shell>
  )
}

function pad2(n) { return String(n).padStart(2, '0') }
function dateToStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) }

// Build numWeeks columns (Sun→Sat) ending with the current week.
function buildWeeks(numWeeks) {
  const today = new Date(); today.setHours(12, 0, 0, 0)
  const end = new Date(today); end.setDate(end.getDate() + (6 - end.getDay()))   // Saturday of this week
  const start = new Date(end); start.setDate(start.getDate() - (numWeeks * 7 - 1)) // Sunday, numWeeks back
  const weeks = []
  const cur = new Date(start)
  for (let w = 0; w < numWeeks; w += 1) {
    const col = []
    for (let d = 0; d < 7; d += 1) {
      col.push({ ds: dateToStr(cur), future: cur > today })
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(col)
  }
  return weeks
}

function cellColor(count, accentHex) {
  if (!count) return 'var(--surface-2)'
  if (count < 5) return accentHex + '55'
  if (count < 15) return accentHex + 'AA'
  return accentHex
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Known-Word Map — reading reach across levels, as calm stacked bars. Each
// level shows how many words you've mastered / know / are learning / haven't met
// yet.
export function KnownWordMap({ map, accentHex, language, system }) {
  const SEGMENTS = [
    { key: 'mastered', label: 'Mastered', color: '#2F9E6D' },
    { key: 'known', label: 'Known', color: accentHex },
    { key: 'learning', label: 'Learning', color: '#D97706' },
    { key: 'new', label: 'Not yet', color: 'var(--border)' },
  ]
  return (
    <div>
      <Eyebrow>Reading reach</Eyebrow>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '18px', lineHeight: 1.5 }}>
        {readableSummary(map)}
      </div>

      <div style={{ display: 'grid', gap: '14px' }}>
        {map.levels.map(row => (
          <div key={row.level}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 750, color: 'var(--text)' }}>
                {getLevelLabel(language, system, row.level)}
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
                {row.readable}/{row.total} readable
              </span>
            </div>
            <div
              role="img"
              aria-label={rowA11yLabel(row, getLevelLabel(language, system, row.level))}
              style={{ display: 'flex', height: '12px', borderRadius: '999px', overflow: 'hidden', background: 'var(--surface-2)' }}
            >
              {SEGMENTS.map(seg => {
                const count = row[seg.key]
                if (!count) return null
                return (
                  <div
                    key={seg.key}
                    title={seg.label + ': ' + count}
                    style={{ width: (count / row.total) * 100 + '%', background: seg.color }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '16px' }}>
        {SEGMENTS.map(seg => (
          <span key={seg.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: seg.color, flexShrink: 0 }} />
            {seg.label} ({map.totals[seg.key]})
          </span>
        ))}
      </div>
    </div>
  )
}

export function StudyCalendar({ activity, accentHex }) {
  const isMobile = useIsMobile()
  const numWeeks = isMobile ? 17 : 24
  const weeks = buildWeeks(numWeeks)
  const today = todayStr()
  const totalDays = Object.keys(activity).length
  const cell = isMobile ? 13 : 14
  const gap = 3

  return (
    <div>
      <Eyebrow right={
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 650 }}>
          {totalDays} {totalDays === 1 ? 'day' : 'days'} studied
        </span>
      }>
        Study activity
      </Eyebrow>

      <div style={{ display: 'flex', gap: gap + 'px', overflowX: 'auto', paddingBottom: '2px' }}>
        {weeks.map((col, wi) => {
          const firstOfMonth = col.find(c => c.ds.slice(8) === '01')
          return (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: gap + 'px', position: 'relative', flexShrink: 0 }}>
              {firstOfMonth && (
                <span style={{ position: 'absolute', top: '-15px', left: 0, fontSize: '9px', color: 'var(--text-faint)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {MONTH_ABBR[parseInt(firstOfMonth.ds.slice(5, 7), 10) - 1]}
                </span>
              )}
              {col.map((c) => (
                <div key={c.ds} title={c.ds + (activity[c.ds] ? ' · ' + activity[c.ds] + ' cards' : '')}
                  style={{
                    width: cell + 'px', height: cell + 'px', borderRadius: '3px',
                    background: c.future ? 'transparent' : cellColor(activity[c.ds], accentHex),
                    border: c.ds === today ? '1.5px solid ' + accentHex : (c.future ? 'none' : '1px solid rgba(0,0,0,0.04)'),
                    boxSizing: 'border-box',
                  }}
                />
              ))}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginTop: '12px', fontSize: '11px', color: 'var(--text-faint)' }}>
        <span>Less</span>
        {['var(--surface-2)', accentHex + '55', accentHex + 'AA', accentHex].map((bg, i) => (
          <span key={i} style={{ width: '11px', height: '11px', borderRadius: '3px', background: bg }} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

// Retention rate + a 30-day reviews bar, both from review_logs (product
// review item #17b — the calendar above already covered the 6-month
// heatmap half of that item). Grade 0 = "Again" (forgotten); grades 1–3
// all count as a successful recall.
export function ReviewAccuracy({ stats, accentHex }) {
  const isMobile = useIsMobile()
  if (stats.total === 0) {
    return (
      <div>
        <Eyebrow>Review accuracy</Eyebrow>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Once you've graded a few cards, your retention rate and daily review count will show up here.
        </div>
      </div>
    )
  }

  const pct = Math.round((stats.correct / stats.total) * 100)

  // Last 30 calendar days, oldest to newest.
  const today = new Date()
  const last30 = []
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const ds = d.toISOString().slice(0, 10)
    last30.push({ ds, count: stats.days[ds] || 0 })
  }
  const max = Math.max(1, ...last30.map(d => d.count))
  const barW = isMobile ? 6 : 8
  const gap = isMobile ? 2 : 3
  const maxBarH = 46

  return (
    <div>
      <Eyebrow>Review accuracy</Eyebrow>

      <div style={{ display: 'flex', gap: '14px', alignItems: 'stretch', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <div style={{
          flexShrink: 0, minWidth: isMobile ? '100%' : '150px', textAlign: 'center',
          padding: '16px 12px', borderRadius: '14px', background: accentHex + '0D', border: '1px solid ' + accentHex + '22',
        }}>
          <div style={{ fontSize: '30px', fontWeight: 800, color: accentHex, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{pct}%</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 650 }}>
            Recalled successfully — {stats.total} review{stats.total === 1 ? '' : 's'}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 650, marginBottom: '10px' }}>Last 30 days</div>
          <div role="img" aria-label={last30A11yLabel(last30.map(d => d.count))} style={{ display: 'flex', alignItems: 'flex-end', gap: gap + 'px', height: maxBarH + 'px' }}>
            {last30.map(d => (
              <div
                key={d.ds}
                title={d.ds + (d.count > 0 ? ' · ' + d.count + ' review' + (d.count === 1 ? '' : 's') : '')}
                style={{
                  width: barW + 'px',
                  height: Math.max(2, Math.round((d.count / max) * maxBarH)) + 'px',
                  borderRadius: '2px',
                  background: d.count > 0 ? accentHex : 'var(--border)',
                  opacity: d.count > 0 ? 0.85 : 0.5,
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Panel({ children, danger }) {
  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: '20px',
      border: '1px solid ' + (danger ? 'var(--danger-border)' : 'var(--border)'),
      boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
      padding: '22px 24px',
      marginBottom: '14px',
    }}>
      {children}
    </div>
  )
}

function Badge({ ach, accentHex, Icon, compact }) {
  const earned = ach.earned

  if (compact) {
    return (
      <div
        title={ach.desc}
        style={{
          flex: '0 0 116px', scrollSnapAlign: 'start',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px',
          padding: '14px 8px', borderRadius: '16px',
          border: '1px solid ' + (earned ? accentHex + '33' : 'var(--border)'),
          background: earned ? accentHex + '0A' : 'var(--surface-2)',
          opacity: earned ? 1 : 0.65,
        }}
      >
        <div style={{
          width: '40px', height: '40px', borderRadius: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: earned ? accentHex + '16' : 'var(--surface)',
          border: '1px solid ' + (earned ? accentHex + '2E' : 'var(--border)'),
        }}>
          <Icon size={18} strokeWidth={1.9} color={earned ? accentHex : 'var(--text-faint)'} />
        </div>
        <div style={{ fontSize: '12px', fontWeight: 750, color: earned ? 'var(--text)' : 'var(--text-muted)' }}>{ach.title}</div>
      </div>
    )
  }

  return (
    <div
      title={ach.desc}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px',
        padding: '16px 10px', borderRadius: '16px',
        border: '1px solid ' + (earned ? accentHex + '33' : 'var(--border)'),
        background: earned ? accentHex + '0A' : 'var(--surface-2)',
        opacity: earned ? 1 : 0.65,
      }}
    >
      <div style={{
        width: '46px', height: '46px', borderRadius: '14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: earned ? accentHex + '16' : 'var(--surface)',
        border: '1px solid ' + (earned ? accentHex + '2E' : 'var(--border)'),
      }}>
        <Icon size={22} strokeWidth={1.9} color={earned ? accentHex : 'var(--text-faint)'} />
      </div>
      <div style={{ fontSize: '13px', fontWeight: 750, color: earned ? 'var(--text)' : 'var(--text-muted)' }}>{ach.title}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-faint)', lineHeight: 1.4 }}>{ach.desc}</div>
    </div>
  )
}

function SmallButton({ children, onClick, accentHex, filled, danger, disabled, icon: Icon }) {
  const color = danger ? '#DC2626' : (accentHex || 'var(--text-muted)')
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: '44px',
        padding: '0 16px',
        borderRadius: '10px',
        border: '1px solid ' + (danger ? 'var(--danger-border)' : filled ? color : 'var(--border)'),
        background: filled ? color : (danger ? 'var(--danger-bg)' : 'var(--surface)'),
        color: filled ? 'var(--surface)' : color,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '13px',
        fontWeight: 750,
        fontFamily: 'Inter, sans-serif',
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.65 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '7px',
      }}
    >
      {Icon && <Icon size={15} strokeWidth={2} color={filled ? 'var(--surface)' : color} />}
      {children}
    </button>
  )
}
