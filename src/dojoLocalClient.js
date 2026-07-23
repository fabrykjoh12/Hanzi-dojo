const STORAGE_KEY = 'hanzi-dojo-hq-local-v1'
const DEVICE_KEY = 'hanzi-dojo-hq-device-v1'
const CHANGE_EVENT = 'hanzi-dojo-hq-change'
const DEMO_ITEM_IDS = new Set([
  'seed-tone-test', 'seed-audio-bug', 'seed-hq',
  'seed-hsk4', 'seed-writing', 'seed-reader',
])

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isoDate(offset = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

function seedStore() {
  const now = new Date().toISOString()
  const workspaceId = 'local-hanzi-dojo-hq'
  return {
    version: 2,
    currentUserId: 'local-user',
    workspaces: [{ id: workspaceId, name: 'Hanzi Dojo HQ', invite_code: 'LOCAL', owner_id: 'local-user', created_at: now }],
    members: [
      { workspace_id: workspaceId, user_id: 'local-user', role: 'owner', joined_at: now, display_name: 'Fabian' },
      { workspace_id: workspaceId, user_id: 'dojo-friend', role: 'member', joined_at: now, display_name: 'Dojo-venn' },
    ],
    items: [
      { id: 'seed-tone-test', workspace_id: workspaceId, created_by: 'local-user', assigned_to: 'dojo-friend', title: 'Test toneøvelsen på iPhone', description: 'Kjør en hel økt og noter om lyd, sveiping og fasit føles riktig på liten skjerm.', item_type: 'test', status: 'review', priority: 'high', tags: ['mobil', 'toner'], due_date: isoDate(2), created_at: now, updated_at: now },
      { id: 'seed-audio-bug', workspace_id: workspaceId, created_by: 'dojo-friend', assigned_to: 'local-user', title: 'Lyd stopper når skjermen låses', description: 'Historieleseren mister avspillingen etter skjermlås. Reprodusert på iOS.', item_type: 'bug', status: 'progress', priority: 'urgent', tags: ['lyd', 'ios'], due_date: isoDate(1), created_at: now, updated_at: now },
      { id: 'seed-hq', workspace_id: workspaceId, created_by: 'local-user', assigned_to: 'local-user', title: 'Gjør Dojo HQ klart for daglig bruk', description: 'Få idéer, bugs, testing, planlegging og vedlegg inn i én felles arbeidsflyt.', item_type: 'implement', status: 'progress', priority: 'high', tags: ['hq', 'samarbeid'], due_date: isoDate(4), created_at: now, updated_at: now },
      { id: 'seed-hsk4', workspace_id: workspaceId, created_by: 'local-user', assigned_to: 'dojo-friend', title: 'Planlegg HSK 4-lanseringen', description: 'Bestem innhold, milepæler og hva som må testes før nivået åpnes.', item_type: 'plan', status: 'planned', priority: 'medium', tags: ['hsk4', 'roadmap'], due_date: isoDate(8), created_at: now, updated_at: now },
      { id: 'seed-writing', workspace_id: workspaceId, created_by: 'dojo-friend', assigned_to: null, title: 'Bedre feedback på håndskrift', description: 'Vis tydeligere hvorfor et strøk ikke blir godkjent uten at øvelsen føles streng.', item_type: 'idea', status: 'inbox', priority: 'low', tags: ['skriving', 'ux'], due_date: null, created_at: now, updated_at: now },
      { id: 'seed-reader', workspace_id: workspaceId, created_by: 'local-user', assigned_to: 'local-user', title: 'Poler bilder i historieleseren', description: 'Ferdig med jevnere bildeformat og roligere overganger.', item_type: 'fix', status: 'done', priority: 'medium', tags: ['stories', 'ui'], due_date: isoDate(-1), created_at: now, updated_at: now },
    ],
    attachments: [],
    comments: [
      { id: 'seed-comment-1', workspace_id: workspaceId, item_id: 'seed-audio-bug', author_id: 'dojo-friend', body: 'Jeg får dette hver gang etter omtrent 30 sekunder med låst skjerm.', created_at: now },
      { id: 'seed-comment-2', workspace_id: workspaceId, item_id: 'seed-hq', author_id: 'local-user', body: 'Første versjon er på plass. La oss bruke den på ekte oppgaver nå.', created_at: now },
    ],
    blobs: {},
    tombstones: [],
    settings: {
      setup_complete: false,
      revision: 0,
      updated_at: now,
      last_export_at: null,
      last_import_at: null,
    },
  }
}

function migrateStore(value) {
  if (!value || !Array.isArray(value.items) || !Array.isArray(value.workspaces)) return seedStore()
  const now = new Date().toISOString()
  return {
    ...value,
    version: 2,
    currentUserId: value.currentUserId || 'local-user',
    members: Array.isArray(value.members) ? value.members : [],
    attachments: Array.isArray(value.attachments) ? value.attachments : [],
    comments: Array.isArray(value.comments) ? value.comments : [],
    blobs: value.blobs && typeof value.blobs === 'object' ? value.blobs : {},
    tombstones: Array.isArray(value.tombstones) ? value.tombstones : [],
    settings: {
      setup_complete: false,
      revision: 0,
      updated_at: now,
      last_export_at: null,
      last_import_at: null,
      ...(value.settings || {}),
    },
  }
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedStore()
    return migrateStore(JSON.parse(raw))
  } catch {
    return seedStore()
  }
}

