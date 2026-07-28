import { useState, useEffect, useRef } from 'react'
import { tokenReading, furiganaSplit, FURIGANA_MODES } from './storyReading'
import { readingFontOptions, readingFontHint } from './readingFonts'
import { SPEED_RATES } from './readAlong'
import { useIsMobile } from './useIsMobile'
import { Sliders, X, Eye, EyeOff } from 'lucide-react'

// Per-word reading scaffolding, shared by the paced / chat / scene readers.
// The DECISION of whether a word shows its reading lives in storyReading.js
// (tokenReading → readingVisibleFor), the same rule the classic scroll reader
// uses; this file only draws it and offers the quiet control that picks a mode.

const RT_COLOR = '#B45309'

// U+00A0. A plain space collapses in HTML, so it could not hold an empty
// annotation row open; this one can.
const NBSP = ' '

const MODE_LABELS = { always: 'Always', learning: 'Learning', unknown: 'Unknown', hidden: 'Off' }

const MODE_HINTS = {
  always: 'Every word shows its reading.',
  learning: 'Only the words you are still learning.',
  unknown: 'Only words you have not started yet.',
  hidden: 'No readings — read it as written.',
}

// What the learner calls the reading in their language. Module-private: the repo
// lints for component-only exports from .jsx files.
function readingLabelFor(language) {
  if (language === 'chinese') return 'Pinyin'
  if (language === 'japanese') return 'Furigana'
  return 'Reading'
}

// One token's body: its reading as <ruby> when this word earns one, otherwise
// the bare text. `reserve` keeps an empty annotation row over words that show no
// reading, so the line sits at the same baseline whichever words are scaffolded
// — switching modes (or moving between beats) never nudges the text.
export function TokenBody({ text, reading, mode, status, language, reserve, rtColor }) {
  const rtStyle = { fontSize: '0.56em', color: rtColor || RT_COLOR, fontWeight: 500, letterSpacing: '0.02em' }
  const shown = tokenReading({ text, reading, mode, status, language })
  if (!shown) {
    if (!reserve) return <>{text}</>
    // NBSP, not a plain space — HTML collapses plain whitespace, which would
    // leave the annotation row zero-height and defeat the reservation.
    return <ruby>{text}<rt style={rtStyle}>{NBSP}</rt></ruby>
  }
  if (language === 'japanese') {
    // Reading over the kanji core only; shared okurigana stays on the baseline.
    const fp = furiganaSplit(text, shown)
    if (fp) return <>{fp.lead}<ruby>{fp.core}<rt style={rtStyle}>{fp.coreReading}</rt></ruby>{fp.trail}</>
  }
  return <ruby>{text}<rt style={rtStyle}>{shown}</rt></ruby>
}

// The per-sentence "reveal meaning" control: a plain eye icon that sits beside
// one sentence/beat/bubble. Each caller owns its own revealed flag (usually one
// bit in a Set keyed by beat/bubble index) — this button never affects any
// sentence but the one it's attached to, so tapping it always means "this one".
export function RevealEnglishButton({ revealed, onToggle, color = 'var(--text-muted)', activeColor, style }) {
  const Icon = revealed ? EyeOff : Eye
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      aria-label={revealed ? 'Hide English translation' : 'Show English translation'}
      aria-pressed={revealed}
      title={revealed ? 'Hide translation' : 'Show translation'}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        ...style,
      }}
    >
      <Icon size={16} strokeWidth={2} color={revealed ? (activeColor || color) : color} />
    </button>
  )
}

