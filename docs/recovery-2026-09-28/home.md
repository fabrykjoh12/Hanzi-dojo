# Home, Practice and first-visit recovery

This is a new reconstruction of the missing candidate. It does not inherit the old score, screenshot findings, or test counts.

## Changes

- Home leads with the actual complete queue and a visible “Start reviewing” action inside one semantic button. The counts wrap intrinsically, the profile control is 44px, and scenic decoration has been removed. A real story title is allowed to wrap; its matched-word coverage is shown even at 0%. Reading remains reachable while reviews are waiting, with no false lock indicator.
- Weekly activity and study vocabulary progress use unboxed content. Unavailable activity is distinguished from a week with no recorded sessions, and failed queue data cannot display a false caught-up state.
- Home and Study use the same eligibility and first-observation helpers. Saving an ungraded word does not spend the daily new-word allowance. Saved, ungraded cards from the whole active deck remain eligible, while new words without rows come from the study level window. Pending operations are excluded from repeat grading and pending introductions reserve an allowance place. Pending counts exclude already-observed cards and other tracks.
- Practice leads with one context-based action. A learner with zero learned words gets a flashcard starting point; existing weak words and due grammar take priority. Remaining exercises and lookup tools remain visible in simple rows. Unsupported speech practice stays hidden. The top-level screen has no redundant Home/back control.
- Authentication keeps existing providers and validation. Back, tab, password-visibility and reset controls have 44px targets. The password-reset request now reports network failure and always clears its loading state. Explicit Log in goes to login even if earlier onboarding choices exist.
- First-visit choices are saved as each answer changes, before advancing the step. Reload retains language, experience, purposes, daily minutes and the completed encounter. The sample flashcard uses overlapping intrinsic grid faces; neither side relies on fixed absolute-positioned height.
- First-visit examples are labeled as examples; method copy avoids promising exact forgetting times or claiming a universal fastest exercise. The sample story coverage reflects five known out of seven vocabulary tokens.

## Focused verification

- `VITEST_MAX_WORKERS=2 npx vitest run src/homeCounts.test.js src/practicePlan.test.js src/prelogin.test.js src/homeModel.test.js src/homePresentation.test.js --maxWorkers=2`: 78 tests passed across five files.
- ESLint on all changed application files: zero errors or warnings.
- Added browser regressions for answers surviving reload before submission and explicit login after saved onboarding choices. Browser execution is owned by the independent review/integration step; no pass is claimed here before it runs.

## Integration requirements and limits

- Depends on the persistence agent’s `introducedTodayCards`, `isEligibleNewCard` and journal exports, plus the SQL `first_reviewed_at` column. Historical records without that timestamp fall back to `created_at`; their exact introduction date cannot be recovered from a UI change.
- Existing pixel/geometry tests that required a scenic hero, hidden CTA, rigid columns or animated hover shadow describe the superseded design. The independent reviewer is replacing those assertions with current interaction, content, fit and accessibility checks; canonical CI pixel baselines still require CI review.
- Root integrates the owned files, updates ROADMAP/BACKLOG/METRICS, runs the canonical `npm run verify:pr` gate, then makes and verifies a remote checkpoint. This agent did not commit or publish a partially integrated tree.
- Visual quality and native installed behavior are unverified at the time of this focused handoff. A 200% browser text stress test is a surrogate, not an OS Dynamic Type result.
