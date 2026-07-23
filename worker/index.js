const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  })
}

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24)
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return [...bytes].map(byte => alphabet[byte % alphabet.length]).join('')
}

async function bodyJson(request) {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > 2_000_000) throw new Error('Forespørselen er for stor.')
  return request.json()
}

function allowed(value, choices, fallback) {
  return choices.includes(value) ? value : fallback
}

function cleanText(value, max, fallback = '') {
  return String(value || fallback).trim().slice(0, max)
}

async function workspaceAccess(request, env, workspaceId) {
  const code = normalizeCode(request.headers.get('x-dojo-key'))
  if (!workspaceId || code.length < 10) return null
  const hash = await sha256(code)
  return env.DB.prepare(
    'SELECT id, name, owner_id, revision, created_at, updated_at FROM dojo_workspaces WHERE id = ? AND invite_hash = ?',
  ).bind(workspaceId, hash).first()
}

async function bumpRevision(env, workspaceId) {
  const now = new Date().toISOString()
  await env.DB.prepare(
    'UPDATE dojo_workspaces SET revision = revision + 1, updated_at = ? WHERE id = ?',
  ).bind(now, workspaceId).run()
}

function parseTags(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function mapItem(row) {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    created_by: row.created_by,
    assigned_to: row.assigned_to,
    title: row.title,
    description: row.description,
    item_type: row.item_type,
    status: row.status,
    priority: row.priority,
    tags: parseTags(row.tags_json),
    due_date: row.due_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function snapshot(env, workspace) {
  const statements = [
    env.DB.prepare('SELECT * FROM dojo_members WHERE workspace_id = ? ORDER BY joined_at').bind(workspace.id),
    env.DB.prepare('SELECT * FROM dojo_items WHERE workspace_id = ? ORDER BY updated_at DESC').bind(workspace.id),
    env.DB.prepare('SELECT * FROM dojo_comments WHERE workspace_id = ? ORDER BY created_at').bind(workspace.id),
    env.DB.prepare('SELECT * FROM dojo_attachments WHERE workspace_id = ? ORDER BY created_at').bind(workspace.id),
  ]
  const [membersResult, itemsResult, commentsResult, attachmentsResult] = await env.DB.batch(statements)
  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      owner_id: workspace.owner_id,
      revision: workspace.revision,
      created_at: workspace.created_at,
      updated_at: workspace.updated_at,
    },
    members: (membersResult.results || []).map(row => ({
      workspace_id: row.workspace_id,
      user_id: row.user_id,
      display_name: row.display_name,
      role: row.role,
      joined_at: row.joined_at,
      profile: { display_name: row.display_name },
    })),
    items: (itemsResult.results || []).map(mapItem),
    comments: (commentsResult.results || []).map(row => ({
      id: row.id,
      workspace_id: row.workspace_id,
      item_id: row.item_id,
      author_id: row.author_id,
      body: row.body,
      created_at: row.created_at,
    })),
    attachments: (attachmentsResult.results || []).map(row => ({
      id: row.id,
      workspace_id: row.workspace_id,
      item_id: row.item_id,
      created_by: row.created_by,
      storage_path: row.storage_path,
      file_name: row.file_name,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      created_at: row.created_at,
    })),
  }
}

async function createWorkspace(request, env) {
  const payload = await bodyJson(request)
  const name = cleanText(payload.name, 80, 'Hanzi Dojo HQ')
  const userId = cleanText(payload.userId, 100)
  const displayName = cleanText(payload.displayName, 60, 'Dojo-medlem')
  if (!userId) return json({ error: 'Mangler enhetsidentitet.' }, 400)
  const id = crypto.randomUUID()
  const code = inviteCode()
  const hash = await sha256(code)
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO dojo_workspaces (id, name, invite_hash, owner_id, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    ).bind(id, name, hash, userId, now, now),
    env.DB.prepare(
      'INSERT INTO dojo_members (workspace_id, user_id, display_name, role, joined_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(id, userId, displayName, 'owner', now),
  ])
  return json({
    workspace: { id, name, invite_code: code, owner_id: userId, role: 'owner', revision: 1, created_at: now },
  }, 201)
}

