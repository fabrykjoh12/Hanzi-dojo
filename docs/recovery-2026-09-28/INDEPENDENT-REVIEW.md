# Independent reconstruction review

Status: **local reconstruction review passes at 8.21/10**, with every dimension at least 8 and no unresolved critical finding in the inspected browser scope. This is a new judgment on commit `5e8832c6e8e7ae6a55958057c599502a1eb92b00`. The previous candidate's reported 8.14/10 is historical and does not transfer to this reconstruction. Production distribution remains on hold for the separate backend, native and release gates.

Start with the [representative evidence gallery](review.html). The [final raw report](evidence/final-verified/report.json) identifies all 32 captures and the unchanged source fingerprint.

## Method and limits

The reviewer owns verification scripts, screenshots and this report, and does not edit application source. All seven dimensions have equal weight. A passing local review requires a mean strictly above 8, every dimension at least 8, and no unresolved critical finding in the observed scope. Scores are judgments with named supporting evidence, not measurements of learning efficacy or a release certificate.

Evidence will distinguish browser behavior with deterministic, synthetic Supabase fixtures from production backend behavior and an installed native application. Fictional learner records and the intentionally simplified test sentences in the E2E fixture do not establish curriculum quality. Existing canonical CI pixel baselines remain authoritative for pixel comparisons. Screenshots from this environment establish layout and interaction observations only.

## Fixed rubric

| Dimension | 5: competent but substantially incomplete | 8: polished and verified in local scope | 9: exceptional, with broader evidence |
| --- | --- | --- | --- |
| Visual craft | Usable composition with weak hierarchy, inconsistent spacing or distracting decoration | Clear primary action, deliberate typography and spacing, restrained surfaces, readable Chinese, coherent light/dark screens | Consistent precision across core, edge and secondary states; no material visual compromise in inspected device contexts |
| Identity and coherence | Generic app styling or unrelated-looking flows | Quiet, recognizable Chinese learning identity; repeated controls and materials agree across Home, Study, Stories and Practice | An unusually distinct yet restrained identity that remains coherent through all detailed flows and native layers |
| Navigation and comprehension | Main tasks are findable but labels, origins, state transitions or recovery confuse | Stable labeled navigation, Home in the middle, predictable back/history, explicit empty/error states and next actions | First-time and returning learners consistently orient without instructions, including complex nested and interrupted journeys |
| Interaction efficiency | Tasks work but require avoidable taps, scrolling, repeated choices or waiting | Reveal/grade, lookup/return and practice paths are direct, responsive, keyboard-usable and preserve context | Friction remains negligible across rapid input, long content, interruptions, device handoff and assistive use |
| Learning and language | Practice is present but recall, feedback, difficulty or metrics are misleading | Recall precedes feedback, FSRS grading labels are honest, story knowledge numbers have a stated denominator, feedback is specific, inspected Chinese is suitable | Extensive language/content audit plus learner evidence supports transfer and calibrated difficulty; no unsupported claim that local tests prove learning |
| Accessibility and device fit | Common layouts work but touch, contrast, text scaling, focus or motion has meaningful barriers | Inspected 320/390/430 and desktop layouts, both themes, 200% text stress, reduced motion, focus and touch paths are usable | Broad assistive technology and installed-device validation, including VoiceOver/TalkBack, native scaling and real safe areas |
| Implementation reliability | Happy path passes while failures, retries, identity or state consistency risk data loss | Required local gate and behavior regressions pass; tested retry, Undo, storage and navigation contracts are sound; unverified external gates explicit | Live backend concurrency, production-equivalent auth/storage, native lifecycle and release-artifact evidence close remaining material uncertainty |

## Capture and journey plan

Preserve baseline evidence against `8a26ecbc40eb1c1723b5d1c09ee15baf17cd2b19` before examining reconstruction. Use a small, representative gallery rather than duplicate every permutation.

- Core captures: Home, Study question, Study answer, Stories shelf, reader launch, active reader/lookup, Practice; light and dark at 390 pixels.
- Stress captures: Home/Study/Stories/reader controls at 320 and 430 pixels; 200% computed text-size stress; reduced-motion context; desktop navigation at 1280 pixels.
- Journeys: Home to reveal/grade/exit; known-word story lookup and close; reader settings, completion and recap; series origin/next/back/reload; Practice into a supported exercise; anonymous onboarding; keyboard focus/escape.
- Measurements: visible horizontal overflow, action target dimensions, clipped enabled controls, console page errors, meaningful opaque-text contrast samples, active navigation geometry, real focus return. Measurements are diagnostic, not automatic certification.

