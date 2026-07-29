import { useState } from 'react'
import { PAPER, CARD_RADIUS, OPTION_RADIUS, TYPE, TAP_TARGET } from './mangaTokens'
import { MessageCircleMore, MessageCircleDashed, Check } from 'lucide-react'

// The story's fork: a small card of things the learner could say.
//
// Deliberately NOT a quiz. There is no right answer, no green tick on the
// "correct" one, no score — picking is characterisation, not assessment, and
// the app's whole promise is that progression is gated on real mastery rather
// than on tapping buttons (CLAUDE.md §1). The reply-along chat reader already
// owns the "pick the correct line" drill; this is the other thing.
//
// Words inside an option are NOT individually tappable, and that is on purpose:
// a tap here means "say this", and a word-lookup tap inside the same rectangle
// would make every choice a coin flip. The moment an option is picked it is
// re-drawn as a real speech bubble in the panel above, where every word IS
// tappable — so nothing is lost, it just happens in the order that keeps both
// gestures unambiguous.

const ICONS = [MessageCircleMore, MessageCircleDashed]

function Option({ text, pinyin, index, picked, chosen, disabled, accentHex, fontFamily, onPick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = ICONS[index % ICONS.length]
  const active = chosen
  return (
    <button
      onClick={() => { if (!disabled) onPick(index) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      aria-pressed={active}
      className="hd-press"
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
        textAlign: 'left', minHeight: TAP_TARGET + 'px',
        padding: '12px 14px',
        borderRadius: OPTION_RADIUS + 'px',
        border: '1px solid ' + (active
          ? 'color-mix(in srgb, ' + accentHex + ' 45%, transparent)'
          : (hovered && !disabled ? 'color-mix(in srgb, ' + accentHex + ' 28%, ' + PAPER.hairline + ')' : PAPER.hairline)),
        background: active
          ? 'color-mix(in srgb, ' + accentHex + ' 8%, ' + PAPER.card + ')'
          : PAPER.card,
        // A choice not taken steps back rather than disappearing — the learner
        // can still see what they didn't say.
        opacity: picked && !active ? 0.42 : 1,
        cursor: disabled ? 'default' : 'pointer',
        boxShadow: active ? 'none' : (hovered && !disabled ? PAPER.shadowLift : PAPER.shadow),
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {active
          ? <Check size={19} strokeWidth={2.4} color={accentHex} />
          : <Icon size={19} strokeWidth={1.9} color={PAPER.faint} />}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{
          display: 'block', fontFamily, fontSize: '18px', fontWeight: 550,
          lineHeight: 1.45, color: active ? accentHex : PAPER.ink,
        }}>
          {text}
        </span>
        {pinyin && (
          <span style={{ display: 'block', fontSize: TYPE.pinyin, color: PAPER.muted, marginTop: '3px', letterSpacing: '0.01em' }}>
            {pinyin}
          </span>
        )}
      </span>
    </button>
  )
}

export default function MangaChoiceCard({
  prompt, options, chosenIndex, onPick, accentHex, fontFamily, showPinyin = true,
}) {
  const picked = Number.isInteger(chosenIndex)
  return (
    <section
      aria-label={prompt}
      className="hd-manga-panel is-in"
      style={{
        background: PAPER.card,
        border: '1px solid ' + PAPER.hairline,
        borderRadius: CARD_RADIUS + 'px',
        boxShadow: PAPER.shadow,
        padding: '16px 16px 18px',
      }}
    >
      <h2 style={{
        margin: '0 0 12px', fontFamily,
        fontSize: '15px', fontWeight: 700, letterSpacing: '0.01em', color: PAPER.ink2,
      }}>
        {prompt}
      </h2>
      <div role="group" aria-label={prompt} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {options.map((o, i) => (
          <Option
            key={i}
            index={i}
            text={o.text}
            pinyin={showPinyin ? o.pinyin : ''}
            picked={picked}
            chosen={chosenIndex === i}
            // Once answered the card is a record, not a control: re-picking
            // would rewrite a line the learner has already said, and a double
            // tap must never advance the story twice.
            disabled={picked}
            accentHex={accentHex}
            fontFamily={fontFamily}
            onPick={onPick}
          />
        ))}
      </div>
    </section>
  )
}
