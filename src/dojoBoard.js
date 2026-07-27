// Pure logic for the account-backed Dojo HQ board.
//
// Everything here is data in, data out: no React, no Supabase. The client
// (`dojoSupabaseClient.js`) does the talking; this module decides what a member
// row looks like, whether an error means "the migration hasn't been applied",
// what a board export contains, and which copy the board shows for the storage
// mode it is running in. That keeps the branching out of DojoHQ.jsx, which is
// already one of the three oversized screens CLAUDE.md §3 calls out.

// One board, shared by every admin account. There is deliberately no workspace
// or invite system — see supabase/migrations/20260727140000_add_dojo_hq.sql.
export const HQ_WORKSPACE_ID = 'admin-hq'
export const HQ_WORKSPACE_NAME = 'Hanzi Dojo HQ'

// The shape DojoHQ.jsx expects from its workspace query. invite_code stays null:
// membership is `profiles.is_admin`, not a code, so the invite UI stays hidden.
export function hqWorkspace(name = HQ_WORKSPACE_NAME) {
  return {
    id: HQ_WORKSPACE_ID,
    name: name || HQ_WORKSPACE_NAME,
    invite_code: null,
    owner_id: null,
    created_at: null,
    role: 'admin',
  }
}

// The board asks the members table for two different shapes, distinguished only
// by the embedded resource it selects. Read the selector, not the caller.
export function memberQueryKind(selector) {
  const text = String(selector || '')
  if (text.includes('workspace:')) return 'workspace'
  if (text.includes('profile:')) return 'profile'
  return 'plain'
}

// Real accounts, never the old `local-user` / `dojo-friend` seed identities:
// a display name if the admin set one, else the local part of their email
// (never the full address), else a neutral label.
export function memberDisplayName(row, fallback = 'Dojo-medlem') {
  const name = String(row?.display_name || '').trim()
  if (name) return name
  const email = String(row?.email || '')
  const localPart = email.split('@')[0].trim()
  if (localPart) return localPart
  return fallback
}

// Maps the `dojo_hq_members()` rows onto the member shape the UI reads
// (`member.user_id`, `member.profile.display_name`). The signed-in admin is
// always present and always first, so assigning work to yourself never depends
// on the round trip having landed.
export function toMemberRows(rows, options = {}) {
  const currentUserId = options.currentUserId || ''
  const currentUserName = String(options.currentUserName || '').trim()
  const seen = new Set()
  const members = []

  for (const row of Array.isArray(rows) ? rows : []) {
    const userId = row?.user_id || row?.id
    if (!userId || seen.has(userId)) continue
    seen.add(userId)
    const isCurrent = userId === currentUserId
    const displayName = isCurrent && currentUserName ? currentUserName : memberDisplayName(row)
    members.push({
      workspace_id: HQ_WORKSPACE_ID,
      user_id: userId,
      role: row.role || 'admin',
      joined_at: row.joined_at || null,
      display_name: displayName,
      profile: { display_name: displayName },
    })
  }

  if (currentUserId && !seen.has(currentUserId)) {
    const displayName = currentUserName || 'Deg'
    members.push({
      workspace_id: HQ_WORKSPACE_ID,
      user_id: currentUserId,
      role: 'admin',
      joined_at: null,
      display_name: displayName,
      profile: { display_name: displayName },
    })
  }

  return members.sort((a, b) => {
    if (a.user_id === currentUserId) return -1
    if (b.user_id === currentUserId) return 1
    return a.display_name.localeCompare(b.display_name, 'nb')
  })
}

// Who the board thinks you are. On the account-backed board that is the signed-in
// account — never the device identity the local/remote clients keep, and never
// the `local-user` seed. Everywhere else the device identity still wins.
export function boardIdentity(options = {}) {
  if (!options.accountBacked) {
    const device = options.deviceIdentity
    return {
      userId: device?.userId || '',
      displayName: device?.displayName || 'Dojo-medlem',
    }
  }
  const name = String(options.displayName || '').trim()
  const localPart = String(options.email || '').split('@')[0].trim()
  return {
    userId: options.userId || '',
    displayName: name || localPart || 'Deg',
  }
}

