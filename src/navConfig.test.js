import { describe, it, expect } from 'vitest'
import { PRIMARY_NAV, NAV_GROUPS, MOBILE_PRIMARY, PROFILE_NAV, ADMIN_NAV } from './navConfig'

// Dojo HQ is internal tooling — workspaces, invite codes, member management.
// It shipped inside PRIMARY_NAV, which put it in front of every learner. These
// pin it to the admin set so that can't happen again by accident.
describe('navigation config', () => {
  const learnerNav = [...PRIMARY_NAV, ...MOBILE_PRIMARY, ...PROFILE_NAV]

  it('locks the mobile architecture to Stories — Home — Practice', () => {
    expect(MOBILE_PRIMARY.map(i => i.key)).toEqual(['stories', 'home', 'practice'])
  })

  it('keeps Cards reachable outside the mobile tab bar', () => {
    expect(PRIMARY_NAV.map(i => i.key)).toContain('study')
    expect(MOBILE_PRIMARY.map(i => i.key)).not.toContain('study')
  })

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
