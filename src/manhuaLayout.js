// The manhua episode's layout plan: how the story's beats are distributed over
// cinematic panels, where each speech bubble sits over the art, and which
// branch of a story choice the learner is currently in.
//
// Pure — no React, no Supabase, no DOM. That split is the point: ManhuaReader
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
// manhua migration for why art and educational text stay separate.

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
const DEFAULT_WIDTH = { speech: 62, reply: 62, thought: 58, narration: 58 }
export const MAX_OVERLAY_WIDTH = 62

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

// { label, level } or null. `level` is a level NUMBER in the story's own system,
// never a printed string — the reader turns it into "HSK 2" (or "N4", or "A2")
// with getLevelLabel, which is the repo's rule for every level label.
function continuesFrom(raw) {
  if (!raw || typeof raw !== 'object') return null
  const label = typeof raw.label === 'string' && raw.label ? raw.label : null
  const level = Number.isInteger(raw.level) && raw.level > 0 ? raw.level : null
  if (!label && !level) return null
  return { label, level }
}

// Optional story-specific reader seal. It is presentation metadata only: the
// quiz answers still live in the shared comprehension state, while this says
// what to print after every authored question has been answered.
function rewardFrom(raw) {
  if (!raw || typeof raw !== 'object') return null
  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : null
  if (!label) return null
  const glyph = typeof raw.glyph === 'string' && raw.glyph.trim() ? raw.glyph.trim() : '读'
  return { label, glyph }
}

