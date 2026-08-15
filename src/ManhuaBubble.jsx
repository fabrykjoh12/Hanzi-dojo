import { useLayoutEffect, useRef, useState } from 'react'
import { wordStatus, isPlaceWord, isWordlikeToken } from './storyReading'
import { TokenBody, RevealEnglishButton } from './ReadingScaffold'
import { PAPER, NARRATION_RADIUS, TYPE, TAP_TARGET } from './manhuaTokens'
import { balloonPath, balloonPadding } from './manhuaBalloon'
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
//   thought    — a cloud with shrinking circles toward the learner's head
//   narration  — a caption plate with a cinnabar rule, the story's voice
//   reply      — a legacy learner line, drawn with the same white balloon as
//                ordinary speech so a linear story never looks like a chat UI

const PROPER_NOUN = '#2F9E6D'
const NUMERAL_HANZI = new Set(['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '百', '千', '万', '两', '几'])
const MEASURE_WORDS = new Set(['个', '位', '本', '张', '只', '条', '件', '杯', '碗', '块', '点', '次', '天', '年', '岁'])
const SENTENCE_END = new Set(['。', '？', '！', '?', '!'])

const SR_ONLY = {
  position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

function keepWithPrevious(previous, current) {
  if (!previous || !current || !MEASURE_WORDS.has(current.text)) return false
  const chars = Array.from(previous.text || '')
  return chars.length > 0 && chars.every(char => NUMERAL_HANZI.has(char))
}

// The balloon itself. Dialogue and thought use drawn SVG silhouettes instead of
// CSS rounded rectangles: a comic balloon is an irregular ink shape fitted to
// its words, not a UI card with a triangle stuck to it.
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
  return {
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
  }
}

function SpeechTail({ tail }) {
  if (!tail) return null
  const bottom = tail.indexOf('bottom') === 0
  const left = tail.indexOf('left') !== -1
  return (
    <svg
      aria-hidden
      data-manhua-balloon-tail={tail}
      viewBox="0 0 44 34"
      preserveAspectRatio="none"
      style={{
        position: 'absolute', zIndex: 0, pointerEvents: 'none',
        width: '44px', height: '34px',
        ...(bottom ? { bottom: '-25px' } : { top: '-25px' }),
        ...(left ? { left: '19px' } : { right: '19px' }),
        transform: 'scale(' + (left ? 1 : -1) + ', ' + (bottom ? 1 : -1) + ')',
      }}
    >
      <path
        d="M3 1C15 2 28 4 41 0C32 10 24 21 9 32C15 19 14 9 3 1Z"
        fill={PAPER.bubble}
        stroke={PAPER.frame}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ThoughtTrail({ side }) {
  const left = side !== 'left'
  return (
    <svg
      aria-hidden
      data-manhua-thought-trail={left ? 'bottom-left' : 'bottom-right'}
      viewBox="0 0 40 34"
      style={{
        position: 'absolute', zIndex: 0, pointerEvents: 'none',
        width: '40px', height: '34px', bottom: '-29px',
        ...(left ? { left: '18px' } : { right: '18px' }),
        transform: left ? 'none' : 'scaleX(-1)',
      }}
    >
      <circle cx="29" cy="5" r="6" fill={PAPER.bubble} stroke={PAPER.ink2} strokeWidth="2" />
      <circle cx="17" cy="17" r="4" fill={PAPER.bubble} stroke={PAPER.ink2} strokeWidth="2" />
      <circle cx="7" cy="28" r="2.5" fill={PAPER.bubble} stroke={PAPER.ink2} strokeWidth="2" />
    </svg>
  )
}

// The silhouette used to be a fixed near-circle stretched over the box with
// preserveAspectRatio="none". An ellipse's edge pulls in steeply near its top
// and bottom, so as soon as pinyin scaffolding made a balloon tall, the text
// rectangle's first line began OUTSIDE the drawn curve. The path is now
// generated from the box's real pixel size (manhuaBalloon.js): corner curves
// are capped in pixels and every wobble bulges outward, so the padded text
// always sits inside the ink — at any content height.
function BalloonShell({ kind, tail, side, overlay, box, seed }) {
  if (kind === 'narration') return null
  const thought = kind === 'thought'
  return (
    <>
      {thought && overlay ? <ThoughtTrail side={side} /> : <SpeechTail tail={tail} />}
      {box && (
        <svg
          aria-hidden
          data-manhua-balloon-shape={thought ? 'thought' : 'speech'}
          viewBox={'0 0 ' + box.w + ' ' + box.h}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', overflow: 'visible' }}
        >
          <path
            d={balloonPath(box.w, box.h, thought ? 'thought' : 'speech', seed)}
            fill={PAPER.bubble}
            stroke={thought ? PAPER.ink2 : PAPER.frame}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )}
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
  beat, beatIndex, kind = 'speech', tail = null, side = 'right', speaker = null, voice = null,
  accentHex, fontFamily, readingMode, userCards, language,
  selected, onSelectToken, onPlayLine, speaking = false,
  english = '', revealed = false, onToggleEnglish,
  layout = { mode: 'below' }, reduceMotion = false, style = {},
}) {
  const overlay = layout.mode === 'overlay'
  const narration = kind === 'narration'

  // The balloon's drawn silhouette needs the box's real pixel size (see
  // BalloonShell). offsetWidth/offsetHeight, not getBoundingClientRect: the
  // entry animation scales the box, and the path must fit the layout size.
  const shellRef = useRef(null)
  const [box, setBox] = useState(null)
  useLayoutEffect(() => {
    if (narration) return undefined
    const el = shellRef.current
    if (!el) return undefined
    const measure = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      setBox(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [narration])

  if (!beat) return null
  const hasActions = Boolean(onPlayLine) || Boolean(onToggleEnglish && english)
  const stackedActions = hasActions && !narration
  // A narration line is a caption plate. Spoken dialogue that has to leave the
  // art remains a balloon in the gutter instead of becoming generic body copy.
  const caption = !overlay && layout.variant === 'caption' && narration
  const chrome = chromeFor(kind, accentHex)

  const maxWidth = (layout.width || 62) + '%'
  const bubbleSide = layout.side || side
  const position = overlay
    ? {
      position: 'absolute',
      top: layout.top + '%',
      width: narration ? maxWidth : 'max-content',
      maxWidth,
      ...(bubbleSide === 'left'
        ? { left: '4%' }
        : (bubbleSide === 'center'
          ? { left: '50%', translate: '-50% 0' }
          : { right: '4%' })),
    }
    : {
      position: 'relative',
      width: caption ? '100%' : 'max-content',
      maxWidth: caption ? '100%' : maxWidth,
      alignSelf: caption
        ? 'stretch'
        : (bubbleSide === 'left' ? 'flex-start' : (bubbleSide === 'center' ? 'center' : 'flex-end')),
      marginTop: caption ? 0 : '10px',
    }
  // Balloon paddings come from manhuaBalloon.js — they are the values the
  // silhouette's corner cap is solved against, not free styling.
  const padding = caption
    ? (narration ? '10px 9px 8px' : '11px 9px 9px')
    : (narration ? '10px 14px' : balloonPadding(kind))

  return (
    <div
      ref={shellRef}
      data-manhua-bubble="true"
      data-manhua-bubble-kind={kind}
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
        isolation: 'isolate',
        ...style,
      }}
    >
      <BalloonShell kind={kind} tail={tail} side={side} overlay={overlay} box={box} seed={beatIndex} />

      {/* Who is talking. A printed label is the exception, not the rule — in a
          manhua panel the drawing says who is speaking, and a name plate over
          every bubble is what makes a comic look like a chat app. So the episode
          opts in per character (cast[speaker].display), while screen readers,
          which have no drawing to go on, are always told. */}
      {speaker && !narration && (
        <div style={{
          position: 'relative', zIndex: 1,
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
        position: 'relative', zIndex: 1,
        minHeight: hasActions ? (stackedActions ? TAP_TARGET * 2 : TAP_TARGET) + 'px' : undefined,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        {/* Balloon tools sit in one narrow column instead of floating across the
            sentence. A horizontal 88px toolbar stole only the first line's
            width, producing orphaned text like “我 / 以前是一个 / 字”. The
            vertical stack costs every line the same 52px, so wrapping remains
            balanced while both controls keep their 44px touch targets.
            Full-width narration captions have room for an inline pair; keeping
            that pair to one row also prevents controls from touching the next
            caption's tap area. */}
        {hasActions && (
          <div data-manhua-line-actions={stackedActions ? 'stacked' : 'inline'} style={{
            position: 'absolute', top: '50%', right: '-5px', translate: '0 -50%',
            display: 'flex', flexDirection: stackedActions ? 'column' : 'row', alignItems: 'center', zIndex: 2,
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
        )}

        <div lang={language === 'chinese' ? 'zh-Hans' : undefined} style={{
          fontFamily,
          fontSize: narration ? TYPE.hanziNarration : TYPE.hanzi,
          lineHeight: 1.85,
          fontWeight: narration ? 500 : 550,
          color: PAPER.ink,
          opacity: narration ? 0.92 : 1,
          paddingRight: hasActions ? (stackedActions ? '52px' : '88px') : 0,
          // `balance` can create extra rows inside an intrinsically sized CJK
          // balloon (for example 哪个 / 字？ / 我忘 / 了。). `pretty` keeps the
          // natural greedy measure while still avoiding a stranded final word.
          textWrap: 'pretty',
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
                  Chinese line may not begin with 。or ？. A second sentence
                  starts a fresh comic line instead of leaving its subject
                  stranded after the previous question mark. */}
              {k > 0 && SENTENCE_END.has(beat.tokens[k - 1].text)
                ? <br />
                : (k > 0 && isWordlikeToken(t.text) && !keepWithPrevious(beat.tokens[k - 1], t) ? <wbr /> : null)}
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
      </div>

      {revealed && english && (
        <div lang="en" style={{
          position: 'relative', zIndex: 1,
          fontSize: TYPE.english, color: PAPER.muted, lineHeight: 1.5,
          marginTop: '6px', paddingTop: '7px', borderTop: '1px solid ' + PAPER.soft,
        }}>
          {english}
        </div>
      )}
    </div>
  )
}
