import { wordStatus, isPlaceWord, isWordlikeToken } from './storyReading'
import { TokenBody, RevealEnglishButton } from './ReadingScaffold'
import { PAPER, BUBBLE_RADIUS, THOUGHT_RADIUS, BUBBLE_FRAME, THOUGHT_FRAME, NARRATION_RADIUS, TYPE, TAP_TARGET } from './manhuaTokens'
import { Volume2 } from 'lucide-react'

// A line of the story, drawn as interface over or directly below the artwork.
//
// Nothing here is baked into an image: the hanzi is real text, every word is its
// own button, the pinyin is the shared per-word scaffolding (TokenBody, same
// rule as every other reader), and the translation is revealed on demand. That
// is the whole reason the art is generated without writing on it.
//
// Four registers, because a panel says different kinds of things:
//   speech    — the white bubble with a tail, someone talking
//   thought    — rounder, tailless, drawn in a lighter ink: the learner's head
//   narration  — a caption plate with a cinnabar rule, the story's voice
//   reply      — a legacy learner line, drawn with the same white balloon as
//                ordinary speech so a linear story never looks like a chat UI

const PROPER_NOUN = '#2F9E6D'

const SR_ONLY = {
  position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

// The balloon itself. Drawn the way a comic draws one: a heavy ink keyline and
// a generous but BOUNDED corner radius, with no shadow — ink on paper does not
// float, and a percentage radius turns a one-line balloon into a flat lens.
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
    // Rounder and drawn in a lighter ink than speech. NOT dashed — a dashed
    // keyline is meant to suggest a scalloped cloud edge and instead reads as a
    // selection marquee, like the balloon is an object you have clicked on.
    return {
      background: PAPER.bubble,
      border: THOUGHT_FRAME + 'px solid ' + PAPER.ink2,
      borderRadius: THOUGHT_RADIUS + 'px',
    }
  }
  if (kind === 'reply') {
    // Kept as a distinct semantic kind for compatibility with saved episodes,
    // but drawn like ordinary dialogue now that authored stories read linearly.
    return {
      background: PAPER.bubble,
      border: BUBBLE_FRAME + 'px solid ' + PAPER.frame,
      borderRadius: BUBBLE_RADIUS + 'px',
    }
  }
  return {
    background: PAPER.bubble,
    border: BUBBLE_FRAME + 'px solid ' + PAPER.frame,
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
  const edge = kind === 'thought' ? PAPER.ink2 : PAPER.frame
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
      tabIndex={-1}
      data-manhua-word="true"
      aria-label={token.text}
      onClick={(e) => { e.stopPropagation(); onSelectToken(token, status, tokenId, beatIndex, e.currentTarget) }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const bubble = e.currentTarget.closest('[data-manhua-bubble]')
          const words = bubble ? Array.from(bubble.querySelectorAll('[data-manhua-word]')) : []
          const at = words.indexOf(e.currentTarget)
          const next = e.key === 'ArrowRight' ? at + 1 : at - 1
          if (words[next]) {
            e.preventDefault()
            words[next].focus()
          }
          return
        }
        if (e.key === 'Escape') {
          const bubble = e.currentTarget.closest('[data-manhua-bubble]')
          if (bubble) { e.preventDefault(); bubble.focus() }
          return
        }
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault(); e.stopPropagation()
        onSelectToken(token, status, tokenId, beatIndex, e.currentTarget)
      }}
      className="hd-manhua-word"
      style={{
        cursor: 'pointer', borderRadius: '5px', padding: '0 1px',
        // Programmatic focus/scroll must leave the word below the sticky reader
        // header instead of considering it visible underneath that header.
        scrollMarginTop: '76px',
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

export default function ManhuaBubble({
  beat, beatIndex, kind = 'speech', tail = null, speaker = null, voice = null,
  accentHex, fontFamily, readingMode, userCards, language,
  selected, onSelectToken, onPlayLine, speaking = false,
  english = '', revealed = false, onToggleEnglish,
  layout = { mode: 'below' }, reduceMotion = false, style = {},
}) {
  if (!beat) return null
  const overlay = layout.mode === 'overlay'
  const caption = !overlay && layout.variant === 'caption'
  const narration = kind === 'narration'
  const chrome = caption
    ? {
      background: 'transparent',
      border: 'none',
      borderBottom: '1px solid ' + PAPER.soft,
      borderRadius: 0,
    }
    : chromeFor(kind, accentHex)

  const position = overlay
    ? {
      position: 'absolute',
      top: layout.top + '%',
      left: layout.left + '%',
      width: layout.width + '%',
    }
    : {
      position: 'relative',
      width: caption ? '100%' : ((layout.width || 68) + '%'),
      alignSelf: caption
        ? 'stretch'
        : (layout.side === 'left' ? 'flex-start' : (layout.side === 'center' ? 'center' : 'flex-end')),
      marginTop: caption ? 0 : '10px',
    }
  const padding = caption
    ? (narration ? '10px 9px 8px' : '11px 9px 9px')
    : (narration ? '10px 14px' : '11px 16px 12px')

  return (
    <div
      data-manhua-bubble="true"
      tabIndex={0}
      role="group"
      aria-label="Story line. Press Enter or the right arrow to explore words."
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key !== 'Enter' && e.key !== 'ArrowRight') return
        const firstWord = e.currentTarget.querySelector('[data-manhua-word]')
        if (firstWord) { e.preventDefault(); firstWord.focus() }
      }}
      className={caption ? 'hd-manhua-caption' : (reduceMotion ? undefined : 'hd-manhua-bubble')}
      data-manhua-text-layout={caption ? 'caption' : (overlay ? 'overlay' : 'below')}
      style={{
        ...position,
        ...chrome,
        padding,
        boxShadow: 'none',
        ...style,
      }}
    >
      <Tail tail={tail} kind={kind} accentHex={accentHex} />

      {/* Who is talking. A printed label is the exception, not the rule — in a
          manhua panel the drawing says who is speaking, and a name plate over
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
            its last character onto a second row. manhuaLayout's height estimate
            models exactly this (BUBBLE_ACTIONS_WIDTH). */}
        <div style={{
          float: 'right', display: 'flex', alignItems: 'center',
          marginLeft: '6px', marginTop: '-4px',
          // The following full-width text block is painted after this float.
          // Keep the controls in the top painting layer so its transparent box
          // cannot intercept taps meant for the visible ear/eye buttons.
          position: 'relative', zIndex: 1,
        }}>
          {onPlayLine && (
            <button
              onClick={(e) => { e.stopPropagation(); onPlayLine(beatIndex) }}
              aria-label={'Play this line' + (speaking ? ' (playing)' : '')}
              title="Play this line"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                width: TAP_TARGET + 'px', height: TAP_TARGET + 'px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                scrollMarginTop: '76px',
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
              style={{ scrollMarginTop: '76px' }}
            />
          )}
        </div>

        <div lang={language === 'chinese' ? 'zh-Hans' : undefined} style={{
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
        <div lang="en" style={{
          fontSize: TYPE.english, color: PAPER.muted, lineHeight: 1.5,
          marginTop: '6px', paddingTop: '7px', borderTop: '1px solid ' + PAPER.soft,
        }}>
          {english}
        </div>
      )}
    </div>
  )
}
