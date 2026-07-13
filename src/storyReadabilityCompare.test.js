import { describe, it, expect } from 'vitest'
import { calculateStoryReadability } from './storyReading'

// Phase 2 — characterization of the DIFFERENCE between the two former "% known"
// algorithms, kept as executable documentation.
//
// `oldRecapPercent` reconstructs the pre-unification recap calc (storyMatch's
// former greedy scan over the WHOLE content: no speaker-label stripping, no
// proper-name handling, no particle exclusion). The canonical
// calculateStoryReadability mirrors the READER instead. These tests pin down
// exactly where and why the two diverged, so the unification is not silent.
function oldRecapPercent(content, vocabMap, cards) {
  const text = content || ''
  const isVocab = (cand) => Boolean(vocabMap[cand])   // no particle exclusion
  const words = new Set()
  let i = 0
  while (i < text.length) {
    let matched = null
    const max = Math.min(6, text.length - i)
    for (let len = max; len >= 1; len -= 1) {
      const cand = text.slice(i, i + len)
      if (isVocab(cand)) { matched = cand; break }
    }
    if (matched) { words.add(matched); i += matched.length } else i += 1
  }
  let known = 0
  words.forEach(w => {
    const card = cards[vocabMap[w].id]
    if (card && (card.is_easy || card.state === 'review')) known += 1
  })
  return { total: words.size, knownPct: words.size ? Math.round((known / words.size) * 100) : 0 }
}

const v = (word, id) => ({ id, word })

describe('old recap vs canonical — they AGREE on neutral text', () => {
  const VOCAB = { 今天: v('今天', 'a'), 我: v('我', 'b'), 朋友: v('朋友', 'c'), 公园: v('公园', 'd'), 散步: v('散步', 'e'), 和: v('和', 'f'), 去: v('去', 'g') }
  const cards = { a: { state: 'review' }, b: { is_easy: true } }
  it('no names, particles, or speaker labels → identical percentage', () => {
    const content = '今天我和朋友去公园散步'
    const oldR = oldRecapPercent(content, VOCAB, cards)
    const now = calculateStoryReadability({ content, vocabMap: VOCAB, cards, language: 'chinese' })
    expect(now.totalUnique).toBe(oldR.total)
    expect(now.knownPct).toBe(oldR.knownPct)
  })
})

describe('old recap vs canonical — documented divergences', () => {
  it('Chinese speaker label: old counts label chars as vocab, canonical strips the label', () => {
    const VOCAB = { 小: v('小', 'x'), 明: v('明', 'y'), 今天: v('今天', 'a') }
    const content = '小明：今天'
    const oldR = oldRecapPercent(content, VOCAB, {})
    const now = calculateStoryReadability({ content, vocabMap: VOCAB, cards: {}, language: 'chinese' })
    expect(oldR.total).toBe(3)        // old: 小 + 明 + 今天
    expect(now.totalUnique).toBe(1)   // canonical: only 今天 (label stripped, 小明 is a name too)
    expect(now.totalUnique).not.toBe(oldR.total)
  })

  it('Chinese proper name: old counts the name’s characters, canonical skips the name', () => {
    const VOCAB = { 小: v('小', 'x'), 明: v('明', 'y'), 我: v('我', 'b') }
    const content = '小明我'          // 小明 is a curated character name
    const oldR = oldRecapPercent(content, VOCAB, {})
    const now = calculateStoryReadability({ content, vocabMap: VOCAB, cards: {}, language: 'chinese' })
    expect(oldR.total).toBe(3)        // old: 小 + 明 + 我
    expect(now.totalUnique).toBe(1)   // canonical: only 我
  })

  it('Japanese particle: old counts a kana particle as vocab, canonical excludes it', () => {
    const VOCAB = { 猫: v('猫', 'n'), は: v('は', 'p') }
    const content = '猫は'
    const oldR = oldRecapPercent(content, VOCAB, {})
    const now = calculateStoryReadability({ content, vocabMap: VOCAB, cards: {}, language: 'japanese' })
    expect(oldR.total).toBe(2)        // old: 猫 + は
    expect(now.totalUnique).toBe(1)   // canonical: 猫 only
  })
})