## Runtime recovery record

The first automated browser CLI startup failed with `Daemon process exited during startup with no error output`. The shared execution transport briefly disconnected afterward; causation is unknown. This is an environment failure, not an app regression. No browser pass is inferred from the dev server starting.

Chromium 153 was obtained from `@sparticuz/chromium@153.0.0` in a temporary runtime. Its normal extraction failed with `EINVAL: invalid argument, chown '/tmp/fonts'`; manual Brotli extraction and tar extraction with `--no-same-owner` succeeded. The valid executable is `/tmp/hanzi-chromium/chromium`, with `LD_LIBRARY_PATH=/tmp/hanzi-chromium/lib`. The incomplete `/tmp/chromium` must not be used. The runtime is disposable; committed scripts and evidence must be sufficient to reconstruct it.

Browser verification uses a separate worktree and port. `DOJO_PUBLIC_BUILD=1 DOJO_NATIVE_BUILD=1` enables bundled app fonts and public app code while serving deterministic `.env.e2e` configuration. This does not emulate an installed native runtime. No real learner data or credentials are used.

## Results

### Preserved baseline

Captured 27 PNGs against main `8a26ecbc40eb1c1723b5d1c09ee15baf17cd2b19`; the application source in this reviewer worktree was unchanged. Raw capture metadata and observations are in `evidence/baseline/report.json`. No page JavaScript exception occurred. Reader lookup, settings choice, Escape and focus return worked in the tested light/dark paced-reader journey.

Material findings from direct image inspection:

1. **Large-text clipping:** `home-320-light-text200.png` has horizontal page overflow and overlapping New/Learning/Review labels. `study-320-dark-text200.png` shows only `友` from `朋友` and crowded rating labels. This is computed text-size stress in Chromium, not an installed OS font-scaling test.
2. **Reader transition exposes the shelf:** `reader-launch-390-light.png` was captured at `/stories/st1` but still displays the shelf and its actionable filters. The old helper's `Start reading` locator can match the shelf hero while the requested reader is loading. The evidence is preserved; final capture waits for a reader-specific Back control.
3. **Touch controls below the repository's 44px target:** Home profile is 34×34; Study Exit is 38×38; Stories filters are 38px tall. The raw census also includes hidden skip links and inline word targets, which must not be mistaken for visible standalone-control failures.
4. **Visual hierarchy and identity:** the large saturated decorative Home landscape dominates the vocabulary task; the story hand-off is dimmed and locked while reviews remain. Selected-only dock labels and changing widths conceal destinations. The desktop decorative watermark and bordered weekly panel add visual furniture.
5. **Story discoverability:** tall fallback poster covers and ellipsized titles spend space on decoration while hiding meaningful content. `% known` lacks a visible denominator in the captured shelf.

An environment-specific font gap was also found: serif/handwriting Chinese preview samples rendered as missing-glyph boxes because this Linux runtime had no complete CJK fallback. The final review uses a complete Noto Sans SC fallback downloaded from the Google Fonts repository, instantiated at weight 400: 30,890 mapped glyphs, SHA-256 `df394d7287af92a73c77af2efdd95aacf47787aa5ffde8fdc951f59c05c18d79`. App-bundled fonts remain active. This restores missing fallback glyphs; it does not validate the appearance of an installed native serif/handwriting font.

No aggregate baseline pass is claimed from this capture set alone. Reliability and learning require evidence beyond these visual observations. The historical candidate score remains separate.

### Final independent assessment

The rubric above was recorded before the reconstructed interface was examined. The reviewer changed browser helpers and assertions to preserve meaningful behavior coverage under the new design, but did not change application source. Scores use half-point steps; the displayed mean is arithmetic, not a claim of measurement precision.

