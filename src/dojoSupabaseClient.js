// Dojo HQ against the app's own Supabase project, keyed to the signed-in
// account. This is the client the real app uses; dojoLocalClient (device
// localStorage) and dojoRemoteClient (Cloudflare worker + invite code) stay for
// the standalone hq.html build and the ?online=1 / ?local=1 escape hatches.
//
// It implements exactly the surface DojoHQ.jsx consumes from `dojoClient`, so
// the screen barely changed:
//   configure / getIdentity / getOverview / setIdentity / completeSetup
//   from / rpc / storage / channel / removeChannel
//   exportData / markExported / importData
//
// Two things are NOT pass-throughs:
//   1. `dojo_workspace_members` — there is no workspace or membership table.
//      Membership is `profiles.is_admin`, resolved through the security-definer
//      `dojo_hq_members()` RPC, and the workspace is a constant.
//   2. `create_dojo_workspace` / `join_dojo_workspace` — no invite system.
//
// The supabase client is imported LAZILY on purpose: src/supabase.js throws at
// import time when the VITE_SUPABASE_* env vars are missing, and the standalone
// hq.html bundle (which never uses this client) must not inherit that.

import {
  applyMutationToCache, boardSnapshot, hqWorkspace, isMissingSetupError,
  memberQueryKind, setupMissingError, toMemberRows,
} from './dojoBoard'

let clientPromise = null

function client() {
  if (!clientPromise) clientPromise = import('./supabase').then(module => module.supabase)
  return clientPromise
}

let identity = { userId: '', displayName: 'Dojo-medlem' }
let lastExportAt = null
const cache = { members: [], items: [], comments: [], attachments: [] }

const MEMBER_TABLE = 'dojo_workspace_members'

// A thin recorder around the real PostgREST builder. It forwards every call
// untouched and only remembers what came back, so `exportData()` (which the UI
// calls synchronously) has something real to write out.
class DojoTableQuery {
  constructor(table) {
    this.table = table
    this.isSelect = false
    this.builder = null
    this.steps = []
  }

  push(method, args) { this.steps.push([method, args]); return this }

  select(...args) { this.isSelect = true; return this.push('select', args) }
  insert(...args) { return this.push('insert', args) }
  update(...args) { return this.push('update', args) }
  delete(...args) { return this.push('delete', args) }
  eq(...args) { return this.push('eq', args) }
  order(...args) { return this.push('order', args) }
  limit(...args) { return this.push('limit', args) }
  single(...args) { return this.push('single', args) }

  then(resolve, reject) { return this.execute().then(resolve, reject) }

  async execute() {
    const supabase = await client()
    this.builder = supabase.from(this.table)
    for (const [method, args] of this.steps) this.builder = this.builder[method](...args)
    const result = await this.builder
    const key = this.table.startsWith('dojo_') ? this.table.slice(5) : this.table
    if (!(key in cache)) return result
    if (this.isSelect && Array.isArray(result.data)) cache[key] = result.data
    // A write with no `.select()` — the board's commonest one — would otherwise
    // leave the cache pre-edit, and exportData() would hand back a snapshot
    // that disagrees with the screen. See applyMutationToCache in dojoBoard.js.
    else if (!this.isSelect && !result.error) cache[key] = applyMutationToCache(cache[key], this.steps)
    return result
  }
}

// `dojo_workspace_members` has no table behind it. Both shapes the board asks
// for are answered from `dojo_hq_members()`: every admin account is a member of
// the one board.
class DojoMembersQuery {
  constructor() {
    this.selector = '*'
    this.wantsSingle = false
  }

  select(selector = '*') { this.selector = selector; return this }
  eq() { return this }
  order() { return this }
  single() { this.wantsSingle = true; return this }

  then(resolve, reject) { return this.execute().then(resolve, reject) }

