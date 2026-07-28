import { createPortal } from 'react-dom'
import { glossaryLookup } from './grammarGlossary'
import { useDictEntry, dictDefinitions } from './useDictEntry'
import { lookupKind, lookupReading, lookupChip, lookupBody, dictWordFor } from './wordLookup'
import { X, Volume2, Bookmark, MapPin, UserRound } from 'lucide-react'

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }
// Same green the story text uses for a name or a curated place name, so the
// sheet and the word on the page never disagree about what kind of word this is.
const PROPER_NOUN_COLOR = '#2F9E6D'

// Bottom-sheet word lookup shared by the paced/chat/scene readers and the
// analyzer. `selected` is { word, vocab, name, status, tokenId, sentence } | null
// — `sentence` (the line the tapped word came from) is shown so it's clear which
// sentence the lookup belongs to, not just which word.
//
// `vocab` is optional: every word in a story is tappable, including the ones
// outside the level's list, and this sheet explains those from the grammar
// glossary or the reference dictionary rather than dead-ending. See wordLookup.js
// for the (pure, tested) decision of what to show.
//
// Rendered through a portal to <body>: screens like the analyzer live inside the
// app shell's <main>, which sets position:relative + z-index, forming a stacking
// context. A plain fixed overlay is then trapped below the sibling mobile nav
// bar and only a sliver peeks out. Portaling to body escapes that context so the
// sheet always sits above the whole app.
export default function WordLookupSheet({ selected, theme, accent, userCards, language, onAddToDeck, onSpeak, onClose }) {
  const lang = language || (selected && selected.vocab && selected.vocab.language) || null
  const grammar = selected && !selected.vocab && !selected.name ? glossaryLookup(lang, selected.word) : null
  const { entry: dictEntry, loading: dictLoading } = useDictEntry(dictWordFor(selected, lang, grammar))
  if (!selected) return null
  if (typeof document === 'undefined') return null

  const kind = lookupKind(selected, lang)
  const isProperNoun = kind === 'name' || kind === 'place'
  const reading = lookupReading(selected, { grammar, dictEntry })
  const chip = lookupChip(kind, { grammar, dictEntry })
  const body = lookupBody(selected, kind, { grammar, dictDefs: dictDefinitions(dictEntry), dictLoading })
  const vocab = selected.vocab || null

  return createPortal(
    <div onClick={onClose} className="app-overlay-viewport" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.14)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '560px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px 20px 0 0', padding: '16px 18px 26px', boxShadow: '0 -10px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '28px', fontWeight: 800, color: isProperNoun ? PROPER_NOUN_COLOR : accent, fontFamily: theme.font }}>{selected.word}</span>
            {reading && <span style={{ fontSize: '16px', color: '#B45309', fontWeight: 600 }}>{reading}</span>}
            {chip && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                fontSize: '11px', fontWeight: 700, borderRadius: '999px', padding: '3px 9px',
                color: isProperNoun ? PROPER_NOUN_COLOR : 'var(--text-muted)',
                border: '1px solid ' + (isProperNoun ? PROPER_NOUN_COLOR + '40' : 'var(--border)'),
                background: isProperNoun ? PROPER_NOUN_COLOR + '12' : 'transparent',
              }}>
                {kind === 'name' && <UserRound size={12} strokeWidth={2.2} color={PROPER_NOUN_COLOR} />}
                {kind === 'place' && <MapPin size={12} strokeWidth={2.2} color={PROPER_NOUN_COLOR} />}
                {chip}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            {vocab && (
              <button onClick={() => onAddToDeck(vocab)} aria-label="Add to deck" style={ghost}>
                <Bookmark size={20} color={userCards[vocab.id] ? accent : 'var(--text-muted)'} fill={userCards[vocab.id] ? accent : 'none'} />
              </button>
            )}
            <button onClick={() => onSpeak(selected.word)} aria-label="Play audio" style={ghost}>
              <Volume2 size={20} color="var(--text-muted)" />
            </button>
            <button onClick={onClose} aria-label="Close" style={ghost}>
              <X size={20} color="var(--text-muted)" />
            </button>
          </div>
        </div>
        <div style={{ fontSize: '15px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>{body}</div>
        {selected.sentence && (
          <div style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)', lineHeight: 1.5 }}>
            {selected.sentence}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
