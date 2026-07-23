const STATE_KEY = 'hanzi-dojo-hq-online-v1'
const CHANGE_EVENT = 'hanzi-dojo-hq-remote-change'
const snapshotCache = new Map()

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function readState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null')
    if (parsed?.identity?.userId && Array.isArray(parsed.workspaces)) return parsed
  } catch {
    // Fall through to a fresh device identity.
  }
  return {
    identity: { userId: `device-${uid()}`, displayName: 'Dojo-medlem' },
    workspaces: [],
  }
}

function writeState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state))
}

function workspaceCredential(workspaceId) {
  return readState().workspaces.find(workspace => workspace.id === workspaceId) || null
}

async function api(path, options = {}, workspaceId) {
  const credential = workspaceId ? workspaceCredential(workspaceId) : null
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof Blob)) headers.set('Content-Type', 'application/json')
  if (credential) headers.set('X-Dojo-Key', credential.invite_code)
  const response = await fetch(path, { ...options, headers })
  if (response.status === 204) return { unchanged: true }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(payload.error || 'Nettversjonen svarte med en feil.'), { status: response.status })
  return payload
}

function saveWorkspace(workspace) {
  const state = readState()
  state.workspaces = [
    ...state.workspaces.filter(entry => entry.id !== workspace.id),
    workspace,
  ]
  writeState(state)
  snapshotCache.delete(workspace.id)
}

async function fetchSnapshot(workspaceId, { force = false, checkRevision = false } = {}) {
  const cached = snapshotCache.get(workspaceId)
  if (!force && cached?.promise && Date.now() - cached.at < 350) return cached.promise
  const revision = checkRevision ? cached?.data?.workspace?.revision : 0
  const promise = api(
    `/api/dojo/workspaces/${encodeURIComponent(workspaceId)}/snapshot${revision ? `?revision=${revision}` : ''}`,
    {},
    workspaceId,
  ).then(result => {
    if (result.unchanged && cached?.data) return { ...cached.data, unchanged: true }
    const credential = workspaceCredential(workspaceId)
    const data = {
      ...result,
      workspace: { ...result.workspace, invite_code: credential?.invite_code, role: credential?.role || 'member' },
      unchanged: false,
    }
    snapshotCache.set(workspaceId, { data, promise: Promise.resolve(data), at: Date.now() })
    return data
  }).catch(error => {
    snapshotCache.delete(workspaceId)
    throw error
  })
  snapshotCache.set(workspaceId, { data: cached?.data, promise, at: Date.now() })
  return promise
}

function notify(workspaceId) {
  if (workspaceId) snapshotCache.delete(workspaceId)
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { workspaceId } }))
}

function tableRows(snapshot, table) {
  return ({
    dojo_workspace_members: snapshot.members,
    dojo_items: snapshot.items,
    dojo_comments: snapshot.comments,
    dojo_attachments: snapshot.attachments,
  })[table] || []
}

function workspaceForRecord(table, recordId) {
  if (!recordId) return null
  for (const credential of readState().workspaces) {
    const snapshot = snapshotCache.get(credential.id)?.data
    if (tableRows(snapshot || {}, table).some(row => row.id === recordId)) return credential.id
  }
  const workspaces = readState().workspaces
  return workspaces.length === 1 ? workspaces[0].id : null
}

class RemoteQuery {
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
  then(resolve, reject) { return this.execute().then(resolve, reject) }

  async execute() {
    try {
      if (this.action === 'select' && this.table === 'dojo_workspace_members' && this.selector.includes('workspace:')) {
        const state = readState()
        const results = await Promise.all(state.workspaces.map(async credential => {
          try {
            const snapshot = await fetchSnapshot(credential.id, { force: true })
            const membership = snapshot.members.find(member => member.user_id === state.identity.userId)
            if (!membership) return null
            return { role: membership.role, workspace: snapshot.workspace }
          } catch {
            return null
          }
        }))
        return { data: results.filter(Boolean), error: null }
      }

      const recordId = this.filters.find(([column]) => column === 'id')?.[1]
      const workspaceId = this.filters.find(([column]) => column === 'workspace_id')?.[1]
        || this.payload?.workspace_id
        || workspaceCredential(this.payload?.workspaceId)?.id
        || workspaceForRecord(this.table, recordId)
      if (!workspaceId && this.table !== 'dojo_workspace_members') {
        return { data: null, error: { code: 'REMOTE_WORKSPACE', message: 'Mangler arbeidsområde.' } }
      }

      if (this.action === 'select') {
        const snapshot = await fetchSnapshot(workspaceId)
        let rows = tableRows(snapshot, this.table).filter(row => this.filters.every(([column, value]) => row[column] === value))
        if (this.sort) {
          const [column, ascending] = this.sort
          rows = [...rows].sort((a, b) => String(a[column] || '').localeCompare(String(b[column] || '')) * (ascending ? 1 : -1))
        }
        return { data: this.wantsSingle ? (rows[0] || null) : rows, error: null }
      }

      if (this.action === 'insert') {
        const row = Array.isArray(this.payload) ? this.payload[0] : this.payload
        const endpoint = {
          dojo_items: 'items',
          dojo_comments: 'comments',
          dojo_attachments: 'attachments',
        }[this.table]
        if (!endpoint) throw new Error('Denne tabellen kan ikke opprettes fra nettklienten.')
        const result = await api(
          `/api/dojo/workspaces/${encodeURIComponent(workspaceId)}/${endpoint}`,
          { method: 'POST', body: JSON.stringify(row) },
          workspaceId,
        )
        notify(workspaceId)
        const created = result.item || result.comment || result.attachment
        return { data: this.wantsSingle ? created : [created], error: null }
      }

      const id = recordId
      if (!id) throw new Error('Mangler id for endringen.')
      const endpoint = this.table === 'dojo_items' ? 'items' : this.table === 'dojo_attachments' ? 'attachments' : null
      if (!endpoint) throw new Error('Denne tabellen kan ikke endres fra nettklienten.')
      if (this.action === 'update') {
        await api(
          `/api/dojo/workspaces/${encodeURIComponent(workspaceId)}/${endpoint}/${encodeURIComponent(id)}`,
          { method: 'PATCH', body: JSON.stringify(this.payload) },
          workspaceId,
        )
      } else {
        await api(
          `/api/dojo/workspaces/${encodeURIComponent(workspaceId)}/${endpoint}/${encodeURIComponent(id)}`,
          { method: 'DELETE' },
          workspaceId,
        )
      }
      notify(workspaceId)
      return { data: null, error: null }
    } catch (error) {
      return { data: null, error: { code: 'REMOTE_ERROR', message: error.message } }
    }
  }
}

