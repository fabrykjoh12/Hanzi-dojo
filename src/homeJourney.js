// Pure presentation model for the Misty Atmosphere Home (P1, approved
// 2026-08-17): the compact header (greeting + level pill) and the three-step
// learning journey — completed → current → upcoming — that replaced the desk
// layout. The daily state machine itself is unchanged and stays in
// homePresentation.js (homeDailyStage); this module only decides what each
// step of the journey PRINTS for a given stage, so the JSX stays layout-only
// and every visible string has a test.

import { homeProgressPct } from './homePresentation'
import { deskCardsSub, practiceStatus, storyStatus } from './homeModel'
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

// The queue line under the focus card's heading: the real composition,
// "13 reviews · 10 new". Same string deskCardsSub prints minus the estimate,
// so the promise and the delivery share one source.
export function sessionQueueLine(counts = {}) {
  return deskCardsSub({ counts })
}

// The word-sample row. Sizing contract: the preview stays LARGE (never below
// SAMPLE_MIN_PX) and never clips — so on a narrow viewport or with longer
// vocabulary the sample DROPS WORDS instead of shrinking below the floor.
// Whole real words only: never truncated, never substituted.
export const SAMPLE_MAX_WORDS = 4
export const SAMPLE_GAP_EM = 0.35
export const SAMPLE_MAX_PX = 44
export const SAMPLE_MIN_PX = 34
// The Home column caps at 430px; page (40) + card (44) padding + slack.
const SAMPLE_COLUMN_MAX_PX = 430
const SAMPLE_CHROME_PX = 88

// The pixels the sample row actually has at a given viewport width.
export function sampleRowWidth(viewportWidth) {
  const vw = viewportWidth > 0 ? viewportWidth : SAMPLE_COLUMN_MAX_PX
  return Math.min(SAMPLE_COLUMN_MAX_PX, vw) - SAMPLE_CHROME_PX
}

// Row length in em: one em per character plus the gaps between words.
export function sampleEmLength(words = []) {
  const chars = words.reduce((sum, word) => sum + [...String(word)].length, 0)
  return chars + SAMPLE_GAP_EM * Math.max(0, words.length - 1)
}

// Up to four words from the front of the ACTUAL prepared queue — never
// fabricated. Greedy in queue order, capped by what fits at the premium
// floor size for THIS viewport: a narrow screen or longer words simply show
// fewer of them. The first word is always kept (the font size clamps it).
export function sessionSampleWords(queueWords = [], viewportWidth) {
  const maxEm = sampleRowWidth(viewportWidth) / SAMPLE_MIN_PX
  const words = []
  for (const word of queueWords) {
    if (!word || words.includes(word)) continue
    if (words.length > 0 && sampleEmLength([...words, word]) > maxEm) break
    words.push(word)
    if (words.length >= SAMPLE_MAX_WORDS) break
  }
  return words
}

// Font size in px for the sample at this viewport — as large as the row
// allows, capped at SAMPLE_MAX_PX. Only a single very long word can push it
// under SAMPLE_MIN_PX (the sampler never lets a multi-word row do so).
export function sampleFontSize(words = [], viewportWidth) {
  const em = sampleEmLength(words)
  if (em <= 0) return SAMPLE_MAX_PX
  return Math.max(20, Math.min(SAMPLE_MAX_PX, Math.floor(sampleRowWidth(viewportWidth) / em)))
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
    ? { key: 'cards', status: 'current', title: 'Today’s session', sub: null }
    : { key: 'cards', status: 'done', title: 'Review', sub: 'Nothing due right now' }

  // The story step never repeats the Story Reward card's title while that
  // card is the primary action right below — "Story unlocked" points at it
  // instead of competing with it.
  const storyStep = stage === 'cards'
    ? { key: 'story', status: 'upcoming', title: storyUnlockTitle(daily), sub: storyStatus({ stage, daily }) }
    : stage === 'story'
      ? {
          key: 'story', status: 'current',
          title: daily === undefined ? 'Today’s story' : 'Story unlocked',
          sub: storyStatus({ stage, daily }),
        }
      : { key: 'story', status: 'done', title: storyTitle, titleIsStory: Boolean(story), sub: storyStatus({ stage, daily }) }

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
