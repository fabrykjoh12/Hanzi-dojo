import { useState, useEffect, useCallback, useMemo, useId } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, FlaskConical, Gauge, GraduationCap, Trophy, Zap, Trash2 } from 'lucide-react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { chunk } from './devTools'
import { toast } from './toast'
import {
  PRESET_COUNTS, parseCount, levelOptions, missingUnlockLevels, unlockRows,
  pickUnstartedVocabIds, creativeCardRows, pickCardsToForceDue, forceDueUpdate,
  armConfirm, describeApplied,
} from './creativeMode'

// Creative mode — the admin sandbox that lives at the bottom of /dashboard.
//
// It puts the SIGNED-IN account into an arbitrary state so the app can be
// tested: jump to a level, learn or master N words, pull reviews forward, wipe
// the language. It is `/unlock` and `/reset` with a UI.
//
// Safety, in one place so it stays true:
//   · Every write below filters on `session.user.id` (or `track.id` + user id),
//     and RLS enforces the same thing server-side. There is no code path here
//     that names another account.
//   · Card rows come from creativeMode.js, which never sets `is_easy` true and
//     never writes `ease_factor`.
//   · Cards are never deleted; the only deleting action is the existing
//     `reset_current_language_progress` RPC.
//   · `level_unlocks` is only ever appended to.
//
// All of the decision-making (which levels, which words, what row, what needs
// confirming) is in creativeMode.js and tested there. This file is the shell.

// Warning amber. A status colour, so it is hardcoded on purpose (CLAUDE.md §5)
// — the point is that this block does NOT wear the language accent like the
// real screens do.
const WARN = '#B45309'

const PAGE = 1000

// PostgREST caps a response at 1000 rows, and a full HSK track has more
// vocabulary than that. Each call must build a FRESH query — a Supabase builder
// is single-use.
//
// MAX_PAGES is a backstop, not a limit anyone should reach: the loop normally
// ends on a short page, but a server whose `db-max-rows` is set below PAGE
// returns a full-looking page forever and would hang the tab. Reaching it
// throws rather than returning a truncated list — a silent half-answer here
// would seed half a level and look like it worked.
const MAX_PAGES = 100

async function fetchPaged(build) {
  const out = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data || []
    for (const r of rows) out.push(r)
    if (rows.length < PAGE) return out
  }
  throw new Error('Read more than ' + MAX_PAGES * PAGE + ' rows without reaching the end — check the server row limit.')
}

function Field({ label, children }) {
  const labelId = useId()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span id={labelId} style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>{children}</div>
    </div>
  )
}

// `active` marks a chosen value (announced as a pressed toggle); `current`
// marks the option you are already on (announced as aria-current). Both look
// the same, so the shared `on` below keeps the styling identical.
function Btn({ label, icon: Icon, onClick, active, current, danger, armed, busy, disabled }) {
  const tone = danger ? WARN : 'var(--text)'
  const on = active || current
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      aria-pressed={active === undefined ? undefined : Boolean(active)}
      aria-current={current ? 'true' : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '8px 12px', borderRadius: '10px',
        border: '1px solid ' + (armed ? WARN : 'var(--border)'),
        background: armed
          ? 'color-mix(in srgb, ' + WARN + ' 14%, var(--surface))'
          : (on ? 'var(--surface-2)' : 'var(--surface)'),
        color: armed ? WARN : tone,
        fontSize: '12.5px', fontWeight: on ? 700 : 600,
        fontFamily: 'Inter, sans-serif',
        cursor: (busy || disabled) ? 'not-allowed' : 'pointer',
        opacity: (busy || disabled) ? 0.55 : 1,
      }}
    >
      {Icon && <Icon size={14} strokeWidth={2} />}
      {busy ? 'Working…' : (armed ? 'Tap again to confirm' : label)}
    </button>
  )
}

