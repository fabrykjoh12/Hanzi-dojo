import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { languageTheme } from './languageTheme'
import { isMastered } from './mastery'
import { levelInfo } from './xp'
import { cleanMeaning } from './cleanMeaning'
import { evaluateAchievements } from './achievements'
import { todayStr, liveStreak } from './streak'
import { monthReview, monthHeadline, monthShareText } from './monthReview'
import { knownWordMap, readableSummary } from './knownWordMap'
import { useIsMobile } from './useIsMobile'
import InfoTip from './InfoTip'
import { BRAND_URL } from './brand'
import {
  ArrowLeft, Flame, Layers, LogOut, RotateCcw, Save,
  Shield, Sparkles, Target, User, Trophy, CalendarCheck, Award, Share2, Check, AlertTriangle, TrendingUp, BookOpen,
} from 'lucide-react'

const ACH_ICONS = { flame: Flame, layers: Layers, sparkles: Sparkles, trophy: Trophy, calendar: CalendarCheck }

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

export default function Profile({ session, profile, track, onBack, onNavigate, onUpdate }) {
  const [stats, setStats] = useState({ learned: 0, totalCards: 0, masteredCount: 0, totalWords: 0 })
  const [editingGoal, setEditingGoal] = useState(false)
  const [newGoal, setNewGoal] = useState(profile.daily_new_cards)
  const [saving, setSaving] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activity, setActivity] = useState({})
  const [shared, setShared] = useState(false)
  const [leeches, setLeeches] = useState([])
  const [reviewStats, setReviewStats] = useState({ total: 0, correct: 0, days: {} })
  const [wordMap, setWordMap] = useState({ levels: [], totals: { total: 0, mastered: 0, known: 0, learning: 0, new: 0, readable: 0 } })

  const isMobile = useIsMobile()
  const { accentHex, fontFamily, nativeName } = getLanguageDetails(profile)
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  async function loadStats() {
    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('id')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)

    const { data: cards } = await supabase
      .from('cards')
      .select('vocab_id, learned, stability')
      .eq('user_id', session.user.id)

    const vocabIds = new Set((vocab || []).map(v => v.id))
    const levelCards = (cards || []).filter(c => vocabIds.has(c.vocab_id))

    // Known-Word Map: bucket every active word in the language (all levels) by
    // how well the learner knows it, so reading reach is visible as it grows.
    const { data: allVocab } = await supabase
      .from('vocabulary')
      .select('id, level')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('is_active', true)
    const cardById = {}
    for (const c of (cards || [])) cardById[c.vocab_id] = c
    setWordMap(knownWordMap(allVocab || [], cardById))

    setStats({
      learned: levelCards.filter(c => c.learned).length,
      totalCards: levelCards.length,
      masteredCount: levelCards.filter(c => isMastered(c)).length,
      totalWords: vocabIds.size,
      // Lifetime counts (across all levels) for achievements.
      lifetimeLearned: (cards || []).filter(c => c.learned).length,
      lifetimeMastered: (cards || []).filter(c => isMastered(c)).length,
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
      .select('lapses, vocabulary(word, reading, meaning, language, system, level)')
      .eq('user_id', session.user.id)
      .gte('lapses', 4)
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

  const resetProgress = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true)
      setResetError('')
      return
    }

    setResetting(true)
    setResetError('')

    const { error } = await supabase.rpc('reset_current_language_progress', {
      p_language: track.language,
      p_system: track.system,
    })

    if (error) {
      setResetError(error.message)
      setResetting(false)
      return
    }

    if (onUpdate) {
      onUpdate({ streak: 0, streak_freezes: 1, last_studied_on: null })
    }

    await loadStats()
    setResetting(false)
    setConfirmingReset(false)
  }

  const masteryPct = stats.totalWords > 0
    ? Math.round((stats.masteredCount / stats.totalWords) * 100)
    : 0

  const achievements = evaluateAchievements({
    streak: liveStreak(profile),
    learned: stats.lifetimeLearned || 0,
    mastered: stats.lifetimeMastered || 0,
    level: levelInfo(profile.total_xp).level,
    daysStudied: Object.keys(activity).length,
  })
  const earnedCount = achievements.filter(a => a.earned).length

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

      <div style={{ margin: '30px 0 28px', display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '24px',
          background: accentHex + '10',
          border: '1px solid ' + accentHex + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accentHex,
          fontFamily,
          fontSize: '30px',
          fontWeight: 850,
          flexShrink: 0,
        }}>
          {nativeName[0]}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accentHex, fontSize: '13px', fontWeight: 800, marginBottom: '7px' }}>
            <User size={16} strokeWidth={1.8} color={accentHex} />
            Profile
          </div>
          <h1 style={{ margin: 0, fontSize: '34px', lineHeight: 1.1, fontWeight: 850, color: 'var(--text)' }}>
            {profile.display_name || session.user.email}
          </h1>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 600 }}>
            {systemLabel} · {levelLabel}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '18px' }}>
        <StatCard label="Current streak" value={liveStreak(profile)} unit="days" icon={Flame} color="#D97706" bg="#FFFBEB" />
        <StatCard label="Streak freezes" value={profile.streak_freezes || 0} unit="available" icon={Shield} color="#3E63DD" bg="#EEF2FF" />
        <StatCard label="Words learned" value={loading ? '-' : stats.learned} unit={'of ' + stats.totalWords} icon={Layers} color={accentHex} bg={accentHex + '10'} />
        <StatCard label="Words mastered" value={loading ? '-' : stats.masteredCount} unit={masteryPct + '%'} icon={Sparkles} color="#2F9E6D" bg="var(--success-bg)" />
      </div>

      <Panel>
        {(() => {
          const lv = levelInfo(profile.total_xp)
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
                  <Sparkles size={17} strokeWidth={1.85} color={accentHex} />
                  Account level {lv.level}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>
                  {Math.max(0, Math.floor(profile.total_xp || 0))} XP
                </span>
              </div>
              <div style={{ height: '8px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '999px',
                  background: 'linear-gradient(90deg, ' + accentHex + ', ' + accentHex + 'AA)',
                  width: lv.pct + '%', transition: 'width 700ms ease',
                }} />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '9px' }}>
                {lv.levelSpan - lv.intoLevel} XP to level {lv.level + 1}. Earn XP from every flashcard you review.
              </div>
            </div>
          )
        })()}
      </Panel>

      {!loading && (
        <Panel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
              <Award size={17} strokeWidth={1.85} color={accentHex} />
              Achievements
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>{earnedCount}/{achievements.length} unlocked</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
            {achievements.map(a => (
              <Badge key={a.id} ach={a} accentHex={accentHex} Icon={ACH_ICONS[a.icon] || Award} />
            ))}
          </div>
        </Panel>
      )}

      {!loading && leeches.length > 0 && (
        <Panel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
              <AlertTriangle size={17} strokeWidth={1.95} color="#D97706" />
              Words that keep slipping
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>{leeches.length}</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
            These have lapsed the most. A focused drill helps them stick.
          </div>
          <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
            {leeches.map((l, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                padding: '10px 14px', borderRadius: '12px', background: 'var(--surface-2)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', minWidth: 0 }}>
                  <span style={{ fontSize: '20px', fontFamily, color: 'var(--text)', flexShrink: 0 }}>{l.vocabulary.word}</span>
                  <span style={{ fontSize: '12px', color: accentHex, fontWeight: 600, flexShrink: 0 }}>{l.vocabulary.reading}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanMeaning(l.vocabulary.meaning)}</span>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#D97706', background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.28)', borderRadius: '999px', padding: '3px 9px', flexShrink: 0 }}>
                  missed {l.lapses}×
                </span>
              </div>
            ))}
          </div>
          {onNavigate && (
            <button onClick={() => onNavigate('weak')} style={{
              width: '100%', minHeight: '44px', borderRadius: '12px',
              border: '1px solid rgba(217,119,6,0.30)', background: 'rgba(217,119,6,0.08)',
              color: '#B45309', fontSize: '14px', fontWeight: 700, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}>
              <RotateCcw size={16} strokeWidth={2} color="#D97706" />
              Review weak words
            </button>
          )}
        </Panel>
      )}

      {!loading && (
        <Panel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
              <CalendarCheck size={17} strokeWidth={1.85} color={accentHex} />
              {monthName} so far
            </span>
            <button
              onClick={shareReport}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                minHeight: '34px', padding: '0 13px', borderRadius: '10px',
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
          </div>
          <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
            {monthHeadline(mr)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
            {[
              { label: 'Active days', value: activeDays, color: accentHex },
              { label: 'Reviews', value: cardsThisMonth, color: '#3E63DD' },
              { label: 'Day streak', value: liveStreak(profile), color: '#D97706' },
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
        </Panel>
      )}

      {!loading && wordMap.totals.total > 0 && (
        <Panel>
          <KnownWordMap map={wordMap} accentHex={accentHex} language={track.language} system={track.system} />
        </Panel>
      )}

      {!loading && (
        <Panel>
          <StudyCalendar activity={activity} accentHex={accentHex} />
        </Panel>
      )}

      {!loading && (
        <Panel>
          <ReviewAccuracy stats={reviewStats} accentHex={accentHex} />
        </Panel>
      )}

      {!loading && (
        <Panel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
              Level mastery
              <InfoTip accentHex={accentHex} text="A word is mastered once the app predicts you'll still recall it about three weeks from now. It can't be rushed - mastery comes from reviewing correctly over time, across multiple days." />
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>{stats.masteredCount}/{stats.totalWords} mastered</span>
          </div>
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
        </Panel>
      )}

      <Panel>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', marginBottom: editingGoal ? '16px' : 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
              <Target size={17} strokeWidth={1.85} color={accentHex} />
              Daily new cards
            </div>
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

      {profile.last_studied_on && (
        <Panel compact>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Last studied</span>
            <span style={{ fontSize: '14px', fontWeight: 750, color: 'var(--text)' }}>
              {new Date(profile.last_studied_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </Panel>
      )}

      <Panel danger>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>Reset progress</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.45 }}>
              Clears flashcards, tests, unlocks, and streak for this language.
            </div>
          </div>
          <SmallButton onClick={resetProgress} danger filled={confirmingReset} disabled={resetting} icon={RotateCcw}>
            {resetting ? 'Resetting' : confirmingReset ? 'Confirm reset' : 'Reset'}
          </SmallButton>
        </div>

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
// yet. Data comes from the pure knownWordMap module (fully unit-tested).
export function KnownWordMap({ map, accentHex, language, system }) {
  const SEGMENTS = [
    { key: 'mastered', label: 'Mastered', color: '#2F9E6D' },
    { key: 'known', label: 'Known', color: accentHex },
    { key: 'learning', label: 'Learning', color: '#D97706' },
    { key: 'new', label: 'Not yet', color: 'var(--border)' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>
        <BookOpen size={17} strokeWidth={1.85} color={accentHex} />
        Known-word map
      </div>
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
            <div style={{ display: 'flex', height: '12px', borderRadius: '999px', overflow: 'hidden', background: 'var(--surface-2)' }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '14px' }}>
        <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>Study activity</span>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>
          {totalDays} {totalDays === 1 ? 'day' : 'days'} studied
        </span>
      </div>

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>
          <TrendingUp size={17} strokeWidth={1.85} color={accentHex} />
          Review accuracy
        </div>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 800, color: 'var(--text)', marginBottom: '16px' }}>
        <TrendingUp size={17} strokeWidth={1.85} color={accentHex} />
        Review accuracy
      </div>

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
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: gap + 'px', height: maxBarH + 'px' }}>
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

function Panel({ children, compact, danger }) {
  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: '20px',
      border: '1px solid ' + (danger ? 'var(--danger-border)' : 'var(--border)'),
      boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
      padding: compact ? '18px 22px' : '22px 24px',
      marginBottom: '14px',
    }}>
      {children}
    </div>
  )
}

function StatCard({ label, value, unit, icon: Icon, color, bg }) {
  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: '18px',
      border: '1px solid var(--border)',
      boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
      padding: '18px',
    }}>
      <div style={{
        width: '38px', height: '38px', borderRadius: '13px',
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '14px',
      }}>
        <Icon size={19} strokeWidth={1.85} color={color} />
      </div>
      <div style={{ fontSize: '29px', fontWeight: 850, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', fontWeight: 650 }}>{unit}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '7px' }}>{label}</div>
    </div>
  )
}

function Badge({ ach, accentHex, Icon }) {
  const earned = ach.earned
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
        minHeight: '36px',
        padding: '0 14px',
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
