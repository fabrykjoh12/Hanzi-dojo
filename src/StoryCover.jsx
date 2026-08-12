import { useState, useRef } from 'react'
import { getAudioUrl } from './utils'
import StoryFormatIcon from './StoryFormatIcon'

// A soft, on-brand gradient standing in for a missing illustration — never the
// browser's broken-image glyph.
function fallbackBackground(accent) {
  // P14-0: the brand, not the old sage. Callers pass the language accent;
  // this is only the default when one is missing.
  const a = accent || '#B83A24'
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
export default function StoryCover({ story, path, accent, alt = '', radius = 14, style, children, loading = 'lazy' }) {
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
    // `data-story-cover` marks this as ARTWORK rather than as a container.
    //
    // It matters to one spec and the distinction is real: home-shape.spec.js bans
    // "a card inside the card" by looking for a rounded, bordered or shadowed box
    // inside the supporting surface, and since P14-5 the cover is exactly that
    // shape — 72px of 2:3 poster with a radius and a shadow, because a cover is a
    // physical object. It is not a panel: it holds an image and no text. Inferring
    // that from the subtree failed the moment the fallback placeholder (an SVG, not
    // an <img>) rendered, so it is declared here instead of guessed there.
    <div data-story-cover="" style={{
      position: 'relative', overflow: 'hidden', borderRadius: radius,
      background: fallbackBackground(accent), border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}>
      {showImg ? (
        <img
          src={src} alt={alt} loading={loading} onError={() => setFailed(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', opacity: 0.68, color: accent || 'var(--text-muted)' }}>
          <StoryFormatIcon story={story} size={40} />
        </span>
      )}
      {children}
    </div>
  )
}