export default function CreativeMode({ session, profile, track }) {
  const userId = session.user.id
  const accent = languageTheme(profile.active_language).accentHex

  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState(track.current_level)
  const [countRaw, setCountRaw] = useState('50')
  const [armed, setArmed] = useState(null)
  const [busy, setBusy] = useState(null)
  const [status, setStatus] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const count = parseCount(countRaw)
  const label = (l) => getLevelLabel(track.language, track.system, l)

  // Everything the pure module needs to decide what to write: the vocabulary in
  // scope (levels up to the selected one), this account's cards for the track,
  // and which levels are already unlocked.
  const loadSnapshot = useCallback(async () => {
    try {
      const [vocab, cards, unlocks] = await Promise.all([
        fetchPaged(() => supabase.from('vocabulary')
          .select('id, level, sort_order')
          .eq('language', track.language).eq('system', track.system)
          .eq('is_active', true).lte('level', level)
          .order('level', { ascending: true }).order('sort_order', { ascending: true })),
        fetchPaged(() => supabase.from('cards')
          .select('id, vocab_id, state, due_at, stability, vocabulary!inner(language, system)')
          .eq('user_id', userId)
          .eq('vocabulary.language', track.language)
          .eq('vocabulary.system', track.system)
          .order('due_at', { ascending: true })),
        fetchPaged(() => supabase.from('level_unlocks')
          .select('level')
          .eq('user_id', userId)
          .eq('language', track.language).eq('system', track.system)
          .order('level', { ascending: true })),
      ])
      setSnapshot({
        vocab,
        cards,
        startedIds: cards.map(c => c.vocab_id),
        unlockLevels: unlocks.map(u => u.level),
      })
      setLoadError(null)
    } catch (e) {
      setSnapshot(null)
      setLoadError(e.message || String(e))
    }
  }, [userId, track.language, track.system, level])

  // Deferred by a tick so the effect body itself never calls setState — same
  // pattern as Dev.jsx, and it keeps the panel's first paint free of a fetch.
  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(loadSnapshot, 0)
    return () => clearTimeout(timer)
  }, [open, loadSnapshot])

  // One gate for every action: destructive or bulk work arms first and only
  // runs on a second tap (armConfirm decides which is which).
  async function run(key, confirmCount, work) {
    if (busy) return
    const gate = armConfirm(key, confirmCount, armed)
    if (!gate.run) {
      setArmed(gate.armedKey)
      return
    }
    setArmed(null)
    setBusy(key)
    try {
      const msg = await work()
      setStatus(msg)
      toast({ kind: 'info', title: msg })
    } catch (e) {
      setStatus('Failed — ' + (e.message || String(e)))
    }
    setBusy(null)
    await loadSnapshot()
  }

  async function jumpTo(target) {
    // level_unlocks is append-only (§7.5): jumping up appends the unlocks the
    // new level implies, jumping down leaves the history exactly as it was.
    const missing = missingUnlockLevels(track.language, track.system, target, snapshot ? snapshot.unlockLevels : [])
    if (missing.length > 0) {
      const { error } = await supabase.from('level_unlocks')
        .upsert(unlockRows(userId, track.language, track.system, missing), { onConflict: 'user_id,language,system,level' })
      if (error) throw new Error(error.message)
    }
    const { error } = await supabase.from('language_tracks')
      .update({ current_level: target })
      .eq('id', track.id).eq('user_id', userId)
    if (error) throw new Error(error.message)
    setLevel(target)
    return 'Now at ' + label(target)
      + (missing.length > 0 ? ' · appended ' + missing.length + ' unlock row' + (missing.length === 1 ? '' : 's') : '')
      + ' · go Home to reload'
  }

  async function seedCards(mode) {
    const ids = pickUnstartedVocabIds(snapshot ? snapshot.vocab : [], snapshot ? snapshot.startedIds : [], count)
    const rows = creativeCardRows(userId, ids, mode)
    for (const part of chunk(rows)) {
      const { error } = await supabase.from('cards').upsert(part, { onConflict: 'user_id,vocab_id' })
      if (error) throw new Error(error.message)
    }
    return describeApplied(rows.length, count, mode === 'mastered' ? 'words mastered' : 'words learned')
  }

  async function pullDue() {
    const ids = pickCardsToForceDue(snapshot ? snapshot.cards : [], count)
    const update = forceDueUpdate()
    for (const part of chunk(ids)) {
      const { error } = await supabase.from('cards').update(update)
        .eq('user_id', userId).in('id', part)
      if (error) throw new Error(error.message)
    }
    return describeApplied(ids.length, count, 'cards pulled due')
  }

  async function resetLanguage() {
    // Reuse the existing RPC — it is the only sanctioned way to delete cards.
    const { error } = await supabase.rpc('reset_current_language_progress', {
      p_language: track.language, p_system: track.system, p_reset_streak: true,
    })
    if (error) throw new Error(error.message)
    setLevel(1)
    return getSystemLabel(track.system) + ' progress reset — go Home to reload'
  }

  const started = snapshot ? snapshot.cards.length : 0
  const inScope = snapshot ? snapshot.vocab.length : 0
  const unstarted = useMemo(() => {
    if (!snapshot) return 0
    const have = new Set(snapshot.startedIds)
    return snapshot.vocab.filter(v => !have.has(v.id)).length
  }, [snapshot])

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid color-mix(in srgb, ' + WARN + ' 34%, var(--border))',
      borderRadius: '14px', overflow: 'hidden',
      marginTop: '10px',
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
          padding: '14px 20px', cursor: 'pointer', textAlign: 'left',
          background: 'color-mix(in srgb, ' + WARN + ' 9%, var(--surface))',
          border: 'none', borderBottom: open ? '1px solid var(--border)' : 'none',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <FlaskConical size={16} strokeWidth={2} color={WARN} />
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Creative mode</span>
        <span style={{
          fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: WARN, border: '1px solid color-mix(in srgb, ' + WARN + ' 45%, transparent)',
          borderRadius: '999px', padding: '2px 8px',
        }}>
          Testing tool
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', display: 'inline-flex' }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {open && (
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <AlertTriangle size={15} strokeWidth={2} color={WARN} style={{ marginTop: '2px', flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
              Writes fake progress to <strong style={{ color: 'var(--text)' }}>your own account only</strong> ({session.user.email}) so
              the app can be tested without hand-written SQL. Nothing here reads or touches another user.
              After a change, go Home — that is what reloads the profile, track and counts.
            </p>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <span style={{ color: ink(accent), fontWeight: 700 }}>{getSystemLabel(track.system)} {label(level)}</span>
            {' · '}
            {loadError
              ? <span style={{ color: WARN }}>Couldn’t read your progress: {loadError}</span>
              : (snapshot
                ? <>{inScope} words in scope · {started} cards · {unstarted} not started yet</>
                : <>Loading your progress…</>)}
          </div>

          <Field label={'Jump to level (' + label(level) + ' now)'}>
            {levelOptions(track.language, track.system, level).map(o => (
              <Btn
                key={o.level}
                label={o.label}
                icon={o.isCurrent ? Gauge : undefined}
                current={o.isCurrent}
                busy={busy === 'jump'}
                disabled={!snapshot}
                onClick={() => run('jump', 0, () => jumpTo(o.level))}
              />
            ))}
          </Field>

          <Field label="How many words">
            {PRESET_COUNTS.map(n => (
              <Btn key={n} label={String(n)} active={count === n} onClick={() => { setCountRaw(String(n)); setArmed(null) }} />
            ))}
            <input
              type="number" min="1" value={countRaw}
              onChange={(e) => { setCountRaw(e.target.value); setArmed(null) }}
              aria-label="Number of words"
              style={{
                // 16px, never less: an iOS WKWebView zooms the whole page in
                // when a focused input's text is smaller. Vertical padding drops
                // to 6px so the taller text still lines up with the 12.5px Btns
                // sharing this row.
                width: '92px', padding: '6px 10px', borderRadius: '10px',
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--text)', fontSize: '16px', fontFamily: 'Inter, sans-serif',
              }}
            />
          </Field>

          <Field label={'Actions on the next ' + (count || '—') + ' words'}>
            <Btn
              label={'Learn ' + count + ' words'} icon={GraduationCap}
              busy={busy === 'learn'} armed={armed === 'learn'} disabled={!snapshot || count === 0}
              onClick={() => run('learn', count, () => seedCards('learned'))}
            />
            <Btn
              label={'Master ' + count + ' words'} icon={Trophy}
              busy={busy === 'master'} armed={armed === 'master'} disabled={!snapshot || count === 0}
              onClick={() => run('master', count, () => seedCards('mastered'))}
            />
            <Btn
              label={'Make ' + count + ' cards due now'} icon={Zap} danger
              busy={busy === 'due'} armed={armed === 'due'} disabled={!snapshot || count === 0}
              onClick={() => run('due', count, pullDue)}
            />
          </Field>

          <Field label="Start over">
            <Btn
              label={'Reset ' + getSystemLabel(track.system) + ' progress'} icon={Trash2} danger
              busy={busy === 'reset'} armed={armed === 'reset'}
              onClick={() => run('reset', 0, resetLanguage)}
            />
            <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>
              Deletes cards, reviews, tests and unlocks for this language (the existing reset RPC).
            </span>
          </Field>

          {status && (
            <div style={{
              fontSize: '12.5px', color: 'var(--text)', padding: '10px 12px', borderRadius: '10px',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
            }}>
              {status}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
