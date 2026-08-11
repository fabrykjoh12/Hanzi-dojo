import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { languageTheme, ink, inkStrong} from './languageTheme'
import { getLevelLabel } from './utils'
import { useIsMobile } from './useIsMobile'
import { flatPanel, NUM } from './designTokens'
import { toast } from './toast'
import { PACING, estimateDays } from './priorKnowledge'
import { matchPastedText } from './priorKnowledgeImport'
import { seedClaim } from './priorKnowledgeSeed'
import {
  buildReviewGroups, selectAll, toggleSelection, setSelected,
  groupState, idsOf, claimIdsFor, initialOpenLevels, toggleLevelOpen,
} from './knownWordsReview'
import { Check, ChevronDown, ChevronRight, Minus } from 'lucide-react'
import AppBar from './AppBar'

// "Words you already know" — bring prior knowledge into review.
//
// Two ways to make a claim (a set of vocab ids the learner already knows):
//   • Paste a list (Anki / Pleco export, or a bare column) → matched by the same
//     matcher the reader uses to decide what is tappable, then REVIEWED word by
//     word before anything is seeded — a paste is a claim about a whole deck,
//     and nobody remembers a whole deck equally.
//   • Browse & check — tap words from a frequency-ordered grid.
// Both end at a pacing picker and seed the claim as spread-out review cards.
// Words that already have a card can never be claimed here (§13: no clobbering).
//
// The selection, grouping and "what will be seeded" derivation are pure and live
// in knownWordsReview.js; this file only draws them.

const PAGE = 1000   // PostgREST hard cap — page until a short page comes back

async function loadAllVocab(track) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('vocabulary')
      .select('id, word, reading, meaning, level, sort_order')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('is_active', true)
      .not('level', 'is', null)
      .order('level').order('sort_order')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

