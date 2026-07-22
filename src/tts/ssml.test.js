import { describe, it, expect } from 'vitest'
import { escapeSsml, toAzurePinyin, overridePhones, ratePercent, buildSsml, buildSsmlBody } from './ssml.js'
import { OVERRIDE_VERIFICATION } from './constants.js'

const zh = { locale: 'zh-CN', voice: 'zh-CN-XiaoxiaoNeural' }

function override(matched, pinyin, extra = {}) {
  return { matched_text: matched, pinyin, verification: OVERRIDE_VERIFICATION.VERIFIED, ...extra }
}

describe('escapeSsml', () => {
  it('escapes every XML-significant character', () => {
    expect(escapeSsml('a & b < c > d " e \' f')).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f')
  })

  it('leaves Chinese text untouched', () => {
    expect(escapeSsml('你好，世界。')).toBe('你好，世界。')
  })

  it('handles null and undefined without throwing', () => {
    expect(escapeSsml(null)).toBe('')
    expect(escapeSsml(undefined)).toBe('')
  })
})

describe('SSML injection safety', () => {
  it('neutralizes markup smuggled in the source text', () => {
    const { ssml } = buildSsml({ ...zh, text: '你好</voice><voice name="evil">坏' })
    expect(ssml.indexOf('<voice name="evil">')).toBe(-1)
    expect(ssml.indexOf('&lt;/voice&gt;')).toBeGreaterThan(-1)
    // Exactly one real voice element survives.
    expect(ssml.split('<voice ').length - 1).toBe(1)
  })

  it('neutralizes markup smuggled in an override pronunciation', () => {
    // Exercised at a locale that still pins, since zh-CN emits no phoneme at
    // all - the escaping has to hold wherever the pin IS written.
    const evil = override('银行', '', { provider_representation: 'yin2"/><evil x="' })
    const { body } = buildSsmlBody('银行', [evil], { locale: 'zh-XX' })
    expect(body.indexOf('<evil')).toBe(-1)
    expect(body.indexOf('&quot;')).toBeGreaterThan(-1)
  })

  it('escapes a voice name so a bad config cannot break out of the attribute', () => {
    const ssml = buildSsml({ locale: 'zh-CN', voice: 'x"><script>', text: '你好' }).ssml
    expect(ssml.indexOf('<script>')).toBe(-1)
  })
})

describe('toAzurePinyin', () => {
  it('rewrites the Google u-umlaut spelling to Azure "v"', () => {
    expect(toAzurePinyin('lu:4 se4')).toBe('lv4 se4')
  })

  it('leaves other syllables alone', () => {
    expect(toAzurePinyin('yin2 hang2')).toBe('yin2 hang2')
  })

  it('returns null for empty input', () => {
    expect(toAzurePinyin('')).toBe(null)
  })
})

describe('overridePhones', () => {
  it('converts tone-marked pinyin into Azure SAPI syllables', () => {
    expect(overridePhones(override('银行', 'yínháng'))).toBe('yin2 hang2')
  })

  it('prefers an explicit provider representation over conversion', () => {
    expect(overridePhones(override('银行', 'yínháng', { provider_representation: 'yin2 hang2 ' }))).toBe('yin2 hang2')
  })

  it('returns null when the pinyin cannot be parsed, so the caller speaks plain text', () => {
    expect(overridePhones(override('银行', '???'))).toBe(null)
  })
})

describe('ratePercent', () => {
  it('renders a slowdown as a negative percentage', () => {
    expect(ratePercent(0.8)).toBe('-20%')
    expect(ratePercent(0.85)).toBe('-15%')
  })

  it('renders a speed-up with an explicit plus sign', () => {
    expect(ratePercent(1.2)).toBe('+20%')
  })
})

