// PostgREST caps a response at 1000 rows. A full HSK track is already past that
// (2,370 active Chinese words) and heads for ~5,100 once the curriculum is
// complete, so any query over a whole track MUST page or it silently returns a
// prefix and every count downstream is wrong.
//
// This bug was live: the level picker fetched all vocabulary in one call and
// showed "HSK 3 — 0/165" against a level that actually has 457 words. The six
// level counts added up to 998, which is the cap, not the curriculum.
//
// Each call must build a FRESH query — a Supabase builder is single-use, so the
// caller passes a thunk rather than a query object.
//
// MAX_PAGES is a backstop, not a limit anyone should reach: the loop normally
// ends on a short page, but a server whose `db-max-rows` is set below PAGE
// returns a full-looking page forever and would hang the tab. Reaching it
// throws rather than returning a truncated list — a silent half-answer here is
// exactly the failure this module exists to prevent.
export const PAGE = 1000
const MAX_PAGES = 100

export async function fetchPaged(build) {
  const out = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data || []
    for (const r of rows) out.push(r)
    if (rows.length < PAGE) return out
  }
  throw new Error('Read more than ' + MAX_PAGES * PAGE + ' rows without reaching the end — check the server row limit.')
}

// Same contract, but a failure yields what was read so far instead of throwing.
// For read-only display paths (counts, highlighting) where a partial list beats
// a blank screen. Never use it where a short read would be written back.
export async function fetchPagedSafe(build) {
  try {
    return await fetchPaged(build)
  } catch {
    return []
  }
}