async function joinWorkspace(request, env) {
  const payload = await bodyJson(request)
  const code = normalizeCode(payload.code)
  const userId = cleanText(payload.userId, 100)
  const displayName = cleanText(payload.displayName, 60, 'Dojo-medlem')
  if (code.length < 10 || !userId) return json({ error: 'Invitasjonskoden er ugyldig.' }, 400)
  const hash = await sha256(code)
  const workspace = await env.DB.prepare(
    'SELECT id, name, owner_id, revision, created_at FROM dojo_workspaces WHERE invite_hash = ?',
  ).bind(hash).first()
  if (!workspace) return json({ error: 'Fant ikke arbeidsområdet.' }, 404)
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO dojo_members (workspace_id, user_id, display_name, role, joined_at)
     VALUES (?, ?, ?, 'member', ?)
     ON CONFLICT(workspace_id, user_id) DO UPDATE SET display_name = excluded.display_name`,
  ).bind(workspace.id, userId, displayName, now).run()
  await bumpRevision(env, workspace.id)
  return json({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      invite_code: code,
      owner_id: workspace.owner_id,
      role: workspace.owner_id === userId ? 'owner' : 'member',
      revision: Number(workspace.revision || 0) + 1,
      created_at: workspace.created_at,
    },
  })
}

async function createItem(request, env, workspace) {
  const payload = await bodyJson(request)
  const now = new Date().toISOString()
  const item = {
    id: cleanText(payload.id, 100) || crypto.randomUUID(),
    created_by: cleanText(payload.created_by, 100),
    assigned_to: cleanText(payload.assigned_to, 100) || null,
    title: cleanText(payload.title, 180),
    description: cleanText(payload.description, 5000),
    item_type: allowed(payload.item_type, ['idea', 'plan', 'implement', 'test', 'fix', 'bug'], 'idea'),
    status: allowed(payload.status, ['inbox', 'planned', 'progress', 'review', 'done'], 'inbox'),
    priority: allowed(payload.priority, ['low', 'medium', 'high', 'urgent'], 'medium'),
    tags: Array.isArray(payload.tags) ? payload.tags.map(tag => cleanText(tag, 40)).filter(Boolean).slice(0, 8) : [],
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(payload.due_date || '') ? payload.due_date : null,
  }
  if (!item.title || !item.created_by) return json({ error: 'Tittel og oppretter er påkrevd.' }, 400)
  await env.DB.prepare(
    `INSERT INTO dojo_items
     (id, workspace_id, created_by, assigned_to, title, description, item_type, status, priority, tags_json, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    item.id, workspace.id, item.created_by, item.assigned_to, item.title, item.description,
    item.item_type, item.status, item.priority, JSON.stringify(item.tags), item.due_date, now, now,
  ).run()
  await bumpRevision(env, workspace.id)
  return json({ item: mapItem({ ...item, workspace_id: workspace.id, tags_json: JSON.stringify(item.tags), created_at: now, updated_at: now }) }, 201)
}

