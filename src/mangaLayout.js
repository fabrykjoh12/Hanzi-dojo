// The manga episode's layout plan: how the story's beats are distributed over
// cinematic panels, where each speech bubble sits over the art, and which
// branch of a story choice the learner is currently in.
//
// Pure — no React, no Supabase, no DOM. That split is the point: MangaReader
// draws whatever this returns, so the awkward cases (a panel that names a beat
// that does not exist, a choice with one option, a bubble too tall for the art
// it is pinned to, a saved position pointing past the end of a re-cut episode)
// are decided here and unit-tested, rather than being things you can only find
// by scrolling on a phone.
//
// The rule this file exists to enforce: metadata may place a bubble, but it may
// never break the reader. Every field is optional and every bad value falls back
// to something readable, because panel metadata is authored content and authored
// content has typos.
//
// The Chinese itself is NOT here. It lives in `stories.content`, one beat per
// line, exactly as it does for the paced/chat/scene readers, and the shared
// engine (useStoryReaderCore) turns it into tappable tokens. A bubble refers to
// a beat by index; it never carries text of its own. See CLAUDE.md and the
// manga migration for why art and educational text stay separate.

// Panels are drawn at the column width; this is the widest and narrowest shape
// one may take, so a typo like "40/1" cannot produce a 40-screen-tall panel.
const MIN_RATIO = 0.55
const MAX_RATIO = 2.6
export const DEFAULT_RATIO = 4 / 3

const BUBBLE_KINDS = ['speech', 'thought', 'narration', 'reply']
const BUBBLE_SIDES = ['left', 'right', 'center']
const TAILS = ['bottom-left', 'bottom-right', 'top-left', 'top-right']

// Width the bubble takes, as a percentage of the panel, when metadata doesn't
// say. Narration is a caption — it wants to be visibly not-a-voice, so it sits
// narrower and squarer than speech.
const DEFAULT_WIDTH = { speech: 72, reply: 72, thought: 66, narration: 58 }

function clamp(n, low, high) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.max(low, Math.min(high, n))
}

function oneOf(value, allowed, fallback) {
  return allowed.indexOf(value) === -1 ? fallback : value
}

// "4/3" | "16/9" | 1.5 → a width÷height number, clamped to a drawable shape.
// Deliberately not a regex: OXC is strict about regex literals (CLAUDE.md §6),
// and split() reads better here anyway.
export function normalizeRatio(raw) {
  if (typeof raw === 'number') return clamp(raw, MIN_RATIO, MAX_RATIO) || DEFAULT_RATIO
  if (typeof raw !== 'string' || raw.indexOf('/') === -1) return DEFAULT_RATIO
  const parts = raw.split('/')
  if (parts.length !== 2) return DEFAULT_RATIO
  const w = parseFloat(parts[0])
  const h = parseFloat(parts[1])
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0 || w <= 0) return DEFAULT_RATIO
  return clamp(w / h, MIN_RATIO, MAX_RATIO)
}

// A bubble's tail points back at whoever is speaking. Speech gets one by
// default, on the side the speaker is standing (a bubble on the right of the
// panel belongs to someone on the left of it). Narration and thought get none:
// narration has no mouth, and a thought is a cloud.
function defaultTail(kind, side) {
  if (kind !== 'speech' && kind !== 'reply') return null
  if (side === 'right') return 'bottom-left'
  if (side === 'left') return 'bottom-right'
  return null
}

// { choice: <panelId>, option: <index> } — a bubble that only exists in one
// branch. Anything malformed becomes "always visible", which is the safe
// direction: a learner may see a line that wasn't meant for their branch, but
// never loses one that was.
function normalizeWhen(raw) {
  if (!raw || typeof raw !== 'object') return null
  const choice = typeof raw.choice === 'string' ? raw.choice : null
  const option = Number.isInteger(raw.option) ? raw.option : null
  if (choice === null || option === null) return null
  return { choice, option }
}

function normalizeBubble(raw, beatCount) {
  if (!raw || typeof raw !== 'object') return null
  if (!Number.isInteger(raw.beat) || raw.beat < 0 || raw.beat >= beatCount) return null
  const kind = oneOf(raw.kind, BUBBLE_KINDS, 'speech')
  const side = oneOf(raw.side, BUBBLE_SIDES, kind === 'narration' ? 'left' : 'right')
  return {
    beat: raw.beat,
    kind,
    side,
    top: clamp(raw.top, 0, 88) == null ? 8 : clamp(raw.top, 0, 88),
    width: clamp(raw.width, 34, 94) == null ? DEFAULT_WIDTH[kind] : clamp(raw.width, 34, 94),
    tail: raw.tail === null ? null : oneOf(raw.tail, TAILS, defaultTail(kind, side)),
    when: normalizeWhen(raw.when),
  }
}

