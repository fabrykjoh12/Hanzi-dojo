import { useState } from 'react'
import { BookImage, CheckCircle2, Lock } from 'lucide-react'
import StoryCover from './StoryCover'

// The library's vertical poster card — one per series or standalone story.
// The artwork carries the card: a 2:3 cover, a two-line title, and ONE quiet
// meta line (posterMeta in storyBrowse.js). Everything richer (description,
// chapter list, progress detail) belongs on the series page, not here.
//
// The cover is treated as the design asset it is: nothing is drawn over it
// except the few overlays a glance needs — a read check, a small format tag so
// Manhua/Practice never blur into the stories, a thin progress sliver for a
// started series, and the calm lock. Readability lives in the meta line below
// the art, not on it. A series wears a subtle deck edge behind its cover, so
// "several chapters" reads before any text does.
//
// Locked posters stay focusable (aria-disabled + no-op click) so the unlock
// requirement is reachable — same pattern the old cards used.

function PosterLock() {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 1, background: 'rgba(250,250,248,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '12px', background: 'var(--surface)',
        border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 14px rgba(24,24,27,0.12)',
      }}>
        <Lock size={17} strokeWidth={2} color="var(--text-muted)" />
      </div>
    </div>
  )
}

export default function StoryPoster({
  story, title, metaLine, accentHex, fontFamily,
  read = false, locked = false, lockLabel = null,
  manhua = false, practice = false, series = false,
  progress = null, // { readCount, total } for a started series
  onClick, ariaLabel,
}) {
  const [hovered, setHovered] = useState(false)
  const lift = hovered && !locked
  const started = progress && progress.total > 0 && progress.readCount > 0
  const pct = started ? Math.round((progress.readCount / progress.total) * 100) : 0
  const done = started && progress.readCount === progress.total
  return (
    <button
      onClick={locked ? () => {} : onClick}
      aria-disabled={locked}
      // metaLine already says "Read" for finished stories, so the label only
      // adds what the line can't carry: the lock.
      aria-label={ariaLabel || [title, locked ? (lockLabel || 'Locked') : metaLine].filter(Boolean).join(' · ')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={locked ? undefined : 'hd-press'}
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left', width: '100%',
        padding: 0, border: 'none', background: 'transparent', cursor: locked ? 'default' : 'pointer',
        fontFamily: 'Inter, sans-serif', opacity: locked ? 0.78 : 1,
        transform: lift ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'transform 170ms ease',
      }}
    >
      <div style={{ position: 'relative', width: '100%' }}>
        {series && (
          // The deck edge: a sliver of "chapters behind" peeking above the
          // cover. Decorative — the meta line carries the real count.
          <div aria-hidden="true" data-poster-deck="" style={{
            position: 'absolute', top: '-6px', left: '11px', right: '11px', height: '22px',
            borderRadius: '12px 12px 0 0',
            background: 'color-mix(in srgb, ' + accentHex + ' 9%, var(--surface))',
            border: '1px solid var(--border)', borderBottom: 'none',
            boxShadow: 'inset 0 2px 0 var(--hairline)',
          }} />
        )}
        <StoryCover
          story={story} path={story && story.image_path} accent={accentHex} radius={16}
          style={{
            position: 'relative', width: '100%', aspectRatio: '2 / 3',
            border: '1px solid ' + (lift ? accentHex + '66' : 'var(--border)'),
            boxShadow: lift ? '0 18px 34px rgba(24,24,27,0.18)' : '0 6px 16px rgba(24,24,27,0.08)',
            transition: 'border-color 170ms ease, box-shadow 170ms ease',
          }}
        >
          {((read && !progress) || done) && (
            <div style={{
              position: 'absolute', top: '8px', right: '8px', width: '22px', height: '22px',
              borderRadius: '999px', background: 'var(--success)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', zIndex: 1,
            }}>
              <CheckCircle2 size={14} strokeWidth={2.4} color="#fff" />
            </div>
          )}
          {(manhua || practice) && (
            <div style={{
              position: 'absolute', top: '8px', left: '8px', display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '10px', fontWeight: 800, letterSpacing: '0.04em', color: '#fff',
              background: 'rgba(24,24,27,0.6)', borderRadius: '999px', padding: '4px 8px', zIndex: 1,
            }}>
              {manhua && <BookImage size={11} strokeWidth={2.4} color="#fff" aria-hidden="true" />}
              {manhua ? 'Manhua' : 'Practice'}
            </div>
          )}
          {started && !done && (
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '4px', background: 'rgba(24,24,27,0.35)', zIndex: 1 }}>
              <div style={{ width: pct + '%', height: '100%', background: accentHex }} />
            </div>
          )}
          {locked && <PosterLock />}
        </StoryCover>
      </div>
      <div title={title} style={{
        marginTop: '9px', fontSize: '14px', fontWeight: 750, fontFamily, color: 'var(--text)',
        lineHeight: 1.32, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
        overflow: 'hidden', width: '100%',
      }}>
        {title}
      </div>
      <div style={{
        marginTop: '3px', fontSize: '11.5px', fontWeight: 650, width: '100%',
        color: locked ? 'var(--text-muted)' : done ? 'var(--success)' : 'var(--text-muted)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {locked ? (lockLabel || 'Locked') : metaLine}
      </div>
    </button>
  )
}
