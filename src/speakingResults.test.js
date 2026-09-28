import { it, expect } from 'vitest'
import { recordSpeakingResult, correctSpeakingCount } from './speakingResults'
it('counts a repeatedly successful prompt only once', () => {
  let results = {}
  for (let n = 0; n < 4; n += 1) results = recordSpeakingResult(results, 'one', true)
  expect(correctSpeakingCount(results)).toBe(1)
})
it('replaces both successful and unsuccessful retry results', () => {
  let results = recordSpeakingResult({}, 'one', false)
  results = recordSpeakingResult(results, 'one', true)
  results = recordSpeakingResult(results, 'two', true)
  expect(correctSpeakingCount(results)).toBe(2)
  results = recordSpeakingResult(results, 'one', false)
  expect(correctSpeakingCount(results)).toBe(1)
})
