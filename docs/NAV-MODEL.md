# The navigation model

**Status: SHIPPED and in production. This is now a description, not a plan.**
Written 2026-08-09 as a specification; built and wired into the shell over the
days that followed. The "Not implemented — nothing in `src/` implements this
yet" banner that used to stand here was true for about a week and then quietly
became the most misleading sentence in the docs.

What implements it, so nobody goes looking for the old `if/else` shell:

| Module | Role |
|---|---|
| `src/navStack.js` | the pure reducer — tabs, stacks, overlays, `VIEW_CLASS`, Android Back, deep-link seeding, URL projection |
| `src/navShell.js` | the questions the shell asks — which root is alive, what is on top, is the tab bar visible |
| `src/navLedger.js` | history snapshots keyed by `navId`; a POP adopts a snapshot rather than re-deriving |
| `src/useNavigation.js` | the hook `App.jsx` holds: `navigate`, `back`, `reselect`, scroll capture/restore |
| `src/useAndroidBack.js` | performs the reducer's Back decision on the native shell |
| `src/TabHost.jsx` | the four persistent roots, each wrapped in `<Activity>` |
| `src/navMotion.js` + `src/useNavMotion.js` | the transitions in §5.4 |

**Treat this model as frozen.** It is load-bearing for every screen and has its
own property tests (`navStack.test.js`, `navShell.test.js`, `navLedger.test.js`).
Presentation work on the bar — order, icons, sizing — happens in `MobileNav.jsx`
and `navConfig.js` and must not reach in here. §0 below is kept as the record of
what the shell used to be and why it changed.

The change this describes, in one line:

```
  from   URL → derive view → replace component
  to     persistent tabs → independent stacks → fullscreen flows / sheets
```

It is a shell change. No screen is redesigned, no business logic moves, and
every URL the app answers today still answers tomorrow.

---

## 0 · Why the current shell is the problem

`App.jsx:451-721` is a 270-line `if/else` producing one `content` variable,
rendered inside `<ErrorBoundary key={view}>`. Three consequences, all of which
this model removes:

1. **`key={view}` unmounts the entire screen on every navigation.** Returning to
   Stories re-runs its mount effects — about nine Supabase queries — and drops
   scroll position.
2. **There is no stack.** `onBack` is a hardcoded literal in 26 screens
   (`navigate('practice')`, `navigate('home')`), so Back means "go to the place
   someone typed", not "go back".
3. **Every tab tap is a history push** (`App.jsx:325`, never `replace`, no guard
   for `key === view`), so Android Back walks the entire browsing history
   instead of popping.

---

## 1 · Single source of truth

There is **one** authoritative runtime navigation model. The URL and
`history.state` are derived from it, never competing with it.

### 1.1 What owns navigation state

A pure reducer in `src/navStack.js` owns it. Its state:

```js
NavState = {
  activeTab,          // 'home' | 'study' | 'stories' | 'practice'
  stacks: {
    home:     [Entry, ...],
    study:    [Entry, ...],
    stories:  [Entry, ...],
    practice: [Entry, ...],
  },
  overlay: null | { kind, originTab, stack: [Entry, ...] },
}

Entry = { view, params, key, scrollTop }
```

`kind` is `'fullscreen'` (a flow) or `'account'` (the avatar stack). `originTab`
is the tab that was active when the overlay opened, so dismissing returns there
rather than to a fixed destination.

Actions: `selectTab · push · pop · present · dismiss · resetTab · restore`.
All pure, all unit-tested. `App.jsx` renders this state; it does not own it.

### 1.2 What is serialized into history

**Only an integer.** `history.state = { navId }`.

Not the stacks. Serializing them invites drift (two representations of the same
truth), size limits, and version-skew bugs after a deploy. The integer is a key
into a module-level ledger:

```js
// src/navLedger.js — Map<navId, NavState>, bounded LRU (50 entries).
// Module scope, deliberately: it must survive a remount, and it must NOT
// survive a reload (see 1.5).
```

