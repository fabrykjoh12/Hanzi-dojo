import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel, metaLine} from './utils'
import { languageTheme, availableLanguages, pinyinInk, ink} from './languageTheme'
import { PageHeader, HeroPanel, Eyebrow } from './panels'
import { ON_HERO, NUM } from './designTokens'
import { isMastered, TEST_UNLOCK_MASTERY_PCT } from './mastery'
import { cleanMeaning } from './cleanMeaning'
import { profileProgress } from './profileProgress'
import { controlGroups, CONTROL_ROW_MIN_HEIGHT } from './profileControls'
import { knownWordMap, readableSummary, rowA11yLabel } from './knownWordMap'
import { useIsMobile } from './useIsMobile'
import StuckWordCoach from './StuckWordCoach'
import { STUCK_LAPSES } from './stuckWord'
import { confirmWordOk, forgetDeviceData, DELETE_CONFIRM_WORD } from './accountDeletion'
import {
  LogOut, RotateCcw, Save, ChevronDown, UserX,
  Sparkles, Target, CalendarCheck, AlertTriangle, BookOpen, Trash2,
} from 'lucide-react'
import AppBar from './AppBar'


// One icon per control row. lucide, like every other icon in the app — the
// custom family is the bottom nav's alone (P8).
const ROW_ICONS = {
  goal: Target,
  signout: LogOut,
  reset: RotateCcw,
  remove: Trash2,
  delete: UserX,
}

const GOAL_OPTIONS = [
  { val: 5, label: 'Casual', desc: '5 cards / day' },
  { val: 10, label: 'Regular', desc: '10 cards / day' },
  { val: 15, label: 'Intensive', desc: '15 cards / day' },
]

// A labelled row that opens its own control. The row IS the disclosure button:
// label on the left, current value on the right, chevron last.
function ControlRow({ row, icon: Icon, accentHex, danger, first, open, onActivate, children }) {
  const bodyId = 'profile-control-' + row.key
  return (
    <div style={{ borderTop: first ? 'none' : '1px solid var(--border)' }}>
      <button
        onClick={onActivate}
        aria-expanded={row.expands ? open : undefined}
        aria-controls={row.expands && open ? bodyId : undefined}
        style={{
          width: '100%', minHeight: CONTROL_ROW_MIN_HEIGHT + 'px',
          display: 'flex', alignItems: 'center', gap: '11px',
          padding: '6px 0', background: 'none', border: 'none',
          textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }}
      >
        <Icon size={17} strokeWidth={1.85} color={danger ? 'var(--danger)' : accentHex} />
        <span style={{
          flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 700,
          color: danger ? 'var(--danger)' : 'var(--text)',
        }}>
          {row.label}
        </span>
        {row.value && (
          <span style={{ fontSize: '13px', fontWeight: 650, color: 'var(--text-muted)', flexShrink: 0, ...NUM }}>
            {row.value}
          </span>
        )}
        {row.expands && (
          <ChevronDown
            size={17}
            strokeWidth={2}
            color="var(--text-faint)"
            style={{
              flexShrink: 0, transition: 'transform 160ms ease',
              transform: open ? 'rotate(180deg)' : 'none',
            }}
          />
        )}
      </button>

      {row.expands && open && (
        <div id={bodyId} style={{ paddingBottom: '16px' }}>{children}</div>
      )}
    </div>
  )
}

// The language chips inside the reset and remove controls. A real 44px target —
// they used to be 31px tall.
function TrackChip({ track, on, disabled, dim, onClick }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      style={{
        minHeight: '44px', padding: '0 14px', borderRadius: '11px',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'Inter, sans-serif', fontSize: '13px',
        fontWeight: on ? 700 : 550,
        border: '1px solid ' + (on ? 'var(--danger)' : 'var(--border)'),
        background: on ? 'var(--danger-bg)' : 'var(--surface)',
        color: on ? 'var(--danger)' : 'var(--text-muted)',
        opacity: dim ? 0.5 : 1,
      }}
    >
      {languageTheme(track.language).languageName}
      <span style={{ opacity: 0.7, fontWeight: 500 }}>
        {' · ' + getLevelLabel(track.language, track.system, track.current_level)}
      </span>
    </button>
  )
}

// "Cancel reset" and friends: text, not a button shape, but still a full-height
// target rather than the 19px line of type it used to be.
function QuietButton({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: '44px', padding: '0 4px', background: 'none', border: 'none',
        color: 'var(--text-muted)', cursor: 'pointer',
        fontSize: '13px', fontFamily: 'Inter, sans-serif',
      }}
    >
      {children}
    </button>
  )
}

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


