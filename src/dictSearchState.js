// Pure state machine for the full-dictionary search box.
//
// Four defects lived in the inline version of this logic, and every one of them
// reads on screen as "the dictionary feels buggy":
//
//  1. STALE RESPONSE. A slow request could resolve after a newer one and
//     repaint the list with results for a query the learner had already typed
//     past. Responses now carry the term they were fetched for and are dropped
//     unless they answer the search that is still outstanding.
//  2. BLANKING. Every keystroke replaced the whole list with "Loading…", so
//     typing a five-letter word flashed the screen five times. Results now stay
//     put until their replacement arrives ('refreshing').
//  3. "NO RESULTS" FLASH. The loading flag was raised in an effect (which runs
//     after paint) while the empty-list check ran during render, so "No words
//     match" appeared for a frame before the request had even been sent. The
//     view is derived from the term the rows actually belong to, so a query
//     with no answer yet can never render as "no results".
//  4. SILENT FAILURE. An RPC error rejected unhandled and left the previous
//     query's rows sitting underneath the new query, with no way to tell. A
//     failure now lands in its own retryable state.
//
// The reducer keeps two terms: `term` is the query the current `rows` answer,
// `pendingTerm` is the query still in flight. Everything the screen renders is
// derived from those, which is why the flashes are gone — there is no separate
// boolean that can disagree with the data.

export const IDLE = 'idle'
export const SEARCHING = 'searching'
export const READY = 'ready'
export const FAILED = 'failed'

export const initialDictSearch = {
  term: '',          // the query `rows` are the answer to ('' = none yet)
  pendingTerm: '',   // the query currently in flight ('' = nothing outstanding)
  rows: [],
  status: IDLE,
  error: null,
}

export function dictSearchReducer(state, action) {
  const s = state || initialDictSearch
  switch (action && action.type) {
    case 'request': {
      const term = String(action.term || '').trim()
      // Clearing the box drops everything — including a failure, which must not
      // outlive the query that caused it.
      if (!term) return initialDictSearch
      // Already asking this exact question; don't restart the spinner.
      if (term === s.pendingTerm) return s
      // Keep `rows`/`term` so the previous answer stays on screen while we wait.
      return { ...s, pendingTerm: term, status: SEARCHING, error: null }
    }
    case 'resolve': {
      const term = String(action.term || '')
      if (!term || term !== s.pendingTerm) return s   // stale response — ignore
      return {
        term,
        pendingTerm: '',
        rows: Array.isArray(action.rows) ? action.rows : [],
        status: READY,
        error: null,
      }
    }
    case 'reject': {
      const term = String(action.term || '')
      if (!term || term !== s.pendingTerm) return s   // stale failure — ignore
      return {
        term,
        pendingTerm: '',
        rows: [],
        status: FAILED,
        error: action.error || 'Search failed.',
      }
    }
    case 'reset':
      return initialDictSearch
    default:
      return s
  }
}

// What the screen should draw, derived from the machine plus the *live* input
// value — deriving from the input (rather than a flag set in an effect) is what
// removes the one-frame "No words match" flash on every keystroke.
//
// mode:
//   'idle'       — empty box; show Recent / the invitation copy
//   'loading'    — first search, nothing to keep on screen
//   'refreshing' — a newer search is out, previous rows still shown
//   'results'    — rows answer the current query
//   'empty'      — the current query genuinely has no matches
//   'error'      — the current query failed; offer a retry
//   'offline'    — no connection, and no fresh answer to show
export function dictSearchView(state, rawQuery, online = true) {
  const s = state || initialDictSearch
  const term = String(rawQuery || '').trim()
  const rows = Array.isArray(s.rows) ? s.rows : []
  if (!term) return { term, mode: 'idle', rows: [], error: null }

  // `rows` are a final answer only when they were fetched for this exact term
  // AND nothing newer is outstanding for it (a retry re-asks the same term, and
  // must not fall back through to "no matches" while it waits).
  const answered = term === s.term
  const inFlight = Boolean(s.pendingTerm) && s.pendingTerm === term
  if (answered && !inFlight) {
    if (s.status === FAILED) return { term, mode: 'error', rows: [], error: s.error }
    return { term, mode: rows.length === 0 ? 'empty' : 'results', rows, error: null }
  }
  if (!online) return { term, mode: 'offline', rows: [], error: null }
  return { term, mode: rows.length === 0 ? 'loading' : 'refreshing', rows, error: null }
}
