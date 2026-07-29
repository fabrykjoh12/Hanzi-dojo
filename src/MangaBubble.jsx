import { wordStatus, isPlaceWord, isWordlikeToken } from './storyReading'
import { TokenBody, RevealEnglishButton } from './ReadingScaffold'
import { PAPER, BUBBLE_RADIUS, TYPE, TAP_TARGET } from './mangaTokens'
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

function chromeFor(kind, accentHex) {
  if (kind === 'narration') {
    return {
      background: 'rgba(250, 248, 243, 0.94)',
      border: '1px solid ' + PAPER.soft,
      borderLeft: '2.5px solid ' + accentHex,
      borderRadius: '4px 12px 12px 4px',
    }
  }
  if (kind === 'reply') {
    return {
      background: 'color-mix(in srgb, ' + accentHex + ' 7%, ' + PAPER.bubble + ')',
      border: '1px solid color-mix(in srgb, ' + accentHex + ' 26%, transparent)',
      borderRadius: BUBBLE_RADIUS + 'px',
    }
  }
  return {
    background: PAPER.bubble,
    border: '1px solid ' + (kind === 'thought' ? PAPER.soft : PAPER.hairline),
    borderRadius: BUBBLE_RADIUS + 'px',
  }
}

// The tail. Two stacked triangles (border colour under, bubble colour over) so
// the 1px edge continues around the point instead of stopping at the bubble.
function Tail({ tail, kind, accentHex }) {
  if (!tail || kind === 'narration') return null
  const chrome = chromeFor(kind, accentHex)
  const bottom = tail.indexOf('bottom') === 0
  const left = tail.indexOf('left') !== -1
  const edge = kind === 'reply'
    ? 'color-mix(in srgb, ' + accentHex + ' 26%, transparent)'
    : (kind === 'thought' ? PAPER.soft : PAPER.hairline)
  const base = {
    position: 'absolute', width: 0, height: 0,
    borderLeft: '9px solid transparent', borderRight: '9px solid transparent',
  }
  const dir = bottom ? 'borderTop' : 'borderBottom'
  const pos = bottom ? { bottom: '-13px' } : { top: '-13px' }
  const posIn = bottom ? { bottom: '-11px' } : { top: '-11px' }
  const side = left ? { left: '26px' } : { right: '26px' }
  return (
    <>
      <span aria-hidden style={{ ...base, ...pos, ...side, [dir]: '13px solid ' + edge }} />
      <span aria-hidden style={{ ...base, ...posIn, ...side, [dir]: '13px solid ' + chrome.background }} />
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
      style={{ ...position, ...chrome, padding: narration ? '10px 14px' : '11px 14px 12px', boxShadow: overlay ? PAPER.shadow : 'none', ...style }}
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

      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px',
      }}>
        <div style={{
          flex: 1, minWidth: 0,
          fontFamily,
          fontSize: narration ? TYPE.hanziNarration : TYPE.hanzi,
          lineHeight: 1.85,
          fontWeight: narration ? 500 : 550,
          color: PAPER.ink,
          fontStyle: kind === 'thought' ? 'normal' : 'normal',
          opacity: narration ? 0.92 : 1,
        }}>
          {beat.tokens.map((t, k) => (
            <Word
              key={k}
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
          ))}
        </div>

        {/* Hear the whole line, and reveal what it means. Two small ink marks,
            not a toolbar — they sit at the bubble's edge so the sentence keeps
            the space. */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginTop: '-2px' }}>
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