function writeStore(store) {
  try {
    const next = migrateStore(store)
    next.settings = {
      ...next.settings,
      revision: Number(next.settings?.revision || 0) + 1,
      updated_at: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
    return null
  } catch {
    return new Error('Den lokale arbeidsfilen er full. Eksporter den og fjern noen store bilder.')
  }
}

function readDevice() {
  try {
    const value = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null')
    if (value?.userId) return value
  } catch {
    // A broken device preference should never block the workspace.
  }
  return { userId: 'local-user', displayName: 'Fabian' }
}

function writeDevice(identity) {
  localStorage.setItem(DEVICE_KEY, JSON.stringify(identity))
}

function rowKey(table, row) {
  if (table === 'members') return `${row.workspace_id}:${row.user_id}`
  return row.id
}

function rowTimestamp(row) {
  return String(row.updated_at || row.created_at || row.joined_at || '')
}

function mergeRows(table, currentRows, incomingRows) {
  const merged = new globalThis.Map(currentRows.map(row => [rowKey(table, row), row]))
  for (const row of incomingRows) {
    const key = rowKey(table, row)
    const existing = merged.get(key)
    if (!existing || rowTimestamp(row) >= rowTimestamp(existing)) merged.set(key, row)
  }
  return [...merged.values()]
}

function mergeTombstones(currentRows, incomingRows) {
  const merged = new globalThis.Map()
  for (const row of [...currentRows, ...incomingRows]) {
    const key = `${row.table}:${row.id}`
    const existing = merged.get(key)
    if (!existing || String(row.deleted_at) > String(existing.deleted_at)) merged.set(key, row)
  }
  return [...merged.values()]
}

function applyTombstones(store) {
  const tableMap = {
    dojo_workspaces: 'workspaces',
    dojo_workspace_members: 'members',
    dojo_items: 'items',
    dojo_attachments: 'attachments',
    dojo_comments: 'comments',
  }
  for (const tombstone of store.tombstones || []) {
    const key = tableMap[tombstone.table]
    if (!key) continue
    store[key] = (store[key] || []).filter(row => {
      const id = rowKey(key, row)
      return id !== tombstone.id || rowTimestamp(row) > String(tombstone.deleted_at)
    })
  }
  return store
}

function tableKey(table) {
  return ({
    dojo_workspaces: 'workspaces',
    dojo_workspace_members: 'members',
    dojo_items: 'items',
    dojo_attachments: 'attachments',
    dojo_comments: 'comments',
  })[table]
}

class LocalQuery {
  constructor(table) {
    this.table = table
    this.action = 'select'
    this.payload = null
    this.filters = []
    this.sort = null
    this.selector = '*'
    this.wantsSingle = false
  }

  select(selector = '*') { this.selector = selector; return this }
  insert(payload) { this.action = 'insert'; this.payload = payload; return this }
  update(payload) { this.action = 'update'; this.payload = payload; return this }
  delete() { this.action = 'delete'; return this }
  eq(column, value) { this.filters.push([column, value]); return this }
  order(column, options = {}) { this.sort = [column, options.ascending !== false]; return this }
  single() { this.wantsSingle = true; return this }

  then(resolve, reject) {
    return this.execute().then(resolve, reject)
  }

  async execute() {
    const store = readStore()
    const key = tableKey(this.table)
    if (!key) return { data: null, error: { code: 'LOCAL_TABLE', message: `Unknown local table: ${this.table}` } }
    const source = store[key] || []
    const matches = row => this.filters.every(([column, value]) => row[column] === value)

    if (this.action === 'select') {
      let rows = source.filter(matches)
      if (this.sort) {
        const [column, ascending] = this.sort
        rows = [...rows].sort((a, b) => String(a[column] || '').localeCompare(String(b[column] || '')) * (ascending ? 1 : -1))
      }
      if (this.table === 'dojo_workspace_members' && this.selector.includes('workspace:')) {
        rows = rows.map(member => ({ role: member.role, workspace: store.workspaces.find(workspace => workspace.id === member.workspace_id) }))
      } else if (this.table === 'dojo_workspace_members' && this.selector.includes('profile:')) {
        rows = rows.map(member => ({ ...member, profile: { display_name: member.display_name || 'Dojo-medlem' } }))
      }
      return { data: this.wantsSingle ? (rows[0] || null) : rows, error: null }
    }

    if (this.action === 'insert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(row => ({
        id: row.id || uid(),
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        ...row,
      }))
      store[key] = [...source, ...rows]
      const error = writeStore(store)
      return { data: this.wantsSingle ? rows[0] : rows, error: error ? { code: 'LOCAL_QUOTA', message: error.message } : null }
    }

    if (this.action === 'update') {
      store[key] = source.map(row => matches(row) ? { ...row, ...this.payload, updated_at: new Date().toISOString() } : row)
      const error = writeStore(store)
      return { data: null, error: error ? { code: 'LOCAL_QUOTA', message: error.message } : null }
    }

    const deletedAt = new Date().toISOString()
    const deletedRows = source.filter(matches)
    store[key] = source.filter(row => !matches(row))
    store.tombstones ||= []
    for (const row of deletedRows) {
      store.tombstones.push({ table: this.table, id: rowKey(key, row), deleted_at: deletedAt })
      if (this.table === 'dojo_items') {
        const childTables = [
          ['dojo_comments', 'comments'],
          ['dojo_attachments', 'attachments'],
        ]
        for (const [childTable, childKey] of childTables) {
          const children = (store[childKey] || []).filter(child => child.item_id === row.id)
          for (const child of children) {
            store.tombstones.push({ table: childTable, id: child.id, deleted_at: deletedAt })
            if (child.storage_path) delete store.blobs[child.storage_path]
          }
          store[childKey] = (store[childKey] || []).filter(child => child.item_id !== row.id)
        }
      }
    }
    const error = writeStore(store)
    return { data: null, error: error ? { code: 'LOCAL_QUOTA', message: error.message } : null }
  }
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Kunne ikke lese bildet.'))
    reader.readAsDataURL(file)
  })
}

