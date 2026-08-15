import { ArrowLeft, Play } from 'lucide-react'

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }
function pct(n, total) { return total ? Math.round((n / total) * 100) + '%' : '0%' }

// An equally-weighted Paged | Scroll choice (replaces the old buried "read as
// classic scroll" text link). Picking Scroll swaps the reader instantly via the
// dispatcher — no trip back to the library.
function ReadingStyleToggle({ mode, onPick, accent }) {
  const opts = [{ key: 'paced', label: 'Paged' }, { key: 'classic', label: 'Scroll' }]
  return (
    <div role="group" aria-label="Reading style" style={{ marginTop: '14px', display: 'flex', gap: '6px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '4px' }}>
      {opts.map(o => {
        const on = (mode === 'classic' ? 'classic' : 'paced') === o.key
        return (
          <button key={o.key} onClick={() => onPick(o.key)} aria-pressed={on}
            style={{
              flex: 1, border: 'none', cursor: 'pointer', borderRadius: '9px', padding: '10px',
              fontSize: '13.5px', fontWeight: on ? 750 : 600, fontFamily: 'Inter, sans-serif',
              background: on ? 'var(--surface)' : 'transparent', color: on ? accent : 'var(--text-muted)',
              boxShadow: on ? '0 1px 6px rgba(24,24,27,0.10)' : 'none', transition: 'background 140ms ease',
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// Shared launch screen for the paced + chat readers. The screen's one accent
// moment is the Start button, in the language's own colour — reading is part of
// the same product the vermilion belongs to, not a green detour.
export default function ReaderLaunch({ story, isRead, levelLabel, accent, theme, readability, onStart, onBack, readerMode, onPickReaderMode }) {
  const { knownPct, knownCount, learningCount, newCount, totalUnique } = readability
  // The paged/scroll choice only applies to paced stories (fixed formats ignore
  // it), and only when the dispatcher passed a picker.
  const canChooseStyle = Boolean(onPickReaderMode) && (!story.presentation || story.presentation === 'paced')
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px' }}>
        <button onClick={onBack} aria-label="Back to library" style={ghost}><ArrowLeft size={18} color="var(--text-muted)" /></button>
      </div>
      <div style={{ flex: 1, maxWidth: '640px', width: '100%', margin: '0 auto', padding: '8px 24px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>{levelLabel}{isRead ? ' · Finished' : ''}</div>
        <h1 style={{ fontFamily: theme.font, fontSize: '34px', fontWeight: 800, lineHeight: 1.15, textWrap: 'balance', marginBottom: '18px' }}>{story.title}</h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '9px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>{knownPct}% known</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{knownCount} known · {learningCount} learning · {newCount} new</span>
        </div>
        <div style={{ display: 'flex', height: '4px', borderRadius: '999px', overflow: 'hidden', background: 'var(--border)' }}>
          <div style={{ width: pct(knownCount, totalUnique), background: 'var(--success)' }} />
          <div style={{ width: pct(learningCount, totalUnique), background: '#CA8A04' }} />
          <div style={{ width: pct(newCount, totalUnique), background: accent + '55' }} />
        </div>
        <button
          onClick={onStart}
          className="hd-press"
          style={{
            marginTop: '24px', width: '100%', border: 'none', borderRadius: '14px',
            background: accent, color: '#FFF9F2',
            fontSize: '15.5px', fontWeight: 750, fontFamily: 'Inter, sans-serif', padding: '16px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
            boxShadow: '0 8px 20px -14px color-mix(in srgb, ' + accent + ' 70%, transparent)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Play size={18} color="#FFF9F2" /> Start reading
        </button>
        {/* Paged vs. classic scroll — an equal choice for paced stories. Fixed
            formats (chat, scene) ignore it, so the toggle is hidden there. */}
        {canChooseStyle && (
          <ReadingStyleToggle mode={readerMode} onPick={onPickReaderMode} accent={accent} />
        )}
      </div>
    </div>
  )
}