// "The Dojo HQ migration has not been applied yet" — PostgREST reports a missing
// table as PGRST205 / 42P01 and a missing function as PGRST202 / 42883. Anything
// else (offline, RLS, a real failure) is NOT a setup problem and must not be
// reported as one.
const SETUP_ERROR_CODES = ['42P01', '42883', 'PGRST202', 'PGRST205']
const SETUP_ERROR_NAMES = ['dojo_items', 'dojo_comments', 'dojo_attachments', 'dojo_hq_members']

export function isMissingSetupError(error) {
  if (!error) return false
  if (SETUP_ERROR_CODES.includes(String(error.code || ''))) return true
  const message = String(error.message || '').toLowerCase()
  if (!message.includes('not find') && !message.includes('does not exist')) return false
  return SETUP_ERROR_NAMES.some(name => message.includes(name))
}

// DojoHQ.jsx switches to its calm "database not connected yet" screen on 42P01 /
// PGRST205, so a missing *function* is normalised to the same shape rather than
// falling through to a generic "something went wrong" toast.
export function setupMissingError() {
  return {
    code: '42P01',
    message: 'Dojo HQ-tabellene finnes ikke i databasen ennå. Kjør migrasjonen 20260727140000_add_dojo_hq.sql.',
  }
}

// What "Last ned kopi" writes to disk: a plain, readable snapshot of the board
// as it was last loaded. Not a sync format — the database is the source of truth.
export function boardSnapshot(state = {}) {
  return {
    version: 1,
    source: 'supabase',
    exported_at: state.exportedAt || null,
    workspace: state.workspace || hqWorkspace(),
    members: state.members || [],
    items: state.items || [],
    comments: state.comments || [],
    attachments: state.attachments || [],
  }
}

// The board runs against three different storage backends and used to describe
// all of them with one `online ? … : …` ternary per string, which meant the
// account-backed mode would have claimed to be a local file. One place decides
// the wording instead.
export function boardCopy(options = {}) {
  const online = Boolean(options.online)
  const accountBacked = Boolean(options.accountBacked)
  const memberCount = Number(options.memberCount) || 0
  const revision = Number(options.revision) || 0
  const copied = Boolean(options.copied)

  if (accountBacked) {
    const admins = memberCount === 1 ? '1 admin' : `${memberCount} admins`
    return {
      live: true,
      canSwitchIdentity: false,
      canImport: false,
      showInvite: false,
      eyebrow: 'Delt arbeidsrom · knyttet til kontoen din',
      intro: 'Alle tanker, feil og neste trekk for Hanzi Dojo — delt mellom admin-kontoene og lagret i appens egen database.',
      syncButtonLabel: 'Delt',
      syncButtonTitle: 'Hvem deler dette HQ-et',
      kicker: 'Samarbeid via kontoen din',
      heading: 'Ett HQ. Begge kontoene.',
      statusTitle: 'Delt med admin-kontoene',
      statusDetail: `${admins} har tilgang · endringer lagres med én gang`,
      shareLabel: copied ? 'Kopi lastet ned' : 'Last ned kopi',
      steps: [
        { title: 'Logg inn som deg selv', body: 'HQ-et følger kontoen din, ikke enheten. Samme brett på mobil og PC.' },
        { title: 'Jobb i samme brett', body: 'Oppgaver, kommentarer og bilder dukker opp hos begge med én gang.' },
        { title: 'Gi tilgang til flere', body: 'Sett is_admin på kontoen deres, så er de med i HQ-et.' },
      ],
    }
  }

  if (online) {
    return {
      live: true,
      canSwitchIdentity: false,
      canImport: false,
      showInvite: true,
      eyebrow: 'Live arbeidsrom · D1 + R2 · ingen Supabase',
      intro: 'Alle tanker, feil, bilder og neste trekk for Hanzi Dojo — delt mellom dere og automatisk synkronisert.',
      syncButtonLabel: 'Live',
      syncButtonTitle: 'Live samarbeid',
      kicker: 'Samarbeid uten Supabase',
      heading: 'Live HQ. Samme plan.',
      statusTitle: 'Delt lagring er aktiv',
      statusDetail: `${memberCount} ${memberCount === 1 ? 'medlem' : 'medlemmer'} · D1 + R2 · automatisk synk`,
      shareLabel: copied ? 'Lenke kopiert' : 'Kopier invitasjonslenke',
      steps: [
        { title: 'Send invitasjonslenken', body: 'Vennen din åpner lenken, skriver navnet sitt og blir med.' },
        { title: 'Planlegg sammen', body: 'Endringer dukker automatisk opp hos begge omtrent hvert fjerde sekund.' },
        { title: 'Bruk bilder og kommentarer', body: 'Skjermbilder ligger i delt bildelager, ikke i nettleseren.' },
      ],
    }
  }

  return {
    live: false,
    canSwitchIdentity: true,
    canImport: true,
    showInvite: false,
    eyebrow: 'Lokal arbeidsfil · ingen Supabase',
    intro: 'Alle tanker, feil og neste trekk for Hanzi Dojo — lagret på enheten din. Eksporter arbeidsfilen når du vil sende siste versjon til vennen din.',
    syncButtonLabel: 'Arbeidsfil',
    syncButtonTitle: 'Samarbeid og arbeidsfil',
    kicker: 'Samarbeid uten Supabase',
    heading: 'Én fil. Begges arbeid.',
    statusTitle: 'Alt er lagret lokalt',
    statusDetail: `Revisjon ${revision} · endringer lagres automatisk`,
    shareLabel: copied ? 'Fil delt' : 'Del nyeste fil',
    steps: [
      { title: 'Gjør endringene dine', body: 'Oppgaver, kommentarer og bilder lagres med én gang.' },
      { title: 'Del nyeste fil', body: 'Send den direkte i meldingsappen dere allerede bruker.' },
      { title: 'Importer når du får den tilbake', body: 'Nye og endrede ting flettes sammen. Slettinger følger også med.' },
    ],
  }
}

