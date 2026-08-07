import { useState, useEffect, useRef, useId } from 'react'

// The button's accessible name comes from the text it reveals, not a hardcoded
// question — this tip explains more than one thing (Profile and Test both use
// it, and the next screen will too). Long copy is trimmed to its first sentence
// so the name stays a name rather than a paragraph read out before every press.
function tipLabel(text) {
  if (typeof text !== 'string' || text.trim() === '') return 'More information'
  const s = text.trim()
  const stop = s.indexOf('. ')
  const first = stop === -1 ? s : s.slice(0, stop)
  return 'More information: ' + (first.length > 72 ? first.slice(0, 71).trim() + '…' : first)
}

export default function InfoTip({ accentHex, text }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const panelId = useId()
  const label = tipLabel(text)

  useEffect(() => {
    if (!pos) return undefined
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setPos(null)
    }
    // Keyboard parity with the outside click: Escape closes and hands focus
    // back to the button that opened it.
    function handleKey(e) {
      if (e.key !== 'Escape') return
      setPos(null)
      if (btnRef.current) btnRef.current.focus({ preventScroll: true })
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [pos])

  // Move focus into the panel once it is open, so a screen reader reads the
  // explanation instead of leaving the learner on a "?" that appeared to do
  // nothing.
  useEffect(() => {
    if (pos && panelRef.current) panelRef.current.focus({ preventScroll: true })
  }, [pos])

  function handleOpen() {
    if (pos) { setPos(null); return }
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({
        top: rect.bottom + 8 + window.scrollY,
        left: Math.min(rect.left, window.innerWidth - 310),
      })
    }
  }

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block', verticalAlign: 'middle' }}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{
          width: '18px', height: '18px',
          borderRadius: '50%',
          border: '1.5px solid ' + (accentHex || 'var(--text-muted)') + '66',
          background: pos ? (accentHex || 'var(--text-muted)') + '18' : 'transparent',
          color: accentHex || 'var(--text-muted)',
          fontSize: '11px', fontWeight: 700,
          cursor: 'pointer', lineHeight: '15px',
          padding: 0, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Inter, sans-serif',
          flexShrink: 0,
        }}
        aria-label={label}
        aria-expanded={Boolean(pos)}
        aria-haspopup="dialog"
        aria-controls={pos ? panelId : undefined}
      >
        ?
      </button>
      {pos && (
        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: '290px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '16px 18px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            zIndex: 9999,
            textAlign: 'left',
            outline: 'none',
          }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {text}
          </div>
        </div>
      )}
    </span>
  )
}
