import { describe, it, expect } from 'vitest'
import { PRIMARY_NAV, BOTTOM_NAV, MOBILE_PRIMARY, MOBILE_MORE, ADMIN_NAV } from './navConfig'

// Dojo HQ is internal tooling — workspaces, invite codes, member management.
// It shipped inside PRIMARY_NAV, which put it in front of every learner. These
// pin it to the admin set so that can't happen again by accident.
describe('navigation config', () => {
  const learnerNav = [...PRIMARY_NAV, ...BOTTOM_NAV, ...MOBILE_PRIMARY, ...MOBILE_MORE]

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

  it('every nav entry has a key, a label and an icon', () => {
    for (const item of [...learnerNav, ...ADMIN_NAV]) {
      expect(item.key, JSON.stringify(item)).toBeTruthy()
      expect(item.label, item.key).toBeTruthy()
      expect(item.icon, item.key).toBeTruthy()
    }
  })
})