// The quiet control: one button that opens a small settings panel (popover on
// desktop, bottom sheet on phones) holding the reading mode and speed — rather
// than a row of always-on switches competing with the story. Sentence English
// lives outside this panel now: a RevealEnglishButton sits beside each
// sentence instead, so translation is a direct per-line action, not a buried
// all-or-nothing setting.
export function ReadingSettings({ mode, setMode, language, accent, onOpenChange, compact = false, placement = 'top', tint, rate, setRate, font, setFont }) {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const label = readingLabelFor(language)
  const fontOptions = readingFontOptions(language)

  const close = () => {
    setOpen(false)
    if (btnRef.current) btnRef.current.focus()
  }

  // Report open/closed so a reader can suspend its tap-to-advance while the
  // panel is up — a tap meant for the settings must never turn the page.
  useEffect(() => { if (onOpenChange) onOpenChange(open) }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return undefined
    if (panelRef.current) panelRef.current.focus()
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      if (btnRef.current) btnRef.current.focus()
    }
    const onDown = (e) => {
      if (panelRef.current && panelRef.current.contains(e.target)) return
      if (btnRef.current && btnRef.current.contains(e.target)) return
      setOpen(false)
    }
    // Capture Escape before the reader's own key handler sees it.
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const panel = (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Reader settings"
      onClick={(e) => e.stopPropagation()}
      style={isMobile ? sheetStyle : (placement === 'bottom' ? popoverBelowStyle : popoverStyle)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.02em' }}>{label}</div>
        <button onClick={close} aria-label="Close settings" style={closeBtn}><X size={15} color="var(--text-muted)" /></button>
      </div>
      <div role="group" aria-label={label + ' display'} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {FURIGANA_MODES.map((value) => {
          const on = mode === value
          return (
            <button
              key={value}
              onClick={() => setMode(value)}
              aria-pressed={on}
              style={{
                flex: '1 1 auto', minWidth: '68px', fontSize: '12px', fontWeight: 700, padding: '8px 10px',
                borderRadius: '10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                border: '1px solid ' + (on ? accent + '73' : 'var(--border)'),
                background: on ? accent + '14' : 'var(--surface)',
                color: on ? accent : 'var(--text-muted)',
              }}
            >{MODE_LABELS[value]}</button>
          )
        })}
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '8px', lineHeight: 1.45 }}>
        {MODE_HINTS[mode] || ''}
      </div>
      {setFont && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.02em', marginBottom: '8px' }}>Reading font</div>
          <div role="group" aria-label="Reading font" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {fontOptions.map((opt) => {
              const on = font === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setFont(opt.value)}
                  aria-pressed={on}
                  style={{
                    flex: '1 1 auto', minWidth: '68px', fontSize: '12px', fontWeight: 700, padding: '8px 10px',
                    borderRadius: '10px', cursor: 'pointer',
                    // Each option is set in its own face, so the shapes are
                    // visible before the choice is made.
                    fontFamily: opt.stack,
                    border: '1px solid ' + (on ? accent + '73' : 'var(--border)'),
                    background: on ? accent + '14' : 'var(--surface)',
                    color: on ? accent : 'var(--text-muted)',
                  }}
                >
                  {opt.sample && (
                    <span aria-hidden="true" style={{ display: 'block', fontSize: '20px', lineHeight: 1.15, marginBottom: '2px', fontWeight: 500 }}>{opt.sample}</span>
                  )}
                  {opt.label}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '8px', lineHeight: 1.45 }}>
            {readingFontHint(language, font)}
          </div>
        </div>
      )}
      {setRate && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.02em', marginBottom: '8px' }}>Speed</div>
          <div role="group" aria-label="Playback speed" style={{ display: 'flex', gap: '6px' }}>
            {SPEED_RATES.map((value) => {
              const on = rate === value
              return (
                <button
                  key={value}
                  onClick={() => setRate(value)}
                  aria-pressed={on}
                  style={{
                    flex: '1 1 auto', fontSize: '12px', fontWeight: 700, padding: '8px 10px',
                    borderRadius: '10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    border: '1px solid ' + (on ? accent + '73' : 'var(--border)'),
                    background: on ? accent + '14' : 'var(--surface)',
                    color: on ? accent : 'var(--text-muted)',
                  }}
                >{value}×</button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Reader settings"
        style={{
          display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700,
          padding: compact ? '7px' : '7px 13px', borderRadius: '999px', cursor: 'pointer',
          fontFamily: 'Inter, sans-serif',
          border: '1px solid ' + (open ? accent + '73' : (tint ? tint.border : 'var(--border)')),
          background: open ? accent + '14' : (tint ? tint.bg : 'var(--surface)'),
          color: open ? accent : (tint ? tint.text : 'var(--text-muted)'),
        }}
      >
        <Sliders size={14} />
        {!compact && <span>Reader</span>}
      </button>
      {open && (isMobile
        ? (
          <>
            <div onClick={close} aria-hidden="true" style={scrimStyle} />
            {panel}
          </>
        )
        : panel)}
    </div>
  )
}

const popoverStyle = {
  position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
  width: '288px', maxWidth: 'calc(100vw - 32px)', zIndex: 60,
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px',
  padding: '14px', boxShadow: '0 10px 30px rgba(0,0,0,0.16)', textAlign: 'left',
  animation: 'hd-pop-in 160ms ease-out', outline: 'none',
}

// Header-anchored variant: the panel drops below the button instead of rising
// above it, so a control in a top bar never opens off-screen.
const popoverBelowStyle = {
  ...popoverStyle, bottom: 'auto', top: 'calc(100% + 10px)', left: 'auto', right: 0, transform: 'none',
}

const sheetStyle = {
  position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 210,
  background: 'var(--surface)', borderTop: '1px solid var(--border)',
  borderRadius: '18px 18px 0 0', padding: '16px 18px calc(20px + env(safe-area-inset-bottom))',
  boxShadow: '0 -8px 30px rgba(0,0,0,0.18)', textAlign: 'left',
  animation: 'hd-sheet-up 200ms ease-out', outline: 'none',
}

const scrimStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.28)', zIndex: 200 }

const closeBtn = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
  display: 'flex', alignItems: 'center',
}