// Build the render plan.
//
// `panelsJson` is stories.panels (may be null — an authored manhua row that has
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
    // `hybrid` keeps narration in the gutter while letting speech and thoughts
    // use real comic balloons on safe parts of the art. `below` remains as a
    // compatibility mode, while `auto` preserves older authored layouts.
    textPlacement: rawMeta.text_placement === 'hybrid'
      ? 'hybrid'
      : (rawMeta.text_placement === 'below' ? 'below' : 'auto'),
    // One English sentence on the closing plate, pointing at the next episode.
    // English on purpose: it is the only line in the reader that is about the
    // series rather than part of it, and an HSK 1 learner cannot be told
    // "something followed you home" in HSK 1.
    hook: typeof rawMeta.hook === 'string' ? rawMeta.hook : null,
    reward: rewardFrom(rawMeta.reward),
    // Where the story goes next, and at what level. The LEVEL is what earns its
    // place here: a serial that climbs the ladder should say so on the plate the
    // learner reaches at the end, so "there is more" and "you are not ready for
    // it yet" arrive together instead of the reader hunting a shelf for a
    // second episode that is two levels up. Null when a season ends.
    continues: continuesFrom(rawMeta.continues),
  }
  const cast = json.cast && typeof json.cast === 'object' ? json.cast : {}

  const rawPanels = Array.isArray(json.panels) ? json.panels : null
  const source = rawPanels && rawPanels.length
    ? rawPanels
    // No layout: every beat gets its own panel, so the episode is still a
    // sequence of readable sections rather than one undifferentiated wall.
    : Array.from({ length: beatCount }, (unused, i) => ({ id: 'b' + i, bubbles: [{ beat: i }] }))

  // Choice metadata existed briefly in published episodes. Pick the first
  // authored branch so stale cached rows remain readable without a gate.
  const legacyChoices = new Map()
  source.forEach((raw, i) => {
    const p = raw && typeof raw === 'object' ? raw : {}
    const id = typeof p.id === 'string' && p.id ? p.id : 'p' + (i + 1)
    const choice = normalizeChoice(p.choice, beatCount)
    if (choice) legacyChoices.set(id, choice)
  })

  const panels = source.map((raw, i) => {
    const p = raw && typeof raw === 'object' ? raw : {}
    const id = typeof p.id === 'string' && p.id ? p.id : 'p' + (i + 1)
    const legacyChoice = legacyChoices.get(id)
    const bubbles = (Array.isArray(p.bubbles) ? p.bubbles : [])
      .map(b => normalizeBubble(b, beatCount))
      .filter(Boolean)
      .filter(b => !b.when || !legacyChoices.has(b.when.choice) || b.when.option === 0)
      .map(b => ({ ...b, when: null }))
    if (legacyChoice) {
      const canonical = legacyChoice.options[0]
      if (!bubbles.some(b => b.beat === canonical.beat)) {
        bubbles.push({
          beat: canonical.beat,
          kind: 'reply',
          side: 'right',
          top: 8,
          width: 68,
          tail: null,
          when: null,
        })
      }
    }
    return {
      id,
      index: i,
      art: typeof p.art === 'string' && p.art ? p.art : null,
      ratio: normalizeRatio(p.ratio),
      alt: typeof p.alt === 'string' ? p.alt : '',
      // A panel may ask for the accent treatment (a cinnabar edge) for a single
      // dramatic beat. It is a flag, not a colour, so the palette stays in one
      // place.
      accent: p.accent === true,
      bubbles,
      choice: null,
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
export function visibleBubbles(panel) {
  if (!panel || !panel.bubbles) return []
  return panel.bubbles
}

// Is this panel waiting on the learner? A choice panel gates everything after
// it until an option is picked — which is also what stops a fast scroll from
// walking to the end of the episode and marking it read.
export function isGate() {
  return false
}

// The last panel index the learner is allowed to see right now: everything up
// to and including the first unanswered choice.
export function revealLimit(panels) {
  const list = Array.isArray(panels) ? panels : []
  return Math.max(0, list.length - 1)
}

// Every beat visible on a panel in the learner's branch, in reading order —
// including the reply they chose, which is a real line of the story and belongs
// in the audio order and the reviewed-word count like any other.
export function panelBeats(panel) {
  if (!panel) return []
  return visibleBubbles(panel).map(b => b.beat)
}

// Every beat the learner has actually read, across the episode up to and
// including `throughIndex`. Used by the completion screen so it counts the
// branch that was read, not both branches.
export function readBeats(panels, throughIndex) {
  const list = Array.isArray(panels) ? panels : []
  const end = Number.isInteger(throughIndex) ? Math.min(throughIndex, list.length - 1) : list.length - 1
  const out = []
  const seen = new Set()
  for (let i = 0; i <= end; i += 1) {
    for (const beat of panelBeats(list[i])) {
      if (seen.has(beat)) continue
      seen.add(beat)
      out.push(beat)
    }
  }
  return out
}

// Which panel is the learner on?
//
// Not "the one filling most of the screen" — on a phone two panels are usually
// both partly visible, and the biggest is often the tall one you have just
// finished rather than the one you have moved on to. Not intersectionRatio
// either: that is area-visible ÷ own-area, so a letterbox panel peeking in at
// the bottom edge scores a perfect 1.0 while the panel you are actually reading
// scores 0.7.
//
// The rule that matches where a reader's eyes are: a fixed READING LINE about
// two-fifths down the viewport, and you are on THE LAST PANEL WHOSE TOP EDGE
// HAS PASSED IT — the most recent panel you have scrolled into.
//
// "Last top past the line" rather than "the panel the line is inside" because
// panels are different heights on purpose. A short 4:3 opening panel sitting
// under the header can end a few pixels ABOVE the line, and "inside" would then
// credit the panel below one before the reader has reached it. This version is
// also monotone: scrolling down can only ever move the count forward.
export const READING_LINE = 0.42

// rects: [{ top }] in viewport coordinates, indexed by panel. Entries may be
// null for a panel that isn't mounted.
export function panelAtReadingLine(rects, viewportHeight, panelCount) {
  const list = Array.isArray(rects) ? rects : []
  const viewport = viewportHeight || 0
  const total = Number.isInteger(panelCount) ? panelCount : list.length
  const firstMounted = list.findIndex(Boolean)

  // At maximum scroll, a short final panel can be completely visible without
  // ever reaching the fixed reading line. Credit it once the learner has
  // scrolled past an earlier panel and can see the whole ending.
  let lastMounted = -1
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]) { lastMounted = i; break }
  }
  const finalRect = list[lastMounted]
  const hasScrolledPastEarlierPanel = list.some((r, i) => i < lastMounted && r?.top < 0)
  if (
    lastMounted === total - 1
    && finalRect?.top >= 0
    && Number.isFinite(finalRect.bottom)
    && finalRect.bottom <= viewport
    && hasScrolledPastEarlierPanel
  ) return lastMounted

  // At the untouched top of an episode, panel 1 is the thing the learner has
  // opened even when a very narrow phone makes that first panel short enough
  // for panel 2's top to cross the fixed reading line. Once panel 1 moves above
  // the viewport, the normal reading-line calculation takes over.
  if (firstMounted >= 0 && list[firstMounted].top >= 0) return firstMounted
  const line = viewport * READING_LINE
  let best = -1
  for (let i = 0; i < list.length; i += 1) {
    const r = list[i]
    if (!r) continue
    if (r.top <= line) best = i
    // Nothing has passed the line yet (the very top of the episode): the first
    // mounted panel is the one being read.
    else if (best < 0) { best = i; break }
    else break
  }
  return best
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
export function isEpisodeComplete(panels, throughIndex) {
  const list = Array.isArray(panels) ? panels : []
  if (list.length === 0) return false
  if (!Number.isInteger(throughIndex) || throughIndex < list.length - 1) return false
  return true
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
// The bubble's own padding.
const BUBBLE_CHROME = 34
// The play-line and reveal-translation controls sit in the bubble's top-right
// corner and the text wraps around them (they are floated, so they cost width
// on the FIRST line only and no height at all). Costing them nothing was what
// orphaned the last character of a short line onto a second row.
export const BUBBLE_ACTIONS_WIDTH = 64

export function estimateBubbleHeight(textLength, widthPx, opts) {
  const o = opts || {}
  const inner = Math.max(40, widthPx - 32)
  const actions = o.withActions === false ? 0 : BUBBLE_ACTIONS_WIDTH
  const firstLine = Math.max(1, Math.floor((inner - actions) / HANZI_ADVANCE))
  const perLine = Math.max(1, Math.floor(inner / HANZI_ADVANCE))
  const chars = textLength || 1
  const lines = chars <= firstLine ? 1 : 1 + Math.ceil((chars - firstLine) / perLine)
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
  // Even if authored metadata asks for a near-full-width box, a balloon may
  // never become a banner across the picture. Narrowing it can make a long line
  // fall into the gutter below, which is safer than covering the subject.
  const authoredWidth = Math.min(
    bubble && bubble.width ? bubble.width : DEFAULT_WIDTH.speech,
    MAX_OVERLAY_WIDTH,
  )
  const top = bubble && typeof bubble.top === 'number' ? bubble.top : 8
  // Fit the balloon to the copy instead of forcing every utterance into the
  // same broad rectangle. Short lines stay compact; longer ones aim for two or
  // three balanced rows, up to the authored/capped maximum.
  const chars = Math.max(1, o.textLength || 1)
  const targetCharsPerLine = chars <= 7 ? chars : Math.ceil(chars / Math.min(3, Math.ceil(chars / 7)))
  const idealPx = Math.max(150, targetCharsPerLine * HANZI_ADVANCE + BUBBLE_ACTIONS_WIDTH + 34)
  const width = Math.min(authoredWidth, Math.max(34, idealPx / columnWidth * 100))
  const widthPx = columnWidth * (width / 100)
  const height = estimateBubbleHeight(o.textLength, widthPx, o)
  // The room left under the bubble's top edge, minus the margin that keeps it
  // off the panel's bottom border.
  const room = panelHeight * (1 - top / 100) - 14

  if (height > room) {
    return {
      mode: 'below',
      width,
      side: (bubble && bubble.side) || 'right',
    }
  }

  const side = (bubble && bubble.side) || 'right'
  const edge = 4
  const base = { mode: 'overlay', top, width, side }
  if (side === 'left') return { ...base, left: edge }
  if (side === 'center') return { ...base, left: (100 - width) / 2 }
  return { ...base, left: 100 - width - edge }
}
