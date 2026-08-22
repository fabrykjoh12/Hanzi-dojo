// A fake Supabase client whose server enforces PostgREST's max-rows cap.
//
// The paging specs need an opponent that behaves like production: every
// response is silently truncated to `maxRows` (1000 on Supabase) no matter
// what the query asked for, and `.range()` windows are served *within* that
// cap. Tests build one of these over an in-memory dataset and hand it to the
// code under test; a query that forgets to page comes back capped, exactly as
// it does against the real backend, so the spec fails against an unpaged
// implementation and passes against a paged one.
//
// Test-only: imported exclusively from *.test.js files, never bundled.
//
// Supported surface (what the modules under test actually use):
//   from(table).select(cols[, opts]) with one embedded relation
//   ('vocabulary!inner(id, level)' — !inner drops rows with no match),
//   .eq/.gte/.lte/.lt (incl. referenced 'vocabulary.level' columns),
//   .in, .not(col, 'is', null), .is, .or('a.lte.4,b.is.null',
//   { referencedTable }), .order (multi-key, referenced keys ignored),
//   .range, .limit, .maybeSingle/.single, count:'exact' + head:true,
//   and awaiting the builder directly (thenable).

// Which local column joins a table to an embedded relation. Only the joins the
// app actually queries need to exist here.
const RELATIONS = {
  cards: { vocabulary: { local: 'vocab_id', foreign: 'id' } },
  review_logs: { vocabulary: { local: 'vocab_id', foreign: 'id' } },
}

function get(row, col, embedName) {
  if (embedName && col.startsWith(embedName + '.')) {
    const rel = row[embedName]
    return rel ? rel[col.slice(embedName.length + 1)] : undefined
  }
  return row[col]
}

function matches(row, f, embedName) {
  if (f.op === 'or') return f.branches.some(b => matches(row, b, embedName))
  const v = get(row, f.col, embedName)
  if (f.op === 'eq') return v === f.value
  if (f.op === 'gte') return v != null && v >= f.value
  if (f.op === 'lte') return v != null && v <= f.value
  if (f.op === 'lt') return v != null && v < f.value
  if (f.op === 'in') return f.value.includes(v)
  if (f.op === 'is-null') return v == null
  if (f.op === 'not-is-null') return v != null
  return true
}

// One '.or()' branch, e.g. 'level.lte.4' or 'level.is.null'. Values arrive as
// strings inside the expression, so numbers are coerced the way PostgREST does.
function parseOrBranch(expr, referencedTable) {
  const [col, op, ...rest] = expr.split('.')
  const raw = rest.join('.')
  const qualified = referencedTable ? referencedTable + '.' + col : col
  if (op === 'is' && raw === 'null') return { op: 'is-null', col: qualified }
  const num = Number(raw)
  return { op, col: qualified, value: Number.isNaN(num) ? raw : num }
}

export function fakeSupabase(tables, { maxRows = 1000 } = {}) {
  const client = {
    // Every resolved request, for asserting how many round trips were made.
    requests: [],
    from(table) {
      const q = {
        filters: [],
        orders: [],
        window: null,
        limitTo: null,
        single: false,
        head: false,
        count: null,
        embedName: null,
        embedInner: false,
      }
      const builder = {
        select(cols, opts) {
          const m = /(\w+)(!inner)?\(/.exec(cols || '')
          if (m) {
            q.embedName = m[1]
            q.embedInner = Boolean(m[2])
          }
          if (opts && opts.count) q.count = opts.count
          if (opts && opts.head) q.head = true
          return builder
        },
        eq: (col, value) => { q.filters.push({ op: 'eq', col, value }); return builder },
        gte: (col, value) => { q.filters.push({ op: 'gte', col, value }); return builder },
        lte: (col, value) => { q.filters.push({ op: 'lte', col, value }); return builder },
        lt: (col, value) => { q.filters.push({ op: 'lt', col, value }); return builder },
        in: (col, value) => { q.filters.push({ op: 'in', col, value: [...value] }); return builder },
        is: (col, value) => {
          q.filters.push(value === null ? { op: 'is-null', col } : { op: 'eq', col, value })
          return builder
        },
        not: (col, op, value) => {
          if (op === 'is' && value === null) q.filters.push({ op: 'not-is-null', col })
          return builder
        },
        or: (expr, opts) => {
          const referencedTable = opts && opts.referencedTable
          q.filters.push({ op: 'or', branches: expr.split(',').map(b => parseOrBranch(b, referencedTable)) })
          return builder
        },
        order: (col, opts) => {
          q.orders.push({ col, ascending: !opts || opts.ascending !== false })
          return builder
        },
        range: (from, to) => { q.window = { from, to }; return builder },
        limit: (n) => { q.limitTo = n; return builder },
        maybeSingle: () => { q.single = true; return resolve() },
        single: () => { q.single = true; return resolve() },
        then: (onFulfilled, onRejected) => resolve().then(onFulfilled, onRejected),
        catch: (onRejected) => resolve().catch(onRejected),
      }

      function resolve() {
        return Promise.resolve().then(() => {
          let rows = (tables[table] || []).slice()

          if (q.embedName) {
            const rel = (RELATIONS[table] || {})[q.embedName]
            const refRows = tables[q.embedName] || []
            const byKey = new Map(refRows.map(r => [r[rel.foreign], r]))
            rows = rows
              .map(r => ({ ...r, [q.embedName]: byKey.get(r[rel.local]) || null }))
              .filter(r => !q.embedInner || r[q.embedName] != null)
          }

          for (const f of q.filters) rows = rows.filter(r => matches(r, f, q.embedName))

          const total = rows.length

          if (q.orders.length) {
            rows.sort((a, b) => {
              for (const o of q.orders) {
                const av = get(a, o.col, q.embedName)
                const bv = get(b, o.col, q.embedName)
                if (av === bv) continue
                const cmp = av < bv ? -1 : 1
                return o.ascending ? cmp : -cmp
              }
              return 0
            })
          }

          if (q.window) rows = rows.slice(q.window.from, q.window.to + 1)
          if (q.limitTo != null) rows = rows.slice(0, q.limitTo)
          // The server's cap, applied to the response AFTER the requested
          // window — this is the truncation the paging fix must survive.
          rows = rows.slice(0, maxRows)

          client.requests.push({ table, rows: rows.length })

          if (q.head) return { data: null, error: null, count: q.count ? total : null }
          if (q.single) return { data: rows[0] ?? null, error: null }
          return { data: rows, error: null, count: q.count ? total : null }
        })
      }

      return builder
    },
  }
  return client
}

// Realistic per-level vocabulary rows matching the live HSK 3.0 curriculum
// sizes, so specs exercise the exact datasets that overflow the cap.
export const HSK_LEVEL_SIZES = { 1: 300, 2: 197, 3: 453, 4: 929, 5: 1495, 6: 1621 }

export function hskVocabRows(levels, { language = 'chinese', system = 'hsk_3' } = {}) {
  const rows = []
  for (const level of levels) {
    const count = HSK_LEVEL_SIZES[level]
    for (let i = 0; i < count; i += 1) {
      rows.push({
        id: 'v' + level + '-' + String(i).padStart(4, '0'),
        word: '词' + level + '_' + i,
        level,
        sort_order: i,
        language,
        system,
        is_active: true,
      })
    }
  }
  return rows
}