async function updateItem(request, env, workspace, itemId) {
  const payload = await bodyJson(request)
  const current = await env.DB.prepare(
    'SELECT * FROM dojo_items WHERE id = ? AND workspace_id = ?',
  ).bind(itemId, workspace.id).first()
  if (!current) return json({ error: 'Fant ikke oppgaven.' }, 404)
  const tags = Array.isArray(payload.tags) ? payload.tags.map(tag => cleanText(tag, 40)).filter(Boolean).slice(0, 8) : parseTags(current.tags_json)
  const next = {
    assigned_to: Object.hasOwn(payload, 'assigned_to') ? (cleanText(payload.assigned_to, 100) || null) : current.assigned_to,
    title: Object.hasOwn(payload, 'title') ? cleanText(payload.title, 180) : current.title,
    description: Object.hasOwn(payload, 'description') ? cleanText(payload.description, 5000) : current.description,
    item_type: Object.hasOwn(payload, 'item_type') ? allowed(payload.item_type, ['idea', 'plan', 'implement', 'test', 'fix', 'bug'], current.item_type) : current.item_type,
    status: Object.hasOwn(payload, 'status') ? allowed(payload.status, ['inbox', 'planned', 'progress', 'review', 'done'], current.status) : current.status,
    priority: Object.hasOwn(payload, 'priority') ? allowed(payload.priority, ['low', 'medium', 'high', 'urgent'], current.priority) : current.priority,
    tags,
    due_date: Object.hasOwn(payload, 'due_date') ? (/^\d{4}-\d{2}-\d{2}$/.test(payload.due_date || '') ? payload.due_date : null) : current.due_date,
  }
  const now = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE dojo_items SET assigned_to = ?, title = ?, description = ?, item_type = ?, status = ?,
     priority = ?, tags_json = ?, due_date = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`,
  ).bind(
    next.assigned_to, next.title, next.description, next.item_type, next.status,
    next.priority, JSON.stringify(next.tags), next.due_date, now, itemId, workspace.id,
  ).run()
  await bumpRevision(env, workspace.id)
  return json({ item: mapItem({ ...current, ...next, tags_json: JSON.stringify(next.tags), updated_at: now }) })
}

// Every object in R2 lives under `${workspace.id}/`. A row in dojo_attachments
// only proves the ROW belongs to this workspace — never that the path it points
// at does, since the path arrives from the client. So anything that touches R2
// re-checks the prefix itself instead of trusting the stored path.
function ownsPath(workspace, path) {
  return typeof path === 'string' && path.startsWith(`${workspace.id}/`)
}

async function deleteItem(env, workspace, itemId) {
  const files = await env.DB.prepare(
    'SELECT storage_path FROM dojo_attachments WHERE workspace_id = ? AND item_id = ?',
  ).bind(workspace.id, itemId).all()
  await Promise.all((files.results || [])
    .filter(file => ownsPath(workspace, file.storage_path))
    .map(file => env.FILES.delete(file.storage_path)))
  await env.DB.prepare('DELETE FROM dojo_items WHERE id = ? AND workspace_id = ?').bind(itemId, workspace.id).run()
  await bumpRevision(env, workspace.id)
  return json({ ok: true })
}

async function createComment(request, env, workspace) {
  const payload = await bodyJson(request)
  const body = cleanText(payload.body, 4000)
  const itemId = cleanText(payload.item_id, 100)
  const authorId = cleanText(payload.author_id, 100)
  if (!body || !itemId || !authorId) return json({ error: 'Kommentaren mangler innhold.' }, 400)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await env.DB.prepare(
    'INSERT INTO dojo_comments (id, workspace_id, item_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, workspace.id, itemId, authorId, body, now).run()
  await bumpRevision(env, workspace.id)
  return json({ comment: { id, workspace_id: workspace.id, item_id: itemId, author_id: authorId, body, created_at: now } }, 201)
}

async function createAttachment(request, env, workspace) {
  const payload = await bodyJson(request)
  const now = new Date().toISOString()
  const attachment = {
    id: cleanText(payload.id, 100) || crypto.randomUUID(),
    item_id: cleanText(payload.item_id, 100),
    created_by: cleanText(payload.created_by, 100),
    storage_path: cleanText(payload.storage_path, 500),
    file_name: cleanText(payload.file_name, 180),
    mime_type: cleanText(payload.mime_type, 100),
    size_bytes: Math.max(0, Number(payload.size_bytes || 0)),
  }
  if (!attachment.item_id || !attachment.created_by || !attachment.storage_path) return json({ error: 'Ugyldig vedlegg.' }, 400)
  // Without this, a member could file an attachment row pointing at another
  // workspace's object and then have it deleted through deleteAttachment.
  if (!ownsPath(workspace, attachment.storage_path)) return json({ error: 'Ugyldig filsti.' }, 400)
  await env.DB.prepare(
    `INSERT INTO dojo_attachments
     (id, workspace_id, item_id, created_by, storage_path, file_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    attachment.id, workspace.id, attachment.item_id, attachment.created_by, attachment.storage_path,
    attachment.file_name, attachment.mime_type, attachment.size_bytes, now,
  ).run()
  await bumpRevision(env, workspace.id)
  return json({ attachment: { ...attachment, workspace_id: workspace.id, created_at: now } }, 201)
}

async function deleteAttachment(env, workspace, attachmentId) {
  const file = await env.DB.prepare(
    'SELECT storage_path FROM dojo_attachments WHERE id = ? AND workspace_id = ?',
  ).bind(attachmentId, workspace.id).first()
  if (ownsPath(workspace, file?.storage_path)) await env.FILES.delete(file.storage_path)
  await env.DB.prepare('DELETE FROM dojo_attachments WHERE id = ? AND workspace_id = ?').bind(attachmentId, workspace.id).run()
  await bumpRevision(env, workspace.id)
  return json({ ok: true })
}