The URL is computed by `urlForState(nav)` — the path of the visible top entry —
and is always one of the paths `routes.js` already defines.

### 1.3 The synchronization rules

| Trigger | What happens |
|---|---|
| `push` / `selectTab` / `present` | reduce → new `navId` → ledger.set → `navigate(urlForState(next), { state: { navId } })` |
| `pop` / `dismiss` with a ledger predecessor | `navigate(-1)`; the resulting POP restores the snapshot |
| `pop` / `dismiss` with no predecessor (cold deep link) | reduce → `navigate(url, { replace: true, state: { navId } })` |
| Router `POP` (browser Back, Android Back, swipe-back) | read `location.state.navId` → `ledger.get` → adopt that snapshot wholesale |
| POP with missing/unknown `navId` | rebuild with `stackForPath(location.pathname)` (see 1.5) |

`POP` is the **only** path where history informs state. Everywhere else the flow
is state → URL.

### 1.4 Cold deep link

The app opens on `/stories/series/inkbound` with no `navId` in history:

1. `stackForPath(pathname)` seeds a full `NavState` (§4).
2. `navigate(url, { replace: true, state: { navId } })` stamps the entry so
   later pops have a predecessor.
3. Back from the seeded screen pops to the seeded parent — the shelf — not out
   of the app.

### 1.5 Refresh on web, and stale/absent history state

A reload destroys the ledger. Every `navId` in the browser's history is now
unknown. This is handled, not patched:

- Any POP whose `navId` is absent from the ledger is treated exactly like a cold
  deep link: `stackForPath(location.pathname)` rebuilds deterministically.
- Determinism is what makes this safe, and it is why `PARENT` (§4) exists rather
  than a heuristic.

**Explicit limitation:** the URL expresses only the *visible* branch. After a
reload, the three non-visible tabs return to their roots. A user who had
`practice → words` open, switched to Stories, and reloaded, will find Practice
at its root. This is accepted: recovering invisible stacks would require
serializing them, which §1.2 rejects for stronger reasons.

### 1.6 Unknown or invalid URLs

`stackForPath` returns `null` for a path that maps to no known view.
The recovery is **NotFound pushed onto the Home tab** — `{ activeTab: 'home',
stacks: { home: [homeRoot, notFound] } }` — rather than replacing the shell as
today. The tab bar stays, Back reaches Home, and the learner is never in a
dead end.

### 1.7 The invariants (property tests, not prose)

These are the tests that keep the three representations from drifting:

1. `urlForState(s)` is always a path `pathToView`/`storyRoute` recognises.
2. For every reachable `s`: `stackForPath(urlForState(s))` equals `s` restricted
   to its visible branch — same `activeTab`, same visible stack, same overlay.
   (Scroll offsets and invisible tabs are exempt by construction.)
3. `pop(push(s, e)) === s` for every entry `e`.
4. No action produces `stacks[t] = []` — a root is never popped.
5. `selectTab(s, s.activeTab) === s` — re-selection is handled by §5, not by a
   spurious history push.

---

## 2 · Persistent tab lifecycle

Requirement: an inactive tab keeps its React state, but must not receive focus
or touches, must be ignored by assistive technology, must not animate, must not
play audio, and must not do background work. And it must not be conditionally
rendered — unmounting is the bug we are removing.

### 2.1 The primitive: `<Activity>`

React 19.2 ships `React.Activity` as a stable export (verified: `react@19.2.7`
exports `Activity`; `react-dom` implements `disappearLayoutEffects` /
`reappearLayoutEffects` / `disconnectPassiveEffect` / `reconnectPassiveEffects`).

```jsx
<Activity mode={activeTab === 'stories' ? 'visible' : 'hidden'}>
  <StoriesRoot />
</Activity>
```

Hidden mode **preserves component state and DOM** while **tearing down effects**.
That single property satisfies every clause of the requirement:

