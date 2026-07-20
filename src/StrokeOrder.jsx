import { useEffect, useRef } from 'react'
import HanziWriter from 'hanzi-writer'

// Animated stroke order for a word — one mini hanzi-writer per character, reusing
// the same config as the Writer practice screen. Stroke data loads from
// hanzi-writer's CDN (same as Writer.jsx); a load failure degrades quietly to an
// empty tile. Only Han characters are rendered (punctuation/letters are skipped).
const HAN = /\p{Script=Han}/u

export default function StrokeOrder({ word, accentHex, size = 84 }) {
  const chars = [...(word || '')].filter(c => HAN.test(c))
  if (chars.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', margin: '10px 0 2px' }}>
      {chars.map((c, i) => <StrokeChar key={c + i} char={c} accentHex={accentHex} size={size} />)}
    </div>
  )
}

function StrokeChar({ char, accentHex, size }) {
  const ref = useRef(null)
  useEffect(() => {
    const target = ref.current
    if (!target) return
    target.innerHTML = ''
    let cancelled = false
    const writer = HanziWriter.create(target, char, {
      width: size, height: size, padding: 5,
      showOutline: true,
      strokeColor: accentHex,
      radicalColor: '#2F9E6D',
      delayBetweenStrokes: 160,
      strokeAnimationSpeed: 1,
      onLoadCharDataSuccess: () => { if (!cancelled) writer.animateCharacter() },
    })
    return () => { cancelled = true; target.innerHTML = '' }
  }, [char, accentHex, size])
  return (
    <div
      ref={ref}
      aria-label={'Stroke order for ' + char}
      style={{ width: size, height: size, border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface-2, var(--surface))' }}
    />
  )
}