| Dimension | Score | Evidence and remaining limit |
| --- | ---: | --- |
| Visual craft | 8.0 | Home now gives the review task the strongest hierarchy, uses restrained light/dark surfaces and keeps weekly activity subordinate. Study Chinese and the answer action are clear; 200% rating labels retain whole words. Stories and Practice are coherent and readable. Synthetic fixtures exercise fallback covers more than real cover art, and secondary/native surfaces are not exhaustively art-directed here. |
| Identity and coherence | 8.0 | Chinese typography, warm neutral surfaces, restrained vermilion accents and consistently labeled navigation form a recognizable learning interface. The same controls and spacing recur through the core loop. Broad native-layer identity and complete production-content presentation remain uninspected. |
| Navigation and comprehension | 8.5 | All three mobile destinations retain labels and equal targets, with Home centered. Reader routing no longer resurfaces the shelf; series origin/history, missing-story recovery, direct links and first-use resume have behavioral coverage. Known-word percentages now explain their denominator. Actual first-time learner observation would be needed for a 9. |
| Interaction efficiency | 8.5 | One clear recall/reveal/grade path, whole-card reveal, keyboard operation, available story hand-off, lookup close/focus return and settings retention work. Speaking retry/late-event and rapid navigation regressions pass. At 320px/200% Study deliberately scrolls; a hit test confirms the grade action is reachable. Real-device interruptions and assistive use remain separate. |
| Learning and language | 8.0 | Recall precedes feedback; Again/Hard/Good/Easy remain FSRS self-ratings with intervals rather than inflated correctness claims. Story knowledge explicitly counts matched unique course words and excludes names/unmatched terms. Retry counting does not inflate speaking progress. Inspected Chinese/pinyin render legibly. Fixture sentences and scripted checks cannot establish curriculum accuracy, transfer or learner outcomes; editorial and learner validation remain required. |
| Accessibility and device fit | 8.0 | Representative 320/390/430 and 1280px states, both themes, 200% computed-text stress, reduced motion, keyboard/Escape, focus return and standalone touch controls pass the inspected checks. Final captures show no horizontal overflow. Sampled contrast passes, including dark Study pinyin at 5.10:1. This is neither full WCAG certification nor VoiceOver/TalkBack, OS text scaling or real safe-area validation. |
| Implementation reliability | 8.5 | All 181 eligible local behavior tests pass with no retries. Six additional fresh real-IndexedDB/Study checks exercise conflict refresh, account ownership, retirement and stale Undo; they also pass in the full run. Exact-head canonical and native CI gates succeeded, as verified by the integration coordinator. The unusually detailed local retry/conflict evidence supports the half point above 8; live multi-session database concurrency, native lifecycle and CI pixel acceptance remain external gates. |

**Mean: (8 + 8 + 8.5 + 8.5 + 8 + 8 + 8.5) / 7 = 8.2142857, displayed as 8.21/10.** Every dimension meets the fixed local threshold. No claim of perfection or public-release readiness follows from that score.

### Final source and execution evidence

| Evidence | Result | Primary record |
| --- | --- | --- |
| Final source | Commit `5e8832c6e8e7ae6a55958057c599502a1eb92b00`; 614 source files; start/end SHA-256 both `dd408343bb27c58a2ce20298f3c8013a1f8d69ae81929f14559f5d2d09aa963e` | [Final report](evidence/final-verified/report.json) |
| Final visual/journey capture | 32 PNGs; zero page exceptions, zero horizontal-overflow states, zero framework error overlays; three recorded journey assertions pass | [Final report](evidence/final-verified/report.json), [gallery](review.html) |
| Full local browser behavior | 181/181 pass; two workers; zero retries; ordinary timeouts; 8.7 minutes | [Raw run](evidence/verification/full-browser.txt) |
| Auth behavior after final style fix | 12/12 pass; two workers; zero retries; 30.6 seconds | [Raw run](evidence/verification/auth-after-fix.txt) |
| Real IndexedDB/Study focused regressions | 6/6 pass; one worker; zero retries; 21.8 seconds | [Raw run](evidence/verification/indexeddb-browser.txt) |
| Exact-head remote gates | Coordinator verified canonical `check` success (job 108913016161), native `verify` success (108913071524), and `native-gate` success (108913423787) | Coordinator's [recovery status](STATUS.md); this reviewer did not independently query GitHub |
| Exact-head CI Playwright | 183 passed, 3 failed, 6 skipped; all three failures are pixel comparisons, with no behavioral failure reported | Coordinator/release-audit inspection of current-head CI artifacts; local behavior evidence remains separately recorded |

The full local browser run excludes only canonical pixel comparisons (`visual.spec.js`) and store-marketing screenshot generation (`store-screenshots.spec.js`). It does not bless or update pixel baselines. The run began before the final Auth-only heading-wrap/centering edit; all other source was fixed. The 12-test Auth rerun and all 32 final captures ran after that edit, against the saved head. The [style-scope record](evidence/final/auth-fix-source-scope.json) reproduces the prior aggregate fingerprint by virtually reverting only those two Auth substitutions.