| Requirement | How `mode="hidden"` satisfies it |
|---|---|
| State preserved | Fibers and hook state are retained; this is the whole point of the API |
| No focus / no touches | React applies `display: none`; the subtree is not hit-testable and not focusable |
| Ignored by accessibility | `display: none` removes the subtree from the accessibility tree |
| No animations | CSS animations and transitions do not run inside a `display: none` subtree |
| No audio/video | Effect cleanup runs on hide — `useStudyAudio`'s teardown pauses playback |
| No background work | Every `useEffect` cleanup runs: timers cleared, listeners removed, subscriptions closed |

It is explicitly **not** conditional rendering: the component is never unmounted
and never loses state.

### 2.2 Consequences we must design around

- **Effects re-run on show.** A `useEffect(… , [])` that fetches will fire again
  every time the tab becomes visible. This is precisely why data must not live
  in mount effects — see §3. The two requirements are one design.
- **`display: none` resets inner scroll offsets.** We store `scrollTop` on the
  stack entry ourselves (§6), so this is already handled and not a regression.
- **In-flight requests must abort on hide** and their results must still land in
  the cache. The cache is module-level, so a resolved fetch writes safely even
  though the component that started it has had its effects torn down.

### 2.3 Lazy first mount

A tab root is not rendered at all until the tab is first selected. After that it
stays mounted for the app run. So a learner who never opens Practice never pays
for it, and one who opens it once pays once.

```jsx
{mountedTabs.has('practice') && (
  <Activity mode={activeTab === 'practice' ? 'visible' : 'hidden'}>…</Activity>
)}
```

`mountedTabs` only ever grows.

### 2.4 Fallback if `Activity` misbehaves

If device testing shows a problem, the fallback is a `display: none` wrapper
plus a `TabVisibleContext` that audio/timer hooks consume to pause themselves.
It is strictly worse — effects keep running and every such hook must opt in —
so it is a contingency, not a plan. **The first implementation task is a spec
that proves `Activity`'s hide/show semantics**, before anything is built on it.

---

## 3 · Data freshness

"Fetch once per app run" is not the architecture. The architecture is: **cache
the data, keep the screen, and invalidate on events that actually change it.**

### 3.1 The cache

`src/dataCache.js` — module-level, deliberately not React state:

```js
Entry = { value, fetchedAt, invalidatedAt, promise }

get(key) · set(key, value) · invalidate(keyOrPrefix) · subscribe(key, fn)
```

`src/useCachedQuery.js`:

```js
useCachedQuery(key, fetcher, { staleMs })
```

On mount **or remount** (including an `Activity` show):

1. Cache hit and `fetchedAt > invalidatedAt` and not older than `staleMs`
   → return the value synchronously. **No fetch, no spinner, no flash.**
2. Cache hit but invalidated or stale → return the cached value *and* revalidate
   in the background (stale-while-revalidate). The screen never blanks.
3. Cache miss → fetch, with the screen's existing skeleton/loading state.

A plain tab switch with nothing invalidated therefore performs **zero** network
work, which is the requirement.

### 3.2 Keys

