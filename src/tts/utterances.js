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
import { VOICE_POOLS } from './constants.js'

export const NARRATOR = 'narrator'

// The recurring cast of the authored and generated stories (see the character
// bibles in generate-serial-stories.mjs and characterNames.js), plus the family
// and shop roles that appear as speakers. Only what is needed to avoid voicing
// a mother as a man - anything unlisted is cast from the combined pool.
export const CHARACTER_GENDER = {
  // family roles
  '妈妈': 'female', '母亲': 'female', '姐姐': 'female', '妹妹': 'female',
  '奶奶': 'female', '外婆': 'female', '阿姨': 'female',
  '爸爸': 'male', '父亲': 'male', '哥哥': 'male', '弟弟': 'male',
  '爷爷': 'male', '外公': 'male', '叔叔': 'male',
  // recurring named characters
  '小红': 'female', '小花': 'female', '小雨': 'female', '林雨晴': 'female',
  '李明': 'male', '小明': 'male', '大明': 'male', '大力': 'male', '大毛': 'male',
}

export function genderOf(name) {
  return CHARACTER_GENDER[name] || null
}

// Cast a story.
//
// Rules, in order of how much they matter:
//   1. The narrator keeps the story voice.
//   2. No character ever shares the narrator's voice - if they did, dialogue
//      and narration would be indistinguishable, which is the whole point of
//      having character voices.
//   3. A character of known gender is cast from that gender's pool.
//   4. Two characters never share a voice while an unused one remains.
//
// Deterministic: the same story always casts the same way, so a re-sync never
// silently re-voices a story the learner has already heard.
export function assignSpeakerVoices(speakers, voices, { locale = 'zh-CN' } = {}) {
  const pools = VOICE_POOLS[locale] || { female: [], male: [] }
  const narratorVoice = voices.story
  const free = {
    female: pools.female.filter(v => v !== narratorVoice),
    male: pools.male.filter(v => v !== narratorVoice),
  }
  const used = new Set()

  // Take the next unused voice from a pool, falling back to the other pool and
  // finally to reuse - a repeated voice beats no audio.
  const take = (gender) => {
    const order = gender === 'male'
      ? [free.male, free.female]
      : gender === 'female'
        ? [free.female, free.male]
        // Unknown gender: alternate, so a crowd of anonymous shop staff does not
        // all come out female.
        : (used.size % 2 === 0 ? [free.male, free.female] : [free.female, free.male])
    for (const pool of order) {
      const pick = pool.find(v => !used.has(v))
      if (pick) { used.add(pick); return pick }
    }
    const any = [...free.female, ...free.male]
    return any.length ? any[used.size % any.length] : (voices.male || narratorVoice)
  }

  const cast = { [NARRATOR]: narratorVoice }
  // Named characters first, so a leading role gets the most distinct voice
  // before the anonymous ones consume the pool.
  const characters = Array.from(new Set(speakers)).filter(s => s && s !== NARRATOR)
  const known = characters.filter(genderOf).sort()
  const unknown = characters.filter(c => !genderOf(c)).sort()
  for (const name of known) cast[name] = take(genderOf(name))
  for (const name of unknown) cast[name] = take(null)
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

  const cast = assignSpeakerVoices(parsed.map(p => p.speaker), voices, { locale: story.locale || 'zh-CN' })

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