  async execute() {
    const supabase = await client()
    const { data, error } = await supabase.rpc('dojo_hq_members')
    if (error) return { data: null, error: isMissingSetupError(error) ? setupMissingError() : error }

    const members = toMemberRows(data, {
      currentUserId: identity.userId,
      currentUserName: identity.displayName,
    })
    cache.members = members

    if (memberQueryKind(this.selector) === 'workspace') {
      const mine = members.find(member => member.user_id === identity.userId)
      const rows = [{ role: mine?.role || 'admin', workspace: hqWorkspace() }]
      return { data: this.wantsSingle ? rows[0] : rows, error: null }
    }
    return { data: this.wantsSingle ? (members[0] || null) : members, error: null }
  }
}

// The realtime channel is chained synchronously (`.on().on().subscribe()`) but
// the client arrives a tick later, so calls are replayed once it does.
function deferredChannel(name) {
  const pending = []
  let live = null
  let removed = false

  const proxy = {
    on(...args) {
      if (live) live = live.on(...args)
      else pending.push(['on', args])
      return proxy
    },
    subscribe(...args) {
      if (live) live = live.subscribe(...args)
      else pending.push(['subscribe', args])
      return proxy
    },
    unsubscribe() {
      removed = true
      if (live) live.unsubscribe()
    },
  }

  client().then(supabase => {
    if (removed) return
    live = supabase.channel(name)
    for (const [method, args] of pending) live = live[method](...args)
  }).catch(() => {})

  proxy.realChannel = () => live
  return proxy
}

export const supabaseDojo = {
  isRemote: false,
  // Tells the board that identity comes from the signed-in account, so it stops
  // offering the device-local identity switcher and the import/merge flow.
  isAccountBacked: true,

  configure(userId, displayName) {
    identity = {
      userId: userId || identity.userId,
      displayName: String(displayName || '').trim() || identity.displayName,
    }
  },

  getIdentity() {
    return identity
  },

  getOverview() {
    return {
      settings: {
        // There is no first-run setup for an account-backed board: being an
        // admin IS the setup, so the launch modal never opens.
        setup_complete: true,
        revision: 0,
        updated_at: null,
        last_export_at: lastExportAt,
        last_import_at: null,
      },
      workspace: hqWorkspace(),
      members: cache.members,
      identity,
      itemCount: cache.items.length,
    }
  },

  setIdentity() {
    return { error: new Error('HQ-et følger kontoen du er logget inn med.') }
  },

  completeSetup() {
    return { error: null, identity }
  },

  from(table) {
    return table === MEMBER_TABLE ? new DojoMembersQuery() : new DojoTableQuery(table)
  },

  async rpc(name, args = {}) {
    if (name === 'create_dojo_workspace' || name === 'join_dojo_workspace') {
      return { data: null, error: new Error('Dojo HQ deles automatisk mellom alle admin-kontoer.') }
    }
    const supabase = await client()
    return supabase.rpc(name, args)
  },

  storage: {
    from(bucket) {
      return {
        async createSignedUrl(path, expiresIn) {
          const supabase = await client()
          return supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
        },
        async upload(path, file, options) {
          const supabase = await client()
          return supabase.storage.from(bucket).upload(path, file, options)
        },
        async remove(paths) {
          const supabase = await client()
          return supabase.storage.from(bucket).remove(paths)
        },
      }
    },
  },

  channel(name) {
    return deferredChannel(name)
  },

  removeChannel(channel) {
    channel?.unsubscribe?.()
    const live = channel?.realChannel?.()
    if (live) client().then(supabase => supabase.removeChannel(live)).catch(() => {})
  },

  exportData() {
    return JSON.stringify(boardSnapshot({
      workspace: hqWorkspace(),
      members: cache.members,
      items: cache.items,
      comments: cache.comments,
      attachments: cache.attachments,
      exportedAt: new Date().toISOString(),
    }), null, 2)
  },

  markExported() {
    lastExportAt = new Date().toISOString()
    return null
  },

  importData() {
    return { error: new Error('HQ-et ligger i databasen nå — det er ingen arbeidsfil å slå sammen.') }
  },
}
