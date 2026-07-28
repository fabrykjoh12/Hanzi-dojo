import { describe, it, expect } from 'vitest'
import { nameFromSpeaker, collectStoryNames } from './storyNames'

// A story's speaker labels are its cast list. These specs pin the precision
// side of that: a role noun, a phrase or a stray label must never be promoted
// to "Name", because mislabeling a real word hides a word the learner needs.
describe('nameFromSpeaker', () => {
  it('accepts a Chinese personal name that is not vocabulary', () => {
    expect(nameFromSpeaker('小云', {}, 'chinese')).toBe('小云')
    expect(nameFromSpeaker('王小龙', {}, 'chinese')).toBe('王小龙')
  })

  it('rejects a role noun that is ordinary vocabulary', () => {
    expect(nameFromSpeaker('妈妈', { '妈妈': { id: 'v1', word: '妈妈' } }, 'chinese')).toBe(null)
  })

  it('rejects a Chinese role noun even when the track has no card for it', () => {
    expect(nameFromSpeaker('服务员', {}, 'chinese')).toBe(null)
    expect(nameFromSpeaker('老师', {}, 'chinese')).toBe(null)
    // …and any label ending in a role character (售货员, 出租车司机 → 机 is not
    // listed, but 员/师/生/人 are the ones that actually occur).
    expect(nameFromSpeaker('售货员', {}, 'chinese')).toBe(null)
  })

  it('rejects a Japanese descriptive label and long role words', () => {
    expect(nameFromSpeaker('みせのひと', {}, 'japanese')).toBe(null)
    expect(nameFromSpeaker('おかあさん', {}, 'japanese')).toBe(null)
    expect(nameFromSpeaker('せんせい', {}, 'japanese')).toBe(null)
  })

  it('accepts a Japanese given name', () => {
    expect(nameFromSpeaker('ゆき', {}, 'japanese')).toBe('ゆき')
  })

  it('requires a Russian name to be capitalized (lowercase = role noun)', () => {
    expect(nameFromSpeaker('Иван', {}, 'russian')).toBe('Иван')
    expect(nameFromSpeaker('продавец', {}, 'russian')).toBe(null)
    expect(nameFromSpeaker('мама', {}, 'russian')).toBe(null)
    // Capitalized role nouns are still role nouns.
    expect(nameFromSpeaker('Мама', {}, 'russian')).toBe(null)
  })

  it('rejects labels that are not a plain word in the language’s script', () => {
    expect(nameFromSpeaker('小明 and 小红', {}, 'chinese')).toBe(null)
    expect(nameFromSpeaker('Narrator', {}, 'chinese')).toBe(null)
    expect(nameFromSpeaker('12', {}, 'chinese')).toBe(null)
    expect(nameFromSpeaker('', {}, 'chinese')).toBe(null)
    expect(nameFromSpeaker(null, {}, 'chinese')).toBe(null)
  })

  it('rejects a single character (too short to match without colliding)', () => {
    expect(nameFromSpeaker('明', {}, 'chinese')).toBe(null)
  })

  it('rejects an over-long CJK label — that is a phrase, not a given name', () => {
    expect(nameFromSpeaker('大人常常告诉他们', {}, 'chinese')).toBe(null)
  })
})

describe('collectStoryNames', () => {
  it('adds the story’s own speakers to the curated map', () => {
    const names = collectStoryNames(['小云', '妈妈'], { '妈妈': { id: 'v1' } }, 'chinese', { '小明': 'Xiǎo Míng' })
    expect(names['小明']).toBe('Xiǎo Míng')
    expect('小云' in names).toBe(true)
    expect(names['小云']).toBe(null)          // derived names carry no reading
    expect('妈妈' in names).toBe(false)        // vocabulary stays vocabulary
  })

  it('never overwrites a curated reading with a derived null', () => {
    const names = collectStoryNames(['小明'], {}, 'chinese', { '小明': 'Xiǎo Míng' })
    expect(names['小明']).toBe('Xiǎo Míng')
  })

  it('is stable with no speakers at all', () => {
    expect(collectStoryNames([], {}, 'chinese', { '小明': 'Xiǎo Míng' })).toEqual({ '小明': 'Xiǎo Míng' })
    expect(collectStoryNames(null, {}, 'chinese', {})).toEqual({})
  })
})