| Key | Holds |
|---|---|
| `home:identity` | the profile + active track (`loadProfile`'s pair) — **shipped** |
| `home:counts` | `getHomeCounts` — due/new/learning, goal, rhythm, forecast — **shipped** |
| `home:handoff` | the story hand-off: the reward teaser, or the daily card — **shipped** |
| `stories:shelf` | the shelf query set — **shipped** |
| `stories:series:<key>` | one series' chapters + progress |
| `practice:plan` | weak/grammar counts behind the hub |
| `progress:stats` | Profile's learned/mastered/achievements |
| `words:list`, `dict:*` | reference data — long-lived, event-invalidated only |

### 3.3 Invalidation is event-driven

`src/cacheEvents.js` publishes domain events; a single table maps them to keys.
Screens publish; they never reach into another screen's cache. An event names a
key **only if it can change that key's value** — that is the whole rule, and it
is what stops a graded card costing a profile fetch.

| Event | Published by | Invalidates |
|---|---|---|
| `card:graded` | `Study.jsx` `applyGrade` | `home:counts` |
| `session:completed` | `Study.jsx` on recap | `home:counts`, `home:handoff`, `stories:` |
| `chapter:unlocked` | `Stories.jsx` claim sites | `home:handoff`, `stories:` |
| `story:read` | `Stories.jsx` `handleMarkRead` | `home:handoff`, `stories:` |
| `level:unlocked` | `Test.jsx` on a pass | `home:identity`, `home:counts`, `home:handoff`, `stories:` |
| `profile:updated` | `Settings.jsx` `savePref` | `home:identity`, `home:counts` |
| `words:changed` | deck add / reset | `home:counts` |

**`language:switched` is deliberately not an event.** Every key is namespaced by
language, so a switch reads an empty namespace and switching back finds the
previous language still valid. Publishing for it would throw away correct data.

Two publishers immediately **re-validate their own key** after publishing
(`writeCache(STORIES_CACHE_KEY, true)`): the chapter-claim and mark-read
handlers in `StoriesDataProvider` have already applied the change to the data
every Stories screen reads, so reloading the shelf would be pure cost — and it
would tear down the finish overlay the learner is looking at.

Counts carry the one clock in the system: `HOME_COUNTS_STALE_MS` (10 minutes)
plus a local-midnight rollover, in `homeData.js`. Cards fall due while the app
sits open and no event fires when they do. This is the surviving half of the
deleted `homeRefresh.js` — the half that was about data rather than about which
route the learner arrived from.

### 3.4 The scenario that must work

> A learner unlocks a chapter in Cards and switches to an already-mounted
> Stories tab.

1. `SessionRecap` renders the unlock → `chapter:unlocked` is published.
2. `stories:shelf` and `home:reward` get `invalidatedAt = now`. Stories is
   hidden; nothing fetches, nothing renders.
3. The learner taps Stories. `Activity` switches to `visible`; effects re-run.
4. `useCachedQuery('stories:shelf')` sees `invalidatedAt > fetchedAt` → returns
   the **cached shelf immediately** (no spinner, no layout jump) and revalidates.
5. The revalidated shelf arrives; the new chapter appears in place.

The learner sees the shelf instantly and the unlock lands a moment later,
instead of either a stale shelf forever or a full reload on every tab tap.

### 3.5 Resume from background — **shipped**

`appResume.js` decides, `useAppResume.js` listens. Time is the one thing that
changes data with nobody to publish an event about it (§3.3), which is the whole
reason this exists — and why it is **not** "refetch on resume": a resume is a
moment to ask the question, not an answer to it.

- **Local calendar day changed** while the app was away → invalidate
  `home:counts` **and** `home:handoff`. Reviews are day-based (CLAUDE.md §4), and
  the reward claim is keyed on today's date, so a midnight crossing changes both.
- **Else away at least `HOME_COUNTS_STALE_MS`** (10 minutes, the same constant
  the arrival check uses) → `home:counts` alone.
- **Anything shorter → nothing.** Glancing at a notification must be free.
- **Content caches are never invalidated on resume.** The story library does not
  change because a phone was in a pocket, so `stories:` is outside this file's
  reach by construction.

**One platform's events, never both.** A WKWebView fires `visibilitychange` as
well as `appStateChange`, so listening to both would run every resume twice;
`isNativeApp()` picks the authoritative one and the web path carries no
Capacitor import at all. Home subscribes to `home:handoff` so an invalidation
that lands *while Home is the screen being looked at* — which is exactly the
overnight case — actually re-runs its query instead of only being marked.

### 3.6 What stays as it is

The in-memory optimistic patches already in the app — `onProfileUpdate`,
`onStreakUpdate` — stay. They are correct, they are instant, and the cache layer
sits underneath them rather than replacing them.

---

## 4 · Deep-link seeding

`routes.js` gains a `PARENT` map and `stackForPath()`. `stackForPath` walks
parents up to a tab root, so Back always reaches something real.

```
PARENT = {
  words: 'practice',      known: 'practice',    dictionary: 'practice',
  analyzer: 'practice',   grammar: 'practice',  youtube: 'practice',
  listen: 'practice',
  settings: 'profile',    languages: 'profile',
  'stories/series': 'stories',
}
```

This map **is** the migration path for the 26 hardcoded back targets (§7).

---

## 5 · Behaviour rules

### 5.1 Tab re-selection

Tapping the active tab, in order: dismiss the overlay → else pop the stack to
its root → else smooth-scroll the root to the top.

**Exception — Cards mid-session: do nothing.** Resetting a session because
someone re-tapped the tab bar is the worst available outcome.

### 5.2 Android hardware back

Replaces `backAction(pathname, canGoBack)`. Same pure, tested shape; the inputs
become the nav state:

1. A sheet or dialog is open → close it. *(Today the More sheet ignores Back.)*
2. An overlay is open → dismiss it. **A session exits and keeps its progress** —
   graded cards are already persisted, so there is nothing to confirm.
3. Stack depth > 1 → pop.
4. Not on the Home tab → switch to the Home tab.
5. Home tab at its root → exit the app.

### 5.3 iOS swipe-back

A left-edge pan (24px zone; commit past 35% of width or on velocity) that drives
the **same `pop()`**. Eligible only where a pop is meaningful: pushed detail, and
dismissible overlays. Never in the flashcard session or the reader.

`allowsBackForwardNavigationGestures` stays **off**. The gesture never touches
browser history — it calls the reducer, like every other navigation.

### 5.4 Transitions

Motion is a property of the **transition**, not of the screen: the difference
between two NavStates says whether something was pushed, popped, presented,
dismissed, or whether the learner simply changed tab. `navMotion.js` names it
and returns one plan; `useNavMotion.js` runs it. **One animation, on one
element, per navigation** — no screen animates itself in.

| Transition | What moves (shipped) |
|---|---|
| Tab switch | opacity 0.62 → 1, 150ms. Deliberately **no** translation: tabs are peers, and sliding them would claim an order between them that does not exist |
| Push | the arriving screen: 18px from the trailing edge + fade, 240ms |
| Pop | the arriving screen: 14px from the leading edge + fade, 220ms — the push in reverse |
| Present (fullscreen flow) | 20px rise + fade, 280ms. Distinct from a push, because it is not one |
| Dismiss | the shell returns: opacity 0.55 → 1, 180ms, nothing travels |
| Sheet | existing `hd-sheet-up`, 280ms, with a scrim fade — component-owned, unchanged |

**Only the entering layer animates.** The layer being left is already gone by
the time we could animate it: a tab root is behind `display: none` (`Activity`)
and a pushed screen is unmounted. The parallaxing parent this section used to
specify would mean keeping both alive and stacking them, which turns every
pushed screen into an absolutely-positioned scroller — a layout change on every
screen for a 240ms effect.

**The View Transitions API is the right way to get the outgoing half, and it is
not safe here yet.** It needs the DOM update inside its callback, i.e.
`flushSync`. That is fine on the forward path (always an event handler) but not
on the way back: a POP arrives as a location change and is adopted in an effect,
where `flushSync` warns and de-opts. Back and forward looking different is worse
than both looking simple, so the outgoing half is recorded in `docs/BACKLOG.md`
rather than half-done.

**Tab panes are never transformed.** A transform makes an element the containing
block for `position: fixed` descendants, and the story reader is built out of
fixed bars. Opacity does not (it creates a stacking context, not a containing
block), so the two pane-side transitions are opacity-only by construction, and
`NO_TRANSFORM_VIEWS` keeps the reader out of the transform path wherever it is
presented.

`prefers-reduced-motion` is checked **in JavaScript**, and the answer is no
animation at all rather than a shortened one. The `index.css` catch-all cannot
help here: it sets `animation-duration`, which has no effect on a Web Animations
animation.

### 5.5 Web

Unchanged in kind. Browser Back fires router `POP` → the same reducer path.
Desktop keeps the sidebar, which now switches tabs. No swipe gesture
(`isNativeApp()` is false). Every URL keeps its current path, so links,
bookmarks and e2e selectors are unaffected.

---

## 6 · Scroll and state preservation

- `<main>` becomes the scroll container (`overflow-y: auto; min-height: 0`).
  This is the Phase 1 note coming due: once it lands,
  `:root[data-native] { overflow: hidden }` becomes safe and document-level
  rubber-banding disappears entirely.
- Each stack entry stores `scrollTop`, captured on push and on tab switch,
  restored on pop and on tab return.
- `key={view}` comes off `ErrorBoundary`; boundaries move to per-stack-entry, so
  a screen that throws degrades without taking the shell down — the property the
  current key was protecting.

---

## 7 · Migrating the 26 hardcoded back targets

Screens do not change. They still receive `onBack` and still just call it.

```js
// today, in App.jsx, 26 times over
onBack={() => navigate('practice')}

// after
onBack={nav.pop}
```

The literal destinations become the `PARENT` map (§4), consulted only when a
deep link left the stack at depth 1. Twenty-six closures collapse into one
tested table.

---

## 8 · Complete classification

Five classes. Each class fixes tab-bar visibility, app-bar/back affordance,
transition, Android Back result and swipe-back eligibility; the per-view table
then only needs its class, owning tab, deep-link seed, and any exception.

### 8.1 Class defaults

| Class | Tab bar | App bar / back | Transition | Android Back | Swipe-back |
|---|---|---|---|---|---|
| **A · Tab root** | visible | title + avatar; no back | cross-fade | §5.2 steps 4-5 | no |
| **B · Pushed detail** | visible | back chevron + title | slide from trailing edge | pop | **yes** |
| **C · Fullscreen flow** | **hidden** | leading X (close) | slide up | dismiss | no |
| **D · Sheet / modal** | covered by scrim | grab handle, no app bar | sheet-up + scrim | close sheet | no (swipe **down**) |
| **E · External / non-shell** | none (no shell) | own chrome | none | per screen | no |

### 8.2 The 28 known views

| View | Class | Owning tab | Deep-link seed | Notes |
|---|---|---|---|---|
| `home` | A | Home | `home:[home]` | |
| `study` | A | Cards | `study:[study]` | **Exception:** tab bar hides while a card is on screen; returns on the recap |
| `stories` | A | Stories | `stories:[stories]` | |
| `practice` | A | Practice | `practice:[practice]` | |
| `words` | B | Practice | `practice:[practice, words]` | |
| `known` | B | Practice | `practice:[practice, known]` | |
| `dictionary` | B | Practice | `practice:[practice, dictionary]` | |
| `analyzer` | B | Practice | `practice:[practice, analyzer]` | |
| `grammar` | B | Practice | `practice:[practice, grammar]` | |
| `youtube` | B | Practice | `practice:[practice, youtube]` | |
| `listen` | B | Practice | `practice:[practice, listen]` | |
| `weak` | C | Cards | `study:[study]` + overlay `[weak]` | Presented, not the Cards root, so it cannot clobber the preserved session |
| `test` | C | Practice | `practice:[practice]` + overlay `[test]` | |
| `writing` | C | Practice | `practice:[practice]` + overlay `[writing]` | |
| `speak` | C | Practice | `practice:[practice]` + overlay `[speak]` | |
| `fillblank` | C | Practice | `practice:[practice]` + overlay `[fillblank]` | **Exception:** when launched from a story reward, `originTab` is Stories and dismiss returns there |
| `builder` | C | Practice | `practice:[practice]` + overlay `[builder]` | |
| `tones` | C | Practice | `practice:[practice]` + overlay `[tones]` | |
| `strokes` | C | Practice | `practice:[practice]` + overlay `[strokes]` | |
| `grammarpractice` | C | Practice | `practice:[practice]` + overlay `[grammarpractice]` | |
| `kana` | C | Practice | `practice:[practice]` + overlay `[kana]` | |
| `cyrillic` | C | Practice | `practice:[practice]` + overlay `[cyrillic]` | |
| `profile` | C | — (avatar) | overlay `account:[profile]` | Opened from the avatar; dismiss returns to `originTab` |
| `settings` | C | — (avatar) | overlay `account:[profile, settings]` | **Exception:** pushed *within* the account overlay, so it shows a back chevron to Profile, not an X |
| `languages` | C | — (avatar) | overlay `account:[profile, languages]` | Same exception as `settings` |
| `hq` | C | — (admin) | overlay `[hq]` | Admin-gated in `App.jsx`; non-admin gets §1.6 NotFound |
| `dashboard` | C | — (admin) | overlay `[dashboard]` | Same gating |
| `dev` | C | — (admin) | overlay `[dev]` | Same gating |

### 8.3 Non-view routes

| Route | Class | Owning tab | Deep-link seed | Notes |
|---|---|---|---|---|
| `/stories/series/:key` | B | Stories | `stories:[stories, series]` | |
| `/stories/:id` | C | Stories | `stories:[stories]` + overlay `[reader]` | No swipe-back: an accidental edge swipe mid-chapter is worse than no gesture |
| `/read/:id` | E | — | replaces the shell | Public; signed-in visitors are redirected into the reader as today |
| `/reset-password` | E | — | replaces the shell | |
| `/privacy` `/terms` `/support` `/methodology` | E | — | replaces the shell | Must stay reachable signed-out |
| `/how-much-can-you-read` | E | — | replaces the shell | |
| Landing · Auth · Onboarding · FirstMissionWelcome · PlacementTest | E | — | replaces the shell | Pre-account flows; the shell does not exist yet |
| More menu · WordLookupSheet · DictEntryView | D | current | not URL-addressable | Closed by Back before anything else (§5.2 step 1) |

---

## 9 · Risks

1. **`Activity` is new.** Verified present in `react@19.2.7`, but its hide/show
   semantics get a dedicated spec before anything is built on it (§2.4).
2. **Four live roots cost memory**, Stories most of all. `display: none` removes
   paint and layout cost but not DOM.
3. **`Study` stays mounted, and its audio will not stop on its own.** Verified:
   `useStudyAudio.js` has **no effect cleanup whatsoever** — both `useEffect`s
   (lines 67 and 76) return nothing, and the `<audio>` element lives in a ref
   that outlives them. `Activity` runs cleanups on hide, so with none to run,
   a clip playing when the learner switches to Stories would keep playing from
   a hidden tab. This is a prerequisite fix, not a follow-up: `useStudyAudio`
   gains a cleanup that pauses the element and releases its object URL, landing
   in commit 2 alongside the shell.
4. **27 Playwright specs assume screens unmount.** `display: none` should keep
   selectors unique (it removes hidden roots from the accessibility tree), but
   this is the likeliest source of e2e churn and gets verified first, not last.

## 10 · Delivery order

Three commits, each independently reviewable:

1. **`navStack.js` + `navLedger.js` + `dataCache.js` and their specs.** Pure
   modules, wired to nothing. No behaviour change.
2. **The shell renders from the state.** `App.jsx` restructured, `Activity`
   roots, per-entry error boundaries, scroll preservation, `PARENT`-driven
   `onBack`. Behaviour changes; transitions do not exist yet.
3. **Motion and gestures.** Push/pop transitions, the edge-swipe, tab
   cross-fade, reduced-motion parity.
