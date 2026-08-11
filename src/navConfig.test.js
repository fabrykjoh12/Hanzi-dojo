import { describe, it, expect } from 'vitest'
import { PRIMARY_NAV, NAV_GROUPS, MOBILE_PRIMARY, MOBILE_MORE, ADMIN_NAV } from './navConfig'
import { TABS, VIEW_CLASS, initialNavState, androidBack } from './navStack'

// Dojo HQ is internal tooling — workspaces, invite codes, member management.
// It shipped inside PRIMARY_NAV, which put it in front of every learner. These
// pin it to the admin set so that can't happen again by accident.
describe('navigation config', () => {
  const learnerNav = [...PRIMARY_NAV, ...MOBILE_PRIMARY, ...MOBILE_MORE]

  it('never exposes Dojo HQ to a non-admin', () => {
    expect(learnerNav.map(i => i.key)).not.toContain('hq')
  })

  it('never exposes the admin dashboard to a non-admin', () => {
    expect(learnerNav.map(i => i.key)).not.toContain('dashboard')
  })

  it('keeps both admin surfaces reachable for an admin', () => {
    const adminKeys = ADMIN_NAV.map(i => i.key)
    expect(adminKeys).toContain('hq')
    expect(adminKeys).toContain('dashboard')
  })

  // The sidebar renders groups, not PRIMARY_NAV directly, so a new entry that
  // nobody adds to a group would silently vanish from the desktop menu.
  it('groups cover every primary nav key exactly once', () => {
    const grouped = NAV_GROUPS.flatMap(g => g.keys)
    expect([...grouped].sort()).toEqual(PRIMARY_NAV.map(i => i.key).sort())
  })

  it('every nav entry has a key, a label and an icon', () => {
    for (const item of [...learnerNav, ...ADMIN_NAV]) {
      expect(item.key, JSON.stringify(item)).toBeTruthy()
      expect(item.label, item.key).toBeTruthy()
      expect(item.icon, item.key).toBeTruthy()
    }
  })
})

// ── The bottom bar's order ────────────────────────────────────────────────
//
// It is a design decision with a consequence that is easy to get wrong: it
// looks like routing. It is not. These pin the two apart.

describe('the mobile bar', () => {
  it('reads Home · Stories · Cards · Practice, then More', () => {
    expect(MOBILE_PRIMARY.map(i => i.key)).toEqual(['home', 'stories', 'study', 'practice'])
    expect(MOBILE_PRIMARY.map(i => i.label)).toEqual(['Home', 'Stories', 'Cards', 'Practice'])
    // "More" is not in the array — MobileNav appends it — so the bar is five
    // columns and Cards is index 2 of five: the physical centre.
    expect(MOBILE_PRIMARY.length + 1).toBe(5)
    expect(MOBILE_PRIMARY.findIndex(i => i.key === 'study')).toBe(2)
  })

  it('keeps Cards in the centre through a reorder', () => {
    // The one fixed point. The first arrangement was
    // Practice · Home · Cards · Stories and this is the second; both put Cards
    // at index 2, because that is the part of the layout that is not in
    // question. If a future order moves it, that is a different decision and
    // this assertion is where it has to be made deliberately.
    expect(MOBILE_PRIMARY[2].key).toBe('study')
    const centre = (MOBILE_PRIMARY.length + 1 - 1) / 2
    expect(MOBILE_PRIMARY.findIndex(i => i.key === 'study')).toBe(centre)
  })

  it('starts the row on Home and ends the tabs on Practice', () => {
    // Home first because it is where the eye starts and where the app opens;
    // Stories beside Cards so the centre of the bar is the language itself;
    // Practice rightward, where a drawer of drills belongs.
    expect(MOBILE_PRIMARY[0].key).toBe('home')
    expect(MOBILE_PRIMARY[1].key).toBe('stories')
    expect(MOBILE_PRIMARY[3].key).toBe('practice')
  })

  it('spells every label out — nothing abbreviated to fit a 320px phone', () => {
    for (const item of MOBILE_PRIMARY) {
      expect(item.label.length, item.key).toBeGreaterThan(3)
      expect(item.label, item.key).not.toContain('.')
    }
  })
})

describe('position is not routing', () => {
  it('still launches on Home — which this order happens to put first, and that is a coincidence', () => {
    // It read Practice · Home · … for a build and Home was still the launch
    // tab; it reads Home · … now and Home is still the launch tab for exactly
    // the same reason. The two facts have never been connected and must not
    // become connected: `initialNavState` is the one that decides.
    expect(initialNavState().activeTab).toBe('home')
  })

  it('still climbs to Home on Back, from every other tab', () => {
    const state = initialNavState()
    for (const tab of TABS.filter(t => t !== 'home')) {
      expect(androidBack({ ...state, activeTab: tab })).toBe('home-tab')
    }
    expect(androidBack(state)).toBe('exit')
  })

  it('leaves route ownership exactly where it was', () => {
    // Reordering buttons must not move a single screen between tabs.
    expect(VIEW_CLASS.test.tab).toBe('practice')
    expect(VIEW_CLASS.weak.tab).toBe('study')
    expect(VIEW_CLASS.reader.tab).toBe('stories')
    expect(VIEW_CLASS.dictionary.tab).toBe('practice')
    // …and the tab set itself is untouched, in its own order.
    expect(TABS).toEqual(['home', 'study', 'stories', 'practice'])
  })

  it('describes the same four tabs the model knows about', () => {
    expect([...MOBILE_PRIMARY.map(i => i.key)].sort()).toEqual([...TABS].sort())
  })
})

describe('the sheet and the rail are unaffected', () => {
  it('leaves More as the account drawer', () => {
    expect(MOBILE_MORE.map(i => i.key)).toEqual(['profile', 'languages', 'settings', 'logout'])
  })

  it('keeps the desktop rail in its own order, with the level test beside Practice', () => {
    expect(PRIMARY_NAV.map(i => i.key)).toEqual(['home', 'study', 'stories', 'practice', 'test'])
  })
})