export const remoteDojo = {
  isRemote: true,

  configure(userId, displayName) {
    const state = readState()
    state.identity = {
      userId: userId || state.identity.userId,
      displayName: displayName || state.identity.displayName,
    }
    writeState(state)
  },

  getIdentity() {
    return readState().identity
  },

  getOverview() {
    const state = readState()
    return {
      settings: { setup_complete: true, revision: 0 },
      workspace: state.workspaces[0] || null,
      members: [],
      identity: state.identity,
      itemCount: 0,
    }
  },

  setIdentity() {
    return { error: new Error('Identiteten følger denne enheten i nettversjonen.') }
  },

  completeSetup() {
    return { error: null, identity: readState().identity }
  },

  from(table) { return new RemoteQuery(table) },

  async rpc(name, args = {}) {
    try {
      const state = readState()
      if (name === 'create_dojo_workspace') {
        const result = await api('/api/dojo/workspaces', {
          method: 'POST',
          body: JSON.stringify({
            name: args.p_name,
            userId: state.identity.userId,
            displayName: state.identity.displayName,
          }),
        })
        saveWorkspace(result.workspace)
        return { data: result.workspace, error: null }
      }
      if (name === 'join_dojo_workspace') {
        const result = await api('/api/dojo/join', {
          method: 'POST',
          body: JSON.stringify({
            code: args.p_invite_code,
            userId: state.identity.userId,
            displayName: state.identity.displayName,
          }),
        })
        saveWorkspace(result.workspace)
        return { data: result.workspace, error: null }
      }
      return { data: null, error: new Error('Ukjent nettoperasjon.') }
    } catch (error) {
      return { data: null, error }
    }
  },

  storage: {
    from() {
      return {
        async createSignedUrl(path) {
          try {
            const workspaceId = String(path).split('/')[0]
            const response = await fetch(
              `/api/dojo/workspaces/${encodeURIComponent(workspaceId)}/files?path=${encodeURIComponent(path)}`,
              { headers: { 'X-Dojo-Key': workspaceCredential(workspaceId)?.invite_code || '' } },
            )
            if (!response.ok) throw new Error('Kunne ikke hente bildet.')
            return { data: { signedUrl: URL.createObjectURL(await response.blob()) }, error: null }
          } catch (error) {
            return { data: null, error }
          }
        },
        async upload(path, file) {
          try {
            if (file.size > 5 * 1024 * 1024) throw new Error('Bildet er større enn 5 MB.')
            const workspaceId = String(path).split('/')[0]
            const result = await api(
              `/api/dojo/workspaces/${encodeURIComponent(workspaceId)}/files`,
              {
                method: 'POST',
                headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Dojo-Path': path },
                body: file,
              },
              workspaceId,
            )
            return { data: result, error: null }
          } catch (error) {
            return { data: null, error }
          }
        },
        async remove(paths) {
          try {
            for (const path of paths) {
              const workspaceId = String(path).split('/')[0]
              await api(
                `/api/dojo/workspaces/${encodeURIComponent(workspaceId)}/files?path=${encodeURIComponent(path)}`,
                { method: 'DELETE' },
                workspaceId,
              )
            }
            return { data: null, error: null }
          } catch (error) {
            return { data: null, error }
          }
        },
      }
    },
  },

  channel(name) {
    const callbacks = new Set()
    let timer
    let localHandler
    const workspaceId = name.replace(/^dojo-hq-/, '')
    return {
      on(_event, _filter, callback) { callbacks.add(callback); return this },
      subscribe() {
        const poll = async () => {
          try {
            const result = await fetchSnapshot(workspaceId, { force: true, checkRevision: true })
            if (!result.unchanged) callbacks.forEach(callback => callback())
          } catch {
            // The next poll retries; transient offline periods keep the last local view.
          }
        }
        timer = window.setInterval(poll, 3500)
        localHandler = event => {
          if (!event.detail?.workspaceId || event.detail.workspaceId === workspaceId) callbacks.forEach(callback => callback())
        }
        window.addEventListener(CHANGE_EVENT, localHandler)
        return this
      },
      unsubscribe() {
        if (timer) window.clearInterval(timer)
        if (localHandler) window.removeEventListener(CHANGE_EVENT, localHandler)
      },
    }
  },

  removeChannel(channel) { channel?.unsubscribe?.() },

  exportData() {
    const state = readState()
    const snapshot = snapshotCache.get(state.workspaces[0]?.id)?.data
    return JSON.stringify(snapshot || { workspace: state.workspaces[0], items: [], comments: [], attachments: [], members: [] }, null, 2)
  },

  markExported() { return null },

  importData() {
    return { error: new Error('Importer lokale oppgaver etter at nettområdet er opprettet.') }
  },
}
