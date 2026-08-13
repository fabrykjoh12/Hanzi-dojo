// Data for the story-first Home hero: the one story the learner has unlocked
// today, and how much of it they can already read.
//
// Kept SEPARATE from homeCounts.js: that module is the synchronous count math
// every screen relies on, while this is Home's own async story fetch. Splitting
// them means Home renders its counts immediately and fills the hero in when the
// story arrives, rather than blocking the whole screen on three more queries.
//
// The pick itself (pickDailyStory) and the percentage (calculateStoryReadability)
// are existing, tested, pure functions. This module only feeds them.

import { supabase } from './supabase'
import { getTrackCards } from './data'
import { pickDailyStory } from './dailyStory'
import { tiersFor } from './storyTiers'
import { calculateStoryReadability } from './storyReading'
import { hasReadToday } from './storyReward'
import { todayStr } from './streak'

// The hero needs a single readable line, not the whole story. The first
// non-empty line is the story's opening — which is what a learner is being
// invited to read.
export function openingLine(content) {
  const first = (content || '').split('\n').map(s => s.trim()).find(Boolean)
  return first || ''
}

// A story's own words, minus any speaker prefix, kept short enough to sit on
// one or two lines in the hero at display size.
export function heroSentence(content, maxChars = 30) {
  const line = openingLine(content)
  // Dialogue lines look like "妈妈：..." — the hero reads better without the
  // speaker tag, and the reader itself still shows it.
  // Story lines can open with a scene emoji (\u{1F327} today's weather, and so on).
  // The hero is the SENTENCE; a leading pictograph reads as a rendering
  // accident at display size, so it goes.
  const noEmoji = line.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '')
  const stripped = noEmoji.replace(/^[^：:]{1,8}[：:]\s*/, '')
  if (stripped.length <= maxChars) return stripped
  // Cut on a clause boundary when there is one, so the teaser never ends
  // mid-word. Falls back to a hard cut with an ellipsis.
  const clause = stripped.slice(0, maxChars).match(/^.*[，,。.！!？?、]/)
  return clause ? clause[0] : stripped.slice(0, maxChars) + '…'
}

// The oversized watermark should be a character that MEANS something. Taking
// the last one tends to land on a grammatical particle (吗 / 了 / の); the
// opening character is almost always content.
export function firstContentChar(sentence) {
  const m = (sentence || '').match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}]/u)
  return m ? m[0] : ''
}

// The columns the daily-story query asks for. Exported so a spec can assert them
// against what `stories` actually has — see the note inside the query.
export const DAILY_STORY_COLUMNS = 'id, title, content, level, tier, story_number, image_path'

// The daily story plus its readability, or null when nothing is unlocked yet
// (a brand-new account) or the fetch fails. Callers render an honest empty
// state on null rather than a fake story.
export async function getDailyStoryCard(userId, track, learnedCount, dateStr = todayStr()) {
  if (!userId || !track) return null

  try {
    const [storiesRes, readsRes, vocabRes] = await Promise.all([
      supabase
        // `image_path` — NOT `cover_url`, which does not exist on `stories` and
        // never has. PostgREST answers an unknown column with a 400, supabase-js
        // puts that in `error` and leaves `data` null, and the `stories.length
        // === 0` guard below then returned null for every learner on every
        // load — so Home's story hand-off has never once rendered in production
        // (found 2026-08-11, verified against the live schema). The column list
        // is asserted in a unit test now, because nothing else could see it: the
        // e2e mock answers any select with its own rows.
        .from('stories').select(DAILY_STORY_COLUMNS)
        .eq('language', track.language).eq('system', track.system)
        .lte('level', track.current_level).eq('is_published', true),
      supabase
        // `read_at` as well as the id: the ids pick the story (an unread one),
        // and the timestamps answer a different question — did the learner read
        // ANYTHING today, which is what Home's guide ticks step 2 on. Same row,
        // same query, one more column.
        .from('story_reads').select('story_id, read_at').eq('user_id', userId),
      supabase
        .from('vocabulary').select('id, word, reading, meaning, level')
        .eq('language', track.language).eq('system', track.system)
        .lte('level', track.current_level).eq('is_active', true),
    ])

    const stories = storiesRes.data || []
    if (stories.length === 0) return null

    const story = pickDailyStory({
      stories,
      categories: tiersFor(track.language, track.current_level),
      learnedCount,
      readIds: new Set((readsRes.data || []).map(r => r.story_id)),
      dateStr,
    })
    if (!story) return null

    // Reuse the cached card fetch rather than issuing a fourth query.
    const cards = await getTrackCards(userId, track, { columns: 'vocab_id, state, due_at, stability, lapses' })
    const cardsMap = {}
    ;(cards || []).forEach(c => { cardsMap[c.vocab_id] = c })
    const vocabMap = {}
    ;(vocabRes.data || []).forEach(v => { vocabMap[v.word] = v })

    const readability = calculateStoryReadability({
      content: story.content, vocabMap, cards: cardsMap, language: track.language,
    })

    return {
      story,
      readToday: hasReadToday(readsRes.data || []),
      // The artwork Home anchors the hand-off on (P10-C2). Null is fine —
      // StoryCover falls back to its own accent wash.
      coverPath: story.image_path || null,
      sentence: heroSentence(story.content),
      // knownPct is already rounded by calculateStoryReadability.
      knownPct: readability.knownPct,
      newCount: readability.newCount,
    }
  } catch {
    // Offline or a failed query — the hero degrades to its empty state. A Home
    // screen must never fail to render because a story couldn't be fetched.
    return null
  }
}
