// Mastery — now a thin re-export of the canonical knowledge model.
//
// These names and this import path predate `knowledgeState.js` and are used by
// a dozen screens plus docs/METRICS.md, so they stay exactly where callers
// expect them. The definitions themselves moved, because "does the learner know
// this word?" had grown four different answers and needed one.
//
// The behavioural change that came with the move: `isLearned` and `isMastered`
// now require a genuine observation (reps >= 1), so a prior-knowledge claim can
// never satisfy either. See knowledgeState.js for why `reps` is the fact a
// claim cannot fabricate.

export {
  MASTERY_STABILITY_DAYS,
  TEST_UNLOCK_MASTERY_PCT,
  isLearned,
  isMastered,
  countMastery,
} from './knowledgeState'