The local canonical run's subprocess timeouts are retained in the coordinator's logs; no timeout was relaxed to obtain a pass. The exact-head remote canonical result is distinct evidence. Native CI checks a built bundle and platform synchronization, not an installed app.

**The current-head CI Playwright gate is still red.** The release-audit agent inspected its three failed image comparisons: mobile landing changes about 4% of pixels (background/CTA), and desktop/mobile Stories change about 32% (composition). That audit identifies them as intended design changes, not behavioral regressions. The matching CI-rendered baseline update and a green rerun remain required; this reviewer has neither regenerated those canonical snapshots nor widened tolerances. The local 8.21 judgment does not override that gate.

### Resolved findings and interpretation

- The baseline Home count overlap, clipped Chinese in Study, undersized standalone controls, hidden inactive dock labels, story lock and reader/shelf race are resolved in the final inspected states and corresponding regressions.
- Interim inspection found broken enlarged rating words, low-contrast dark pinyin and a wrapping Practice dock label. The owners repaired these; final Study labels use two columns at 320px/200%, pinyin measures 5.10:1, and all three dock labels fit on one line. Grade reachability after scrolling is recorded as a real center-point hit, not inferred from a full-page image.
- The first final candidate still overflowed on Auth at 320px/200%. [The failed original](evidence/final/auth-320-light-text200.png) is retained. The [final capture](evidence/final-verified/auth-320-light-text200.png) wraps the heading and fits without reducing the text size. The supporting [Auth recheck](evidence/final-auth-fixed/report.json) also reports no overflow or undersized targets.
- The first conflict-refresh E2E failure was investigated against actual IndexedDB records after the source was fully copied. [The diagnostic](evidence/interim-e2e/conflict-refresh-debug.json) shows the authoritative revision refresh, rejection of a stale grade and acceptance of a new intent at the current revision. Fresh focused and full-suite runs pass; the failed intermediate log is preserved.
- The raw target census reports offscreen keyboard skip links and inline single-character lookups (`很`, `好`) below 44px wide. Those are not visible standalone controls and are not counted as standalone-target failures. Inline Chinese remains an accessibility area for installed-device review.
- These are full-page browser screenshots. The fixed bottom dock appears at the initial viewport boundary within a tall image, so it can visually cross the stitched content; content remains scrollable. These images are not simulated iPhone hardware screenshots.

Representative computed contrast ratios are: Home review action 16.95:1 light / 15.44:1 dark; Home “Then read” 4.62 / 7.17; Stories start action 5.48 / 5.71; reader start action 6.23 in both themes; selected reader “Always” 5.08 / 4.84; Study pinyin 5.72 / 5.10. All meet the applicable sampled threshold. The [dark-pinyin ancestry record](evidence/verification/pinyin-contrast.json) independently records its foreground and first opaque card background.

### What still prevents a release claim

Complete the current-head CI visual comparison review without loosening tolerances; validate the deployed migration/catalog/grants and authenticated multi-connection grade/Undo/reset races; then verify the signed installed candidate's auth, audio, offline lifecycle, OS text scaling, screen reader and safe areas. Native signing/upload and production database mutation were not performed by this review. The [release plan](release-plan.md) owns those distinct gates. Editorial review of real Chinese content and evidence from learners are required before broader content or efficacy claims.

To prevent recurrence, retain this script, raw evidence and exact-source report in the remote checkpoint, alongside source and the coordinator's release state. A running local browser, remembered score, or scratch-only PNG is not a recoverable checkpoint. Future source changes require a bounded rerun tied to their actual fingerprint rather than carrying this score forward automatically.

### Accessibility measurement references

The sampled text-color check follows [W3C WCAG 2.2 contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4.5:1 for ordinary text, 3:1 for large text, using computed colors rather than antialiased screenshot pixels. The report stores a pass decision before rounding its displayed ratio. Samples with unhandled gradients or ancestor opacity are omitted, so this is not a complete accessibility audit.

The repository requires 44×44px standalone controls. That is a product rule, distinct from [WCAG 2.2's minimum target-size criterion and exceptions](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Inline Chinese word lookups and hidden keyboard skip links are recorded separately from visible standalone buttons.

Publication note: trailing horizontal whitespace in three generated failure-log/context files was removed to satisfy `git diff --check`; their original and saved hashes are recorded in [text-normalization.json](evidence/text-normalization.json). Failure content and line breaks are unchanged.
