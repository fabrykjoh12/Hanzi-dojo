// A small bounded-concurrency map.
//
// Always settles rather than rejecting on the first failure: a batch of 200
// clips where clip 3 has bad text should still generate the other 199. Callers
// inspect the per-item result and decide what to retry.
//
// Results come back in INPUT order regardless of completion order, so a summary
// lines up with the list the operator passed in.

import { TtsCancelledError } from './errors.js'

export async function mapWithConcurrency(items, limit, worker, { signal = null, onProgress = null } = {}) {
  const list = Array.from(items || [])
  const width = Math.max(1, Math.min(Number(limit) || 1, list.length || 1))
  const results = new Array(list.length)
  let cursor = 0
  let completed = 0

  async function runOne() {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= list.length) return
      const item = list[index]
      if (signal && signal.aborted) {
        results[index] = { ok: false, index, item, value: null, error: new TtsCancelledError() }
      } else {
        try {
          results[index] = { ok: true, index, item, value: await worker(item, index), error: null }
        } catch (error) {
          results[index] = { ok: false, index, item, value: null, error }
        }
      }
      completed += 1
      if (onProgress) onProgress({ completed, total: list.length, result: results[index] })
    }
  }

  const workers = []
  for (let i = 0; i < width; i += 1) workers.push(runOne())
  await Promise.all(workers)
  return results
}
