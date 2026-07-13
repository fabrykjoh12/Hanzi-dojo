import { Compass } from 'lucide-react'
import { Centered, PrimaryButton } from './ui'

// Shown when the URL maps to a view the app doesn't render. Previously an
// unknown path fell through to Home silently, which hid broken links and typos
// and left the user unsure whether the app had misbehaved. A calm, explicit
// dead-end with one obvious way back is clearer than a silent redirect.
export default function NotFound({ onHome }) {
  return (
    <Centered>
      <div style={{
        width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 20px',
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Compass size={26} strokeWidth={1.8} color="var(--text-muted)" />
      </div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginBottom: '10px', letterSpacing: '-0.01em' }}>
        This page wandered off
      </div>
      <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 24px' }}>
        We couldn’t find that page. Your progress is safe — head back to your dojo
        and pick up today’s session.
      </p>
      <PrimaryButton onClick={onHome} icon={Compass}>Back to today’s dojo</PrimaryButton>
    </Centered>
  )
}
