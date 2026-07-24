import { useState, useRef } from 'react'
import { getAudioUrl } from './utils'
import { formatEmoji } from './storyFormat'

// A soft, on-brand gradient standing in for a missing illustration — never the
// browser's broken-image glyph.
function fallbackBackground(accent) {
  const a = accent || '#6E8466'
  return 'linear-gradient(135deg, ' + a + '26 0%, ' + a + '0D 55%, var(--surface-2) 100%)'
}

// Story cover / thumbnail with a designed fallback. The storage blob for a cover
// can go missing (it has before — see the story-images-apply runbook), and a
// bare <img> then renders the broken-image icon. Here, an image error (or an
// absent image_path) falls back to a soft accent gradient with the format emoji,
// so a card or reader header always looks intentional.
//
// The caller sizes the slot via `style` (e.g. a fixed aspectRatio); overlays
// like a "read" badge pass through as children.
export default function StoryCover({ story, path, accent, alt = '', radius = 14, style, children }) {
  const src = path ? getAudioUrl(path) : null
  const [failed, setFailed] = useState(false)
  // A new story swapped into the same slot (the reader stays mounted across
  // "next story") must get a fresh chance to load its own cover. Reset in render
  // when the source changes — the repo's "adjust state during render" pattern,
  // so there is no setState-in-effect.
  const prevSrc = useRef(src)
  if (prevSrc.current !== src) { prevSrc.current = src; if (failed) setFailed(false) }
  const showImg = Boolean(src) && !failed
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', borderRadius: radius,
      background: fallbackBackground(accent), border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}>
      {showImg ? (
        <img
          src={src} alt={alt} loading="lazy" onError={() => setFailed(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <span aria-hidden="true" style={{ fontSize: 'clamp(24px, 34%, 44px)', lineHeight: 1, opacity: 0.85, filter: 'saturate(0.9)' }}>
          {formatEmoji(story)}
        </span>
      )}
      {children}
    </div>
  )
}
