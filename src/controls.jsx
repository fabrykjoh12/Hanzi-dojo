import { useState, useRef } from 'react'
import {
  buttonStyle, buttonInk, BUTTON_HEIGHT,
  iconButtonStyle, iconInk,
  rowStyle, ROW_TITLE, ROW_SUPPORTING,
  chipStyle,
  segmentedTrackStyle, segmentStyle, segmentedKeyIndex,
} from './controlTokens'

// The five shared controls — P14-1.
//
// These are thin. Every colour, size and state recipe lives in controlTokens.js
// as a pure function; what is here is the part that genuinely needs React: hover
// state, the element choice, and the accessibility contract.
//
// ── They are Hanzi Dojo's controls, not a UI kit ────────────────────────────
// The prop lists below are short on purpose, and each prop exists because a real
// call site in this app forces it. Rejected, with what to do instead:
//
//   `color` / `tone` on Button   — the palette decides which roles may fill a
//       button (canFillButton). A screen that wants a plum CTA wants the brand
//       to stop being the brand.
//   `radius` / `size` in pixels  — shape.js owns the scale. Two button heights
//       exist because the app has two; a third would be a fourth by next month.
//   `as` / polymorphism          — Row and Chip already pick their element from
//       whether they are interactive, which is the only distinction that has
//       ever mattered here.
//   a spinner on `loading`       — a spinner is an animation, and P14-1 is
//       explicitly before the animation phase. `loading` disables the control,
//       sets aria-busy, and optionally swaps the label, which is what the app's
//       hand-rolled buttons already do ("Sending…").
//
// `style` IS accepted, merged last, because panels.jsx established that for
// shared components and a primitive nobody can place is a primitive nobody uses.
// It is for LAYOUT — margin, width, grid placement. Putting a colour there is
// how a design system dies, and the guard test counts hexes, so it will show up.

// ── Button ──────────────────────────────────────────────────────────────────
//
//   variant    'primary' | 'secondary' | 'ghost' | 'destructive'
//   size       'md' (44) | 'lg' (52)
//   icon       a lucide component; tinted to match the label automatically
//   full       stretch to the container's width
//   loading    disables, sets aria-busy, and swaps in `loadingLabel` if given
//   keepFocus  disable with aria-disabled instead of the real attribute
//
// `keepFocus` exists because two screens need it and both already say why in a
// comment: Test.jsx auto-advances, and Speaking.jsx disables the moment it is
// pressed. A real `disabled` on the element that currently HAS focus drops that
// focus to <body>, which strands a keyboard learner mid-drill. So the control
// stays focusable, announces itself disabled, and refuses the click anyway.
export function Button({
  children, onClick, variant = 'primary', size = 'md', icon: Icon,
  disabled = false, loading = false, full = false, loadingLabel,
  keepFocus = false, type = 'button', ariaLabel, style = {},
}) {
  const [hovered, setHovered] = useState(false)
  // Only the `lacquer` variant reads this — a material control compresses under
  // a finger, and nothing but the renderer knows the finger is there. Cleared on
  // leave as well as up, or a drag off the button leaves it stuck pressed.
  const [pressed, setPressed] = useState(false)
  const off = disabled || loading
  const ink = buttonInk(variant, { disabled, loading })
  return (
    <button
      type={type}
      onClick={off ? undefined : onClick}
      disabled={off && !keepFocus}
      aria-disabled={off && keepFocus ? true : undefined}
      aria-busy={loading ? true : undefined}
      aria-label={ariaLabel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      className="hd-press"
      style={{ ...buttonStyle(variant, { size, disabled, loading, hovered, pressed, full }), ...style }}
    >
      {Icon && <Icon size={size === 'lg' ? 18 : 16} strokeWidth={2.1} color={ink} aria-hidden="true" />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
}

// ── IconButton ──────────────────────────────────────────────────────────────
// `label` is not optional. An icon-only control with no accessible name is
// invisible to a screen reader, and the census found unlabelled ones in the app;
// making the name a required prop is the only way that stops recurring.
//
// The box is always 44x44. For the default `ghost` variant that paints nothing,
// so a 30x30 button becomes a 44x44 target with an identical picture — the
// glyph does not move and no pixel changes colour.
//
//   icon      a lucide component, or pass `children` for a custom SVG
//   iconSize  the GLYPH's size, which is not the button's size
//   variant   'ghost' (no shell) | 'solid' (bordered surface)
//   round     pill instead of the control radius
//
export function IconButton({
  label, icon: Icon, iconSize = 19, onClick, variant = 'ghost',
  disabled = false, round = false, tone, pressed, style = {}, children,
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : Boolean(pressed)}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hd-press"
      style={{ ...iconButtonStyle(variant, { disabled, hovered, round }), ...style }}
    >
      {/* One stroke weight for every icon button — that consistency is the
          point. 2 is lucide's default and what most of the app's icon-only
          controls already pass. */}
      {Icon
        ? <Icon size={iconSize} strokeWidth={2} color={iconInk({ disabled, tone })} aria-hidden="true" />
        : children}
    </button>
  )
}

// ── Row ─────────────────────────────────────────────────────────────────────
// A list row. It is a <button> when it does something and a <div> when it does
// not, which is the whole reason to have it: the app is full of `<div onClick>`
// rows that a keyboard cannot reach, and this makes the accessible version the
// easy one to write.
//
//   title       required
//   supporting  the second line
//   leading     an icon or any node on the left
//   trailing    a value, a chevron, a switch — anything on the right
//   divider     draws the hairline ABOVE this row. `rowDivider(i)` for a run;
//               default off, so a lone Row does not wear a stray line.
//
export function Row({
  title, supporting, leading, trailing, onClick,
  disabled = false, divider = false, style = {}, ariaLabel, dataTour,
}) {
  const [hovered, setHovered] = useState(false)
  const interactive = typeof onClick === 'function'
  const shared = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    'data-tour': dataTour,
    style: { ...rowStyle({ disabled, hovered, interactive, divider }), ...style },
  }
  const body = (
    <>
      {leading}
      {/* minWidth:0 is what lets a long title ellipsize instead of pushing the
          trailing content off the row. */}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...ROW_TITLE, display: 'block' }}>{title}</span>
        {supporting && <span style={{ ...ROW_SUPPORTING, display: 'block', marginTop: '2px' }}>{supporting}</span>}
      </span>
      {trailing}
    </>
  )
  if (!interactive) return <div {...shared}>{body}</div>
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} aria-label={ariaLabel} className="hd-press" {...shared}>
      {body}
    </button>
  )
}