export default function KnownWords({ session, profile, track, onBack }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const langFont = theme.font

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [vocab, setVocab] = useState([])
  const [carded, setCarded] = useState(() => new Set())   // vocab ids that already have a card

  const [mode, setMode] = useState('paste')               // 'paste' | 'browse'
  const [text, setText] = useState('')
  const [pasteResult, setPasteResult] = useState(null)    // { ids, unmatchedLines }
  const [ticked, setTicked] = useState(() => new Set())   // paste review — ids still claimed
  const [openLevels, setOpenLevels] = useState(() => new Set())
  const [picked, setPicked] = useState(() => new Set())   // browse selections
  const [pacing, setPacing] = useState('steady')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [vrows, crows] = await Promise.all([
          loadAllVocab(track),
          supabase.from('cards').select('vocab_id'),
        ])
        if (cancelled) return
        setVocab(vrows)
        setCarded(new Set((crows.data || []).map(c => c.vocab_id)))
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'Could not load your words.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [track.language, track.system])

  // word → vocab, for the paste matcher (the shape it expects).
  const vocabMap = useMemo(() => {
    const m = {}
    vocab.forEach(v => { if (!m[v.word]) m[v.word] = v })
    return m
  }, [vocab])

  const byLevel = useMemo(() => {
    const groups = new Map()
    vocab.forEach(v => {
      if (!groups.has(v.level)) groups.set(v.level, [])
      groups.get(v.level).push(v)
    })
    return [...groups.entries()].sort((a, b) => a[0] - b[0])
  }, [vocab])

  // What a paste turned up, grouped by level and stripped of anything already in
  // the deck. Rebuilt whenever the match or the deck changes.
  const review = useMemo(
    () => buildReviewGroups(vocab, pasteResult ? pasteResult.ids : [], carded),
    [vocab, pasteResult, carded],
  )

  // The claim: for a paste, only what is still ticked; for browse, what was
  // tapped. Both stay in the loaded (frequency) order so the spread is
  // frequency-ordered, and both exclude anything already carded.
  const claimIds = useMemo(() => {
    if (mode === 'paste') return claimIdsFor(review, ticked)
    return vocab.filter(v => picked.has(v.id) && !carded.has(v.id)).map(v => v.id)
  }, [mode, review, ticked, picked, vocab, carded])

  const runPaste = () => {
    const { matchedIds, unmatchedLines } = matchPastedText(text, vocabMap, track.language)
    const next = buildReviewGroups(vocab, matchedIds, carded)
    setPasteResult({ ids: matchedIds, unmatchedLines })
    setTicked(selectAll(next.orderedIds))       // everything ticked to start
    setOpenLevels(initialOpenLevels(next.groups))
  }

  const clearPaste = () => {
    setPasteResult(null)
    setTicked(new Set())
    setOpenLevels(new Set())
  }

  const toggle = (id) => {
    if (carded.has(id)) return
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const claimAll = (words) => {
    setPicked(prev => {
      const next = new Set(prev)
      words.forEach(v => { if (!carded.has(v.id)) next.add(v.id) })
      return next
    })
  }

  const confirm = async () => {
    if (!claimIds.length || saving) return
    setSaving(true); setSaveError(null)
    try {
      const perDay = (PACING.find(p => p.key === pacing) || PACING[1]).perDay
      const { inserted } = await seedClaim({
        userId: session.user.id,
        vocabIds: claimIds,
        perDay,
        source: mode === 'paste' ? 'paste' : 'checklist',
      })
      toast(`Added ${inserted} word${inserted === 1 ? '' : 's'} to review`)
      onBack()
    } catch (e) {
      setSaveError(e.message || 'Could not save. Please try again.')
      setSaving(false)
    }
  }

  const pad = isMobile ? '16px' : '32px'

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <div style={{ fontSize: '30px', color: accentHex, fontFamily: "'" + langFont + "'" }}>学</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '10px' }}>Loading your words…</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: pad }}>
      <AppBar kind="back" onBack={onBack} sticky={false} />

      <h1 style={{ fontSize: '24px', fontWeight: 750, color: 'var(--text)', margin: '10px 0 6px', fontFamily: 'Inter, sans-serif' }}>
        Words you already know
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '20px' }}>
        Learned some {theme.languageName} before you found us? Tell us which words, and we’ll add
        them to review a few each day so they stay sharp instead of quietly fading.
      </p>

      {loadError && <div style={errorBox}>{loadError}</div>}

      <div role="group" aria-label="How to add words" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[['paste', 'Paste a list'], ['browse', 'Browse & check']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            aria-pressed={mode === key}
            style={{
              flex: 1, padding: '10px', borderRadius: '10px', cursor: 'pointer',
              border: '2px solid ' + (mode === key ? accentHex : 'var(--border)'),
              background: mode === key ? accentHex + '12' : 'var(--surface)',
              color: 'var(--text)', fontSize: '14px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'paste' && (
        <div style={{ marginBottom: '22px' }}>
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); clearPaste() }}
            placeholder={'Paste words here — an Anki or Pleco export, or one word per line.'}
            rows={7}
            style={{
              width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', fontSize: '15px',
              fontFamily: "'" + langFont + "', sans-serif", resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={runPaste}
            disabled={!text.trim()}
            style={{ ...secondaryBtn(accentHex), marginTop: '10px', opacity: text.trim() ? 1 : 0.5 }}
          >
            Check this list
          </button>
          {pasteResult && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '10px' }}>
              Found <strong style={{ color: 'var(--text)' }}>{review.matched}</strong> of your words
              {review.alreadyKnown > 0 && ' · ' + review.alreadyKnown + ' already in your deck'}
              {pasteResult.unmatchedLines > 0 && ' · ' + pasteResult.unmatchedLines + ' line' + (pasteResult.unmatchedLines === 1 ? '' : 's') + ' we didn’t recognise'}.
            </p>
          )}

          {pasteResult && review.total > 0 && (
            <ReviewList
              review={review}
              ticked={ticked}
              openLevels={openLevels}
              onToggleWord={id => setTicked(prev => toggleSelection(prev, id))}
              onSetMany={(ids, on) => setTicked(prev => setSelected(prev, ids, on))}
              onToggleLevel={level => setOpenLevels(prev => toggleLevelOpen(prev, level))}
              track={track}
              accentHex={accentHex}
              langFont={langFont}
              isMobile={isMobile}
            />
          )}
        </div>
      )}

      {mode === 'browse' && (
        <div style={{ marginBottom: '22px' }}>
          {byLevel.map(([level, words]) => (
            <div key={level} style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                  {getLevelLabel(track.language, track.system, level)}
                </span>
                <button onClick={() => claimAll(words)} style={linkBtn(accentHex)}>Claim all</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {words.map(v => {
                  const already = carded.has(v.id)
                  const on = picked.has(v.id)
                  return (
                    <button
                      key={v.id}
                      onClick={() => toggle(v.id)}
                      disabled={already}
                      title={already ? 'Already in your deck' : v.meaning}
                      style={{
                        padding: '6px 10px', borderRadius: '8px', fontSize: '15px',
                        fontFamily: "'" + langFont + "', sans-serif",
                        border: '1px solid ' + (on ? accentHex : 'var(--border)'),
                        background: already ? 'var(--surface-2)' : on ? accentHex + '18' : 'var(--surface)',
                        color: already ? 'var(--text-faint)' : 'var(--text)',
                        cursor: already ? 'default' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      {v.word}
                      {(on || already) && <Check size={13} strokeWidth={2.5} color={already ? 'var(--text-faint)' : accentHex} />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === 'paste' && review.total > 0 && claimIds.length === 0 && (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', paddingTop: '4px' }}>
          Nothing ticked, so nothing will be added. These words stay as new words.
        </p>
      )}

      {/* Pacing + confirm — shown once there is a claim */}
      {claimIds.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px' }}>
            How fast should we check these {claimIds.length}?
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            {PACING.map(p => (
              <button
                key={p.key}
                onClick={() => setPacing(p.key)}
                style={{
                  flex: 1, padding: '12px 8px', borderRadius: '10px', cursor: 'pointer',
                  border: '2px solid ' + (pacing === p.key ? accentHex : 'var(--border)'),
                  background: 'var(--surface)', color: 'var(--text)', fontFamily: 'Inter, sans-serif',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 700 }}>{p.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {p.perDay}/day · ~{estimateDays(claimIds.length, p.perDay)} days
                </div>
              </button>
            ))}
          </div>
          {saveError && <div style={errorBox}>{saveError}</div>}
          <button
            onClick={confirm}
            disabled={saving}
            style={{ ...primaryBtn(accentHex), opacity: saving ? 0.6 : 1, cursor: saving ? 'default' : 'pointer' }}
          >
            {saving ? 'Adding…' : `Add ${claimIds.length} to review`}
          </button>
        </div>
      )}
    </div>
  )
}

// The review step. Every matched word is here, ticked, until the learner says
// otherwise — the counts and the ordering come from knownWordsReview.js, so this
// is only layout.
function ReviewList({
  review, ticked, openLevels, onToggleWord, onSetMany, onToggleLevel,
  track, accentHex, langFont, isMobile,
}) {
  const selected = review.orderedIds.filter(id => ticked.has(id)).length
  const allIds = review.orderedIds

  return (
    <div style={{ marginTop: '16px', overflow: 'hidden', ...flatPanel({ radius: 14 }) }}>
      <div style={{ padding: isMobile ? '12px 14px' : '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
          Check what you remember
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.55, margin: '5px 0 0' }}>
          Untick anything you don’t actually remember. Those stay out of review and
          come round later as new words.
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '10px', marginTop: '10px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', ...NUM }}>
            <strong style={{ color: 'var(--text)' }}>{selected}</strong> of {review.total} ticked
          </span>
          <span style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => onSetMany(allIds, true)} style={linkBtn(ink(accentHex))}>Tick all</button>
            <button onClick={() => onSetMany(allIds, false)} style={linkBtn(ink(accentHex))}>Untick all</button>
          </span>
        </div>
      </div>

      {/* dvh, not vh: on mobile vh is the LARGE viewport, so the list would be
          taller than what is actually on screen and its footer pushed under
          the browser/WebView toolbar. */}
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: isMobile ? '54dvh' : '460px' }}>
        {/* flex scroll rule (§5): the scroller needs min-height 0 or it grows to
            fit thousands of rows and the overflow gets clipped. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {review.groups.map(group => {
            const state = groupState(group.words, ticked)
            const open = openLevels.has(group.level)
            return (
              <div key={group.level}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '9px 14px', background: 'var(--surface-2)',
                  borderBottom: '1px solid var(--border)',
                  position: 'sticky', top: 0, zIndex: 1,
                }}>
                  <button
                    onClick={() => onToggleLevel(group.level)}
                    aria-expanded={open}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', flex: 1,
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      color: 'var(--text)', fontFamily: 'Inter, sans-serif', textAlign: 'left',
                    }}
                  >
                    {open
                      ? <ChevronDown size={15} strokeWidth={2.2} color="var(--text-muted)" />
                      : <ChevronRight size={15} strokeWidth={2.2} color="var(--text-muted)" />}
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>
                      {getLevelLabel(track.language, track.system, group.level)}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', ...NUM }}>
                      {state.selected} of {state.total}
                    </span>
                  </button>
                  <button
                    onClick={() => onSetMany(idsOf(group.words), !state.all)}
                    style={linkBtn(ink(accentHex))}
                  >
                    {state.all ? 'Untick all' : 'Tick all'}
                  </button>
                </div>

                {open && group.words.map(v => {
                  const on = ticked.has(v.id)
                  return (
                    <button
                      key={v.id}
                      onClick={() => onToggleWord(v.id)}
                      aria-pressed={on}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                        padding: '9px 14px', textAlign: 'left', cursor: 'pointer',
                        border: 'none', borderBottom: '1px solid var(--hairline)',
                        // Ticked is the resting state, so it stays plain; an
                        // unticked word recedes instead of the list shouting.
                        background: on ? 'var(--surface)' : 'var(--surface-2)',
                        color: 'var(--text)', fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      <span style={{
                        width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        border: '1.5px solid ' + (on ? accentHex : 'var(--border)'),
                        background: on ? accentHex : 'transparent',
                      }}>
                        {on
                          ? <Check size={12} strokeWidth={3} color="#fff" />
                          : <Minus size={11} strokeWidth={3} color="var(--text-faint)" />}
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '17px', fontFamily: "'" + langFont + "', sans-serif",
                            color: on ? 'var(--text)' : 'var(--text-muted)',
                          }}>
                            {v.word}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{v.reading}</span>
                        </span>
                        <span style={{
                          display: 'block', fontSize: '12.5px', marginTop: '1px',
                          color: on ? 'var(--text-muted)' : 'var(--text-faint)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {v.meaning}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


function primaryBtn(accentHex) {
  return {
    width: '100%', padding: '13px', borderRadius: '12px', border: 'none',
    background: accentHex, color: '#fff', fontSize: '15px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
  }
}

function secondaryBtn(accentHex) {
  return {
    padding: '10px 16px', borderRadius: '10px', border: '1px solid ' + accentHex,
    background: 'var(--surface)', color: inkStrong(accentHex), fontSize: '14px', fontWeight: 600,
    fontFamily: 'Inter, sans-serif', cursor: 'pointer',
  }
}

function linkBtn(accentHex) {
  return {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: inkStrong(accentHex), fontSize: '13px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
  }
}

const errorBox = {
  padding: '10px 12px', borderRadius: '10px', marginBottom: '12px',
  background: 'var(--danger-bg, #DC26260D)', border: '1px solid var(--danger-border, #DC262633)',
  color: 'var(--danger, #DC2626)', fontSize: '13px',
}
