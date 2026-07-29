import { describe, it, expect } from 'vitest'
import { splitSpeaker, buildDict, cjkCoverage, validateStory } from './storyValidation.mjs'

const TIER = { lines: [4, 8], minCov: 0.85, maxMisses: 3 }
const SPEAKERS = ['李明', '小红']

function chinese(words) {
  return buildDict(words.map(w => ({ word: w })), { language: 'chinese', speakers: SPEAKERS })
}

describe('splitSpeaker', () => {
  it('splits a dialogue line on the speaker colon', () => {
    expect(splitSpeaker('李明：我要吃饭')).toEqual({ speaker: '李明', text: '我要吃饭' })
  })

  it('leaves narration alone', () => {
    expect(splitSpeaker('小红看见了大毛')).toEqual({ speaker: null, text: '小红看见了大毛' })
  })

  it('does not treat a late colon as a speaker tag', () => {
    // Otherwise a colon used mid-sentence would silently swallow the first
    // half of a narration line and hide it from coverage.
    const line = '妈妈说了一句很长的话：吃饭'
    expect(splitSpeaker(line).speaker).toBe(null)
  })
})

describe('buildDict', () => {
  it('strips the decorations stored vocabulary carries', () => {
    const dict = buildDict([{ word: '吃饭。' }, { word: '这～' }], { language: 'chinese' })
    expect(dict.has('吃饭')).toBe(true)
    expect(dict.has('这')).toBe(true)
  })

  it('indexes both halves of a parenthesised form', () => {
    const dict = buildDict([{ word: '後(で)' }], { language: 'japanese' })
    expect(dict.has('後で')).toBe(true)
    expect(dict.has('後')).toBe(true)
  })

  it('indexes the kanji stem of a Japanese verb so conjugation still matches', () => {
    // 食べます → 食. cjkCoverage treats trailing okurigana as allowed hiragana,
    // so the stem alone is enough for 食べた/食べて to count as in-pool.
    const dict = buildDict([{ word: '食べます' }], { language: 'japanese' })
    expect(dict.has('食')).toBe(true)
  })

  it('indexes the ます-stem of an all-kana verb', () => {
    const dict = buildDict([{ word: 'かえります' }], { language: 'japanese' })
    expect(dict.has('かえり')).toBe(true)
  })

  it('admits the cast, who are never in the vocabulary list', () => {
    expect(chinese(['吃']).has('李明')).toBe(true)
  })
})

describe('cjkCoverage', () => {
  it('is 100% when every word is in the pool', () => {
    const dict = chinese(['我', '喜欢', '吃', '饭'])
    expect(cjkCoverage(['我喜欢吃饭。'], dict).coverage).toBe(1)
  })

  it('prefers the longest match, so a compound is one word not two', () => {
    // 喜欢 must match whole; matching 喜 then leaving 欢 unmatched would both
    // undercount coverage and split a word the reader shows as one tappable unit.
    const dict = chinese(['我', '喜欢'])
    expect(cjkCoverage(['我喜欢'], dict).misses).toEqual([])
  })

  it('reports an out-of-pool run as a word, not as loose characters', () => {
    const dict = chinese(['我', '去'])
    const { misses } = cjkCoverage(['我去图书馆'], dict)
    expect(misses).toEqual(['图书馆'])
  })

  it('ignores the speaker tag, which is not story text', () => {
    const dict = chinese(['吃饭'])
    expect(cjkCoverage(['李明：吃饭'], dict).coverage).toBe(1)
  })

  it('ignores emoji, which scene stories lead every line with', () => {
    // Counting them as unmatched characters marked the illustration wrong and
    // dropped a good HSK 2 story to 49%.
    const dict = chinese(['我', '喜欢', '吃', '饭'])
    expect(cjkCoverage(['🍚 我喜欢吃饭'], dict).coverage).toBe(1)
    expect(cjkCoverage(['🦁🐼 我喜欢吃饭'], dict).misses).toEqual([])
  })

  it('counts unmatched hiragana as known for Japanese only', () => {
    const jp = buildDict([{ word: '学校' }], { language: 'japanese' })
    expect(cjkCoverage(['学校にいきます'], jp, 8, true).coverage).toBe(1)
    expect(cjkCoverage(['学校にいきます'], jp, 8, false).coverage).toBeLessThan(1)
  })
})

describe('validateStory', () => {
  const pool = ['我', '喜欢', '吃', '饭', '你', '好', '今天', '天气', '很', '不', '是', '的', '去', '学校', '吗'].map(w => ({ word: w }))
  const base = { pool, tier: TIER, language: 'chinese', speakers: SPEAKERS, maxLineChars: 30 }
  const goodLines = ['今天天气很好。', '李明：你好！', '小红：你好，你去学校吗？', '李明：是的。', '小红：我很喜欢吃饭。']

  it('passes a chapter that stays inside its pool', () => {
    const r = validateStory(goodLines.join('\n'), base)
    expect(r.ok).toBe(true)
    expect(r.coverage).toBe(1)
    expect(r.lineCount).toBe(5)
  })

  it('rejects a speaker who is not in the cast', () => {
    const content = goodLines.concat(['王明：你好！']).join('\n')
    const r = validateStory(content, base)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('王明')
  })

  it('rejects a chapter that drifts out of the pool', () => {
    const content = ['今天天气很好。', '李明：图书馆里面有很多书架。', '小红：附近的商场人山人海。', '李明：是的。', '小红：我很喜欢吃饭。'].join('\n')
    const r = validateStory(content, base)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('coverage')
  })

  it('rejects a chapter with too many distinct reach words even at high coverage', () => {
    // Each reach word is separated by in-pool text, so they count as distinct
    // misses rather than merging into one long unmatched run.
    const r = validateStory(
      [
        '今天天气很好。',
        '李明：你好！',
        '小红：甲很好,乙很好,丙很好。',
        '李明：丁不好,戊不好。',
        '小红：我很喜欢吃饭。',
      ].join('\n'),
      { ...base, tier: { ...TIER, minCov: 0.5, maxMisses: 3 } },
    )
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('distinct out-of-pool')
  })

  it('rejects a chapter that is too short to be a chapter', () => {
    const r = validateStory('今天天气很好。', base)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('Too short')
  })

  it('flags a line that runs far past the level\'s line length', () => {
    const long = '我'.repeat(70)
    const r = validateStory(goodLines.concat([long]).join('\n'), base)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('too long')
  })
})