// ── Keeping the export cache honest ─────────────────────────────────────────
//
// dojoSupabaseClient caches the last rows it read, because `exportData()` is
// synchronous — the UI calls it to build a download and cannot await a fetch.
// That cache used to refresh only on `.select()`, but the board's most common
// write is `update(patch).eq('id', id)` with no select (a drag between columns
// writes only `status`). So an edit landed in Postgres and in React state, but
// the cached copy stayed pre-edit, and "Last ned kopi" could hand you a
// snapshot that disagreed with the board on screen.
//
// Realtime usually papered over it — but the migration registers realtime in a
// guarded block that skips rather than fails, so "usually" is not a guarantee.
//
// This applies the mutation to the cached rows directly, from the recorded
// builder steps. Deliberately generic: it matches on EVERY `eq` filter, not
// just `id`, so a filter shape the board doesn't use today can't silently
// corrupt the cache tomorrow. A mutation it cannot interpret returns the rows
// untouched — a stale cache is recoverable, a wrongly-patched one is not.
export function applyMutationToCache(rows, steps) {
  const list = Array.isArray(rows) ? rows : []
  const entries = Array.isArray(steps) ? steps : []

  const step = key => entries.find(entry => Array.isArray(entry) && entry[0] === key)
  const filters = entries
    .filter(entry => Array.isArray(entry) && entry[0] === 'eq' && Array.isArray(entry[1]))
    .map(entry => ({ column: entry[1][0], value: entry[1][1] }))

  const matches = row => filters.length > 0
    && filters.every(filter => row && row[filter.column] === filter.value)

  const updateStep = step('update')
  if (updateStep) {
    const patch = updateStep[1] && updateStep[1][0]
    if (!patch || typeof patch !== 'object' || !filters.length) return list
    return list.map(row => (matches(row) ? { ...row, ...patch } : row))
  }

  const deleteStep = step('delete')
  if (deleteStep) {
    if (!filters.length) return list
    return list.filter(row => !matches(row))
  }

  const insertStep = step('insert')
  if (insertStep) {
    const payload = insertStep[1] && insertStep[1][0]
    const added = (Array.isArray(payload) ? payload : [payload]).filter(Boolean)
    if (!added.length) return list
    // Only rows carrying an id are appended — without one there is nothing to
    // dedupe against, and a duplicate in the export is worse than a gap the
    // next select fills in.
    const withIds = added.filter(row => row && row.id != null)
    if (!withIds.length) return list
    const seen = new Set(list.map(row => row && row.id))
    return [...list, ...withIds.filter(row => !seen.has(row.id))]
  }

  return list
}
