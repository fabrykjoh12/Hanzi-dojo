import { Bell, Palette, ShieldCheck, SlidersHorizontal, Sun, Moon } from 'lucide-react'
import { useIsMobile } from './useIsMobile'
import { useTheme } from './ThemeContext'

function getLanguageDetails(profile) {
  const isJapanese = profile.active_language === 'japanese'
  return {
    accentHex: isJapanese ? '#2E3A6E' : '#B83A24',
    fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
  }
}

export default function Settings({ profile }) {
  const { accentHex, fontFamily } = getLanguageDetails(profile)
  const isMobile = useIsMobile()
  const { theme, setTheme } = useTheme()

  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: isMobile ? '32px 16px 56px' : '52px 32px 72px', position: 'relative', zIndex: 1 }}>
        <div style={{
          width: '68px', height: '68px', borderRadius: '22px',
          background: accentHex + '10',
          border: '1px solid ' + accentHex + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '20px',
        }}>
          <SlidersHorizontal size={32} strokeWidth={1.75} color={accentHex} />
        </div>

        <div style={{ color: accentHex, fontSize: '13px', fontWeight: 850, marginBottom: '10px' }}>
          Preferences
        </div>
        <h1 style={{ margin: 0, fontSize: '38px', lineHeight: 1.1, fontWeight: 850, color: 'var(--text)' }}>
          Settings
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.65, margin: '12px 0 30px', maxWidth: '560px' }}>
          This screen is ready for future app preferences. For now, daily goal and reset controls stay in Profile.
        </p>

        <div style={{ display: 'grid', gap: '14px' }}>
          <AppearanceCard theme={theme} setTheme={setTheme} accentHex={accentHex} />
          <SettingPreview icon={Bell} title="Reminders" text="Daily study reminder settings can be added when notifications are wired up." accentHex={accentHex} />
          <SettingPreview icon={ShieldCheck} title="Account safety" text="Account and privacy controls can expand from this page over time." accentHex={accentHex} />
        </div>
      </div>
    </div>
  )
}

function AppearanceCard({ theme, setTheme, accentHex }) {
  const options = [
    { key: 'light', label: 'Light', icon: Sun },
    { key: 'dark', label: 'Dark', icon: Moon },
  ]
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: '20px',
      border: '1px solid var(--border)', boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
      padding: '22px 24px', display: 'flex', alignItems: 'flex-start', gap: '16px',
    }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '15px',
        background: accentHex + '10', border: '1px solid ' + accentHex + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Palette size={21} strokeWidth={1.85} color={accentHex} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 850, color: 'var(--text)', marginBottom: '5px' }}>Appearance</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: '14px' }}>
          Choose a light or dark theme for the whole app.
        </div>
        <div style={{ display: 'inline-flex', gap: '8px', background: 'var(--surface-2)', padding: '4px', borderRadius: '12px' }}>
          {options.map(opt => {
            const active = theme === opt.key
            const Icon = opt.icon
            return (
              <button
                key={opt.key}
                onClick={() => setTheme(opt.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '8px 16px', borderRadius: '9px', cursor: 'pointer',
                  border: '1px solid ' + (active ? accentHex + '40' : 'transparent'),
                  background: active ? 'var(--surface)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-muted)',
                  fontSize: '13px', fontWeight: 700,
                  boxShadow: active ? '0 1px 4px rgba(24,24,27,0.08)' : 'none',
                }}
              >
                <Icon size={16} strokeWidth={2} color={active ? accentHex : 'var(--text-muted)'} />
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SettingPreview({ icon: Icon, title, text, accentHex }) {
  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: '20px',
      border: '1px solid var(--border)',
      boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
      padding: '22px 24px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '16px',
    }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '15px',
        background: accentHex + '10',
        border: '1px solid ' + accentHex + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={21} strokeWidth={1.85} color={accentHex} />
      </div>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 850, color: 'var(--text)', marginBottom: '5px' }}>
          {title}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
          {text}
        </div>
      </div>
    </div>
  )
}
