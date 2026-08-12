import { ArrowLeft, X } from 'lucide-react'
import { MICRO } from './designTokens'

// The one header the app's screens share.
//
// Before this, twenty-four screens each drew their own back control and each
// decided for itself where Back went — as a literal: `navigate('home')`,
// `navigate('practice')`. That is not Back, it is a shortcut that happens to
// point uphill, and it was wrong the moment a screen could be reached from more
// than one place.
//
// The affordance is decided by the screen's CLASS, not by the screen:
//
//   'back'  — pushed detail, and Settings/Languages inside the account stack.
//             A chevron. Means pop: one step back up the stack you are in.
//   'close' — a fullscreen flow and the account root. An X. Means dismiss the
//             whole presentation and return to whatever it was opened from.
//   'none'  — a tab root. The bottom bar already says where you are; a Back
//             here would be a lie about the hierarchy, and pointing it at Home
//             was the specific lie the old headers told.
//
// `onBack` should almost always be the reducer's own back/dismiss. A header
// that needs to send the learner somewhere PARTICULAR does not want this
// component's back slot — that is a destination, and destinations belong in the
// screen's content where they can be labelled.
export default function AppBar({ kind = 'back', title, meta, onBack, right, sticky = true }) {
  const showControl = kind === 'back' || kind === 'close'
  const Icon = kind === 'close' ? X : ArrowLeft
  const label = kind === 'close' ? 'Close' : 'Back'

  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      minHeight: '52px', marginBottom: '10px',
      ...(sticky ? { position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)' } : {}),
    }}>
      {showControl && (
        <button
          onClick={onBack}
          aria-label={label}
          className="hd-press"
          style={{
            // 44px, the smallest control a thumb should ever be asked to find.
            // The negative left margin keeps the icon optically aligned with the
            // content below while the hit area stays full size.
            width: '44px', height: '44px', marginLeft: '-10px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)',
          }}
        >
          <Icon size={kind === 'close' ? 21 : 20} strokeWidth={2} />
        </button>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {meta && (
          <span style={{ ...MICRO, color: 'var(--text-faint)', display: 'block', marginBottom: '2px' }}>
            {meta}
          </span>
        )}
        {title && (
          <h1 style={{
            fontSize: '19px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
          </h1>
        )}
      </div>

      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </header>
  )
}
