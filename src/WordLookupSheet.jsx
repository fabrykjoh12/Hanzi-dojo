import { createPortal } from 'react-dom'
import { glossaryLookup } from './grammarGlossary'
import { useDictEntry, dictDefinitions } from './useDictEntry'
import {
  lookupKind, lookupReading, lookupChip, lookupBody, dictWordFor, splitAround,
  dictSaveAction, STATUS_COLOR, STATUS_LABEL,
} from './wordLookup'
import { MICRO } from './designTokens'
import { X, Volume2, Bookmark, MapPin, UserRound } from 'lucide-react'

// Same green the story text uses for a name or a curated place name, so the
// sheet and the word on the page never disagree about what kind of word this is.
const PROPER_NOUN_COLOR = '#2F9E6D'

// Actions sit in real 40px targets — a thumb reaches for them on a phone, and
// the icon alone was a 20px target with a 6px pad before.
const action = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  width: '40px', height: '40px', borderRadius: '999px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// One pill shape for the status dot and the kind chip, so the meta row reads as
// a row rather than as two unrelated badges.
function pill(color, tinted) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    fontSize: '11.5px', fontWeight: 700, borderRadius: '999px', padding: '4px 10px',
    color, border: '1px solid ' + (tinted ? color + '40' : 'var(--border)'),
    background: tinted ? color + '12' : 'transparent',
    whiteSpace: 'nowrap',
  }
}

// Bottom-sheet word lookup shared by the paced/chat/scene readers and the
// analyzer. `selected` is { word, vocab, name, status, tokenId, sentence } | null.
//
// The layout answers three questions in order, and gives each its own line
// rather than crowding them onto one baseline: WHAT did I tap (word + reading),
// WHERE does it stand (status / kind), WHAT does it mean (the definition) — and
// then the line it came from, with the tapped word lit inside it.
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
//
// `onAddDictToDeck` / `dictSaved` / `dictSaving` are optional: supply them and a
// word the reference dictionary resolved gets the same bookmark a vocabulary
// word has, so "tap a word, keep a word" holds here too. Leave them out (the
// analyzer, the dictionary screen) and the action simply isn't drawn.
export default function WordLookupSheet({ selected, theme, accent, userCards, language, onAddToDeck, onSpeak, onClose, onAddDictToDeck = null, dictSaved = null, dictSaving = false }) {
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
  const status = (vocab && selected.status) || null
  const inDeck = Boolean(vocab && userCards && userCards[vocab.id])
  const dictSave = dictSaveAction(selected, kind, {
    dictEntry, grammar, canSave: Boolean(onAddDictToDeck), savedIds: dictSaved, saving: dictSaving,
  })
  const parts = splitAround(selected.sentence, selected.word)

  return createPortal(
    <div onClick={onClose} className="app-overlay-viewport" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.18)' }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto',
        background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '1px solid var(--hairline)',
        borderRadius: '22px 22px 0 0',
        // The extra bottom padding clears a phone's home indicator, so the last
        // line of a definition is never half-swallowed by the system bar.
        padding: '12px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 -14px 44px rgba(24,24,27,0.18)',
        animation: 'hd-sheet-up 240ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}>
        <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 12px' }} />

        {/* What did I tap — word and reading own the top line; actions sit clear of them. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: '30px', fontWeight: 800, lineHeight: 1.15, overflowWrap: 'anywhere',
              color: isProperNoun ? PROPER_NOUN_COLOR : accent, fontFamily: theme.font,
            }}>
              {selected.word}
            </div>
            {reading && (
              <div style={{ fontSize: '16px', color: '#B45309', fontWeight: 600, marginTop: '4px' }}>{reading}</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            {vocab && (
              <button onClick={() => onAddToDeck(vocab)} aria-label={inDeck ? 'In your deck' : 'Add to deck'} title={inDeck ? 'In your deck' : 'Add to deck'} style={action}>
                <Bookmark size={20} color={inDeck ? accent : 'var(--text-muted)'} fill={inDeck ? accent : 'none'} />
              </button>
            )}
            {dictSave && (
              <button onClick={() => onAddDictToDeck(dictEntry)} disabled={dictSave.disabled}
                aria-label={dictSave.label} title={dictSave.label}
                style={{ ...action, cursor: dictSave.disabled ? 'default' : 'pointer', opacity: dictSave.busy ? 0.5 : 1 }}>
                <Bookmark size={20} color={dictSave.inDeck ? accent : 'var(--text-muted)'} fill={dictSave.inDeck ? accent : 'none'} />
              </button>
            )}
            <button onClick={() => onSpeak(selected.word)} aria-label="Play audio" title="Play audio" style={action}>
              <Volume2 size={20} color="var(--text-muted)" />
            </button>
            <button onClick={onClose} aria-label="Close" title="Close" style={action}>
              <X size={20} color="var(--text-muted)" />
            </button>
          </div>
        </div>

        {/* Where does it stand — learning status for vocabulary, what-kind-of-word otherwise. */}
        {(status || chip) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
            {status && (
              <span style={pill(STATUS_COLOR[status] || 'var(--text-muted)', true)}>
                <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: STATUS_COLOR[status] || 'var(--text-muted)' }} />
                {STATUS_LABEL[status] || status}
              </span>
            )}
            {chip && (
              <span style={pill(isProperNoun ? PROPER_NOUN_COLOR : 'var(--text-muted)', isProperNoun)}>
                {kind === 'name' && <UserRound size={12} strokeWidth={2.2} color={PROPER_NOUN_COLOR} />}
                {kind === 'place' && <MapPin size={12} strokeWidth={2.2} color={PROPER_NOUN_COLOR} />}
                {chip}
              </span>
            )}
          </div>
        )}

        {/* What does it mean — the reason the sheet opened, so it reads as body text, not a caption. */}
        <div style={{ fontSize: '16px', color: 'var(--text)', fontWeight: 500, marginTop: '12px', lineHeight: 1.5 }}>{body}</div>

        {/* Where it came from — the line, with the tapped word lit inside it. */}
        {selected.sentence && (
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ ...MICRO, color: 'var(--text-faint)', marginBottom: '6px' }}>From this line</div>
            <div style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.7, fontFamily: theme.font }}>
              {parts ? (
                <>
                  {parts.before}
                  <span style={{
                    borderRadius: '4px', padding: '1px 2px', color: 'var(--text)', fontWeight: 600,
                    background: 'color-mix(in srgb, ' + accent + ' 14%, var(--surface))',
                  }}>{parts.match}</span>
                  {parts.after}
                </>
              ) : selected.sentence}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
