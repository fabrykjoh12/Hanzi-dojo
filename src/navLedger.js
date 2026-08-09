// The bridge between the navigation model and the browser's history.
//
// history.state carries ONE integer — a navId — and this module holds the
// snapshots it keys. Serialising the stacks themselves into history was
// rejected deliberately (NAV-MODEL §1.2): two representations of the same
// truth is exactly the drift this whole model exists to remove, and it would
// also mean version-skew bugs the first time the state shape changed under a
// history entry written by an older deploy.
//
// Module scope on purpose, with two consequences that are both wanted:
//   - it survives a remount, because navigation is a property of the app run;
//   - it does NOT survive a reload, so every navId in the browser's history
//     becomes unknown — which is handled, not patched (see restoreForPop).

import { urlForState, stackForPath, normalizePath } from './navStack'

// Deep enough that ordinary back-stacks are always served from memory, small
// enough that a long session cannot grow without bound. Eviction is not an
// error path: it degrades to the same deterministic rebuild a reload uses.
export const LEDGER_LIMIT = 50

let nextId = 1
const ledger = new Map()

export function recordNavState(state) {
  const navId = nextId
  nextId += 1
  ledger.set(navId, state)
  // Map preserves insertion order, so the oldest key is the first one.
  while (ledger.size > LEDGER_LIMIT) {
    const oldest = ledger.keys().next().value
    ledger.delete(oldest)
  }
  return navId
}

export function readNavState(navId) {
  if (typeof navId !== 'number') return null
  const found = ledger.get(navId)
  return found === undefined ? null : found
}

export function ledgerSize() {
  return ledger.size
}

// What to do when the browser hands us a POP: browser Back, Android Back, or
// the iOS edge swipe once it is wired.
//
// A known navId is NOT sufficient on its own. History state is writable by
// anything on the page, survives a deploy that changed the state shape, and can
// simply be wrong; trusting it blindly would render one screen while the
// address bar claimed another. So the snapshot has to agree with the pathname
// it is being restored for, and a disagreement is treated exactly like a
// missing entry: rebuild from the URL, which is the one thing we know is true.
export function restoreForPop({ navId, pathname }) {
  const path = normalizePath(pathname)
  const snapshot = readNavState(navId)
  if (snapshot && urlForState(snapshot) === path) {
    return { state: snapshot, source: 'ledger' }
  }
  return { state: stackForPath(path), source: 'rebuilt' }
}

// Tests only — the ledger is process-wide by design.
export function resetLedger() {
  ledger.clear()
  nextId = 1
}
