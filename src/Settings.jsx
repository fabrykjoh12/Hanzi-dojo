import { SlidersHorizontal } from 'lucide-react'

export default function Settings({ profile }) {
  const accentHex = profile.active_language === 'japanese' ? '#2E3A6E' : '#B83A24'

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '52px 32px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <SlidersHorizontal size={26} strokeWidth={1.75} color={accentHex} />
        <h1 style={{ fontSize: '30px', fontWeight: 700, color: '#18181B' }}>Settings</h1>
      </div>
      <p style={{ fontSize: '15px', color: '#71717A', marginBottom: '32px' }}>
        More options are coming soon.
      </p>

      <div style={{
        background: '#fff', borderRadius: '18px', border: '1px solid #E7E5E4',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '28px 32px',
        fontSize: '14px', color: '#71717A', lineHeight: 1.6,
      }}>
        Settings will live here in a future update. For now, your daily goal and
        progress reset are available on the Profile screen.
      </div>
    </div>
  )
}