export const localDojo = {
  configure(userId, displayName) {
    if (!userId) return
    const store = readStore()
    store.currentUserId = userId
    const existing = store.members.find(member => member.user_id === userId)
    if (existing && displayName) {
      store.members = store.members.map(member => member.user_id === userId ? { ...member, display_name: displayName } : member)
    } else if (!existing && store.workspaces[0]) {
      store.members.push({
        workspace_id: store.workspaces[0].id,
        user_id: userId,
        role: 'member',
        joined_at: new Date().toISOString(),
        display_name: displayName || 'Dojo-medlem',
      })
    }
    writeDevice({ userId, displayName: displayName || existing?.display_name || 'Dojo-medlem' })
    writeStore(store)
  },

  getIdentity() {
    return readDevice()
  },

  setIdentity(userId) {
    const store = readStore()
    const member = store.members.find(entry => entry.user_id === userId)
    if (!member) return { error: new Error('Fant ikke dette medlemmet.') }
    store.currentUserId = userId
    writeDevice({ userId, displayName: member.display_name || 'Dojo-medlem' })
    return { error: writeStore(store), identity: readDevice() }
  },

  getOverview() {
    const store = readStore()
    return {
      settings: store.settings,
      workspace: store.workspaces[0] || null,
      members: store.members,
      identity: readDevice(),
      itemCount: store.items.length,
    }
  },

  completeSetup({ workspaceName, ownerName, friendName, role = 'owner', keepExamples = false, ownerId = 'local-user' }) {
    const store = readStore()
    const workspace = store.workspaces[0] || {
      id: 'local-hanzi-dojo-hq',
      owner_id: 'local-user',
      created_at: new Date().toISOString(),
    }
    workspace.name = workspaceName.trim() || 'Hanzi Dojo HQ'
    workspace.owner_id = ownerId
    store.workspaces = [workspace]
    store.members = [
      {
        workspace_id: workspace.id,
        user_id: ownerId,
        role: 'owner',
        joined_at: store.members[0]?.joined_at || new Date().toISOString(),
        display_name: ownerName.trim() || 'Meg',
      },
      {
        workspace_id: workspace.id,
        user_id: 'dojo-friend',
        role: 'member',
        joined_at: store.members[1]?.joined_at || new Date().toISOString(),
        display_name: friendName.trim() || 'Dojo-venn',
      },
    ]
    if (!keepExamples) {
      const deletedAt = new Date().toISOString()
      const removedItems = store.items.filter(item => DEMO_ITEM_IDS.has(item.id))
      store.tombstones ||= []
      for (const item of removedItems) store.tombstones.push({ table: 'dojo_items', id: item.id, deleted_at: deletedAt })
      store.items = store.items.filter(item => !DEMO_ITEM_IDS.has(item.id))
      store.comments = store.comments.filter(comment => !DEMO_ITEM_IDS.has(comment.item_id))
      const removedPaths = store.attachments.filter(file => DEMO_ITEM_IDS.has(file.item_id)).map(file => file.storage_path)
      store.attachments = store.attachments.filter(file => !DEMO_ITEM_IDS.has(file.item_id))
      for (const path of removedPaths) delete store.blobs[path]
    } else if (ownerId !== 'local-user') {
      store.items = store.items.map(item => ({
        ...item,
        created_by: item.created_by === 'local-user' ? ownerId : item.created_by,
        assigned_to: item.assigned_to === 'local-user' ? ownerId : item.assigned_to,
      }))
      store.comments = store.comments.map(comment => comment.author_id === 'local-user' ? { ...comment, author_id: ownerId } : comment)
    }
    store.settings = { ...store.settings, setup_complete: true }
    const userId = role === 'friend' ? 'dojo-friend' : ownerId
    store.currentUserId = userId
    const displayName = role === 'friend' ? friendName.trim() : ownerName.trim()
    writeDevice({ userId, displayName: displayName || (role === 'friend' ? 'Dojo-venn' : 'Meg') })
    return { error: writeStore(store), identity: readDevice() }
  },

  from(table) { return new LocalQuery(table) },

  async rpc(name, args = {}) {
    const store = readStore()
    if (name === 'create_dojo_workspace') {
      const workspace = { id: uid(), name: args.p_name || 'Hanzi Dojo HQ', invite_code: 'LOCAL', owner_id: store.currentUserId, created_at: new Date().toISOString() }
      store.workspaces.push(workspace)
      store.members.push({ workspace_id: workspace.id, user_id: store.currentUserId, role: 'owner', joined_at: new Date().toISOString(), display_name: 'Fabian' })
      const error = writeStore(store)
      return { data: workspace, error }
    }
    return { data: store.workspaces[0], error: null }
  },

  storage: {
    from() {
      return {
        async createSignedUrl(path) {
          const store = readStore()
          return { data: { signedUrl: store.blobs[path] || '' }, error: null }
        },
        async upload(path, file) {
          if (file.size > 1.5 * 1024 * 1024) return { data: null, error: new Error('Bildet er større enn 1,5 MB.') }
          try {
            const store = readStore()
            store.blobs[path] = await readFile(file)
            const error = writeStore(store)
            return { data: error ? null : { path }, error }
          } catch (error) {
            return { data: null, error }
          }
        },
        async remove(paths) {
          const store = readStore()
          for (const path of paths) delete store.blobs[path]
          return { data: null, error: writeStore(store) }
        },
      }
    },
  },

  channel() {
    const callbacks = new Set()
    let handler
    return {
      on(_event, _filter, callback) { callbacks.add(callback); return this },
      subscribe() {
        handler = () => callbacks.forEach(callback => callback())
        window.addEventListener(CHANGE_EVENT, handler)
        window.addEventListener('storage', handler)
        return this
      },
      unsubscribe() {
        if (handler) {
          window.removeEventListener(CHANGE_EVENT, handler)
          window.removeEventListener('storage', handler)
        }
      },
    }
  },

  removeChannel(channel) { channel?.unsubscribe?.() },

  exportData() {
    return JSON.stringify(readStore(), null, 2)
  },

  markExported() {
    const store = readStore()
    store.settings.last_export_at = new Date().toISOString()
    return writeStore(store)
  },

  importData(text) {
    try {
      const parsed = JSON.parse(text)
      if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.workspaces)) throw new Error('Ugyldig Dojo-fil.')
      const incoming = migrateStore(parsed)
      const current = readStore()
      const beforeIds = new Set(current.items.map(item => item.id))
      const merged = {
        ...current,
        workspaces: mergeRows('workspaces', current.workspaces, incoming.workspaces),
        members: mergeRows('members', current.members, incoming.members),
        items: mergeRows('items', current.items, incoming.items),
        attachments: mergeRows('attachments', current.attachments, incoming.attachments),
        comments: mergeRows('comments', current.comments, incoming.comments),
        blobs: { ...current.blobs, ...incoming.blobs },
        tombstones: mergeTombstones(current.tombstones, incoming.tombstones),
        currentUserId: readDevice().userId,
        settings: {
          ...current.settings,
          setup_complete: true,
          last_import_at: new Date().toISOString(),
        },
      }
      applyTombstones(merged)
      const added = merged.items.filter(item => !beforeIds.has(item.id)).length
      const error = writeStore(merged)
      return error ? { error } : { error: null, added, total: merged.items.length }
    } catch (error) {
      return { error }
    }
  },
}
