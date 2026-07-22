// Provider registry.
//
// The one place that knows which providers exist. Adding MiniMax, ElevenLabs or
// another engine later means writing a class with a `synthesize(request, opts)`
// method and registering it here - nothing above this line changes, because
// everything upstream is expressed in our own request/result vocabulary rather
// than any vendor's.

import { AzureTTSProvider } from './azure.js'
import { MockTTSProvider } from './mock.js'
import { TtsConfigError } from '../errors.js'

export { AzureTTSProvider, MockTTSProvider }

const REGISTRY = {
  azure: (config, deps) => new AzureTTSProvider({
    key: config.azure && config.azure.key,
    region: config.azure && config.azure.region,
    timeoutMs: config.timeoutMs,
    fetchImpl: deps.fetchImpl || null,
  }),
  mock: (config, deps) => new MockTTSProvider(deps.mockOptions || {}),
}

export const PROVIDER_NAMES = Object.keys(REGISTRY)

// Build the provider named by a validated config. Throws rather than silently
// falling back, because "quietly used the mock" would look like a successful
// generation run that produced unplayable files.
export function createProvider(config, deps = {}) {
  const name = config && config.provider
  const make = REGISTRY[name]
  if (!make) {
    throw new TtsConfigError('Unknown TTS provider "' + name + '". Known providers: ' + PROVIDER_NAMES.join(', '))
  }
  return make(config, deps)
}
