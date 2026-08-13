// The Visual Style V2 lab's axes — pure data, outside the .jsx for the
// react-refresh rule. Each axis is a small list of named options; the lab
// renders the SAME approved Home composition through every option, so a
// difference between two frames has exactly one cause.

// ── Typography ────────────────────────────────────────────────────────────
//
// The two candidate files are variable-weight woff2s committed under
// public/dev-fonts/ with their licenses beside them — both OFL-1.1, so bundling
// is clean if one wins. They are loaded by a @font-face the LAB injects; nothing
// outside /dev references them.
//
// One honesty note that outranks the rendering: the "native" benchmark in this
// harness draws Linux's fontconfig default (Liberation Sans), NOT the SF Pro an
// iPhone would use. Its frames say what the option IS — deferring to the
// platform — not what it looks like on a device. Judge that option on a phone,
// never from these screenshots.
//
// The Chinese stack is not an axis. Hanzi and pinyin keep languageTheme's font
// in every candidate, and the lab carries a separate specimen proving it.
export const STYLE_FONTS = [
  {
    key: 'inter', label: 'Current — Inter',
    stack: "'Inter', system-ui, sans-serif",
    note: 'The bundled production face. The baseline every candidate has to beat.',
  },
  {
    key: 'native', label: 'A — platform native',
    stack: "-apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, sans-serif",
    note: 'The benchmark: what deferring to the OS buys. Only honest on a real device.',
  },
  {
    key: 'mona', label: 'B — Mona Sans',
    stack: "'Mona Sans Lab', 'Inter', system-ui, sans-serif",
    note: 'Authored but grown-up: wider apertures, a little more ink personality than Inter.',
  },
  {
    key: 'onest', label: 'C — Onest',
    stack: "'Onest Lab', 'Inter', system-ui, sans-serif",
    note: 'Rounder terminals, friendlier learning-product character. The risk is cuteness.',
  },
]

// ── Shape ─────────────────────────────────────────────────────────────────
//
// Not a new scale — a TIGHTENING of the existing one: controls 12 → 10, cards
// 18 → 16, hero and pill untouched. The point is that rounded forms become
// selective rather than ambient, which is most of what "generated rounded-
// rectangle app" means.
export const STYLE_SHAPES = [
  { key: 'current', label: 'Current shapes', control: 12, card: 18 },
  { key: 'tight', label: 'Tighter proposal', control: 10, card: 16 },
]

// ── The action model ──────────────────────────────────────────────────────
export const STYLE_ACTIONS = [
  {
    key: 'button', label: 'Baseline — packet + separate button',
    note: 'The approved arrangement: the packet is artwork, the lacquer button acts.',
  },
  {
    key: 'packet', label: 'Packet as the action',
    note: 'One accessible control: the packet and "Open cards →" are the tap target.',
  },
]

// ── The proposed combination ──────────────────────────────────────────────
// One coherent answer, not four independent favourites. Declared here so the
// lab renders it as its own labelled section and the review can reject it as a
// unit.
export const STYLE_PROPOSAL = {
  font: 'mona',
  shape: 'tight',
  action: 'packet',
}

// The type roles the brief asks to be judged, as one specimen per font.
export const SPECIMEN_ROLES = [
  { role: 'display', sample: '136' },
  { role: 'titleScreen', sample: 'Training complete' },
  { role: 'titleCard', sample: 'Story' },
  { role: 'bodySecondary', sample: '74 reviews · 62 new — the queue in plain words.' },
  { role: 'label', sample: 'Open cards →' },
  { role: 'eyebrow', sample: "TODAY'S TRAINING" },
]
