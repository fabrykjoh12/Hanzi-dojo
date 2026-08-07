import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { glossaryLookup } from './grammarGlossary'
import { useDictEntry, dictDefinitions } from './useDictEntry'
import { useAnchoredPopover } from './useAnchoredPopover'
import { PopoverArrow } from './ui'
import {
  lookupKind, lookupReadingState, lookupChip, lookupLevel, lookupBody, dictWordFor, splitAround,
  dictSaveAction, STATUS_COLOR, STATUS_LABEL,
} from './wordLookup'
import { MICRO } from './designTokens'
import { X, Volume2, Bookmark, MapPin, UserRound } from 'lucide-react'
import { trapDialogFocus } from './dialogFocus'

// Same green the story text uses for a name or a curated place name, so the
// sheet and the word on the page never disagree about what kind of word this is.
const PROPER_NOUN_COLOR = '#2F9E6D'

// Actions sit in real 40px targets — a thumb reaches for them on a phone, and
// the icon alone was a 20px target with a 6px pad before.
const action = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  width: '44px', height: '44px', borderRadius: '999px',
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

// Word lookup shared by the paced/chat/scene readers, the analyzer, the
// dictionary and the word list. `selected` is
// { word, vocab, name, status, tokenId, sentence } | null.
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
// `anchor` — OPTIONAL. Pass the tapped element (or a viewport-relative rect) and
// the answer is drawn as a small popover directly ABOVE that word, with an arrow
// pointing at it, instead of as a sheet at the bottom of the screen. That matters
// in a story: the learner's eyes are already on the word, and an answer arriving
// somewhere else costs a hunt on every single lookup. Pass nothing (the analyzer,
// the dictionary, the word list — screens with no word on a page to point at) and
// this renders the bottom sheet it always did, unchanged. anchoredPopover.js
// decides the geometry; when it reports that nothing readable fits above OR below
// the word, this falls back to the bottom sheet, so a small screen with a long
// definition still gets a real answer.
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
export default function WordLookupSheet({ selected, theme, accent, userCards, language, onAddToDeck, onSpeak, onClose, onAddDictToDeck = null, dictSaved = null, dictSaving = false, anchor = null }) {
  const lang = language || (selected && selected.vocab && selected.vocab.language) || null
  const grammar = selected && !selected.vocab && !selected.name ? glossaryLookup(lang, selected.word) : null
  const { entry: dictEntry, loading: dictLoading } = useDictEntry(dictWordFor(selected, lang, grammar))
  // Measuring and repositioning only — the geometry lives in anchoredPopover.js.
  const { ref: popRef, mode, place } = useAnchoredPopover(selected ? anchor : null, onClose)

  // Dialog focus management: remember the word that opened the sheet, move
  // focus into it (so a screen reader announces the lookup instead of silence),
  // give focus back on close. Every reader gets this for free.
  const boxRef = useRef(null)
  const openerRef = useRef(null)
  useEffect(() => {
    if (!selected) return
    openerRef.current = document.activeElement
    if (boxRef.current) boxRef.current.focus({ preventScroll: true })
    return () => {
      if (openerRef.current && openerRef.current.focus) openerRef.current.focus({ preventScroll: true })
    }
  }, [selected])

  if (!selected) return null
  if (typeof document === 'undefined') return null

  const kind = lookupKind(selected, lang)
  const isProperNoun = kind === 'name' || kind === 'place'
  const reading = lookupReadingState(selected, { grammar, dictEntry, dictLoading })
  const chip = lookupChip(kind, { grammar })
  const levelChip = lookupLevel(selected, kind, lang)
  const body = lookupBody(selected, kind, { grammar, dictDefs: dictDefinitions(dictEntry), dictLoading })
  const vocab = selected.vocab || null
  const status = (vocab && selected.status) || null
  const inDeck = Boolean(vocab && userCards && userCards[vocab.id])
  const dictSave = dictSaveAction(selected, kind, {
    dictEntry, grammar, canSave: Boolean(onAddDictToDeck), savedIds: dictSaved, saving: dictSaving,
  })
  const parts = splitAround(selected.sentence, selected.word)

  const anchored = mode !== 'sheet'

  // The same content, in whichever of its two shapes this call asked for. Sheet:
  // full width, hinged to the bottom edge. Popover: a card pinned over the word,
  // width-capped so it stays readable on a narrow phone, with its own scroller so
  // a long dictionary entry runs out of room inside the box, not off the screen.
  const boxStyle = anchored
    ? {
      position: 'fixed',
      top: (place ? place.top : 0) + 'px',
      left: (place ? place.left : 0) + 'px',
      // Hidden for the single layout pass it takes to measure, so the box is
      // never painted at 0,0 before it knows where it belongs.
      visibility: place ? 'visible' : 'hidden',
      width: 'min(360px, calc(100vw - 24px))',
      // dvh, not vh: the pre-measurement fallback has to fit the VISIBLE
      // viewport. This box is anchored to the word, not a child of the overlay.
      maxHeight: place ? place.maxHeight + 'px' : '60dvh',
      overflowY: 'auto',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '16px', padding: '10px 14px 12px',
      boxShadow: 'var(--shadow-2)',
      zIndex: 201,
      animation: 'hd-pop-in 160ms ease',
    }
    : {
      // A share of the `app-overlay-viewport` wrapper below (100dvh) — a vh
      // height would be measured against the larger, partly hidden viewport.
      width: '100%', maxWidth: '560px', maxHeight: '80%', overflowY: 'auto',
      background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '1px solid var(--hairline)',
      borderRadius: '22px 22px 0 0',
      // The extra bottom padding clears a phone's home indicator, so the last
      // line of a definition is never half-swallowed by the system bar.
      padding: '12px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
      boxShadow: '0 -14px 44px rgba(24,24,27,0.18)',
      animation: 'hd-sheet-up 240ms cubic-bezier(0.22, 1, 0.36, 1)',
    }

  return createPortal(
    <div onClick={onClose} className="app-overlay-viewport" style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      // The anchored popover points at the word it is about; dimming the page
      // behind it would shade out exactly the thing it is pointing at.
      background: anchored ? 'transparent' : 'rgba(0,0,0,0.18)',
    }}>
      <div
        ref={(el) => { boxRef.current = el; if (anchored) popRef.current = el }}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => trapDialogFocus(e, boxRef.current)}
        role="dialog"
        aria-modal={anchored ? undefined : 'true'}
        aria-label={selected.word}
        tabIndex={-1}
        style={{ ...boxStyle, outline: 'none' }}
      >
        {/* The grab handle belongs to the sheet — a popover isn't dragged. */}
        {!anchored && (
          <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 12px' }} />
        )}

        {/* What did I tap — word and reading own the top line; actions sit clear of them. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div lang={lang === 'chinese' ? 'zh-Hans' : undefined} style={{
              fontSize: anchored ? '26px' : '30px', fontWeight: 800, lineHeight: 1.15, overflowWrap: 'anywhere',
              color: isProperNoun ? PROPER_NOUN_COLOR : accent, fontFamily: theme.font,
            }}>
              {selected.word}
            </div>
            {/* The pronunciation. For a word beyond the list this is the answer
                the learner came for, so the line is held open (dimmed) while the
                dictionary is still answering rather than appearing a beat later
                and pushing the definition down. */}
            {reading && (
              <div style={{
                fontSize: '16px', color: '#B45309', fontWeight: 600, marginTop: '4px',
                opacity: reading.pending ? 0.45 : 1, letterSpacing: reading.pending ? '0.12em' : 'normal',
              }} aria-hidden={reading.pending ? 'true' : undefined}>{reading.text}</div>
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

        {/* Where does it stand — learning status for vocabulary, what-kind-of-word
            otherwise, and (for curriculum vocabulary) which level it comes from.
            One row of meta: status and kind are mutually exclusive with the level
            chip's own case, so this never becomes three competing badges. */}
        {(status || chip || levelChip) && (
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
            {levelChip && (
              <span style={pill('var(--text-muted)', false)}>{levelChip}</span>
            )}
          </div>
        )}

        {/* What does it mean — the reason the sheet opened, so it reads as body text, not a caption. */}
        <div style={{ fontSize: anchored ? '15px' : '16px', color: 'var(--text)', fontWeight: 500, marginTop: anchored ? '10px' : '12px', lineHeight: 1.5 }}>{body}</div>

        {/* Where it came from — the line, with the tapped word lit inside it. */}
        {selected.sentence && (
          <div style={{ marginTop: anchored ? '10px' : '14px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
            <div style={{ ...MICRO, color: 'var(--text-faint)', marginBottom: anchored ? '4px' : '6px' }}>From this line</div>
            <div lang={lang === 'chinese' ? 'zh-Hans' : undefined} style={{ fontSize: anchored ? '14px' : '15px', color: 'var(--text-muted)', lineHeight: anchored ? 1.5 : 1.7, fontFamily: theme.font }}>
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
      {anchored && <PopoverArrow place={place} />}
    </div>,
    document.body,
  )
}
