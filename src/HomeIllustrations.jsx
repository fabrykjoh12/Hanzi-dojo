// The Home illustration system: flat, layered, editorial desk objects with one
// restrained supporting arc — Direction 3 (desk still-life) carried by
// Direction 2's geometry. Everything is drawn in code: a handful of shapes per
// piece, no assets, no scenes, no characters-as-decoration.
//
// Colour discipline: the pieces borrow the story world's tint (storyArt.js)
// only in small supporting places — an arc, the tea's surface, a tile's ground
// — always through color-mix into an existing surface or paper colour, so the
// dawn→dusk system and the hero's vermilion stay the base. Paper objects keep
// one fixed warm-paper colour by design (like cover art, illustration content
// does not re-theme; the grounds beneath them do).

const PAPER = '#FBF5E9'

function mix(tint, pct, into) {
  return 'color-mix(in srgb, ' + tint + ' ' + pct + '%, ' + into + ')'
}

// ── The hero's still-life ───────────────────────────────────────────────────
// The desk follows the day. While cards are waiting the panel is full of
// numbers, so only the tea sits quietly under the chevron — steam rising,
// waiting for you. Once the queue clears, the open corner shows the whole
// desk: the cards set down beside the cup, one quiet arc behind them. The
// tea's surface carries the next story's world tint.
export function DeskStillLife({ tint, compact = false }) {
  const tea = tint ? mix(tint, 55, PAPER) : mix('#B83A24', 30, PAPER)
  const arc = tint ? mix(tint, 45, '#FFFBF4') : '#FFFBF4'

  if (compact) {
    return (
      <svg
        aria-hidden="true"
        data-desk-art="compact"
        viewBox="0 0 52 66"
        style={{
          position: 'absolute', right: '22px', top: '30px',
          width: '52px', height: '66px',
          pointerEvents: 'none', userSelect: 'none',
        }}
      >
        <circle cx="44" cy="62" r="30" fill="none" stroke={arc} strokeOpacity="0.18" strokeWidth="1.5" />
        <ellipse cx="26" cy="60" rx="14" ry="2.2" fill="rgba(0,0,0,0.16)" />
        <path d="M14 42 H38 L35.2 55 Q26 60.5 16.8 55 Z" fill={PAPER} opacity="0.94" />
        <ellipse cx="26" cy="42" rx="12" ry="2.8" fill={tea} opacity="0.95" />
        <path d="M26 32 C22.5 27.5 29.5 24 26 18" fill="none" stroke="#FFFBF4" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg
      aria-hidden="true"
      data-desk-art="full"
      viewBox="0 0 132 92"
      style={{
        position: 'absolute', right: '18px', bottom: '10px',
        width: '132px', height: '92px',
        pointerEvents: 'none', userSelect: 'none',
      }}
    >
      {/* The supporting geometry: one large arc, one echo. */}
      <circle cx="104" cy="96" r="66" fill="none" stroke={arc} strokeOpacity="0.20" strokeWidth="1.5" />
      <circle cx="104" cy="96" r="46" fill="none" stroke="#FFFBF4" strokeOpacity="0.10" strokeWidth="1.5" />

      {/* Ground shadows — the objects rest on the desk, they don't float. */}
      <ellipse cx="88" cy="84" rx="27" ry="3" fill="rgba(0,0,0,0.16)" />
      <ellipse cx="33" cy="84" rx="16" ry="2.5" fill="rgba(0,0,0,0.16)" />

      {/* The card stack, set down for the day. */}
      <rect x="64" y="50" width="46" height="30" rx="5" fill="#FFFBF4" opacity="0.30" transform="rotate(5 87 65)" />
      <rect x="63" y="47" width="46" height="30" rx="5" fill="#FFFBF4" opacity="0.55" transform="rotate(-4 86 62)" />
      <rect x="62" y="44" width="46" height="30" rx="5" fill={PAPER} opacity="0.96" transform="rotate(1.5 85 59)" />
      {/* One abstract text line — a mark, never a character. */}
      <rect x="72" y="55" width="20" height="3" rx="1.5" fill="rgba(0,0,0,0.13)" transform="rotate(1.5 85 59)" />

      {/* The tea. */}
      <path d="M20 64 H46 L43 78 Q33 84 23 78 Z" fill={PAPER} opacity="0.94" />
      <ellipse cx="33" cy="64" rx="13" ry="3" fill={tea} opacity="0.95" />
      <path d="M33 54 C29 49 37 45 33 38" fill="none" stroke="#FFFBF4" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ── The Then-read fallback family ───────────────────────────────────────────
// A coverless story wears one of four desk objects — book, cards, teacup,
// folded paper — on a ground mixed from its world tint, with the same
// supporting arc. Which one is deterministic per story (storyArt.js).

function TileBook({ deep }) {
  return (
    <>
      <rect x="10" y="17" width="34" height="22" rx="3" fill={deep} />
      <path d="M13 20 Q20 16.5 27 19.5 V36 Q20 33 13 36 Z" fill={PAPER} />
      <path d="M41 20 Q34 16.5 27 19.5 V36 Q34 33 41 36 Z" fill={PAPER} opacity="0.88" />
    </>
  )
}

function TileCards({ deep }) {
  return (
    <>
      <rect x="15" y="17" width="26" height="18" rx="3" fill={deep} transform="rotate(-6 28 26)" />
      <rect x="14" y="20" width="26" height="18" rx="3" fill={PAPER} transform="rotate(4 27 29)" />
      <rect x="20" y="26" width="12" height="2.5" rx="1.25" fill="rgba(0,0,0,0.16)" transform="rotate(4 27 29)" />
    </>
  )
}

function TileTeacup({ deep }) {
  return (
    <>
      <ellipse cx="27" cy="38" rx="12" ry="2" fill="rgba(0,0,0,0.12)" />
      <path d="M17 26 H37 L34.5 36 Q27 40.5 19.5 36 Z" fill={PAPER} />
      <ellipse cx="27" cy="26" rx="10" ry="2.5" fill={deep} />
      <path d="M27 20 C24 16.5 30 14 27 10" fill="none" stroke={deep} strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
    </>
  )
}

function TilePaper({ deep }) {
  return (
    <>
      <rect x="19" y="12" width="22" height="28" rx="3" fill={deep} transform="rotate(6 30 26)" />
      <rect x="16" y="14" width="22" height="28" rx="3" fill={PAPER} />
      <path d="M38 14 L38 23 L29 14 Z" fill={deep} />
      <rect x="21" y="30" width="12" height="2.5" rx="1.25" fill="rgba(0,0,0,0.14)" />
    </>
  )
}

const TILE_ART = { book: TileBook, cards: TileCards, teacup: TileTeacup, paper: TilePaper }

export function StoryFallbackTile({ tint, variant, style }) {
  const Art = TILE_ART[variant] || TileBook
  const deep = mix(tint, 72, 'var(--text)')
  return (
    <svg
      aria-hidden="true"
      data-story-tile={variant}
      viewBox="0 0 54 54"
      style={{ width: '54px', height: '54px', borderRadius: '12px', flexShrink: 0, display: 'block', ...style }}
    >
      <rect x="0" y="0" width="54" height="54" fill={mix(tint, 16, 'var(--surface-2)')} />
      <circle cx="46" cy="50" r="26" fill="none" stroke={mix(tint, 55, 'var(--surface-2)')} strokeWidth="1.5" opacity="0.6" />
      <Art deep={deep} />
    </svg>
  )
}
