import { describe, it, expect } from 'vitest'
import { statusBarStyleFor, syncStatusBar, STATUS_BAR_STYLE } from './statusBar'

describe('statusBarStyleFor', () => {
  // The one that is easy to get backwards: Capacitor's "DARK" means
  // light-coloured text, which is what a DARK app background needs.
  it('asks for light icons when the app is dark', () => {
    expect(statusBarStyleFor('dark')).toBe('DARK')
  })

  it('asks for dark icons when the app is light', () => {
    expect(statusBarStyleFor('light')).toBe('LIGHT')
  })

  it('treats anything unknown as the light theme, matching the app default', () => {
    expect(statusBarStyleFor(undefined)).toBe('LIGHT')
    expect(statusBarStyleFor(null)).toBe('LIGHT')
    expect(statusBarStyleFor('sepia')).toBe('LIGHT')
  })

  it('never reaches for DEFAULT, which would follow the OS instead of the app', () => {
    expect(statusBarStyleFor('dark')).not.toBe(STATUS_BAR_STYLE.default)
    expect(statusBarStyleFor('light')).not.toBe(STATUS_BAR_STYLE.default)
  })
})

describe('syncStatusBar', () => {
  it('does nothing on the web and resolves false', async () => {
    await expect(syncStatusBar('dark', { native: false })).resolves.toBe(false)
  })

  it('resolves false rather than rejecting when the plugin is unavailable', async () => {
    await expect(syncStatusBar('dark', { native: true })).resolves.toBe(false)
  })
})
