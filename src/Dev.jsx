import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { isDevUser, masteredCardRow, learningCardRow, chunk } from './devTools'
import { getLevels, getLevelLabel, getSystemLabel } from './utils'
import { languageTheme } from './languageTheme'
import { buildLabel } from './version'
import { toast } from './toast'
import {
  ArrowLeft, FlaskConical, Gauge, BookOpen, Trash2, Zap, RefreshCw, ShieldCheck,
} from 'lucide-react'

// Developer page (/dev) — self-service testing tools. Everything here runs as
// the signed-in user through RLS, so it can only touch this account's own
// rows; access is additionally gated to the dev email allowlist (devTools.js).
// Not linked from the main nav — reachable via /dev or the Settings link.

function Section({ icon: Icon, title, children, accent }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px',
      padding: '18px 20px', marginBottom: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Icon size={16} strokeWidth={2} color={accent} />
        <span style={{ fontSize: '13.5px', fontWeight: 750, color: 'var(--text)' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>{children}</div>
    </div>
  )
}

// Small action button with built-in busy state and (optional) two-tap confirm
// for destructive actions — no native dialogs, same pattern as Test.jsx.
function Action({ label, onRun, danger, confirm }) {
  const [busy, setBusy] = useState(false)
  const [arming, setArming] = useState(false)
  const run = async () => {
    if (busy) return
    if (confirm && !arming) { setArming(true); setTimeout(() => setArming(false), 2500); return }
    setArming(false)
    setBusy(true)
    try { await onRun() } catch (e) { toast({ kind: 'info', title: 'Failed', body: e.message || String(e) }) }
    setBusy(false)
  }
  const color = danger ? '#DC2626' : 'var(--text)'
  return (
    <button onClick={run} disabled={busy} style={{
      padding: '9px 14px', borderRadius: '10px', cursor: busy ? 'wait' : 'pointer',
      border: '1px solid ' + (danger ? '#DC262640' : 'var(--border)'),
      background: arming ? '#DC262615' : 'var(--surface)',
      color, fontSize: '12.5px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
      opacity: busy ? 0.6 : 1,
    }}>
      {busy ? 'Working…' : (arming ? 'Tap again to confirm' : label)}
    </button>
  )
}

export default function Dev({ session, profile, track, onBack, onNavigate }) {
  const email = session?.user?.email
  const allowed = isDevUser(email)
  const theme = languageTheme(profile.active_language)
  const accent = theme.accentHex
  const [counts, setCounts] = useState(null)

  const levels = getLevels(track.language, track.system)
  const lvlLabel = (l) => getLevelLabel(track.language, track.system, l)

  // Live card-state snapshot for the active language (all levels).
  async function loadCounts() {
    const { data } = await supabase
      .from('cards')
      .select('state, vocabulary!inner(language, system)')
      .eq('user_id', session.user.id)
      .eq('vocabulary.language', track.language)
      .eq('vocabulary.system', track.system)
    const c = { new: 0, learning: 0, review: 0, relearning: 0, total: 0 }
    for (const r of data || []) { c[r.state] = (c[r.state] || 0) + 1; c.total += 1 }
    setCounts(c)
  }
  useEffect(() => {
    if (!allowed) return undefined
    const timer = setTimeout(loadCounts, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!allowed) {
    return (
      <div style={{ maxWidth: '520px', margin: '80px auto', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
        <FlaskConical size={28} color="var(--text-faint)" style={{ marginBottom: '10px' }} />
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Developer tools</div>
        <div style={{ fontSize: '13px', marginTop: '6px' }}>This page is only available to developer accounts.</div>
      </div>
    )
  }

  const vocabIdsAtLevels = async (maxLevel, exactLevel) => {
    let q = supabase.from('vocabulary').select('id')
      .eq('language', track.language).eq('system', track.system).eq('is_active', true)
    if (exactLevel != null) q = q.eq('level', exactLevel)
    else q = q.lte('level', maxLevel)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data || []).map(v => v.id)
  }

  const upsertCards = async (ids, rowFor) => {
    for (const part of chunk(ids)) {
      const { error } = await supabase.from('cards')
        .upsert(part.map(id => rowFor(session.user.id, id)), { onConflict: 'user_id,vocab_id' })
      if (error) throw new Error(error.message)
    }
  }

  const deleteCards = async (ids) => {
    for (const part of chunk(ids)) {
      const { error } = await supabase.from('cards')
        .delete().eq('user_id', session.user.id).in('vocab_id', part)
      if (error) throw new Error(error.message)
    }
  }

  const done = async (msg) => { toast({ kind: 'info', title: msg }); await loadCounts() }
  const setLevel = async (lvl) => {
    const { error } = await supabase.from('language_tracks')
      .update({ current_level: lvl }).eq('id', track.id)
    if (error) throw new Error(error.message)
    toast({ kind: 'info', title: 'Level set to ' + lvlLabel(lvl) })
    onNavigate('home')   // Home reload picks up the new track
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '28px 18px 60px', fontFamily: 'Inter, sans-serif' }}>
      <button onClick={onBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px',
        border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '10px',
        padding: '8px 12px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer',
      }}>
        <ArrowLeft size={14} /> Home
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '4px' }}>
        <FlaskConical size={20} strokeWidth={2} color={accent} />
        <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>Developer tools</span>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px', lineHeight: 1.6 }}>
        {email} · build {buildLabel()} · {getSystemLabel(track.system)} {lvlLabel(track.current_level)}
        {counts && <> · cards: {counts.total} ({counts.new} new / {counts.learning + counts.relearning} learning / {counts.review} review)</>}
        <br />All actions affect ONLY this account (RLS) — safe to experiment.
      </div>

      <Section icon={Gauge} title="Level jump (no test required)" accent={accent}>
        {levels.map(l => (
          <Action key={l} label={lvlLabel(l) + (l === track.current_level ? ' ✓' : '')} onRun={() => setLevel(l)} />
        ))}
      </Section>

      <Section icon={ShieldCheck} title={'Vocabulary — current level (' + lvlLabel(track.current_level) + ')'} accent={accent}>
        <Action label="Master ALL words" onRun={async () => {
          const ids = await vocabIdsAtLevels(null, track.current_level)
          await upsertCards(ids, masteredCardRow)
          await done('Mastered ' + ids.length + ' words — stories, tiers and the level test are unlocked')
        }} />
        <Action label="Start all as learning" onRun={async () => {
          const ids = await vocabIdsAtLevels(null, track.current_level)
          await upsertCards(ids, learningCardRow)
          await done(ids.length + ' words set to learning (all due now)')
        }} />
        <Action danger confirm label="Delete this level's cards" onRun={async () => {
          const ids = await vocabIdsAtLevels(null, track.current_level)
          await deleteCards(ids)
          await done('Deleted cards for ' + ids.length + ' words')
        }} />
      </Section>

      <Section icon={ShieldCheck} title="Vocabulary — whole language" accent={accent}>
        <Action label={'Master everything ≤ ' + lvlLabel(track.current_level)} onRun={async () => {
          const ids = await vocabIdsAtLevels(track.current_level, null)
          await upsertCards(ids, masteredCardRow)
          await done('Mastered ' + ids.length + ' words across all levels up to current')
        }} />
        <Action danger confirm label="FULL reset (cards, tests, unlocks)" onRun={async () => {
          const { error } = await supabase.rpc('reset_current_language_progress', {
            p_language: track.language, p_system: track.system, p_reset_streak: true,
          })
          if (error) throw new Error(error.message)
          toast({ kind: 'info', title: 'Progress reset — back to a fresh account for this language' })
          onNavigate('home')
        }} />
      </Section>

      <Section icon={BookOpen} title="Stories & test" accent={accent}>
        <Action label="Mark all stories at this level read" onRun={async () => {
          const { data, error } = await supabase.from('stories').select('id')
            .eq('language', track.language).eq('system', track.system)
            .eq('level', track.current_level).eq('is_published', true)
          if (error) throw new Error(error.message)
          const rows = (data || []).map(s => ({ user_id: session.user.id, story_id: s.id }))
          for (const part of chunk(rows)) {
            const { error: e2 } = await supabase.from('story_reads').upsert(part)
            if (e2) throw new Error(e2.message)
          }
          await done((data || []).length + ' stories marked read')
        }} />
        <Action danger confirm label="Clear ALL my story reads" onRun={async () => {
          const { error } = await supabase.from('story_reads').delete().eq('user_id', session.user.id)
          if (error) throw new Error(error.message)
          await done('Story reads cleared')
        }} />
        <Action label="Clear today's test attempts" onRun={async () => {
          const today = new Date().toISOString().slice(0, 10)
          const { error } = await supabase.from('test_attempts').delete()
            .eq('user_id', session.user.id).eq('language', track.language)
            .eq('system', track.system).eq('level', track.current_level)
            .eq('attempt_date', today)
          if (error) throw new Error(error.message)
          await done('Today’s attempts cleared — 3 fresh tries')
        }} />
      </Section>


      <Section icon={Zap} title="Client" accent={accent}>
        <Action label="Reload fresh (clear caches + IndexedDB)" onRun={async () => {
          try { indexedDB.deleteDatabase('hanzi-offline') } catch { /* best effort */ }
          if (typeof caches !== 'undefined') {
            const keys = await caches.keys()
            await Promise.all(keys.map(k => caches.delete(k)))
          }
          window.location.reload()
        }} />
        <Action label="Refresh counts" onRun={async () => { await loadCounts(); toast({ kind: 'info', title: 'Counts refreshed' }) }} />
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: 'var(--text-faint)' }}>
        <RefreshCw size={12} /> After data changes, go Home — it reloads profile, track and counts.
        <Trash2 size={12} style={{ marginLeft: '8px' }} /> Red actions need a second tap.
      </div>
    </div>
  )
}
