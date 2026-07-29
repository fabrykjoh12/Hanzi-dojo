import { wordStatus, isPlaceWord, isWordlikeToken } from './storyReading'
import { TokenBody, RevealEnglishButton } from './ReadingScaffold'
import { PAPER, BUBBLE_OVAL, BUBBLE_FRAME, NARRATION_RADIUS, TYPE, TAP_TARGET } from './mangaTokens'
import { Volume2 } from 'lucide-react'

// A line of the story, drawn as interface over the artwork.
//
// Nothing here is baked into an image: the hanzi is real text, every word is its
// own button, the pinyin is the shared per-word scaffolding (TokenBody, same
// rule as every other reader), and the translation is revealed on demand. That
// is the whole reason the art is generated without writing on it.
//
// Four registers, because a panel says different kinds of things:
//   speech    — the white bubble with a tail, someone talking
//   thought    — the same, tailless and softer, the learner's own head
//   narration  — a caption plate with a cinnabar rule, the story's voice
//   reply      — the learner's chosen line, tinted with the accent so their own
//                voice is visibly theirs

const PROPER_NOUN = '#2F9E6D'

const SR_ONLY = {
  position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

// The balloon itself. Drawn the way a comic draws one: a heavy ink keyline and
// an elliptical shape, with no shadow — ink on paper does not float.
//
// Narration is deliberately the odd one out. In print a caption is a hard-edged
// box, not a balloon, and keeping it square is what tells the reader at a glance
// that nobody is saying it out loud.
function chromeFor(kind, accentHex) {
  if (kind === 'narration') {
    return {
      background: '#FBF9F4',
      border: '2px solid ' + PAPER.frame,
      borderLeft: '5px solid ' + accentHex,
      borderRadius: NARRATION_RADIUS + 'px',
    }
  }
  if (kind === 'thought') {
    // A thought balloon is a cloud. A dashed keyline is the honest CSS
    // approximation of a scalloped edge, and reads as "unspoken" instantly.
    return {
      background: PAPER.bubble,
      border: BUBBLE_FRAME + 'px dashed ' + PAPER.frame,
      borderRadius: BUBBLE_OVAL,
    }
  }
  if (kind === 'reply') {
    return {
      background: 'color-mix(in srgb, ' + accentHex + ' 7%, ' + PAPER.bubble + ')',
      border: BUBBLE_FRAME + 'px solid ' + accentHex,
      borderRadius: BUBBLE_OVAL,
    }
  }
  return {
    background: PAPER.bubble,
    border: BUBBLE_FRAME + 'px solid ' + PAPER.frame,
    borderRadius: BUBBLE_OVAL,
  }
}

// The tail. Two stacked triangles (border colour under, bubble colour over) so
// the 1px edge continues around the point instead of stopping at the bubble.
function Tail({ tail, kind, accentHex }) {
  if (!tail || kind === 'narration') return null
  const chrome = chromeFor(kind, accentHex)
  const bottom = tail.indexOf('bottom') === 0
  const left = tail.indexOf('left') !== -1
  const edge = kind === 'reply' ? accentHex : PAPER.frame
  const base = {
    position: 'absolute', width: 0, height: 0,
    borderLeft: '10px solid transparent', borderRight: '10px solid transparent',
  }
  const dir = bottom ? 'borderTop' : 'borderBottom'
  // The outline triangle sits 3px further out than the fill triangle, so the
  // keyline continues around the point at the same weight as the balloon's edge
  // instead of thinning to nothing.
  const pos = bottom ? { bottom: '-19px' } : { top: '-19px' }
  const posIn = bottom ? { bottom: '-16px' } : { top: '-16px' }
  const side = left ? { left: '30px' } : { right: '30px' }
  return (
    <>
      <span aria-hidden style={{ ...base, ...pos, ...side, [dir]: '19px solid ' + edge }} />
      <span aria-hidden style={{ ...base, ...posIn, ...side, [dir]: '16px solid ' + chrome.background }} />
    </>
  )
}

// One tappable word. Vocabulary words, proper names and everything else all
// open the same lookup — the reader's rule is that every word in a story can be
// asked about — while punctuation stays inert.
function Word({ token, tokenId, beatIndex, selected, accentHex, readingMode, userCards, language, onSelectToken }) {
  const status = token.vocab ? wordStatus(token.vocab.id, userCards) : 'not_started'
  const tappable = Boolean(token.vocab) || Boolean(token.name) || isWordlikeToken(token.text)
  const isSelected = selected && selected.tokenId === tokenId
  const isPlace = token.vocab && isPlaceWord(token.vocab.word, language)
  const proper = Boolean(token.name) || isPlace

  if (!tappable) {
    return (
      <span style={{ color: PAPER.ink }}>
        <TokenBody text={token.text} reading={null} mode={readingMode} status={status} language={language} reserve />
      </span>
    )
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={token.text}
      onClick={(e) => { e.stopPropagation(); onSelectToken(token, status, tokenId, beatIndex, e.currentTarget) }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault(); e.stopPropagation()
        onSelectToken(token, status, tokenId, beatIndex, e.currentTarget)
      }}
      className="hd-manga-word"
      style={{
        cursor: 'pointer', borderRadius: '5px', padding: '0 1px',
        color: isSelected ? accentHex : (proper ? PROPER_NOUN : PAPER.ink),
        background: isSelected ? 'color-mix(in srgb, ' + accentHex + ' 12%, transparent)' : 'transparent',
        // A tapped word is marked by colour AND a rule under it, so the
        // selection is not carried by colour alone.
        boxShadow: isSelected ? 'inset 0 -2px 0 0 ' + accentHex : 'none',
      }}
    >
      <TokenBody
        text={token.text}
        reading={token.vocab ? token.vocab.reading : (token.name ? token.name.reading : null)}
        mode={readingMode} status={status} language={language} reserve
      />
    </span>
  )
}