// A choice needs at least two real options to be a choice at all; one option is
// a button that says "continue", and zero is a bug. Either way the panel keeps
// its art and simply stops gating.
function normalizeChoice(raw, beatCount) {
  if (!raw || typeof raw !== 'object') return null
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .filter(o => o && Number.isInteger(o.beat) && o.beat >= 0 && o.beat < beatCount)
    .map(o => ({ beat: o.beat, tone: typeof o.tone === 'string' ? o.tone : null }))
  if (options.length < 2) return null
  return { prompt: typeof raw.prompt === 'string' && raw.prompt ? raw.prompt : '选择回答', options }
}

// Build the render plan.
//
// `panelsJson` is stories.panels (may be null — an authored manga row that has
// not been laid out yet), `beatCount` the number of lines the engine parsed.
// With no metadata at all this still returns a readable episode: one panel per
// beat, no art, bubbles in the default position. That fallback is what keeps a
// half-authored episode from rendering as a blank screen.
export function buildEpisode(panelsJson, beatCount) {
  const json = panelsJson && typeof panelsJson === 'object' ? panelsJson : {}
  const rawMeta = json.meta && typeof json.meta === 'object' ? json.meta : {}
  const meta = {
    series: typeof rawMeta.series === 'string' ? rawMeta.series : null,
    label: typeof rawMeta.episode_label === 'string' ? rawMeta.episode_label : null,
    title: typeof rawMeta.episode_title === 'string' ? rawMeta.episode_title : null,
    artBase: typeof rawMeta.art_base === 'string' ? rawMeta.art_base : '',
    // One English sentence on the closing plate, pointing at the next episode.
    // English on purpose: it is the only line in the reader that is about the
    // series rather than part of it, and an HSK 1 learner cannot be told
    // "something followed you home" in HSK 1.
    hook: typeof rawMeta.hook === 'string' ? rawMeta.hook : null,
  }
  const cast = json.cast && typeof json.cast === 'object' ? json.cast : {}

  const rawPanels = Array.isArray(json.panels) ? json.panels : null
  const source = rawPanels && rawPanels.length
    ? rawPanels
    // No layout: every beat gets its own panel, so the episode is still a
    // sequence of readable sections rather than one undifferentiated wall.
    : Array.from({ length: beatCount }, (unused, i) => ({ id: 'b' + i, bubbles: [{ beat: i }] }))

  const panels = source.map((raw, i) => {
    const p = raw && typeof raw === 'object' ? raw : {}
    const bubbles = (Array.isArray(p.bubbles) ? p.bubbles : [])
      .map(b => normalizeBubble(b, beatCount))
      .filter(Boolean)
    return {
      id: typeof p.id === 'string' && p.id ? p.id : 'p' + (i + 1),
      index: i,
      art: typeof p.art === 'string' && p.art ? p.art : null,
      ratio: normalizeRatio(p.ratio),
      alt: typeof p.alt === 'string' ? p.alt : '',
      // A panel may ask for the accent treatment (a cinnabar edge) for a single
      // dramatic beat. It is a flag, not a colour, so the palette stays in one
      // place.
      accent: p.accent === true,
      bubbles,
      choice: normalizeChoice(p.choice, beatCount),
    }
  })

  return { meta, cast, panels, total: panels.length }
}

// Absolute art URL for a panel, from the episode's art_base. Kept here so the
// renderer never concatenates paths itself and a base with or without its
// trailing slash both work.
export function panelArtSrc(meta, panel) {
  if (!panel || !panel.art) return null
  if (panel.art.indexOf('http') === 0 || panel.art.indexOf('/') === 0) return panel.art
  const base = meta && meta.artBase ? meta.artBase : ''
  if (!base) return panel.art
  return base.charAt(base.length - 1) === '/' ? base + panel.art : base + '/' + panel.art
}

// The bubbles actually on this panel for the branch the learner is in.
// `choices` maps panelId → the option index picked there.
export function visibleBubbles(panel, choices) {
  if (!panel || !panel.bubbles) return []
  const picked = choices || {}
  return panel.bubbles.filter(b => {
    if (!b.when) return true
    const answer = picked[b.when.choice]
    return answer === b.when.option
  })
}

// Is this panel waiting on the learner? A choice panel gates everything after
// it until an option is picked — which is also what stops a fast scroll from
// walking to the end of the episode and marking it read.
export function isGate(panel, choices) {
  if (!panel || !panel.choice) return false
  const picked = choices || {}
  return !Number.isInteger(picked[panel.id])
}

// The last panel index the learner is allowed to see right now: everything up
// to and including the first unanswered choice.
export function revealLimit(panels, choices) {
  const list = Array.isArray(panels) ? panels : []
  for (let i = 0; i < list.length; i += 1) {
    if (isGate(list[i], choices)) return i
  }
  return Math.max(0, list.length - 1)
}

