import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The wiring, pinned. Every defect the first review of this change found was a
// CALL SITE defect — a payload of the wrong shape handed to toast(), and an
// event dispatched where nothing was listening — and in both cases the pure
// modules underneath were already correct and already tested. Deleting either
// line left the whole suite green, which is the thing that made those defects
// survive three artefacts claiming they were fixed.
//
// Structural, and says so: this reads source text and proves nothing about
// runtime. tests/e2e/known-words.spec.js is the behavioural half — it drives
// the screen in a real browser and reads the toast off it. This half is here
// because it is cheap, runs in verify:pr, and kills the exact mutation
// "somebody deletes the line".

const read = (p) => readFileSync(p, 'utf8')
const codeOf = (p) => read(p).split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

describe('the import confirmation reaches the learner', () => {
  it('hands toast() the payload builder, never a bare string', () => {
    // The round-1 defect exactly: toast(detail) dispatches its argument
    // verbatim and <Toasts /> spreads it, so toast('Added 3 words') arrives as
    // {0:'A',1:'d',…} with title undefined and renders as an empty card.
    const code = codeOf('src/KnownWords.jsx')
    expect(code).toMatch(/toast\(\s*claimToast\(/)
    expect(code, 'a sentence builder must not be handed straight to toast()')
      .not.toMatch(/toast\(\s*claimSummaryLine\(/)
    // No string literal or template goes in either.
    expect(code).not.toMatch(/toast\(\s*['"`]/)
  })

  it('reports what the database wrote, not what was sent', () => {
    // seedClaim returns { inserted, skipped }; `claimIds.length` is the count
    // that overstated, because the upsert uses ignoreDuplicates.
    const code = codeOf('src/KnownWords.jsx')
    expect(code).toMatch(/const \{ inserted, skipped \} = await seedClaim\(/)
    expect(code).toMatch(/claimToast\(\{ inserted, skipped/)
  })
})

describe('the failed-seed notice is recorded, and announced where it can be seen', () => {
  it('onboarding records the failure durably', () => {
    const code = codeOf('src/Onboarding.jsx')
    expect(code).toMatch(/recordPriorSeedFailure\(\)/)
  })

  it('App asks whether anything is listening before it announces', () => {
    // Not "is the shell up". profile and track are both loaded on the trust
    // pages, the public reading assessment, a public story link and the
    // password-recovery screen — all of which return from App above <Toasts />.
    const code = codeOf('src/App.jsx')
    expect(code).toMatch(/toastsAreListening\(\)/)
    expect(code).toMatch(/shouldAnnouncePriorSeedFailure\(\{ flagged, listening: toastsAreListening\(\) \}\)/)
    expect(code).toMatch(/toast\(priorSeedNoticeToast\(\)\)/)
  })

  it('clears the flag AFTER the toast, never on read', () => {
    // A single take() spends the notice whether or not it reached anybody. The
    // order of these two lines is the whole guarantee.
    const code = codeOf('src/App.jsx')
    const announce = code.indexOf('toast(priorSeedNoticeToast())')
    const clear = code.indexOf('clearPriorSeedFailure()')
    expect(announce, 'the notice must be announced somewhere').toBeGreaterThan(-1)
    expect(clear, 'the flag must be cleared somewhere').toBeGreaterThan(-1)
    expect(announce, 'the flag is cleared before the toast is dispatched').toBeLessThan(clear)
    expect(code, 'peek-and-clear-in-one is the bug this replaced')
      .not.toMatch(/takePriorSeedFailure/)
  })
})
