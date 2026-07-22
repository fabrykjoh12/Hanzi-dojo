// Typed TTS errors.
//
// Two properties matter to callers: `retryable` (may the runner back off and
// try again?) and `code` (a stable string safe to store in a database column
// and show in an operator UI). Messages are built from provider status codes
// and our own validation — never from request headers or credentials, so an
// error can be logged verbatim without leaking a key.

export const TTS_ERROR_CODES = {
  CONFIG: 'tts_config',
  INVALID_REQUEST: 'tts_invalid_request',
  UNSUPPORTED_LOCALE: 'tts_unsupported_locale',
  UNSUPPORTED_VOICE: 'tts_unsupported_voice',
  TEXT_TOO_LONG: 'tts_text_too_long',
  TIMEOUT: 'tts_timeout',
  CANCELLED: 'tts_cancelled',
  RATE_LIMIT: 'tts_rate_limit',
  AUTH: 'tts_auth',
  PROVIDER: 'tts_provider',
  EMPTY_AUDIO: 'tts_empty_audio',
  STORAGE: 'tts_storage',
}

export class TtsError extends Error {
  constructor(message, { code = TTS_ERROR_CODES.PROVIDER, retryable = false, status = null, cause = null } = {}) {
    super(message)
    this.name = 'TtsError'
    this.code = code
    this.retryable = retryable
    this.status = status
    if (cause) this.cause = cause
  }

  // What gets persisted / printed. Deliberately narrow: no stack, no cause
  // chain, nothing that could have captured a header or a URL with a key in it.
  toRecord() {
    return { code: this.code, message: this.message, status: this.status }
  }
}

export class TtsConfigError extends TtsError {
  constructor(message) {
    super(message, { code: TTS_ERROR_CODES.CONFIG, retryable: false })
    this.name = 'TtsConfigError'
  }
}

export class TtsRequestError extends TtsError {
  constructor(message, code = TTS_ERROR_CODES.INVALID_REQUEST) {
    super(message, { code, retryable: false })
    this.name = 'TtsRequestError'
  }
}

export class TtsTimeoutError extends TtsError {
  constructor(ms) {
    super('Synthesis timed out after ' + ms + 'ms', { code: TTS_ERROR_CODES.TIMEOUT, retryable: true })
    this.name = 'TtsTimeoutError'
  }
}

export class TtsCancelledError extends TtsError {
  constructor(message = 'Synthesis cancelled') {
    super(message, { code: TTS_ERROR_CODES.CANCELLED, retryable: false })
    this.name = 'TtsCancelledError'
  }
}

export class TtsProviderError extends TtsError {
  constructor(message, { status = null, code = TTS_ERROR_CODES.PROVIDER, retryable = false } = {}) {
    super(message, { code, retryable, status })
    this.name = 'TtsProviderError'
  }
}

export class TtsStorageError extends TtsError {
  constructor(message, { retryable = true } = {}) {
    super(message, { code: TTS_ERROR_CODES.STORAGE, retryable })
    this.name = 'TtsStorageError'
  }
}

// Map an HTTP status from a synthesis endpoint onto a typed error. 401/403 are
// never retried — retrying a bad credential just burns time and can trip a
// provider's lockout. 429 and 5xx are.
export function providerErrorFromStatus(status, detail) {
  // Azure answers a malformed-SSML 400 with an EMPTY body, so "HTTP 400" alone
  // tells an operator nothing. Say so, and point at the usual cause.
  const suffix = detail
    ? ' - ' + String(detail).slice(0, 300)
    : (status === 400 ? ' - the provider returned no detail, which usually means it rejected the SSML' : '')
  if (status === 401 || status === 403) {
    return new TtsProviderError('The TTS provider rejected the credentials (HTTP ' + status + ')' + suffix, {
      status, code: TTS_ERROR_CODES.AUTH, retryable: false,
    })
  }
  if (status === 429) {
    return new TtsProviderError('Rate limited by the TTS provider (HTTP 429)' + suffix, {
      status, code: TTS_ERROR_CODES.RATE_LIMIT, retryable: true,
    })
  }
  if (status >= 500) {
    return new TtsProviderError('TTS provider error (HTTP ' + status + ')' + suffix, { status, retryable: true })
  }
  return new TtsProviderError('TTS request failed (HTTP ' + status + ')' + suffix, { status, retryable: false })
}

// True for anything the runner should retry: our own retryable errors plus
// transport-level failures (a dropped socket surfaces as a plain TypeError).
export function isRetryableError(err) {
  if (!err) return false
  if (err instanceof TtsError) return err.retryable
  const name = err.name || ''
  return name === 'FetchError' || name === 'TypeError'
}
