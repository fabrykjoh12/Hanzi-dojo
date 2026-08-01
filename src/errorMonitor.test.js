import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { errorEventProps, reportClientError, _resetErrorMonitorForTests } from './errorMonitor'
import * as analytics from './analytics'

describe('errorEventProps', () => {
  it('shapes an Error into safe, truncated props', () => {
    const err = new TypeError('Cannot read properties of undefined (reading foo) with a very long tail')
    const p = errorEventProps(err, 'window', '/study')
    expect(p.error_name).toBe('TypeError')
    expect(p.source).toBe('window')
    expect(p.route).toBe('/study')
    expect(p.message.length).toBeLessThanOrEqual(40)
    expect(p.message.startsWith('Cannot read properties of undefined')).toBe(true)
  })

  it('never includes a stack, even though the error has one', () => {
    const err = new Error('boom')
    const p = errorEventProps(err, 'boundary', '/stories')
    expect(Object.keys(p).sort()).toEqual(['error_name', 'message', 'route', 'source'])
  })

  it('tolerates non-Error values (string rejections, null)', () => {
    expect(errorEventProps('string failure', 'promise', '/').message).toBe('string failure')
    expect(errorEventProps(null, 'promise', '/').error_name).toBe('Error')
    expect(errorEventProps(undefined, 'promise', undefined).route).toBe('/')
  })
})

describe('reportClientError', () => {
  beforeEach(() => { _resetErrorMonitorForTests() })
  afterEach(() => { vi.restoreAllMocks() })

  it('tracks a client_error event', () => {
    const spy = vi.spyOn(analytics, 'track').mockImplementation(() => {})
    reportClientError(new Error('x'), 'window')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe(analytics.EVENTS.CLIENT_ERROR)
  })

  it('caps reports per app-load so an error loop cannot flood the table', () => {
    const spy = vi.spyOn(analytics, 'track').mockImplementation(() => {})
    for (let i = 0; i < 20; i += 1) reportClientError(new Error('loop ' + i), 'window')
    expect(spy.mock.calls.length).toBeLessThanOrEqual(5)
  })

  it('never throws even if tracking does', () => {
    vi.spyOn(analytics, 'track').mockImplementation(() => { throw new Error('analytics down') })
    expect(() => reportClientError(new Error('x'), 'window')).not.toThrow()
  })
})
