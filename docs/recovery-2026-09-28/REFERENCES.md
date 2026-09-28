# Design basis for the reconstruction

Primary guidance rechecked on 28 September 2026. These references inform concrete decisions; they do not establish that Hanzi Dojo improves learning outcomes.

- [Apple UI design guidance](https://developer.apple.com/design/tips/): comfortable touch targets and deliberate alignment support reliable repeated actions. The app's 44px web target floor is an implementation choice aligned with Apple's 44pt guidance, not proof of equivalent physical sizing in every installed device. Verify real device behavior separately.
- [W3C contrast explanation](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): normal text requires at least 4.5:1 and qualifying large text 3:1, with specified exceptions. Measure computed colors without rounding a failing result upward; inspect pinyin, selected controls and dark-mode text as well as body copy.
- [W3C text resizing](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html): text enlargement should retain usable content and controls. Our 320px/200% stress checks exposed actual overlap and clipping in the baseline; intrinsic sizing and wrapping address those findings. Emulated text enlargement is not a VoiceOver or OS Dynamic Type test.
- [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): the WCAG 2.2 minimum criterion has a 24 CSS-pixel threshold and spacing/equivalent-control exceptions. The product's 44px recurring-control target is intentionally stricter; do not misreport 44px as the normative WCAG AA rule.
- [Anki's study flow](https://docs.ankiweb.net/studying.html): attempt recall before revealing the answer, then distinguish failure from effortful correct recall using Again/Hard/Good/Easy and show the next interval. This supports an explicit Show answer control and stable rating positions. Hanzi Dojo keeps its existing FSRS configuration and its own day/session policy rather than copying Anki's scheduling defaults.

## Design decisions and hypotheses

Quiet Studio keeps Chinese text and story content visually prominent through typography, spacing, neutral surfaces and restrained action color. One daily-queue action reduces ambiguity; readable persistent navigation makes Stories/Home/Practice discoverable without shifting selection geometry. Home remains centered by the owner's explicit preference. Honest vocabulary coverage connects study to reading; optional coverage explanation belongs beside the value it explains.

These are design judgments to inspect in rendered journeys, not universal research findings. The previous session chose this direction after exploration, but its visual artifacts were lost. The reconstruction preserves that choice and rebuilds current baseline/changed-state evidence. Fresh reviewers must assess current pixels and actual interactions without transferring the old score.

TestFlight should test whether learners can start a review, grade accurately, recover an accidental grade, choose a readable story and resume after interruption without guidance. Record confusion and completion, then separately evaluate actual learning and retention over time. A polished interface or AI score alone cannot demonstrate either.
