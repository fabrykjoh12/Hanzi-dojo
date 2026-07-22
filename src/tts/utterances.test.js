import { describe, it, expect } from 'vitest'
import { parseStoryUtterances, assignSpeakerVoices, castOf, NARRATOR } from './utterances.js'

const VOICES = {
  flashcard: 'zh-CN-XiaoxiaoNeural',
  story: 'zh-CN-XiaoxiaoMultilingualNeural',
  male: 'zh-CN-YunxiNeural',
}

const STORY_ID = '33333333-3333-3333-3333-333333333333'

function story(content, extra = {}) {
  return { id: STORY_ID, content, ...extra }
}

describe('assignSpeakerVoices', () => {
  it('always narrates with the story voice', () => {
    expect(assignSpeakerVoices([NARRATOR, '小明'], VOICES)[NARRATOR]).toBe(VOICES.story)
  })

  it('gives the first character a different voice from the narrator', () => {
    const cast = assignSpeakerVoices([NARRATOR, '小明'], VOICES)
    expect(cast['小明']).toBe(VOICES.male)
    expect(cast['小明']).not.toBe(cast[NARRATOR])
  })

  it('is deterministic, so a re-sync never re-casts the story', () => {
    const a = assignSpeakerVoices(['小红', '小明', NARRATOR], VOICES)
    const b = assignSpeakerVoices([NARRATOR, '小明', '小红'], VOICES)
    expect(a).toEqual(b)
  })

  it('distinguishes two characters in the same scene', () => {
    const cast = assignSpeakerVoices(['小明', '小红'], VOICES)
    expect(cast['小明']).not.toBe(cast['小红'])
  })
})

describe('parseStoryUtterances', () => {
  it('numbers utterances by the reader beat index, skipping blank lines', () => {
    const rows = parseStoryUtterances(story('第一句。\n\n第二句。\n第三句。'), { voices: VOICES })
    expect(rows.map(r => r.utterance_index)).toEqual([0, 1, 2])
    expect(rows.map(r => r.hanzi)).toEqual(['第一句。', '第二句。', '第三句。'])
  })

  it('treats a blank line as a scene boundary', () => {
    const rows = parseStoryUtterances(story('第一句。\n\n第二句。'), { voices: VOICES })
    expect(rows.map(r => r.scene_index)).toEqual([0, 1])
  })

  it('does not create empty scenes from doubled or trailing blank lines', () => {
    const rows = parseStoryUtterances(story('第一句。\n\n\n第二句。\n\n'), { voices: VOICES })
    expect(rows.map(r => r.scene_index)).toEqual([0, 1])
  })

  it('strips the speaker label from what gets spoken and keeps it as the speaker', () => {
    const rows = parseStoryUtterances(story('小明：你好！'), { voices: VOICES })
    expect(rows[0].speaker_id).toBe('小明')
    expect(rows[0].hanzi).toBe('你好！')
  })

  it('attributes an unlabelled line to the narrator', () => {
    const rows = parseStoryUtterances(story('一天晚上，小明在森林里。'), { voices: VOICES })
    expect(rows[0].speaker_id).toBe(NARRATOR)
    expect(rows[0].voice).toBe(VOICES.story)
  })

  it('gives dialogue its character voice', () => {
    const rows = parseStoryUtterances(story('一天晚上。\n小明：你好！'), { voices: VOICES })
    expect(rows[1].voice).toBe(VOICES.male)
  })

  it('honours an explicit per-character casting', () => {
    const rows = parseStoryUtterances(story('小红：你好！'), {
      voices: VOICES, characterVoices: { '小红': 'zh-CN-XiaoyiNeural' },
    })
    expect(rows[0].voice).toBe('zh-CN-XiaoyiNeural')
  })

  it('strips the leading emoji from a scene story so it is not counted as text', () => {
    const rows = parseStoryUtterances(story('🌲 一天晚上，小明在森林里。', { presentation: 'scene' }), { voices: VOICES })
    expect(rows[0].hanzi).toBe('一天晚上，小明在森林里。')
  })

  it('aligns each utterance with its English line', () => {
    const rows = parseStoryUtterances(
      story('第一句。\n第二句。', { english_content: 'First line.\nSecond line.' }),
      { voices: VOICES }
    )
    expect(rows[0].translation).toBe('First line.')
    expect(rows[1].translation).toBe('Second line.')
  })

  it('leaves the translation empty rather than guessing when the counts disagree', () => {
    const rows = parseStoryUtterances(
      story('第一句。\n第二句。', { english_content: 'Only one line.' }),
      { voices: VOICES }
    )
    expect(rows[1].translation).toBe(null)
  })

  it('creates no row for a beat with nothing to say', () => {
    const rows = parseStoryUtterances(story('🌲', { presentation: 'scene' }), { voices: VOICES })
    expect(rows).toHaveLength(0)
  })

  it('keeps the beat index of surrounding lines when one beat is unsayable', () => {
    const rows = parseStoryUtterances(story('🌲\n小明：你好！', { presentation: 'scene' }), { voices: VOICES })
    expect(rows).toHaveLength(1)
    // The reader still shows the emoji line as beat 0, so the spoken line is 1.
    expect(rows[0].utterance_index).toBe(1)
  })

  it('gives dialogue a longer trailing pause than narration', () => {
    const rows = parseStoryUtterances(story('一天晚上。\n小明：你好！'), { voices: VOICES })
    expect(rows[1].pause_after_ms).toBeGreaterThan(rows[0].pause_after_ms)
  })

  it('gives a picture-book scene the longest pause', () => {
    const scene = parseStoryUtterances(story('🌲 一天晚上。', { presentation: 'scene' }), { voices: VOICES })
    const paced = parseStoryUtterances(story('一天晚上。'), { voices: VOICES })
    expect(scene[0].pause_after_ms).toBeGreaterThan(paced[0].pause_after_ms)
  })

  it('carries the story id on every row', () => {
    const rows = parseStoryUtterances(story('第一句。\n第二句。'), { voices: VOICES })
    expect(rows.every(r => r.story_id === STORY_ID)).toBe(true)
  })

  it('returns nothing for an empty story', () => {
    expect(parseStoryUtterances(story(''), { voices: VOICES })).toEqual([])
    expect(parseStoryUtterances(null, { voices: VOICES })).toEqual([])
  })
})

describe('castOf', () => {
  it('lists the narrator first, then characters by line count', () => {
    const rows = parseStoryUtterances(
      story('一天晚上。\n小明：你好！\n小红：你好！\n小明：再见。'),
      { voices: VOICES }
    )
    const cast = castOf(rows)
    expect(cast[0].speaker_id).toBe(NARRATOR)
    expect(cast[1].speaker_id).toBe('小明')
    expect(cast[1].lines).toBe(2)
    expect(cast[2].speaker_id).toBe('小红')
  })

  it('is empty for a story with no utterances', () => {
    expect(castOf([])).toEqual([])
  })
})
