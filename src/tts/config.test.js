import { describe, it, expect } from 'vitest'
import { validateTtsEnv, describeConfig, PROVIDERS, MAX_CONCURRENCY } from './config.js'
import { createProvider, PROVIDER_NAMES } from './providers/index.js'
import { AzureTTSProvider } from './providers/azure.js'
import { MockTTSProvider } from './providers/mock.js'

// Synthetic values only - never a real credential.
const FAKE_KEY = 'test-key-0123456789abcdef0123456789abcdef'
const goodEnv = {
  AZURE_SPEECH_KEY: FAKE_KEY,
  AZURE_SPEECH_REGION: 'westeurope',
  TTS_DEFAULT_PROVIDER: 'azure',
  TTS_FLASHCARD_VOICE: 'zh-CN-XiaoxiaoNeural',
  TTS_STORY_VOICE: 'zh-CN-XiaoxiaoMultilingualNeural',
  TTS_DEFAULT_LOCALE: 'zh-CN',
}

describe('validateTtsEnv', () => {
  it('resolves a complete environment', () => {
    const config = validateTtsEnv(goodEnv)
    expect(config.provider).toBe('azure')
    expect(config.locale).toBe('zh-CN')
    expect(config.voices.flashcard).toBe('zh-CN-XiaoxiaoNeural')
    expect(config.voices.story).toBe('zh-CN-XiaoxiaoMultilingualNeural')
    expect(config.voices.male).toBe('zh-CN-YunxiNeural')
    expect(config.azure.region).toBe('westeurope')
  })

  it('falls back to the documented defaults', () => {
    const config = validateTtsEnv({ AZURE_SPEECH_KEY: FAKE_KEY, AZURE_SPEECH_REGION: 'eastus2' })
    expect(config.provider).toBe('azure')
    expect(config.locale).toBe('zh-CN')
    expect(config.voices.flashcard).toBe('zh-CN-XiaoxiaoNeural')
  })

  it('fails when the key is missing', () => {
    const { AZURE_SPEECH_KEY, ...rest } = goodEnv
    void AZURE_SPEECH_KEY
    expect(() => validateTtsEnv(rest)).toThrow(/AZURE_SPEECH_KEY/)
  })

  it('fails when the region is missing', () => {
    const { AZURE_SPEECH_REGION, ...rest } = goodEnv
    void AZURE_SPEECH_REGION
    expect(() => validateTtsEnv(rest)).toThrow(/AZURE_SPEECH_REGION/)
  })

  it('rejects a region that would corrupt the endpoint host', () => {
    expect(() => validateTtsEnv({ ...goodEnv, AZURE_SPEECH_REGION: 'west europe' })).toThrow(/lowercase alphanumeric/)
    expect(() => validateTtsEnv({ ...goodEnv, AZURE_SPEECH_REGION: 'evil.example.com' })).toThrow(/lowercase alphanumeric/)
  })

  it('rejects an unknown provider instead of guessing', () => {
    expect(() => validateTtsEnv({ ...goodEnv, TTS_DEFAULT_PROVIDER: 'elevenlabs' }))
      .toThrow(/must be one of/)
  })

  it('rejects an unsupported locale', () => {
    expect(() => validateTtsEnv({ ...goodEnv, TTS_DEFAULT_LOCALE: 'ja-JP' })).toThrow(/not supported/)
  })

  it('rejects a misspelled voice before any paid request is made', () => {
    expect(() => validateTtsEnv({ ...goodEnv, TTS_FLASHCARD_VOICE: 'zh-CN-XiaoxiaoNeual' }))
      .toThrow(/not a known zh-CN voice/)
  })

  it('allows a dry run with no credentials at all', () => {
    const config = validateTtsEnv({ TTS_DEFAULT_PROVIDER: 'azure' }, { requireCredentials: false })
    expect(config.azure.key).toBe(null)
  })

  it('caps concurrency so a batch cannot stampede the provider', () => {
    expect(() => validateTtsEnv({ ...goodEnv, TTS_CONCURRENCY: String(MAX_CONCURRENCY + 1) }))
      .toThrow(/at most/)
    expect(validateTtsEnv({ ...goodEnv, TTS_CONCURRENCY: '4' }).concurrency).toBe(4)
  })

  it('rejects a non-numeric tuning value rather than silently using a default', () => {
    expect(() => validateTtsEnv({ ...goodEnv, TTS_TIMEOUT_MS: 'soon' })).toThrow(/positive whole number/)
  })

  it('exposes the mock provider as a first-class choice', () => {
    expect(PROVIDERS).toContain('mock')
    expect(validateTtsEnv({ TTS_DEFAULT_PROVIDER: 'mock' }).azure).toBe(null)
  })
})

describe('describeConfig', () => {
  it('never reveals the credential', () => {
    const described = describeConfig(validateTtsEnv(goodEnv))
    expect(JSON.stringify(described).indexOf(FAKE_KEY)).toBe(-1)
    expect(described.azureKey).toBe('set (' + FAKE_KEY.length + ' chars)')
  })

  it('says so plainly when the credential is absent', () => {
    const described = describeConfig(validateTtsEnv({ TTS_DEFAULT_PROVIDER: 'azure', AZURE_SPEECH_REGION: 'eastus' }, { requireCredentials: false }))
    expect(described.azureKey).toBe('missing')
  })

  it('reports the settings an operator needs to sanity-check a run', () => {
    const described = describeConfig(validateTtsEnv(goodEnv))
    expect(described.provider).toBe('azure')
    expect(described.azureRegion).toBe('westeurope')
    expect(described.voices.story).toBe('zh-CN-XiaoxiaoMultilingualNeural')
  })
})

describe('provider registry', () => {
  it('knows exactly the providers this phase supports', () => {
    expect(PROVIDER_NAMES.slice().sort()).toEqual(['azure', 'mock'])
  })

  it('builds an Azure provider from a validated config', () => {
    const provider = createProvider(validateTtsEnv(goodEnv))
    expect(provider).toBeInstanceOf(AzureTTSProvider)
    expect(provider.name).toBe('azure')
  })

  it('builds the mock provider', () => {
    const provider = createProvider(validateTtsEnv({ TTS_DEFAULT_PROVIDER: 'mock' }))
    expect(provider).toBeInstanceOf(MockTTSProvider)
  })

  it('throws rather than silently falling back to the mock', () => {
    expect(() => createProvider({ provider: 'minimax' })).toThrow(/Unknown TTS provider/)
  })

  it('gives every provider the same synthesize interface', () => {
    for (const name of PROVIDER_NAMES) {
      const config = name === 'azure' ? validateTtsEnv(goodEnv) : validateTtsEnv({ TTS_DEFAULT_PROVIDER: 'mock' })
      expect(typeof createProvider(config).synthesize).toBe('function')
    }
  })
})