// ── Chip ────────────────────────────────────────────────────────────────────
// Passive when it has no onClick — a <span>, because a label is not a control.
// Selectable when it does, and then `selected` becomes aria-pressed so the state
// is announced rather than only drawn.
export function Chip({ children, onClick, selected = false, disabled = false, icon: Icon, style = {} }) {
  const selectable = typeof onClick === 'function'
  const shape = { ...chipStyle({ selectable, selected, disabled }), ...style }
  const glyph = Icon && (
    <Icon size={13} strokeWidth={2} color={selected ? '#fff' : 'currentColor'} aria-hidden="true" />
  )
  if (!selectable) return <span style={shape}>{glyph}{children}</span>
  return (
    <button
      type="button"
      aria-pressed={Boolean(selected)}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="hd-press"
      style={shape}
    >
      {glyph}{children}
    </button>
  )
}

// ── Segmented ───────────────────────────────────────────────────────────────
// One of N, which is a radio group — so that is what it reports itself as.
//
// The app's existing segmented controls are runs of `aria-pressed` buttons, and
// aria-pressed is a toggle: it says "this one is on" without saying "and the
// others are therefore off", so a screen reader user hears four independent
// switches. role="radiogroup" + aria-checked says it once, and it brings the
// keyboard contract that comes with it: one tab stop for the group (roving
// tabindex), arrows to move, Home/End to jump.
//
//   label     the group's accessible name — required, it is a radiogroup
//   options   [{ value, label, icon? }]
//   value     the selected value
//   onChange  (value) => void
//
// The one interactive control here WITHOUT `hd-press`: the class nudges its
// element down a pixel, and a segment nudging inside a fixed track reads as the
// track wobbling. The thumb moving IS the feedback.
//
// If `value` matches nothing, the first segment still owns the tab stop — a
// radiogroup with no selection has to remain reachable.
export function Segmented({ label, options = [], value, onChange, disabled = false, style = {} }) {
  const [hovered, setHovered] = useState(null)
  const refs = useRef([])

  const selectedIndex = Math.max(0, options.findIndex(o => o.value === value))

  function onKeyDown(e, index) {
    const next = segmentedKeyIndex(e.key, index, options.length)
    if (next === null) return
    e.preventDefault()
    const option = options[next]
    if (!option) return
    // A radio group moves selection with the arrows, not just focus — that is
    // the pattern's contract, and it is why there is no Enter to confirm.
    if (option.value !== value && typeof onChange === 'function') onChange(option.value)
    // Focused straight from the handler rather than through an effect. An effect
    // that setStates to clear its own trigger is a cascading render (and the
    // lint rule that says so is right); the node is keyed by value so it
    // survives the re-render and keeps the focus we just gave it.
    const el = refs.current[next]
    if (el) el.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} style={{ ...segmentedTrackStyle({ disabled }), ...style }}>
      {options.map((o, i) => {
        const on = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={on}
            // Roving tabindex: the group is ONE tab stop, and it is the selected
            // option. Tabbing into a four-option control four times is the thing
            // this replaces.
            tabIndex={disabled ? -1 : (i === selectedIndex ? 0 : -1)}
            disabled={disabled}
            onClick={() => { if (!disabled && !on && typeof onChange === 'function') onChange(o.value) }}
            onKeyDown={(e) => { if (!disabled) onKeyDown(e, i) }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={segmentStyle({ selected: on, disabled, hovered: hovered === i })}
          >
            {Icon && <Icon size={15} strokeWidth={2} color="currentColor" aria-hidden="true" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// The height a Button reserves, for a caller that has to line something else up
// with it. Re-exported so a screen never needs to import the token module too.
//
// Deliberately NOT re-exported: buttonStyle / rowStyle / chipStyle. A screen
// reaching for the raw recipe is a screen building a sixth control, and the
// point of this file is that there are five.
export { BUTTON_HEIGHT }
