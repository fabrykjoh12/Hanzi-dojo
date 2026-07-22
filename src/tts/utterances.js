// Parsing a story into utterances.
//
// The critical property: `utterance_index` must be the SAME index the readers
// use for their beats, or a line will be highlighted while a different line is
// spoken. So this reuses the readers' own helpers - splitSpeaker for the
// dialogue label, splitScene for the picture-book emoji - and filters blank
// lines exactly the way `useStoryReaderCore` does.
//
// Scenes come from blank lines in the source, which is the only structural
// signal the authored stories carry.
//
// Pure: given a story row it returns rows to write, nothing more.

import { splitSpeaker } from '../storyReading.js'
import { splitScene } from '../sceneReading.js'
import { normalizeTtsText, isSpeakable } from './normalize.js'

export const NARRATOR = 'narrator'

// Give each speaking character a distinct voice, deterministically, so a
// re-sync never re-casts the story. The narrator always keeps the story voice;
// characters alternate from the other voices so two people in a scene do not
// sound identical.
export function assignSpeakerVoices(speakers, voices) {
  const cast = {}
  const others = [voices.male, voices.story].filter(Boolean)
  const characters = Array.from(new Set(speakers))
    .filter(s => s && s !== NARRATOR)
    .sort()
  characters.forEach((name, i) => { cast[name] = others[i % others.length] })
  cast[NARRATOR] = voices.story
  return cast
}

// A beat's trailing silence. Dialogue wants a beat of air after it; a
// picture-book scene wants longer, because the learner is also looking at an
// illustration. Narration inside a paragraph wants very little.
function pauseAfterFor(presentation, isDialogue) {
  if (presentation === 'scene') return 600
  if (isDialogue) return 350
  return 250
}

// Split a story into utterance rows.
//
// `content` lines and `english_content` lines are authored newline-aligned, so
// a beat's translation is the English line at the same position - guarded by
// index, so a mismatch yields no translation rather than the wrong one.
export function parseStoryUtterances(story, { voices, characterVoices = {} } = {}) {
  if (!story || !story.content) return []
  const presentation = story.presentation || 'paced'
  const rawLines = String(story.content).split('\n')
  const englishLines = String(story.english_content || '').split('\n').filter(Boolean)

  // First pass: beat index (blank lines skipped) and scene index (blank lines
  // are the boundaries).
  const beats = []
  let sceneIndex = 0
  let sawContentInScene = false
  for (const raw of rawLines) {
    if (!raw.trim()) {
      // Only advance on a blank line that actually separates two scenes, so
      // trailing or doubled blank lines do not create empty scenes.
      if (sawContentInScene) { sceneIndex += 1; sawContentInScene = false }
      continue
    }
    sawContentInScene = true
    beats.push({ raw, sceneIndex })
  }

  const parsed = beats.map((beat, index) => {
    const body = presentation === 'scene' ? splitScene(beat.raw).text : beat.raw
    const { speaker, text } = splitSpeaker(body)
    return {
      index,
      sceneIndex: beat.sceneIndex,
      speaker: speaker || NARRATOR,
      hanzi: normalizeTtsText(text),
      translation: englishLines[index] || null,
    }
  })

  const cast = assignSpeakerVoices(parsed.map(p => p.speaker), voices)

  return parsed
    // A beat with nothing sayable (an emoji-only scene line) still occupies its
    // beat index in the reader, but there is nothing to narrate, so it gets no
    // row rather than an unfulfillable generation job.
    .filter(p => isSpeakable(p.hanzi))
    .map(p => {
      const isDialogue = p.speaker !== NARRATOR
      return {
        story_id: story.id,
        scene_index: p.sceneIndex,
        utterance_index: p.index,
        speaker_id: p.speaker,
        hanzi: p.hanzi,
        pinyin: null,
        translation: p.translation,
        // An explicit per-character voice wins; otherwise the deterministic cast.
        voice: characterVoices[p.speaker] || cast[p.speaker] || voices.story,
        speaking_rate: null,
        delivery_style: null,
        pause_before_ms: 0,
        pause_after_ms: pauseAfterFor(presentation, isDialogue),
      }
    })
}

// The distinct speaking parts in a story, narrator first - useful for reporting
// how a story has been cast before spending anything on it.
export function castOf(utterances) {
  const seen = []
  for (const u of utterances || []) {
    const existing = seen.find(s => s.speaker_id === u.speaker_id)
    if (existing) { existing.lines += 1; continue }
    seen.push({ speaker_id: u.speaker_id, voice: u.voice, lines: 1 })
  }
  return seen.sort((a, b) => (a.speaker_id === NARRATOR ? -1 : b.speaker_id === NARRATOR ? 1 : b.lines - a.lines))
}