export default function Profile({ session, profile, track, onBack, onNavigate, onUpdate }) {
  const [stats, setStats] = useState({ learned: 0, totalCards: 0, masteredCount: 0, totalWords: 0 })
  // Which control row is open. One at a time, so the screen stays short and an
  // armed destructive action can never hide behind a collapsed row.
  const [openRow, setOpenRow] = useState(null)
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
  // Account deletion (a store requirement — see accountDeletion.js). A first
  // tap arms the panel, typing the word confirms it, the RPC does the rest.
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [deleteWord, setDeleteWord] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activity, setActivity] = useState({})
  const [leeches, setLeeches] = useState([])
  const [coachVocab, setCoachVocab] = useState(null)   // stuck-word coach target
  const [reviewStats, setReviewStats] = useState({ total: 0, correct: 0 })
  const [wordMap, setWordMap] = useState({ levels: [], totals: { total: 0, mastered: 0, known: 0, learning: 0, new: 0, readable: 0 } })

  const { accentHex, fontFamily } = getLanguageDetails(profile)
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

    // Retention: grade 0 = "Again" (forgotten), grades 1–3 all count as a
    // successful recall. Scoped to the current track, same as everything else
    // on this page. review_logs only started being written recently, so early
    // accounts may simply have nothing yet — then the line is omitted rather
    // than showing a misleading 0%.
    const { data: reviewLogs } = await supabase
      .from('review_logs')
      .select('grade, vocabulary!inner(language, system)')
      .eq('user_id', session.user.id)
      .eq('vocabulary.language', track.language)
      .eq('vocabulary.system', track.system)
    let correct = 0
    ;(reviewLogs || []).forEach(r => { if (r.grade > 0) correct += 1 })
    setReviewStats({ total: (reviewLogs || []).length, correct })

    setLoading(false)
  }

  const saveGoal = async () => {
    if (newGoal === profile.daily_new_cards) { setOpenRow(null); return }
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ daily_new_cards: newGoal })
      .eq('id', session.user.id)
    if (!error && onUpdate) onUpdate({ daily_new_cards: newGoal })
    setSaving(false)
    setOpenRow(null)
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

  const deleteAccount = async () => {
    if (!deleteArmed) {
      setDeleteArmed(true)
      setDeleteError('')
      return
    }
    if (!confirmWordOk(deleteWord)) return
    setDeleting(true)
    setDeleteError('')
    const { error } = await supabase.rpc('delete_my_account')
    if (error) {
      setDeleteError(error.message)
      setDeleting(false)
      return
    }
    // Server side is gone; clear this device's copy (caches AND the write
    // outbox — queued grades for a dead account would fail forever), drop the
    // local session, and start the app over from the top.
    await forgetDeviceData()
    try { await supabase.auth.signOut() } catch { /* session already dead */ }
    window.location.assign('/')
  }

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

  // Every figure the progress panel shows, decided in one pure place so two
  // labels can never disagree about what they are counting (profileProgress.js).
  const progress = profileProgress({
    levelLearned: stats.learned,
    levelMastered: stats.masteredCount,
    levelTotal: stats.totalWords,
    levelLabel,
    testUnlockPct: TEST_UNLOCK_MASTERY_PCT,
    activity,
  })

  // Retention is the one number that comes from review_logs rather than cards,
  // so it stays here; it only appears once there is something honest to report.
  const retentionPct = reviewStats.total > 0
    ? Math.round((reviewStats.correct / reviewStats.total) * 100)
    : null

  // Tapping a row opens its control; tapping it again, or opening another,
  // closes and DISARMS it — a half-confirmed reset must never survive out of
  // sight. Sign out is the one row that simply acts.
  const toggleRow = (row) => {
    if (row.key === 'signout') { supabase.auth.signOut(); return }
    const next = openRow === row.key ? null : row.key
    setOpenRow(next)
    if (row.key === 'goal' && next) setNewGoal(profile.daily_new_cards)
    setConfirmingReset(false); setResetError('')
    setConfirmingRemove(false); setRemoveError('')
    setDeleteArmed(false); setDeleteWord(''); setDeleteError('')
  }

  // The control each row opens. Same options, same warnings, same two-step
  // confirmations as the four panels these replaced.
  const rowBody = (key) => {
    if (key === 'goal') return (
      <div>
        <div style={{ display: 'grid', gap: '9px' }}>
          {GOAL_OPTIONS.map(opt => (
            <button
              key={opt.val}
              onClick={() => setNewGoal(opt.val)}
              aria-pressed={newGoal === opt.val}
              style={{
                minHeight: '48px', padding: '12px 16px', borderRadius: '14px', textAlign: 'left',
                border: '1.5px solid ' + (newGoal === opt.val ? accentHex : 'var(--border)'),
                background: newGoal === opt.val
                  ? 'color-mix(in srgb, ' + accentHex + ' 8%, var(--surface))'
                  : 'var(--surface)',
                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <span style={{ fontWeight: 750, fontSize: '14px', color: newGoal === opt.val ? ink(accentHex) : 'var(--text)' }}>
                {opt.label}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{opt.desc}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <SmallButton onClick={() => setOpenRow(null)}>Cancel</SmallButton>
          <SmallButton onClick={saveGoal} accentHex={accentHex} filled disabled={saving} icon={Save}>
            {saving ? 'Saving' : 'Save'}
          </SmallButton>
        </div>
      </div>
    )

    // Reset is scoped to ONE language. The account-wide part — the study
    // history — is a separate opt-in, because daily_activity has no language
    // column and so cannot be cleared for one track alone.
    if (key === 'reset') return (
      <div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Clears flashcards, tests, story reads and unlocks for{' '}
          <strong style={{ color: 'var(--text)', fontWeight: 700 }}>
            {languageTheme(targetTrack.language).languageName}
          </strong>{' '}
          and puts that track back to{' '}
          {getLevelLabel(targetTrack.language, targetTrack.system, 1)}. Your other
          languages are untouched.
        </div>

        {/* Only a choice once there is something to choose between. */}
        {tracks.length > 1 && !confirmingReset && (
          <div role="radiogroup" aria-label="Language to reset" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
            {tracks.map(t => (
              <TrackChip
                key={t.language}
                track={t}
                on={t.language === targetTrack.language}
                onClick={() => setResetTarget(t.language)}
              />
            ))}
          </div>
        )}

        <label style={{
          display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px',
          minHeight: '44px', cursor: 'pointer',
          fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.45,
        }}>
          <input
            type="checkbox"
            checked={clearHistory}
            onChange={e => setClearHistory(e.target.checked)}
            style={{ width: '18px', height: '18px', flexShrink: 0, accentColor: 'var(--danger)', cursor: 'pointer' }}
          />
          <span>
            Also clear my study history.{' '}
            <span style={{ color: 'var(--danger)', fontWeight: 650 }}>
              This one covers every language
            </span>{' '}
            — the record is of days you studied, not which language you studied.
          </span>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
          <SmallButton onClick={resetProgress} danger filled={confirmingReset} disabled={resetting} icon={RotateCcw}>
            {resetting ? 'Resetting' : confirmingReset ? 'Confirm reset' : 'Reset'}
          </SmallButton>
          {confirmingReset && !resetting && (
            <QuietButton onClick={() => { setConfirmingReset(false); setResetError('') }}>
              Cancel reset
            </QuietButton>
          )}
        </div>

        {resetError && (
          <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '10px', lineHeight: 1.4 }}>
            {resetError}
          </div>
        )}
      </div>
    )

    // Only reachable for a track whose language has since been paused — it
    // stuck around so it's never silently orphaned, but the learner can choose
    // to actually drop it here.
    if (key === 'remove') return (
      <div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          {removeTarget
            ? <>Deletes your <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{languageTheme(removeTarget).languageName}</strong> track and its flashcards, tests, story reads and unlocks. This can't be undone.</>
            : "These tracks are for a language that's not offered right now — pick one to remove it."}
        </div>

        <div role="radiogroup" aria-label="Language to remove" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
          {removableTracks.map(t => (
            <TrackChip
              key={t.language}
              track={t}
              on={t.language === removeTarget}
              disabled={confirmingRemove}
              dim={confirmingRemove && t.language !== removeTarget}
              onClick={() => { setRemoveTarget(t.language); setConfirmingRemove(false); setRemoveError('') }}
            />
          ))}
        </div>

        {removeTarget && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
            <SmallButton onClick={() => removeLanguageTrack(removeTarget)} danger filled={confirmingRemove} disabled={removing} icon={Trash2}>
              {removing ? 'Removing' : confirmingRemove ? 'Confirm remove' : 'Remove'}
            </SmallButton>
            {confirmingRemove && !removing && (
              <QuietButton onClick={() => { setConfirmingRemove(false); setRemoveError('') }}>
                Cancel remove
              </QuietButton>
            )}
          </div>
        )}

        {removeError && (
          <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '10px', lineHeight: 1.4 }}>
            {removeError}
          </div>
        )}
      </div>
    )

    // Account deletion — self-serve and in-app, as both app stores require.
    // Total and permanent: the delete_my_account RPC removes every owned row and
    // the login itself. One notch sterner than the reset: armed by a tap,
    // confirmed by typing the word.
    if (key === 'delete') return (
      <div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Permanently deletes your account and everything in it — flashcards, review
          history, story progress, test results and settings, for every language —
          and your login with it. <strong style={{ color: 'var(--danger)', fontWeight: 700 }}>This
          cannot be undone.</strong> For a fresh start without losing your account,
          use “Reset a language” instead.
        </div>

        {deleteArmed && (
          <div style={{ marginTop: '14px' }}>
            <label style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Type <strong style={{ color: 'var(--danger)', fontWeight: 700 }}>{DELETE_CONFIRM_WORD}</strong> to
              confirm you want your account gone for good.
            </label>
            <input
              type="text"
              value={deleteWord}
              onChange={e => setDeleteWord(e.target.value)}
              disabled={deleting}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label={'Type ' + DELETE_CONFIRM_WORD + ' to confirm account deletion'}
              style={{
                width: '100%', maxWidth: '260px', boxSizing: 'border-box',
                minHeight: '44px', padding: '10px 12px', borderRadius: '10px',
                border: '1px solid var(--danger-border)',
                background: 'var(--surface)', color: 'var(--text)',
                fontSize: '14px', fontFamily: 'Inter, sans-serif',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
          <SmallButton
            onClick={deleteAccount}
            danger
            filled={deleteArmed}
            disabled={deleting || (deleteArmed && !confirmWordOk(deleteWord))}
            icon={Trash2}
          >
            {deleting ? 'Deleting' : deleteArmed ? 'Delete forever' : 'Delete account'}
          </SmallButton>
          {deleteArmed && !deleting && (
            <QuietButton onClick={() => { setDeleteArmed(false); setDeleteWord(''); setDeleteError('') }}>
              Cancel — keep my account
            </QuietButton>
          )}
        </div>

        {deleteError && (
          <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '10px', lineHeight: 1.4 }}>
            {deleteError}
          </div>
        )}
      </div>
    )

    return null
  }

  return (
    <Shell accentHex={accentHex} fontFamily={fontFamily}>
      <AppBar kind="close" onBack={onBack} sticky={false} />

      <PageHeader
        title={profile.display_name || session.user.email}
        meta={metaLine(systemLabel, levelLabel)}
        style={{ margin: '22px 0 18px' }}
      />

      {/* The one lit thing on this screen (R1). It answers "how much Chinese
          have I learned?" once, in one object, instead of across four panels
          that used to contradict each other — "Words mastered" appeared twice
          with the level's number and the lifetime number under identical words.
          Every figure here is scoped and labelled by `profileProgress`. */}
      <HeroPanel accentHex={accentHex} seed="profile" style={{ marginBottom: '14px' }}>
        {/* The level is the section's heading — no extra chrome, and a screen
            reader still gets a landmark to jump to. */}
        <h2 style={{ margin: 0 }}><Eyebrow onHero>{levelLabel}</Eyebrow></h2>
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '40px', fontWeight: 800, color: '#fff', lineHeight: 1, ...NUM }}>
            {loading ? '—' : progress.learned.value}
          </span>
          <span style={{ fontSize: '15px', color: ON_HERO.body, fontWeight: 650 }}>
            {loading ? '' : 'of ' + progress.learned.of + ' words learned'}
          </span>
        </div>

        {/* Mastery, named by its level so it can never be read as a lifetime
            total. The bar is decoration over the sentence, not the source of
            it — the numbers are written out beside it. Held back until the
            counts have actually arrived: "0 of 0" is a lie, not a skeleton. */}
        {!loading && (
        <div
          role="img"
          aria-label={progress.a11yLabel}
          style={{ marginTop: '20px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '8px' }}>
            <span style={{ fontSize: '13.5px', color: '#fff', fontWeight: 700 }}>
              {progress.mastered.label}
            </span>
            <span style={{ fontSize: '13.5px', color: ON_HERO.body, fontWeight: 650, ...NUM }}>
              {progress.mastered.value} of {progress.mastered.of}
            </span>
          </div>
          <div style={{ height: '7px', borderRadius: '999px', background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '999px', background: '#fff',
              width: progress.mastered.pct + '%', transition: 'width 700ms ease',
            }} />
          </div>
        </div>
        )}

        {!loading && progress.test.label && (
          <div style={{ marginTop: '12px', fontSize: '13px', color: ON_HERO.body }}>
            {progress.test.label}
          </div>
        )}

        {/* Recent activity, in one line. Home owns the richer weekly rhythm. */}
        {!loading && (
        <div style={{
          marginTop: '18px', paddingTop: '14px',
          borderTop: '1px solid rgba(255,255,255,0.16)',
          display: 'flex', alignItems: 'center', gap: '9px',
        }}>
          <CalendarCheck size={15} strokeWidth={1.9} color={ON_HERO.body} />
          <span style={{ fontSize: '13px', color: ON_HERO.body }}>{progress.rhythm.label}</span>
          {retentionPct !== null && (
            <span style={{ fontSize: '13px', color: ON_HERO.body, ...NUM }}>
              · {retentionPct}% recalled
            </span>
          )}
        </div>
        )}
      </HeroPanel>

      {!loading && leeches.length > 0 && (
        <Panel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
              <AlertTriangle size={17} strokeWidth={1.95} color="#D97706" />
              Words that keep slipping
            </h2>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 650 }}>{leeches.length}</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
            These have lapsed the most. A focused drill helps them stick.
          </div>
          <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
            {leeches.map((l, i) => (
              <button key={i} onClick={() => setCoachVocab(l.vocabulary)} title="See it a different way" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', width: '100%', textAlign: 'left',
                padding: '10px 14px', borderRadius: '12px', background: 'var(--surface-2)', border: '1px solid var(--border)',
                cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', minWidth: 0 }}>
                  <span style={{ fontSize: '20px', fontFamily, color: 'var(--text)', flexShrink: 0 }}>{l.vocabulary.word}</span>
                  <span style={{ fontSize: '12px', color: pinyinInk(accentHex), fontWeight: 600, flexShrink: 0 }}>{l.vocabulary.reading}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanMeaning(l.vocabulary.meaning)}</span>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#D97706', background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.28)', borderRadius: '999px', padding: '3px 9px' }}>
                    missed {l.lapses}×
                  </span>
                  <Sparkles size={15} strokeWidth={2} color={accentHex} />
                </span>
              </button>
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

      <StuckWordCoach vocab={coachVocab} onClose={() => setCoachVocab(null)} />

      {!loading && wordMap.totals.total > 0 && (
        <Panel>
          <KnownWordMap map={wordMap} accentHex={accentHex} language={track.language} system={track.system} />
        </Panel>
      )}

      {/* The controls, as rows (P10-B4). These were four stacked panels — daily
          goal, reset a language, remove a language, delete account — each with
          a heading, a paragraph and a button, plus a fifth standalone Sign out
          button: ~590px of permanent screen for four things a learner touches
          roughly once ever. Nothing was removed. Every option, warning and
          confirmation step is still here, one tap inside its own row. */}
      {controlGroups({
        dailyNewCards: profile.daily_new_cards,
        resetLanguageName: languageTheme(targetTrack.language).languageName,
        removableCount: removableTracks.length,
      }).map(group => (
        <Panel key={group.key} danger={group.tone === 'danger'}>
          <h2 style={{ margin: '0 0 2px' }}>
            <Eyebrow style={group.tone === 'danger' ? { color: 'var(--danger)' } : {}}>
              {group.heading}
            </Eyebrow>
          </h2>
          {group.rows.map((row, i) => (
            <ControlRow
              key={row.key}
              row={row}
              icon={ROW_ICONS[row.key]}
              accentHex={accentHex}
              danger={group.tone === 'danger'}
              first={i === 0}
              open={openRow === row.key}
              onActivate={() => toggleRow(row)}
            >
              {rowBody(row.key)}
            </ControlRow>
          ))}
        </Panel>
      ))}
    </Shell>
  )
}

export function KnownWordMap({ map, accentHex, language, system }) {
  const SEGMENTS = [
    { key: 'mastered', label: 'Mastered', color: '#2F9E6D' },
    { key: 'known', label: 'Known', color: accentHex },
    { key: 'learning', label: 'Learning', color: '#D97706' },
    { key: 'new', label: 'Not yet', color: 'var(--border)' },
  ]
  return (
    <div>
      <h2 style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
        <BookOpen size={17} strokeWidth={1.85} color={accentHex} />
        Known-word map
      </h2>
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

function SmallButton({ children, onClick, accentHex, filled, danger, disabled, icon: Icon }) {
  const color = danger ? 'var(--danger)' : (accentHex || 'var(--text-muted)')
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: '44px',
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
