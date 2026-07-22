import { describe, it, expect } from 'vitest'
import { buildTtsRequest, buildVariantRequest } from './request.js'
import { normalizeTtsText, stripSpeakerLabel, isSpeakable, characterCount, assertSpeakableText } from './normalize.js'
import { MAX_TEXT_CHARS, VARIANTS } from './constants.js'

const zh = { locale: 'zh-CN', voice: 'zh-CN-XiaoxiaoNeural', contentType: 'word' }

describe('normalizeTtsText', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeTtsText('  你好   世界  ')).toBe('你好 世界')
  })

  it('collapses the ideographic space that survives a paste', () => {
    expect(normalizeTtsText('你好　世界')).toBe('你好 世界')
  })

  it('strips zero-width characters that would silently change the hash', () => {
    expect(normalizeTtsText('你​好')).toBe('你好')
    expect(normalizeTtsText('﻿你好')).toBe('你好')
  })

  it('turns newlines into spaces so a multi-line block is one utterance', () => {
    expect(normalizeTtsText('你好\n世界')).toBe('你好 世界')
  })

  it('keeps punctuation, which is what carries intonation', () => {
    expect(normalizeTtsText('你明天想去北京吗？')).toBe('你明天想去北京吗？')
  })

  it('is idempotent', () => {
    const once = normalizeTtsText('  你好　世界 ')
    expect(normalizeTtsText(once)).toBe(once)
  })

  it('handles null without throwing', () => {
    expect(normalizeTtsText(null)).toBe('')
  })
})

describe('stripSpeakerLabel', () => {
  it('removes a leading speaker label exactly as the readers do', () => {
    expect(stripSpeakerLabel('小明：你好')).toBe('你好')
    expect(stripSpeakerLabel('Anna: hello')).toBe('hello')
  })

  it('leaves a mid-sentence colon alone', () => {
    expect(stripSpeakerLabel('我今天很忙，所以：明天见')).toBe('我今天很忙，所以：明天见')
  })

  it('leaves a line with no label alone', () => {
    expect(stripSpeakerLabel('一天晚上，小明在森林里。')).toBe('一天晚上，小明在森林里。')
  })
})

describe('isSpeakable', () => {
  it('rejects empty and punctuation-only text', () => {
    expect(isSpeakable('')).toBe(false)
    expect(isSpeakable('。。。')).toBe(false)
    expect(isSpeakable('   ')).toBe(false)
  })

  it('accepts a single character', () => {
    expect(isSpeakable('好')).toBe(true)
  })
})

describe('characterCount', () => {
  it('counts Chinese characters, not UTF-16 units', () => {
    expect(characterCount('你好')).toBe(2)
    expect(characterCount('我今天去银行。')).toBe(7)
  })
})

describe('assertSpeakableText', () => {
  it('refuses oversized text - that means content was not split', () => {
    expect(() => assertSpeakableText('好'.repeat(MAX_TEXT_CHARS + 1))).toThrow(/over the/)
  })

  it('refuses text with nothing to say', () => {
    expect(() => assertSpeakableText('，，，')).toThrow(/Nothing to speak/)
  })
})

describe('buildTtsRequest', () => {
  it('carries the payload and the hash inputs together', () => {
    const req = buildTtsRequest({ ...zh, text: '  银行 ' })
    expect(req.normalizedText).toBe('银行')
    expect(req.characterCount).toBe(2)
    expect(req.ssml.indexOf('银行')).toBeGreaterThan(-1)
    expect(req.overrideVersion).toBe('none')
    expect(req.speakingRate).toBe(1)
  })

  it('is frozen so nothing downstream can desync the markup from the hash inputs', () => {
    const req = buildTtsRequest({ ...zh, text: '银行' })
    expect(Object.isFrozen(req)).toBe(true)
  })

  it('rejects an unsupported locale', () => {
    expect(() => buildTtsRequest({ ...zh, locale: 'ja-JP', text: '你好' })).toThrow(/Unsupported locale/)
  })

  it('rejects an unknown voice', () => {
    expect(() => buildTtsRequest({ ...zh, voice: 'zh-CN-Nobody', text: '你好' })).toThrow(/Unsupported voice/)
  })

  it('rejects an unknown content type', () => {
    expect(() => buildTtsRequest({ ...zh, contentType: 'song', text: '你好' })).toThrow(/Unknown contentType/)
  })

  it('rejects an out-of-range speaking rate', () => {
    expect(() => buildTtsRequest({ ...zh, text: '你好', speakingRate: 0.1 })).toThrow(/speakingRate/)
    expect(() => buildTtsRequest({ ...zh, text: '你好', speakingRate: 9 })).toThrow(/speakingRate/)
  })

  it('records the applied override so the hash tracks pronunciation changes', () => {
    const req = buildTtsRequest({
      ...zh, text: '银行',
      pronunciationOverrides: [{ matched_text: '银行', pinyin: 'yínháng', verification: 'verified' }],
    })
    expect(req.overrideVersion).toBe('银行=yínháng')
  })
})

describe('buildVariantRequest', () => {
  it('pairs each variant with its own rate and content type', () => {
    expect(buildVariantRequest('word', { ...zh, contentType: null, text: '银行' }).speakingRate).toBe(VARIANTS.word.rate)
    expect(buildVariantRequest('word_slow', { ...zh, contentType: null, text: '银行' }).speakingRate).toBe(0.8)
    expect(buildVariantRequest('sentence_slow', { ...zh, contentType: null, text: '我去银行。' }).speakingRate).toBe(0.85)
  })

  it('keeps slow speech natural rather than draggy', () => {
    expect(VARIANTS.word_slow.rate).toBeGreaterThanOrEqual(0.7)
    expect(VARIANTS.sentence_slow.rate).toBeGreaterThanOrEqual(0.7)
  })

  it('derives the content type from the variant', () => {
    expect(buildVariantRequest('sentence', { ...zh, contentType: null, text: '我去银行。' }).contentType).toBe('sentence')
    expect(buildVariantRequest('utterance', { ...zh, contentType: null, text: '我去银行。' }).contentType).toBe('story')
  })

  it('rejects an unknown variant', () => {
    expect(() => buildVariantRequest('shouting', { ...zh, text: '你好' })).toThrow(/Unknown audio variant/)
  })
})
