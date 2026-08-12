import { PAPER, COLUMN_MAX, TYPE, TAP_TARGET, stickyPaperBar } from './manhuaTokens'
import { ArrowLeft } from 'lucide-react'

// The episode's only chrome: where you are, what you're reading, how far in.
//
// It stays a line, not a bar. Every extra control put here is a control drawn on
// top of a page of artwork — the reading settings, the format toggle and the
// library link all live one tap back, on the story shelf, which is where a
// reader looks for them anyway.
//
// Sticky, with the paper carried up behind it so the panels scroll under it
// without the title becoming unreadable over a dark establishing shot.
// Opaque, and it covers the notch — both rules, and why, live in
// stickyPaperBar (manhuaTokens.js), where they are tested.
export default function ManhuaHeader({ label, title, current, total, pct, onBack, accentHex, fontFamily }) {
  return (
    <header data-manhua-header="true" style={stickyPaperBar(5)}>
      <div style={{
        maxWidth: COLUMN_MAX + 'px', margin: '0 auto',
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 12px 9px',
      }}>
        <button
          onClick={onBack}
          aria-label="Back to stories"
          className="hd-press"
          style={{
            flexShrink: 0, width: TAP_TARGET + 'px', height: TAP_TARGET + 'px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', borderRadius: '12px',
          }}
        >
          <ArrowLeft size={21} strokeWidth={2.1} color={PAPER.ink} />
        </button>

        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          {label && (
            <div style={{
              fontFamily, fontSize: TYPE.meta, fontWeight: 600,
              color: PAPER.muted, letterSpacing: '0.06em', lineHeight: 1.3,
            }}>
              {label}
            </div>
          )}
          <h1 style={{
            margin: 0, fontFamily, fontSize: '19px', fontWeight: 700,
            color: PAPER.ink, letterSpacing: '0.01em', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
          </h1>
        </div>

        {/* Tabular figures: "3 / 8" must not jog sideways when it becomes
            "4 / 8" with the whole page scrolling under it. */}
        <div
          aria-label={'Panel ' + current + ' of ' + total}
          style={{
            flexShrink: 0, minWidth: '46px', textAlign: 'right',
            fontSize: '15px', fontWeight: 600, color: PAPER.muted,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {current} / {total}
        </div>
      </div>

      {/* The reading rail. Two pixels of lantern-gold under the title is the
          entire progress indicator — a percentage or a segmented bar would be a
          game HUD on top of a comic. */}
      <div style={{ height: '2px', background: PAPER.soft }}>
        <div
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Reading progress"
          style={{
            height: '100%', width: pct + '%',
            background: 'linear-gradient(90deg, ' + PAPER.gold + ' 0%, ' + accentHex + ' 100%)',
            transition: 'width 320ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>
    </header>
  )
}