// Every beat visible on a panel in the learner's branch, in reading order —
// including the reply they chose, which is a real line of the story and belongs
// in the audio order and the reviewed-word count like any other.
export function panelBeats(panel, choices) {
  if (!panel) return []
  const out = visibleBubbles(panel, choices).map(b => b.beat)
  const picked = (choices || {})[panel.id]
  if (panel.choice && Number.isInteger(picked) && panel.choice.options[picked]) {
    out.push(panel.choice.options[picked].beat)
  }
  return out
}

// Every beat the learner has actually read, across the episode up to and
// including `throughIndex`. Used by the completion screen so it counts the
// branch that was read, not both branches.
export function readBeats(panels, choices, throughIndex) {
  const list = Array.isArray(panels) ? panels : []
  const end = Number.isInteger(throughIndex) ? Math.min(throughIndex, list.length - 1) : list.length - 1
  const out = []
  const seen = new Set()
  for (let i = 0; i <= end; i += 1) {
    for (const beat of panelBeats(list[i], choices)) {
      if (seen.has(beat)) continue
      seen.add(beat)
      out.push(beat)
    }
  }
  return out
}

// The header's "3 / 8". One-based for humans, clamped so an out-of-range active
// index can never print "0 / 8" or "9 / 8".
export function episodeProgress(activeIndex, total) {
  const n = Math.max(1, total || 1)
  const current = Math.min(n, Math.max(1, (Number.isInteger(activeIndex) ? activeIndex : 0) + 1))
  return { current, total: n, pct: (current / n) * 100 }
}

// The episode is only complete when the learner has reached the last panel AND
// answered every choice on the way. Scrolling alone is not completion — the
// gates are what make "I read it" mean something.
export function isEpisodeComplete(panels, choices, throughIndex) {
  const list = Array.isArray(panels) ? panels : []
  if (list.length === 0) return false
  if (!Number.isInteger(throughIndex) || throughIndex < list.length - 1) return false
  return list.every(p => !isGate(p, choices))
}

// ── Bubble geometry ────────────────────────────────────────────────────────
// A bubble overlays the art, as it does in a printed panel. But a bubble is
// sized by ITS TEXT and the panel is sized by its aspect ratio, so a long line
// on a short panel would cover the whole drawing — including the face the
// learner is meant to be reading the expression on. When that happens the
// bubble drops out of the art and sits in the gutter beneath it instead: still
// attached to the panel, still tailless-and-tidy, just no longer on top of the
// picture. Deciding it here (rather than with a CSS guess) is what makes it
// testable at every screen width.

// Roughly how wide one hanzi is at the reader's type size, including the space
// between characters. Used only to estimate line count.
const HANZI_ADVANCE = 23
// One line of hanzi, plus the ruby row that carries its pinyin.
const LINE_HEIGHT = 32
const RUBY_HEIGHT = 15
// The bubble's own padding plus its speaker label.
const BUBBLE_CHROME = 34

export function estimateBubbleHeight(textLength, widthPx, opts) {
  const o = opts || {}
  const inner = Math.max(40, widthPx - 32)
  const perLine = Math.max(1, Math.floor(inner / HANZI_ADVANCE))
  const lines = Math.max(1, Math.ceil((textLength || 1) / perLine))
  const ruby = o.withReadings === false ? 0 : RUBY_HEIGHT
  const speaker = o.withSpeaker ? 18 : 0
  const english = o.withEnglish ? 22 : 0
  return lines * (LINE_HEIGHT + ruby) + BUBBLE_CHROME + speaker + english
}

// Where a bubble goes, given the panel it belongs to and the column it is drawn
// in. Returns { mode: 'overlay' | 'below', top, left, right, width } with
// percentages for overlay and nothing positional for 'below'.
export function bubbleLayout(bubble, opts) {
  const o = opts || {}
  const columnWidth = o.columnWidth > 0 ? o.columnWidth : 390
  const ratio = o.ratio > 0 ? o.ratio : DEFAULT_RATIO
  const panelHeight = columnWidth / ratio
  const width = bubble && bubble.width ? bubble.width : DEFAULT_WIDTH.speech
  const top = bubble && typeof bubble.top === 'number' ? bubble.top : 8
  const widthPx = columnWidth * (width / 100)
  const height = estimateBubbleHeight(o.textLength, widthPx, o)
  // The room left under the bubble's top edge, minus the margin that keeps it
  // off the panel's bottom border.
  const room = panelHeight * (1 - top / 100) - 14

  if (height > room) return { mode: 'below', width: 100 }

  const side = (bubble && bubble.side) || 'right'
  const edge = 4
  const base = { mode: 'overlay', top, width }
  if (side === 'left') return { ...base, left: edge }
  if (side === 'center') return { ...base, left: (100 - width) / 2 }
  return { ...base, left: 100 - width - edge }
}