async function uploadFile(request, env, workspace) {
  const path = cleanText(request.headers.get('x-dojo-path'), 500)
  const type = cleanText(request.headers.get('content-type'), 100, 'application/octet-stream')
  const length = Number(request.headers.get('content-length') || 0)
  if (!ownsPath(workspace, path) || length > 5 * 1024 * 1024) return json({ error: 'Filen er for stor eller har ugyldig sti.' }, 400)
  await env.FILES.put(path, request.body, { httpMetadata: { contentType: type } })
  return json({ path }, 201)
}

// Content types we are willing to hand back for inline rendering. The uploader
// chooses its own Content-Type, so echoing that back would let a member store
// text/html and run script on this origin. Images are safe to render and the UI
// depends on it (DojoHQ renders attachments in <img>); everything else is served
// as an opaque download. SVG is deliberately absent — it can carry script.
const INLINE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

async function downloadFile(env, workspace, path) {
  if (!ownsPath(workspace, path)) return json({ error: 'Ugyldig filsti.' }, 400)
  const object = await env.FILES.get(path)
  if (!object) return json({ error: 'Fant ikke filen.' }, 404)

  const stored = (object.httpMetadata?.contentType || '').split(';')[0].trim().toLowerCase()
  const inline = INLINE_TYPES.includes(stored)
  const name = path.split('/').pop() || 'fil'

  const headers = new Headers()
  headers.set('Content-Type', inline ? stored : 'application/octet-stream')
  headers.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox")
  headers.set('Cache-Control', 'private, max-age=300')
  return new Response(object.body, { headers })
}

async function deleteFile(env, workspace, path) {
  if (!ownsPath(workspace, path)) return json({ error: 'Ugyldig filsti.' }, 400)
  await env.FILES.delete(path)
  return json({ ok: true })
}

async function dojoApi(request, env, url) {
  if (request.method === 'GET' && url.pathname === '/api/dojo/status') {
    return json({ online: true, storage: 'D1 + R2' })
  }
  if (request.method === 'POST' && url.pathname === '/api/dojo/workspaces') return createWorkspace(request, env)
  if (request.method === 'POST' && url.pathname === '/api/dojo/join') return joinWorkspace(request, env)

  const match = url.pathname.match(/^\/api\/dojo\/workspaces\/([^/]+)(?:\/(.*))?$/)
  if (!match) return json({ error: 'Ukjent API-rute.' }, 404)
  const workspaceId = decodeURIComponent(match[1])
  const action = match[2] || ''
  const workspace = await workspaceAccess(request, env, workspaceId)
  if (!workspace) return json({ error: 'Arbeidsområdet eller nøkkelen er ugyldig.' }, 401)

  if (request.method === 'GET' && action === 'snapshot') {
    const clientRevision = Number(url.searchParams.get('revision') || 0)
    if (clientRevision && clientRevision === Number(workspace.revision)) return new Response(null, { status: 204 })
    return json(await snapshot(env, workspace))
  }
  if (request.method === 'POST' && action === 'items') return createItem(request, env, workspace)
  if (request.method === 'POST' && action === 'comments') return createComment(request, env, workspace)
  if (request.method === 'POST' && action === 'attachments') return createAttachment(request, env, workspace)
  if (request.method === 'POST' && action === 'files') return uploadFile(request, env, workspace)

  const itemMatch = action.match(/^items\/([^/]+)$/)
  if (itemMatch && request.method === 'PATCH') return updateItem(request, env, workspace, decodeURIComponent(itemMatch[1]))
  if (itemMatch && request.method === 'DELETE') return deleteItem(env, workspace, decodeURIComponent(itemMatch[1]))

  const attachmentMatch = action.match(/^attachments\/([^/]+)$/)
  if (attachmentMatch && request.method === 'DELETE') return deleteAttachment(env, workspace, decodeURIComponent(attachmentMatch[1]))

  if (action === 'files' && request.method === 'GET') return downloadFile(env, workspace, url.searchParams.get('path') || '')
  if (action === 'files' && request.method === 'DELETE') return deleteFile(env, workspace, url.searchParams.get('path') || '')
  return json({ error: 'Ukjent handling.' }, 404)
}

function securityHeaders(response) {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'same-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    try {
      if (url.pathname.startsWith('/api/dojo/')) return securityHeaders(await dojoApi(request, env, url))
      if (url.pathname === '/') return Response.redirect(new URL('/hq.html?online=1', url), 302)
      return securityHeaders(await env.ASSETS.fetch(request))
    } catch (error) {
      return securityHeaders(json({ error: error instanceof Error ? error.message : 'Ukjent serverfeil.' }, 500))
    }
  },
}
