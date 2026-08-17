import { ProfileGlyph } from './HomeV2NavGlyphs'

// The Misty Home's compact header: avatar + greeting on the left, the level
// pill on the right. The greeting's hello is the language's own word
// (languageTheme.greeting) and carries its lang tag; the name and the pill are
// UI chrome. No streak, no extra statistics — the pill is level + progress and
// nothing else.

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"

export default function HomeHeader({ theme, firstName, levelPill, onProfile }) {
  return (
    <header
      className="hd-home-rise"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', minHeight: '44px' }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
        <button
          type="button"
          aria-label="Open profile"
          onClick={onProfile}
          className="hd-press"
          style={{
            width: '38px', height: '38px', padding: 0, borderRadius: '50%', flexShrink: 0,
            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)',
            display: 'grid', placeItems: 'center', cursor: 'pointer',
            '--primary-bright': 'var(--text-faint)', '--primary-fill': 'var(--text-muted)', '--primary-pressed': 'var(--text-muted)',
          }}
        >
          <ProfileGlyph size={20} active={false} color="currentColor" />
        </button>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '16px', lineHeight: 1.2, fontWeight: 650, fontFamily: UI_FONT }}>
          <span lang={theme.langTag} style={{ fontFamily: theme.font + ', sans-serif', fontWeight: 600 }}>{theme.greeting}</span>
          {firstName ? ', ' + firstName : ''}
        </span>
      </span>
      <span
        style={{
          flexShrink: 0, padding: '9px 14px', borderRadius: '999px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: '12.5px', lineHeight: 1, fontWeight: 680, letterSpacing: '0.01em',
          color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
          fontFamily: UI_FONT,
        }}
      >
        {levelPill}
      </span>
    </header>
  )
}
