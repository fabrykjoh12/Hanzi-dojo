let workspace = null
let identity = null

async function request(path, options = {}) {
  if (!workspace?.id || !workspace?.invite_code) throw new Error('HQ 2.0 mangler arbeidsområde.')
  const response = await fetch(
    `/api/dojo/workspaces/${encodeURIComponent(workspace.id)}/${path}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Dojo-Key': workspace.invite_code,
        'X-Dojo-User': identity?.userId || '',
        ...(options.headers || {}),
      },
    },
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'HQ 2.0 svarte med en feil.')
  return payload
}

function post(path, payload) {
  return request(path, { method: 'POST', body: JSON.stringify(payload) })
}

function patch(path, payload) {
  return request(path, { method: 'PATCH', body: JSON.stringify(payload) })
}

export const dojoHQ2Client = {
  configure(nextWorkspace, nextIdentity) {
    workspace = nextWorkspace || null
    identity = nextIdentity || null
  },

  snapshot() {
    return request('hq2')
  },

  heartbeat(activeItemId = null) {
    return post('presence', {
      user_id: identity?.userId,
      display_name: identity?.displayName,
      active_item_id: activeItemId,
    })
  },

  createMilestone(payload) {
    return post('milestones', { ...payload, created_by: identity?.userId })
  },

  updateMilestone(id, payload) {
    return patch(`milestones/${encodeURIComponent(id)}`, { ...payload, _actor_id: identity?.userId })
  },

  createTestCase(payload) {
    return post('test-cases', { ...payload, created_by: identity?.userId })
  },

  updateTestCase(id, payload) {
    return patch(`test-cases/${encodeURIComponent(id)}`, { ...payload, updated_by: identity?.userId })
  },

  deleteTestCase(id) {
    return request(`test-cases/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  createRun(itemId) {
    return post('agent-runs', { item_id: itemId, started_by: identity?.userId })
  },

  updateRun(id, payload) {
    return patch(`agent-runs/${encodeURIComponent(id)}`, { ...payload, _actor_id: identity?.userId })
  },

  addDecision(summary, itemId = null) {
    return post('activities', {
      actor_id: identity?.userId,
      event_type: 'decision',
      summary,
      item_id: itemId,
    })
  },

  restoreItem(itemId, versionId) {
    return post(`items/${encodeURIComponent(itemId)}/restore`, {
      actor_id: identity?.userId,
      version_id: versionId,
    })
  },
}
