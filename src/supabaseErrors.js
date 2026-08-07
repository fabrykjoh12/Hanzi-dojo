// Classifying Supabase/PostgREST failures where the difference changes what
// the learner sees. `.single()` with zero rows fails with PGRST116 — for the
// profile/track bootstrap that means "genuinely not set up yet" (→ onboarding),
// while every other failure (network down, 5xx, RLS misconfig) means "we don't
// KNOW" — and must never be treated as a blank account.

export function isRowMissing(error) {
  return Boolean(error && error.code === 'PGRST116')
}

// True when a bootstrap query failed in a way that says nothing about whether
// the data exists. No error at all, and the missing-row case, are both false.
export function isBootstrapFailure(error) {
  return Boolean(error) && !isRowMissing(error)
}