describe('buildSsml', () => {
  it('omits prosody entirely at the natural rate', () => {
    const { ssml } = buildSsml({ ...zh, text: '你好', speakingRate: 1 })
    expect(ssml.indexOf('<prosody')).toBe(-1)
    expect(ssml.indexOf('>你好<')).toBeGreaterThan(-1)
  })

  it('wraps the body in prosody for a slow variant', () => {
    const { ssml } = buildSsml({ ...zh, text: '你好', speakingRate: 0.8 })
    expect(ssml.indexOf('<prosody rate="-20%">')).toBeGreaterThan(-1)
  })

  it('names the locale and voice', () => {
    const { ssml } = buildSsml({ ...zh, text: '你好' })
    expect(ssml.indexOf('xml:lang="zh-CN"')).toBeGreaterThan(-1)
    expect(ssml.indexOf('name="zh-CN-XiaoxiaoNeural"')).toBeGreaterThan(-1)
  })

  it('only emits an express-as style when one is asked for', () => {
    expect(buildSsml({ ...zh, text: '你好' }).ssml.indexOf('mstts:express-as')).toBe(-1)
    expect(buildSsml({ ...zh, text: '你好', style: 'cheerful' }).ssml.indexOf('<mstts:express-as style="cheerful">')).toBeGreaterThan(-1)
  })

  it('reports "none" when no override applied', () => {
    expect(buildSsml({ ...zh, text: '你好' }).overrideVersion).toBe('none')
  })
})

// Measured against a live Azure resource: <phoneme> returns HTTP 400 with an
// empty body on every zh-CN neural voice and every alphabet, while the same
// element succeeds for en-US on the same resource. Emitting it fails the whole
// request, so Chinese must never carry one.
describe('zh-CN cannot use <phoneme> (Azure rejects it)', () => {
  it('emits no phoneme element even when an override matches', () => {
    const { ssml } = buildSsml({ ...zh, text: '我去银行。', overrides: [override('银行', 'yínháng')] })
    expect(ssml.indexOf('<phoneme')).toBe(-1)
    expect(ssml.indexOf('银行')).toBeGreaterThan(-1)
  })

  it('reports no applied override, so an unusable pin cannot mark audio stale', () => {
    const { overrideVersion } = buildSsml({ ...zh, text: '我去银行。', overrides: [override('银行', 'yínháng')] })
    expect(overrideVersion).toBe('none')
  })

  it('still speaks the full text unchanged', () => {
    const { ssml } = buildSsml({ ...zh, text: '我去银行。', overrides: [override('银行', 'yínháng')] })
    expect(ssml.indexOf('>我去银行。<')).toBeGreaterThan(-1)
  })

  it('keeps the rate control, which zh-CN does accept', () => {
    const { ssml } = buildSsml({ ...zh, text: '银行', speakingRate: 0.8, overrides: [override('银行', 'yínháng')] })
    expect(ssml.indexOf('<prosody rate="-20%">')).toBeGreaterThan(-1)
  })

})

describe('phoneme support gate', () => {
  it('applies the pin for a locale with no recorded restriction', () => {
    const { body, version } = buildSsmlBody('银行', [override('银行', 'yínháng')], { locale: 'zh-XX' })
    expect(body.indexOf('<phoneme alphabet="sapi" ph="yin2 hang2">银行</phoneme>')).toBeGreaterThan(-1)
    expect(version).toBe('银行=yínháng')
  })

  it('skips the pin for zh-CN', () => {
    const { body, version } = buildSsmlBody('银行', [override('银行', 'yínháng')], { locale: 'zh-CN' })
    expect(body).toBe('银行')
    expect(version).toBe('none')
  })
})

describe('buildSsmlBody', () => {
  it('speaks the characters plainly when an override has no usable phones', () => {
    const { body } = buildSsmlBody('银行', [override('银行', 'not-pinyin')])
    expect(body).toBe('银行')
  })

  it('leaves text outside the matched span unwrapped', () => {
    const { body } = buildSsmlBody('我去银行了', [override('银行', 'yínháng')])
    expect(body.indexOf('我去')).toBe(0)
    expect(body.endsWith('了')).toBe(true)
  })
})
