// src/DictEntryView.jsx
import { useState, useEffect } from 'react'
import { splitHanziWithTones, TONE_CLASS } from './toneColor'
import { getExamples, getWordsContaining } from './dictSearch'
import { supabase } from './supabase'
import { Volume2, Bookmark, PenLine } from 'lucide-react'

// The "Refined" entry: tone-colored headword + character cards, everything else
// neutral. Three tabs (Meaning · Chars · Examples) keep the sheet short.
const TABS = [
  { key: 'meaning', label: 'Meaning' },
  { key: 'chars', label: 'Chars' },
  { key: 'examples', label: 'Examples' },
]

export default function DictEntryView({ entry, accentHex, langFont, ttsLang, onOpenEntry, onAddToDeck, canAddToDeck, canShowStrokes }) {
  const [tab, setTab] = useState('meaning')
  const [examples, setExamples] = useState([])
  const [contains, setContains] = useState([])
  // Reset the active tab when a new entry loads. Adjusting state during
  // render (rather than in the effect below) avoids the extra commit React
  // would otherwise schedule for a synchronous setState-in-effect.
  const [tabResetFor, setTabResetFor] = useState(entry)
  if (entry !== tabResetFor) {
    setTabResetFor(entry)
    setTab('meaning')
    setExamples([])
    setContains([])
  }

  useEffect(() => {
    if (!entry) return
    let cancelled = false
    ;(async () => {
      const [ex, ct] = await Promise.all([
        getExamples(supabase, entry.simplified).catch(() => []),
        getWordsContaining(supabase, entry.simplified, entry.id).catch(() => []),
      ])
      if (cancelled) return
      setExamples(ex)
      setContains(ct)
    })()
    return () => { cancelled = true }
  }, [entry])

  if (!entry) return null
  const chars = splitHanziWithTones(entry.simplified, entry.pinyin)
  const defs = Array.isArray(entry.definitions) ? entry.definitions : []
  const speak = (text) => {
    if (!text) return
    try { const u = new SpeechSynthesisUtterance(text); u.lang = ttsLang; u.rate = 0.85; window.speechSynthesis.speak(u) } catch { /* noop */ }
  }

  return (
    <div className="dict-entry" style={{ '--accent': accentHex }}>
      {/* hero */}
      <div style={{ textAlign: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: langFont + ', sans-serif', fontSize: '52px', fontWeight: 750, lineHeight: 1, letterSpacing: '4px' }}>
          {chars.map((c, i) => <span key={i} className={TONE_CLASS[c.tone]}>{c.char}</span>)}
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '10px', color: 'var(--text)' }}>{entry.pinyin}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
          {entry.hsk_level != null && <span className="dict-pill dict-pill-accent">HSK {entry.hsk_level}</span>}
          {entry.traditional && entry.traditional !== entry.simplified && (
            <span className="dict-pill" style={{ fontFamily: langFont + ', sans-serif' }}>trad. {entry.traditional}</span>
          )}
        </div>
      </div>

      {/* action bar */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '22px', margin: '14px 0 4px' }}>
        <button className="dict-act" onClick={() => speak(entry.simplified)} aria-label="Play audio"><Volume2 size={19} /><span>Audio</span></button>
        {canShowStrokes && (
          <button className="dict-act" aria-label="Stroke order"><PenLine size={19} /><span>Strokes</span></button>
        )}
        {canAddToDeck && (
          <button className="dict-act" onClick={() => onAddToDeck && onAddToDeck(entry)} aria-label="Add to deck"><Bookmark size={19} /><span>Add</span></button>
        )}
      </div>

      {/* tabs */}
      <div role="tablist" className="dict-tabs">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'meaning' && (
        <ol className="dict-senses">
          {defs.map((d, i) => <li key={i}><span className="i">{i + 1}</span>{d}</li>)}
        </ol>
      )}

      {tab === 'chars' && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
          {chars.map((c, i) => (
            <button key={i} className="dict-charcard" onClick={() => onOpenEntry && onOpenEntry(c.char)}>
              <span className={TONE_CLASS[c.tone]} style={{ fontFamily: langFont + ', sans-serif', fontSize: '30px', fontWeight: 750 }}>{c.char}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'examples' && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {examples.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No example sentences yet.</div>}
          {examples.map((ex, i) => (
            <div key={i} className="dict-ex">
              <div style={{ fontFamily: langFont + ', sans-serif', fontSize: '16px', lineHeight: 1.55 }}>{ex.hanzi}</div>
              {ex.pinyin && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{ex.pinyin}</div>}
              <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: '2px' }}>{ex.english}</div>
            </div>
          ))}
        </div>
      )}

      {contains.length > 0 && (
        <div style={{ marginTop: '18px' }}>
          <div className="dict-label">Words containing {entry.simplified}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {contains.map(w => (
              <button key={w.id} className="dict-chip" onClick={() => onOpenEntry && onOpenEntry(w.id)}>
                <span style={{ fontFamily: langFont + ', sans-serif', fontWeight: 700 }}>{w.simplified}</span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{Array.isArray(w.definitions) ? w.definitions[0] : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
