// Pure presentation model for the Misty Atmosphere Home (P1, approved
// 2026-08-17): the compact header (greeting + level pill) and the three-step
// learning journey — completed → current → upcoming — that replaced the desk
// layout. The daily state machine itself is unchanged and stays in
// homePresentation.js (homeDailyStage); this module only decides what each
// step of the journey PRINTS for a given stage, so the JSX stays layout-only
// and every visible string has a test.

import { homeQueueSummary, homeProgressPct } from './homePresentation'
import { practiceStatus, storyStatus } from './homeModel'
import { leadingChapterNumber, stripLeadingNumber } from './storyArcs'

// ── Header ──────────────────────────────────────────────────────────────────

// First name for the greeting: the first word of the profile's display name.
// '' when there is none — the greeting then stands alone ("你好").
export function homeFirstName(profile) {
  const name = String((profile && profile.display_name) || '').trim()
  if (!name) return ''
  return name.split(/\s+/)[0]
}

// The compact progress pill: "HSK 2 · 42%". Level and progress on one line,
// nothing else — no streak, no extra statistics.
export function homeLevelPill({ levelLabel = '', learned = 0, totalWords = 0 } = {}) {
  const pct = Math.round(homeProgressPct(learned, totalWords))
  return levelLabel + ' · ' + pct + '%'
}

// ── The current session card ────────────────────────────────────────────────

// Headline for the focus card, derived from the real queue — "Learn 4 new
// words" only when the session genuinely is 4 new words.
export function sessionHeadline(counts = {}) {
  const queue = homeQueueSummary(counts)
  if (queue.failed) return 'Start today’s session'
  const reviews = queue.reviewCount
  const fresh = queue.newCount
  if (reviews > 0 && fresh > 0) return 'Review ' + reviews + ' · learn ' + fresh + ' new'
  if (fresh > 0) return 'Learn ' + fresh + ' new ' + (fresh === 1 ? 'word' : 'words')
  if (reviews > 0) return 'Review ' + reviews + ' ' + (reviews === 1 ? 'word' : 'words')
  return ''
}

// The word-sample row. Sizing contract: words render at up to SAMPLE_MAX_PX
// with a SAMPLE_GAP_EM gap, and the whole row must fit one line inside the
// card at every supported width — so the sample is capped by total em-length,
// not just word count, and the font size shrinks for what remains.
export const SAMPLE_MAX_WORDS = 4
export const SAMPLE_MAX_EM = 8.4
export const SAMPLE_GAP_EM = 0.35
export const SAMPLE_MAX_PX = 44
// The column is capped at 430px; page (40) + card (44) padding leaves ~346.
const SAMPLE_MAX_ROW_PX = 346
const SAMPLE_VW_CHROME_PX = 92

// Row length in em: one em per character plus the gaps between words.
export function sampleEmLength(words = []) {
  const chars = words.reduce((sum, word) => sum + [...String(word)].length, 0)
  return chars + SAMPLE_GAP_EM * Math.max(0, words.length - 1)
}

// Up to four words from the front of the ACTUAL prepared queue — never
// fabricated. Greedy in queue order: stop at the first word that would
// overflow the row, so what the learner sees is genuinely the top of the
// session. The first word is always kept (the font size clamps it).
export function sessionSampleWords(queue = []) {
  const words = []
  for (const item of queue) {
    const word = item && item.vocab && item.vocab.word
    if (!word || words.includes(word)) continue
    if (words.length > 0 && sampleEmLength([...words, word]) > SAMPLE_MAX_EM) break
    words.push(word)
    if (words.length >= SAMPLE_MAX_WORDS) break
  }
  return words
}

// The CSS font-size expression that keeps the sample on one line: capped so
// the row fits the 430px column, and viewport-scaled below that.
export function sampleFontSize(words = []) {
  const em = sampleEmLength(words)
  if (em <= 0) return SAMPLE_MAX_PX + 'px'
  const cap = Math.min(SAMPLE_MAX_PX, Math.floor(SAMPLE_MAX_ROW_PX / em))
  return 'min(' + cap + 'px, calc((100vw - ' + SAMPLE_VW_CHROME_PX + 'px) / ' + em + '))'
}

// ── Journey steps ───────────────────────────────────────────────────────────

// The third step's unlock line, from the real daily story. The chapter number
// is derived from the title the same way the shelf derives it (storyArcs.js);
// a story without one simply gets no chapter suffix.
export function storyUnlockTitle(daily) {
  const story = daily && daily.story
  if (!story) return 'Today’s story'
  const title = stripLeadingNumber(story.title)
  const chapter = leadingChapterNumber(story.title)
  return chapter ? 'Unlock ' + title + ' · Chapter ' + chapter : 'Unlock ' + title
}

// Which object is the screen's single primary action for a stage. 'complete'
// is the calm end state — deliberately nothing to press.
export function homePrimaryAction(stage) {
  if (stage === 'cards') return 'cards'
  if (stage === 'story') return 'story'
  if (stage === 'practice') return 'practice'
  if (stage === 'caught-up') return 'shelf'
  return null
}

// The three steps of the journey for a stage, in the loop's order — cards,
// story, practice (or the shelf when no story exists). Exactly one step is
// 'current' except in the all-done stage. Titles and subs reuse the tested
// status strings from homeModel so the two can never drift.
export function homeJourneySteps({ stage, counts = {}, daily } = {}) {
  const story = daily ? daily.story : null
  const storyTitle = story ? stripLeadingNumber(story.title) : 'Today’s story'
  const grammarDue = counts.grammarDueCount || 0
  const grammarSub = grammarDue > 0
    ? grammarDue + (grammarDue === 1 ? ' pattern due' : ' patterns due')
    : null

  if (stage === 'caught-up') {
    return [
      { key: 'cards', status: 'done', title: 'Review', sub: 'Nothing due right now' },
      { key: 'shelf', status: 'current', title: 'Open the story shelf', sub: storyStatus({ stage, daily }) },
      { key: 'practice', status: 'done', title: 'Grammar review', sub: practiceStatus(stage) },
    ]
  }

  const cardsStep = stage === 'cards'
    ? { key: 'cards', status: 'current', title: sessionHeadline(counts), sub: null }
    : { key: 'cards', status: 'done', title: 'Review', sub: 'Nothing due right now' }

  const storyStep = {
    key: 'story',
    status: stage === 'cards' ? 'upcoming' : stage === 'story' ? 'current' : 'done',
    title: stage === 'cards' ? storyUnlockTitle(daily) : storyTitle,
    titleIsStory: stage !== 'cards' && Boolean(story),
    sub: storyStatus({ stage, daily }),
  }

  const practiceStep = {
    key: 'practice',
    status: stage === 'practice' ? 'current' : stage === 'complete' ? 'done' : 'upcoming',
    title: 'Grammar review',
    sub: stage === 'practice' ? grammarSub : practiceStatus(stage),
  }

  return [cardsStep, storyStep, practiceStep]
}

// ── Story Reward section ────────────────────────────────────────────────────

// What the cinematic reward card shows for a stage. 'hidden' when no story
// exists at all (the shelf card is the honest fallback then); the locked and
// completed states are display-only — the card is tappable ONLY when reading
// it is the current step, preserving the one-primary-action rule.
export function storyRewardState({ stage, daily } = {}) {
  if (daily === undefined) return { kind: 'skeleton' }
  if (!daily || !daily.story) return { kind: 'hidden' }
  if (stage === 'cards') return { kind: 'locked', badge: 'Unlocks after today’s session' }
  if (stage === 'story') return { kind: 'ready', badge: null }
  return { kind: 'complete', badge: 'Completed today' }
}
