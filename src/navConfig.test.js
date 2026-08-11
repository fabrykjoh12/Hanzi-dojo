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
  it('reads Practice · Home · Cards · Stories, then More', () => {
    expect(MOBILE_PRIMARY.map(i => i.label)).toEqual(['Practice', 'Home', 'Cards', 'Stories'])
    // "More" is not in the array — MobileNav appends it — so the bar is five
    // columns and Cards is index 2 of five: the physical centre.
    expect(MOBILE_PRIMARY.length + 1).toBe(5)
    expect(MOBILE_PRIMARY.findIndex(i => i.key === 'study')).toBe(2)
  })

  it('keeps the daily loop contiguous in the middle', () => {
    // Home → Cards → Stories: open the app, review, read. The two drawers sit
    // outside it, which is the whole point of the ordering.
    expect(MOBILE_PRIMARY.slice(1).map(i => i.key)).toEqual(['home', 'study', 'stories'])
    expect(MOBILE_PRIMARY[0].key).toBe('practice')
  })

  it('spells every label out — nothing abbreviated to fit a 320px phone', () => {
    for (const item of MOBILE_PRIMARY) {
      expect(item.label.length, item.key).toBeGreaterThan(3)
      expect(item.label, item.key).not.toContain('.')
    }
  })
})

describe('position is not routing', () => {
  it('still launches on Home, which is no longer the first column', () => {
    expect(initialNavState().activeTab).toBe('home')
    expect(MOBILE_PRIMARY[0].key).not.toBe('home')
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
