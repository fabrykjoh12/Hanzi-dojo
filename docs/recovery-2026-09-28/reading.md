# Reading and navigation recovery

This is newly reconstructed source, not recovery of the lost commit. The earlier score and screenshot set do not certify this candidate.

## Implemented

- Mobile Stories / Home / Practice destinations have equal, stable widths, visible labels, and a second active-state signal. Home stays centered. ResizeObserver publishes the actual dock height so page clearance and floating controls adapt to larger text.
- Sidebar retains 236 / 64 px layouts, removes the decorative character, and gives account, theme and collapse controls at least 44 px targets.
- Stories renders directly from route state rather than competing local view state. Missing story and series targets get a safe fallback. A reader's series origin is validated against membership and passed to chapter navigation. App.jsx integration must persist `readerSeriesKey` in React Router history state.
- Featured stories use an honest editorial label, complete story artwork, readable titles and semantic surfaces. Shelf artwork uses a consistent 3:2 contained slot. Coverage disclosure explains the matched course-vocabulary denominator rather than implying whole-story comprehension.
- Reader launch metadata wraps, key controls meet 44 px, pinyin uses a theme-aware ink token, and the mobile scroll-reader settings sheet is excluded from outside-pointer dismissal.
- Speaking records one latest result per prompt; retries replace the earlier result. Recognition callbacks must belong to the active attempt, Next stops recognition, and the summary says what speech recognition actually matched.

## Verification at this checkpoint

Targeted ESLint: no errors or new warnings.
30 targeted unit tests passed across story route view, speaking retry scoring, bottom clearance, navigation configuration and navigation ancestry.
Browser regressions are added for shelf resurrection, series reload/history origin, unavailable-story recovery, mobile reader settings selection, and speaking retry/stale callbacks. Their result must be recorded after the integrated App navigation change is present.
The canonical gate and integrated browser result are recorded by the coordinating branch. Installed-device speech recognition and OS text enlargement remain release checks.
