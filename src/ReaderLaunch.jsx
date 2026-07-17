import { ArrowLeft, Play } from 'lucide-react'
import { prefsGet, prefsSet } from './offline'

const SAGE = '#6E8466'
const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }
const startBtn = { marginTop: '24px', width: '100%', border: 'none', borderRadius: '16px', background: SAGE, color: '#fff', fontSize: '15.5px', fontWeight: 750, fontFamily: 'Inter, sans-serif', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px' }
const classicLink = { marginTop: '14px', textAlign: 'center', fontSize: '12.5px', color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', width: '100%' }
function pct(n, total) { return total ? Math.round((n / total) * 100) + '%' : '0%' }

// Shared launch screen for the paced + chat readers.
export default function ReaderLaunch({ story, isRead, levelLabel, accent, theme, readability, onStart, onBack }) {
  const { knownPct, knownCount, learningCount, newCount, totalUnique } = readability
  const readClassic = async () => { const p = (await prefsGet('reader:prefs')) || {}; await prefsSet('reader:prefs', { ...p, mode: 'classic' }); onBack() }
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px' }}>
        <button onClick={onBack} aria-label="Back to library" style={ghost}><ArrowLeft size={18} color="var(--text-muted)" /></button>
      </div>
      <div style={{ flex: 1, maxWidth: '640px', width: '100%', margin: '0 auto', padding: '8px 24px 40px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent, marginBottom: '8px' }}>{levelLabel}</div>
        <h1 style={{ fontFamily: theme.font, fontSize: '34px', fontWeight: 800, lineHeight: 1.15, textWrap: 'balance', marginBottom: '18px' }}>{story.title}</h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '9px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>{knownPct}% known{isRead ? ' · Finished' : ''}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{knownCount} known · {learningCount} learning · {newCount} new</span>
        </div>
        <div style={{ display: 'flex', height: '5px', borderRadius: '999px', overflow: 'hidden', background: 'var(--border)', marginBottom: 'auto' }}>
          <div style={{ width: pct(knownCount, totalUnique), background: '#2F9E6D' }} />
          <div style={{ width: pct(learningCount, totalUnique), background: '#CA8A04' }} />
          <div style={{ width: pct(newCount, totalUnique), background: accent + '55' }} />
        </div>
        <button onClick={onStart} style={startBtn}><Play size={18} color="#fff" /> Start reading</button>
        <button onClick={readClassic} style={classicLink}>Prefer the whole page? <u>Read as classic scroll</u></button>
      </div>
    </div>
  )
}
