import { describe, it, expect, afterEach } from 'vitest'
import { speechRecognitionCtor, speechRecognitionSupported, speechErrorKind } from './speechSupport'

afterEach(() => {
  delete globalThis.window
})

describe('speechRecognitionCtor', () => {
  it('finds the standard and the webkit-prefixed constructor', () => {
    expect(speechRecognitionCtor({ SpeechRecognition: 'std' })).toBe('std')
    expect(speechRecognitionCtor({ webkitSpeechRecognition: 'webkit' })).toBe('webkit')
  })
  it('is null when neither exists, and with no window at all', () => {
    expect(speechRecognitionCtor({})).toBe(null)
    expect(speechRecognitionCtor(null)).toBe(null)
  })
})

describe('speechRecognitionSupported', () => {
  it('is true on a browser that has the API', () => {
    expect(speechRecognitionSupported({ ctor: function () {}, native: false })).toBe(true)
  })

  it('is false on a browser without it', () => {
    expect(speechRecognitionSupported({ ctor: null, native: false })).toBe(false)
  })

  it('is FALSE in the native shell even though the webview exposes the constructor', () => {
    // This is the whole point: WKWebView has webkitSpeechRecognition and no
    // working implementation behind it.
    expect(speechRecognitionSupported({ ctor: function () {}, native: true })).toBe(false)
  })
})

describe('speechErrorKind', () => {
  it('separates a refused microphone from an unavailable service', () => {
    expect(speechErrorKind('not-allowed')).toBe('denied')
    expect(speechErrorKind('service-not-allowed')).toBe('unsupported')
  })

  it('names the no-microphone case', () => {
    expect(speechErrorKind('audio-capture')).toBe('no-mic')
  })

  it('treats everything else as a plain failure', () => {
    expect(speechErrorKind('network')).toBe('other')
    expect(speechErrorKind('aborted')).toBe('other')
    expect(speechErrorKind(undefined)).toBe('other')
  })
})