export default function MangaBubble({
  beat, beatIndex, kind = 'speech', tail = null, speaker = null, voice = null,
  accentHex, fontFamily, readingMode, userCards, language,
  selected, onSelectToken, onPlayLine, speaking = false,
  english = '', revealed = false, onToggleEnglish,
  layout = { mode: 'below' }, reduceMotion = false, style = {},
}) {
  if (!beat) return null
  const chrome = chromeFor(kind, accentHex)
  const overlay = layout.mode === 'overlay'
  const narration = kind === 'narration'

  const position = overlay
    ? {
      position: 'absolute',
      top: layout.top + '%',
      left: layout.left + '%',
      width: layout.width + '%',
    }
    : { position: 'relative', width: '100%', marginTop: '10px' }

  return (
    <div
      className={reduceMotion ? undefined : 'hd-manga-bubble'}
      style={{ ...position, ...chrome, padding: narration ? '10px 14px' : '14px 22px 15px', boxShadow: 'none', ...style }}
    >
      <Tail tail={tail} kind={kind} accentHex={accentHex} />

      {/* Who is talking. A printed label is the exception, not the rule — in a
          manga panel the drawing says who is speaking, and a name plate over
          every bubble is what makes a comic look like a chat app. So the episode
          opts in per character (cast[speaker].display), while screen readers,
          which have no drawing to go on, are always told. */}
      {speaker && !narration && (
        <div style={{
          fontSize: TYPE.speaker, fontWeight: 800, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: PAPER.muted, marginBottom: '3px',
        }}>
          {speaker}
        </div>
      )}
      {!speaker && voice && !narration && (
        <span style={SR_ONLY}>{voice}</span>
      )}

      <div>
        {/* Hear the whole line, and reveal what it means. Two small ink marks,
            not a toolbar — and FLOATED, not a flex sibling: floated, they cost
            the sentence width on its first line only and no height at all, so a
            six-character line stays a six-character line instead of orphaning
            its last character onto a second row. mangaLayout's height estimate
            models exactly this (BUBBLE_ACTIONS_WIDTH). */}
        <div style={{ float: 'right', display: 'flex', alignItems: 'center', marginLeft: '6px', marginTop: '-4px' }}>
          {onPlayLine && (
            <button
              onClick={(e) => { e.stopPropagation(); onPlayLine(beatIndex) }}
              aria-label={'Play this line' + (speaking ? ' (playing)' : '')}
              title="Play this line"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                width: TAP_TARGET * 0.66 + 'px', height: TAP_TARGET * 0.66 + 'px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Volume2 size={17} strokeWidth={2} color={speaking ? accentHex : PAPER.faint} />
            </button>
          )}
          {onToggleEnglish && english && (
            <RevealEnglishButton
              revealed={revealed}
              onToggle={() => onToggleEnglish(beatIndex)}
              color={PAPER.faint}
              activeColor={accentHex}
            />
          )}
        </div>

        <div style={{
          fontFamily,
          fontSize: narration ? TYPE.hanziNarration : TYPE.hanzi,
          lineHeight: 1.85,
          fontWeight: narration ? 500 : 550,
          color: PAPER.ink,
          opacity: narration ? 0.92 : 1,
          // Wrap between words, never inside one.
          //
          // CJK breaks between any two characters by default, which tore 林老师
          // across two lines as 林老 / 师 — a name split in half, and a tap
          // target split with it. `keep-all` forbids all of those breaks; the
          // <wbr> the loop below emits between tokens hands back exactly the
          // ones we want. (Marking each token `white-space: nowrap` instead does
          // not work: a break between two nowrap inline boxes is forbidden too,
          // so a long line stops wrapping at all and runs off the bubble.)
          wordBreak: 'keep-all',
        }}>
          {beat.tokens.map((t, k) => (
            <span key={k}>
              {/* A legal place to wrap — but never in front of punctuation: a
                  Chinese line may not begin with 。or ？. */}
              {k > 0 && isWordlikeToken(t.text) ? <wbr /> : null}
              <Word
                token={t}
                tokenId={beatIndex + ':' + k}
                beatIndex={beatIndex}
                selected={selected}
                accentHex={accentHex}
                readingMode={readingMode}
                userCards={userCards}
                language={language}
                onSelectToken={onSelectToken}
              />
            </span>
          ))}
        </div>
        <div style={{ clear: 'both' }} />
      </div>

      {revealed && english && (
        <div style={{
          fontSize: TYPE.english, color: PAPER.muted, lineHeight: 1.5,
          marginTop: '6px', paddingTop: '7px', borderTop: '1px solid ' + PAPER.soft,
        }}>
          {english}
        </div>
      )}
    </div>
  )
}
