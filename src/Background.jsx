import { useEffect, useState } from 'react'
import bgChinese from './assets/bg-chinese.png'
import bgJapanese from './assets/bg-japanese.png'

const baseStyle = {
  position: 'fixed', top: 0, left: 0,
  width: '100vw', height: '100vh',
  objectFit: 'cover',
  zIndex: 0,
  pointerEvents: 'none',
  transition: 'opacity 500ms ease',
}

// Fixed full-page background image, faint and behind everything (z-index 0).
// Crossfades between language themes when `language` changes.
export default function Background({ language }) {
  const src = language === 'japanese' ? bgJapanese : bgChinese
  const [current, setCurrent] = useState(src)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (src === current) return
    setVisible(false)
    const timer = setTimeout(() => {
      setCurrent(src)
      setVisible(true)
    }, 500)
    return () => clearTimeout(timer)
  }, [src, current])

  return (
    <img
      src={current}
      alt=""
      aria-hidden="true"
      style={{ ...baseStyle, opacity: visible ? 'var(--bg-image-opacity)' : 0 }}
    />
  )
}
