import { Bell, Palette, ShieldCheck, SlidersHorizontal } from 'lucide-react'

function getLanguageDetails(profile) {
  const isJapanese = profile.active_language === 'japanese'
  return {
    accentHex: isJapanese ? '#2E3A6E' : '#B83A24',
    fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
    faintCharacter: isJapanese ? '設' : '设',
  }
}

export default function Settings({ profile }) {
  const { accentHex, fontFamily, faintCharacter } = getLanguageDetails(profile)

  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(180deg, #FBFBF9 0%, #FAFAF8 100%)',
    }}>
      <div style={{
        position: 'fixed', right: '-44px', bottom: '-118px',
        fontSize: '360px', lineHeight: 1,
        color: accentHex, opacity: 0.035,
        fontFamily, fontWeight: 700,
        pointerEvents: 'none', userSelect: 'none',
      }}>
        {faintCharacter}
      </div>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '52px 32px 72px', position: 'relative', zIndex: 1 }}>
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
        <h1 style={{ margin: 0, fontSize: '38px', lineHeight: 1.1, fontWeight: 850, color: '#18181B' }}>
          Settings
        </h1>
        <p style={{ fontSize: '15px', color: '#71717A', lineHeight: 1.65, margin: '12px 0 30px', maxWidth: '560px' }}>
          This screen is ready for future app preferences. For now, daily goal and reset controls stay in Profile.
        </p>

        <div style={{ display: 'grid', gap: '14px' }}>
          <SettingPreview icon={Palette} title="Appearance" text="Theme and reading display options can live here later." accentHex={accentHex} />
          <SettingPreview icon={Bell} title="Reminders" text="Daily study reminder settings can be added when notifications are wired up." accentHex={accentHex} />
          <SettingPreview icon={ShieldCheck} title="Account safety" text="Account and privacy controls can expand from this page over time." accentHex={accentHex} />
        </div>
      </div>
    </div>
  )
}

function SettingPreview({ icon: Icon, title, text, accentHex }) {
  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: '20px',
      border: '1px solid #E7E5E4',
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
        <div style={{ fontSize: '15px', fontWeight: 850, color: '#18181B', marginBottom: '5px' }}>
          {title}
        </div>
        <div style={{ fontSize: '13px', color: '#71717A', lineHeight: 1.55 }}>
          {text}
        </div>
      </div>
    </div>
  )
}
