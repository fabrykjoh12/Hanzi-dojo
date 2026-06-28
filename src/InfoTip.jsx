import { useState, useEffect, useRef } from 'react'

export default function InfoTip({ accentHex, text }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!pos) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setPos(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
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
        aria-label="What does mastered mean?"
      >
        ?
      </button>
      {pos && (
        <div style={{
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
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {text}
          </div>
        </div>
      )}
    </span>
  )
}
