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

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
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
    milestone_id: row.milestone_id || null,
    depends_on: parseJson(row.depends_on_json || '[]', []),
    blocked_reason: row.blocked_reason || '',
    github_branch: row.github_branch || '',
    github_pr_url: row.github_pr_url || '',
    ci_status: row.ci_status || 'none',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function recordActivity(env, workspaceId, actorId, eventType, summary, itemId = null, metadata = {}) {
  await env.DB.prepare(
    `INSERT INTO dojo_activity
     (id, workspace_id, item_id, actor_id, event_type, summary, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), workspaceId, itemId, cleanText(actorId, 100, 'system'),
    cleanText(eventType, 60, 'update'), cleanText(summary, 500, 'Oppdatert'),
    JSON.stringify(metadata || {}), new Date().toISOString(),
  ).run()
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
    milestone_id: cleanText(payload.milestone_id, 100) || null,
    depends_on: Array.isArray(payload.depends_on) ? payload.depends_on.map(value => cleanText(value, 100)).filter(Boolean).slice(0, 12) : [],
    blocked_reason: cleanText(payload.blocked_reason, 1000),
    github_branch: cleanText(payload.github_branch, 250),
    github_pr_url: cleanText(payload.github_pr_url, 500),
    ci_status: allowed(payload.ci_status, ['none', 'pending', 'passing', 'failing'], 'none'),
  }
  if (item.milestone_id) {
    const milestone = await env.DB.prepare('SELECT id FROM dojo_milestones WHERE id = ? AND workspace_id = ?')
      .bind(item.milestone_id, workspace.id).first()
    if (!milestone) return json({ error: 'Milepælen tilhører ikke dette arbeidsområdet.' }, 400)
  }
  if (!item.title || !item.created_by) return json({ error: 'Tittel og oppretter er påkrevd.' }, 400)
  await env.DB.prepare(
    `INSERT INTO dojo_items
     (id, workspace_id, created_by, assigned_to, title, description, item_type, status, priority, tags_json,
      due_date, milestone_id, depends_on_json, blocked_reason, github_branch, github_pr_url, ci_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    item.id, workspace.id, item.created_by, item.assigned_to, item.title, item.description,
    item.item_type, item.status, item.priority, JSON.stringify(item.tags), item.due_date,
    item.milestone_id, JSON.stringify(item.depends_on), item.blocked_reason, item.github_branch,
    item.github_pr_url, item.ci_status, now, now,
  ).run()
  await bumpRevision(env, workspace.id)
  await recordActivity(env, workspace.id, item.created_by, 'item.created', `Opprettet «${item.title}»`, item.id)
  return json({ item: mapItem({
    ...item,
    workspace_id: workspace.id,
    tags_json: JSON.stringify(item.tags),
    depends_on_json: JSON.stringify(item.depends_on),
    created_at: now,
    updated_at: now,
  }) }, 201)
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
    milestone_id: Object.hasOwn(payload, 'milestone_id') ? (cleanText(payload.milestone_id, 100) || null) : current.milestone_id,
    depends_on: Object.hasOwn(payload, 'depends_on') && Array.isArray(payload.depends_on)
      ? payload.depends_on.map(value => cleanText(value, 100)).filter(Boolean).slice(0, 12)
      : parseJson(current.depends_on_json || '[]', []),
    blocked_reason: Object.hasOwn(payload, 'blocked_reason') ? cleanText(payload.blocked_reason, 1000) : current.blocked_reason,
    github_branch: Object.hasOwn(payload, 'github_branch') ? cleanText(payload.github_branch, 250) : current.github_branch,
    github_pr_url: Object.hasOwn(payload, 'github_pr_url') ? cleanText(payload.github_pr_url, 500) : current.github_pr_url,
    ci_status: Object.hasOwn(payload, 'ci_status') ? allowed(payload.ci_status, ['none', 'pending', 'passing', 'failing'], current.ci_status) : current.ci_status,
  }
  next.depends_on = [...new Set(next.depends_on)].filter(dependencyId => dependencyId !== itemId)
  if (next.milestone_id) {
    const milestone = await env.DB.prepare('SELECT id FROM dojo_milestones WHERE id = ? AND workspace_id = ?')
      .bind(next.milestone_id, workspace.id).first()
    if (!milestone) return json({ error: 'Milepælen tilhører ikke dette arbeidsområdet.' }, 400)
  }
  if (next.depends_on.length) {
    const dependencies = await Promise.all(next.depends_on.map(dependencyId => (
      env.DB.prepare('SELECT id FROM dojo_items WHERE id = ? AND workspace_id = ?')
        .bind(dependencyId, workspace.id).first()
    )))
    if (dependencies.some(dependency => !dependency)) {
      return json({ error: 'En av avhengighetene tilhører ikke dette arbeidsområdet.' }, 400)
    }
  }
  const now = new Date().toISOString()
  const actorId = cleanText(payload._actor_id, 100, current.created_by)
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO dojo_item_versions (id, workspace_id, item_id, actor_id, snapshot_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), workspace.id, itemId, actorId, JSON.stringify(mapItem(current)), now),
    env.DB.prepare(
      `UPDATE dojo_items SET assigned_to = ?, title = ?, description = ?, item_type = ?, status = ?,
       priority = ?, tags_json = ?, due_date = ?, milestone_id = ?, depends_on_json = ?, blocked_reason = ?,
       github_branch = ?, github_pr_url = ?, ci_status = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    ).bind(
      next.assigned_to, next.title, next.description, next.item_type, next.status,
      next.priority, JSON.stringify(next.tags), next.due_date, next.milestone_id,
      JSON.stringify(next.depends_on), next.blocked_reason, next.github_branch, next.github_pr_url,
      next.ci_status, now, itemId, workspace.id,
    ),
  ])
  await bumpRevision(env, workspace.id)
  await recordActivity(env, workspace.id, actorId, 'item.updated', `Oppdaterte «${next.title}»`, itemId, {
    status: next.status,
  })
  return json({ item: mapItem({
    ...current,
    ...next,
    tags_json: JSON.stringify(next.tags),
    depends_on_json: JSON.stringify(next.depends_on),
    updated_at: now,
  }) })
}

// Every object in R2 lives under `${workspace.id}/`. A row in dojo_attachments
// only proves the ROW belongs to this workspace — never that the path it points
// at does, since the path arrives from the client. So anything that touches R2
// re-checks the prefix itself instead of trusting the stored path.
function ownsPath(workspace, path) {
  return typeof path === 'string' && path.startsWith(`${workspace.id}/`)
}

async function deleteItem(request, env, workspace, itemId) {
  const actorId = cleanText(request.headers.get('x-dojo-user'), 100, 'system')
  const item = await env.DB.prepare(
    'SELECT title FROM dojo_items WHERE id = ? AND workspace_id = ?',
  ).bind(itemId, workspace.id).first()
  const files = await env.DB.prepare(
    'SELECT storage_path FROM dojo_attachments WHERE workspace_id = ? AND item_id = ?',
  ).bind(workspace.id, itemId).all()
  await Promise.all((files.results || [])
    .filter(file => ownsPath(workspace, file.storage_path))
    .map(file => env.FILES.delete(file.storage_path)))
  await recordActivity(env, workspace.id, actorId, 'item.deleted', `Slettet «${item?.title || 'oppgave'}»`, itemId)
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
  const mentions = [...body.matchAll(/@([\p{L}\p{N}._-]+)/gu)].map(match => match[1]).slice(0, 12)
  await recordActivity(env, workspace.id, authorId, 'comment.created', 'La til en kommentar', itemId, { mentions })
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

async function hq2Snapshot(env, workspace) {
  const [milestones, testCases, runs, activities, presence, versions] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM dojo_milestones WHERE workspace_id = ? ORDER BY target_date, created_at').bind(workspace.id),
    env.DB.prepare('SELECT * FROM dojo_test_cases WHERE workspace_id = ? ORDER BY updated_at DESC').bind(workspace.id),
    env.DB.prepare('SELECT * FROM dojo_agent_runs WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 100').bind(workspace.id),
    env.DB.prepare('SELECT * FROM dojo_activity WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 160').bind(workspace.id),
    env.DB.prepare('SELECT * FROM dojo_presence WHERE workspace_id = ? ORDER BY last_seen DESC').bind(workspace.id),
    env.DB.prepare('SELECT * FROM dojo_item_versions WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100').bind(workspace.id),
  ])
  const onlineSince = Date.now() - 45_000
  return json({
    milestones: milestones.results || [],
    testCases: testCases.results || [],
    runs: (runs.results || []).map(row => ({
      ...row,
      files: parseJson(row.files_json || '[]', []),
      tests: parseJson(row.tests_json || '[]', []),
    })),
    activities: (activities.results || []).map(row => ({
      ...row,
      metadata: parseJson(row.metadata_json || '{}', {}),
    })),
    presence: (presence.results || []).filter(row => Date.parse(row.last_seen) >= onlineSince),
    versions: (versions.results || []).map(row => ({
      ...row,
      snapshot: parseJson(row.snapshot_json || '{}', {}),
    })),
  })
}

async function createMilestone(request, env, workspace) {
  const payload = await bodyJson(request)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const title = cleanText(payload.title, 140)
  const actorId = cleanText(payload.created_by, 100)
  if (!title || !actorId) return json({ error: 'Milepælen mangler tittel eller oppretter.' }, 400)
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.target_date || '') ? payload.target_date : null
  const color = /^#[0-9a-fA-F]{6}$/.test(payload.color || '') ? payload.color : '#D9FF57'
  await env.DB.prepare(
    `INSERT INTO dojo_milestones
     (id, workspace_id, title, description, status, target_date, color, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, workspace.id, title, cleanText(payload.description, 2000),
    allowed(payload.status, ['planned', 'active', 'shipped'], 'planned'),
    targetDate, color, actorId, now, now,
  ).run()
  await bumpRevision(env, workspace.id)
  await recordActivity(env, workspace.id, actorId, 'milestone.created', `Opprettet milepælen «${title}»`, null, { milestoneId: id })
  return json({ milestone: { id, workspace_id: workspace.id, title, target_date: targetDate, color } }, 201)
}

async function updateMilestone(request, env, workspace, milestoneId) {
  const payload = await bodyJson(request)
  const current = await env.DB.prepare(
    'SELECT * FROM dojo_milestones WHERE id = ? AND workspace_id = ?',
  ).bind(milestoneId, workspace.id).first()
  if (!current) return json({ error: 'Fant ikke milepælen.' }, 404)
  const next = {
    title: Object.hasOwn(payload, 'title') ? cleanText(payload.title, 140) : current.title,
    description: Object.hasOwn(payload, 'description') ? cleanText(payload.description, 2000) : current.description,
    status: Object.hasOwn(payload, 'status') ? allowed(payload.status, ['planned', 'active', 'shipped'], current.status) : current.status,
    target_date: Object.hasOwn(payload, 'target_date') ? (/^\d{4}-\d{2}-\d{2}$/.test(payload.target_date || '') ? payload.target_date : null) : current.target_date,
    color: Object.hasOwn(payload, 'color') && /^#[0-9a-fA-F]{6}$/.test(payload.color || '') ? payload.color : current.color,
  }
  const now = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE dojo_milestones SET title = ?, description = ?, status = ?, target_date = ?, color = ?, updated_at = ?
     WHERE id = ? AND workspace_id = ?`,
  ).bind(next.title, next.description, next.status, next.target_date, next.color, now, milestoneId, workspace.id).run()
  await bumpRevision(env, workspace.id)
  await recordActivity(
    env, workspace.id, cleanText(payload._actor_id, 100, current.created_by),
    'milestone.updated', `Oppdaterte milepælen «${next.title}»`, null, { milestoneId },
  )
  return json({ milestone: { ...current, ...next, updated_at: now } })
}

async function createTestCase(request, env, workspace) {
  const payload = await bodyJson(request)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const title = cleanText(payload.title, 220)
  const itemId = cleanText(payload.item_id, 100)
  const actorId = cleanText(payload.created_by, 100)
  const item = itemId
    ? await env.DB.prepare('SELECT id FROM dojo_items WHERE id = ? AND workspace_id = ?').bind(itemId, workspace.id).first()
    : null
  if (itemId && !item) return json({ error: 'Testen må knyttes til en oppgave i dette arbeidsområdet.' }, 400)
  if (!title || !itemId || !actorId) return json({ error: 'Testen mangler oppgave, tittel eller oppretter.' }, 400)
  await env.DB.prepare(
    `INSERT INTO dojo_test_cases
     (id, workspace_id, item_id, title, expected, notes, status, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, workspace.id, itemId, title, cleanText(payload.expected, 3000), cleanText(payload.notes, 3000),
    allowed(payload.status, ['pending', 'passed', 'failed'], 'pending'), actorId, actorId, now, now,
  ).run()
  await bumpRevision(env, workspace.id)
  await recordActivity(env, workspace.id, actorId, 'test.created', `La til testen «${title}»`, itemId, { testCaseId: id })
  return json({ testCase: { id, workspace_id: workspace.id, item_id: itemId, title, status: 'pending', created_at: now, updated_at: now } }, 201)
}

async function updateTestCase(request, env, workspace, testCaseId) {
  const payload = await bodyJson(request)
  const current = await env.DB.prepare(
    'SELECT * FROM dojo_test_cases WHERE id = ? AND workspace_id = ?',
  ).bind(testCaseId, workspace.id).first()
  if (!current) return json({ error: 'Fant ikke testen.' }, 404)
  const status = Object.hasOwn(payload, 'status') ? allowed(payload.status, ['pending', 'passed', 'failed'], current.status) : current.status
  const title = Object.hasOwn(payload, 'title') ? cleanText(payload.title, 220) : current.title
  const expected = Object.hasOwn(payload, 'expected') ? cleanText(payload.expected, 3000) : current.expected
  const notes = Object.hasOwn(payload, 'notes') ? cleanText(payload.notes, 3000) : current.notes
  const actorId = cleanText(payload.updated_by, 100, current.updated_by)
  const now = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE dojo_test_cases SET title = ?, expected = ?, notes = ?, status = ?, updated_by = ?, updated_at = ?
     WHERE id = ? AND workspace_id = ?`,
  ).bind(title, expected, notes, status, actorId, now, testCaseId, workspace.id).run()
  await bumpRevision(env, workspace.id)
  await recordActivity(env, workspace.id, actorId, `test.${status}`, `${status === 'passed' ? 'Godkjente' : status === 'failed' ? 'Feilet' : 'Nullstilte'} testen «${title}»`, current.item_id, { testCaseId })
  return json({ testCase: { ...current, title, expected, notes, status, updated_by: actorId, updated_at: now } })
}

async function deleteTestCase(request, env, workspace, testCaseId) {
  const actorId = cleanText(request.headers.get('x-dojo-user'), 100, 'system')
  const current = await env.DB.prepare(
    'SELECT item_id, title FROM dojo_test_cases WHERE id = ? AND workspace_id = ?',
  ).bind(testCaseId, workspace.id).first()
  if (!current) return json({ error: 'Fant ikke testen.' }, 404)
  await env.DB.prepare('DELETE FROM dojo_test_cases WHERE id = ? AND workspace_id = ?').bind(testCaseId, workspace.id).run()
  await bumpRevision(env, workspace.id)
  await recordActivity(env, workspace.id, actorId, 'test.deleted', `Slettet testen «${current.title}»`, current.item_id)
  return json({ ok: true })
}

async function createAgentRun(request, env, workspace) {
  const payload = await bodyJson(request)
  const id = crypto.randomUUID()
  const itemId = cleanText(payload.item_id, 100)
  const actorId = cleanText(payload.started_by, 100)
  const item = itemId
    ? await env.DB.prepare('SELECT id FROM dojo_items WHERE id = ? AND workspace_id = ?').bind(itemId, workspace.id).first()
    : null
  if (itemId && !item) return json({ error: 'Claude-økten må knyttes til en oppgave i dette arbeidsområdet.' }, 400)
  if (!itemId || !actorId) return json({ error: 'Claude-økten mangler oppgave eller bruker.' }, 400)
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO dojo_agent_runs
     (id, workspace_id, item_id, status, summary, files_json, tests_json, branch, pr_url, ci_status,
      started_by, started_at, completed_at, updated_at)
     VALUES (?, ?, ?, 'queued', '', '[]', '[]', '', '', 'none', ?, ?, NULL, ?)`,
  ).bind(id, workspace.id, itemId, actorId, now, now).run()
  await bumpRevision(env, workspace.id)
  await recordActivity(env, workspace.id, actorId, 'run.queued', 'Klargjorde en Claude-økt', itemId, { runId: id })
  return json({ run: { id, workspace_id: workspace.id, item_id: itemId, status: 'queued', started_by: actorId, started_at: now, updated_at: now } }, 201)
}

async function updateAgentRun(request, env, workspace, runId) {
  const payload = await bodyJson(request)
  const current = await env.DB.prepare(
    'SELECT * FROM dojo_agent_runs WHERE id = ? AND workspace_id = ?',
  ).bind(runId, workspace.id).first()
  if (!current) return json({ error: 'Fant ikke Claude-økten.' }, 404)
  const status = Object.hasOwn(payload, 'status') ? allowed(payload.status, ['queued', 'running', 'needs_input', 'testing', 'completed', 'failed'], current.status) : current.status
  const summary = Object.hasOwn(payload, 'summary') ? cleanText(payload.summary, 5000) : current.summary
  const files = Array.isArray(payload.files) ? payload.files.map(value => cleanText(value, 500)).filter(Boolean).slice(0, 100) : parseJson(current.files_json || '[]', [])
  const tests = Array.isArray(payload.tests) ? payload.tests.map(value => cleanText(value, 500)).filter(Boolean).slice(0, 100) : parseJson(current.tests_json || '[]', [])
  const branch = Object.hasOwn(payload, 'branch') ? cleanText(payload.branch, 250) : current.branch
  const prUrl = Object.hasOwn(payload, 'pr_url') ? cleanText(payload.pr_url, 500) : current.pr_url
  const ciStatus = Object.hasOwn(payload, 'ci_status') ? allowed(payload.ci_status, ['none', 'pending', 'passing', 'failing'], current.ci_status) : current.ci_status
  const completedAt = ['completed', 'failed'].includes(status) ? (current.completed_at || new Date().toISOString()) : null
  const now = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE dojo_agent_runs SET status = ?, summary = ?, files_json = ?, tests_json = ?, branch = ?, pr_url = ?,
     ci_status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`,
  ).bind(status, summary, JSON.stringify(files), JSON.stringify(tests), branch, prUrl, ciStatus, completedAt, now, runId, workspace.id).run()
  await bumpRevision(env, workspace.id)
  await recordActivity(
    env, workspace.id, cleanText(payload._actor_id, 100, current.started_by),
    `run.${status}`, `Claude-økt: ${status.replace('_', ' ')}`, current.item_id, { runId },
  )
  return json({ run: { ...current, status, summary, files, tests, branch, pr_url: prUrl, ci_status: ciStatus, completed_at: completedAt, updated_at: now } })
}

async function heartbeatPresence(request, env, workspace) {
  const payload = await bodyJson(request)
  const userId = cleanText(payload.user_id, 100)
  const displayName = cleanText(payload.display_name, 80, 'Dojo-medlem')
  if (!userId) return json({ error: 'Tilstedeværelsen mangler bruker.' }, 400)
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO dojo_presence (workspace_id, user_id, display_name, active_item_id, last_seen)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, user_id) DO UPDATE SET
         display_name = excluded.display_name,
         active_item_id = excluded.active_item_id,
         last_seen = excluded.last_seen`,
    ).bind(workspace.id, userId, displayName, cleanText(payload.active_item_id, 100) || null, now),
    env.DB.prepare('DELETE FROM dojo_presence WHERE workspace_id = ? AND last_seen < ?')
      .bind(workspace.id, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])
  return json({ ok: true, lastSeen: now })
}

async function createManualActivity(request, env, workspace) {
  const payload = await bodyJson(request)
  const actorId = cleanText(payload.actor_id, 100)
  const summary = cleanText(payload.summary, 500)
  if (!actorId || !summary) return json({ error: 'Beslutningen mangler bruker eller tekst.' }, 400)
  await recordActivity(env, workspace.id, actorId, allowed(payload.event_type, ['decision', 'note'], 'note'), summary, cleanText(payload.item_id, 100) || null)
  await bumpRevision(env, workspace.id)
  return json({ ok: true }, 201)
}

async function restoreItemVersion(request, env, workspace, itemId) {
  const payload = await bodyJson(request)
  const actorId = cleanText(payload.actor_id, 100)
  const version = await env.DB.prepare(
    'SELECT snapshot_json FROM dojo_item_versions WHERE id = ? AND item_id = ? AND workspace_id = ?',
  ).bind(cleanText(payload.version_id, 100), itemId, workspace.id).first()
  const current = await env.DB.prepare(
    'SELECT * FROM dojo_items WHERE id = ? AND workspace_id = ?',
  ).bind(itemId, workspace.id).first()
  if (!version || !current || !actorId) return json({ error: 'Kunne ikke gjenopprette denne versjonen.' }, 404)
  const snapshot = parseJson(version.snapshot_json || '{}', {})
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO dojo_item_versions (id, workspace_id, item_id, actor_id, snapshot_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), workspace.id, itemId, actorId, JSON.stringify(mapItem(current)), now),
    env.DB.prepare(
      `UPDATE dojo_items SET assigned_to = ?, title = ?, description = ?, item_type = ?, status = ?, priority = ?,
       tags_json = ?, due_date = ?, milestone_id = ?, depends_on_json = ?, blocked_reason = ?, github_branch = ?,
       github_pr_url = ?, ci_status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`,
    ).bind(
      snapshot.assigned_to || null, cleanText(snapshot.title, 180, current.title), cleanText(snapshot.description, 5000),
      allowed(snapshot.item_type, ['idea', 'plan', 'implement', 'test', 'fix', 'bug'], current.item_type),
      allowed(snapshot.status, ['inbox', 'planned', 'progress', 'review', 'done'], current.status),
      allowed(snapshot.priority, ['low', 'medium', 'high', 'urgent'], current.priority),
      JSON.stringify(Array.isArray(snapshot.tags) ? snapshot.tags : []), snapshot.due_date || null,
      snapshot.milestone_id || null, JSON.stringify(Array.isArray(snapshot.depends_on) ? snapshot.depends_on : []),
      cleanText(snapshot.blocked_reason, 1000), cleanText(snapshot.github_branch, 250),
      cleanText(snapshot.github_pr_url, 500), allowed(snapshot.ci_status, ['none', 'pending', 'passing', 'failing'], 'none'),
      now, itemId, workspace.id,
    ),
  ])
  await bumpRevision(env, workspace.id)
  await recordActivity(env, workspace.id, actorId, 'item.restored', `Gjenopprettet «${snapshot.title || current.title}»`, itemId)
  return json({ item: { ...snapshot, id: itemId, workspace_id: workspace.id, updated_at: now } })
}

async function pairBridge(request, env) {
  const payload = await bodyJson(request)
  const code = normalizeCode(payload.code)
  if (code.length < 10) return json({ error: 'Invitasjonskoden er ugyldig.' }, 400)
  const workspace = await env.DB.prepare(
    'SELECT id, name FROM dojo_workspaces WHERE invite_hash = ?',
  ).bind(await sha256(code)).first()
  if (!workspace) return json({ error: 'Fant ikke arbeidsområdet.' }, 404)
  return json({ workspace: { id: workspace.id, name: workspace.name } })
}

async function bridgeStatus(env, workspace) {
  const client = await env.DB.prepare(
    `SELECT client_id, display_name, version, bridge_version, project_root, readme_found, documents_json, last_seen
     FROM dojo_bridge_clients WHERE workspace_id = ? ORDER BY last_seen DESC LIMIT 1`,
  ).bind(workspace.id).first()
  const connected = Boolean(client?.last_seen && Date.now() - Date.parse(client.last_seen) < 20_000)
  return json({
    connected,
    claudeReady: connected && Boolean(client?.version),
    claudeVersion: connected ? client?.version || '' : '',
    clientName: connected ? client?.display_name || '' : '',
    lastSeen: client?.last_seen || null,
    bridgeVersion: connected ? client?.bridge_version || '' : '',
    projectRoot: connected ? client?.project_root || '' : '',
    readmeFound: connected ? Boolean(client?.readme_found) : false,
    documents: connected ? parseJson(client?.documents_json || '[]', []) : [],
    mode: 'cloud',
  })
}

async function createBridgeCommand(request, env, workspace) {
  const payload = await bodyJson(request)
  const action = allowed(payload.action, ['read', 'sync', 'launch'], '')
  if (!action) return json({ error: 'Denne brohandlingen er ikke tillatt.' }, 400)
  const commandPayload = payload.payload && typeof payload.payload === 'object' ? payload.payload : {}
  const payloadJson = JSON.stringify(commandPayload)
  if (payloadJson.length > 1_800_000) return json({ error: 'Broforespørselen er for stor.' }, 413)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO dojo_bridge_commands
       (id, workspace_id, action, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, 'queued', ?)`,
    ).bind(id, workspace.id, action, payloadJson, now),
    env.DB.prepare(
      `DELETE FROM dojo_bridge_commands
       WHERE workspace_id = ? AND completed_at IS NOT NULL AND completed_at < ?`,
    ).bind(workspace.id, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ])
  return json({ command: { id, action, status: 'queued', createdAt: now } }, 202)
}

async function getBridgeCommand(env, workspace, commandId) {
  const command = await env.DB.prepare(
    `SELECT id, action, status, result_json, error_text, created_at, claimed_at, completed_at
     FROM dojo_bridge_commands WHERE id = ? AND workspace_id = ?`,
  ).bind(commandId, workspace.id).first()
  if (!command) return json({ error: 'Fant ikke brohandlingen.' }, 404)
  const result = command.result_json ? parseJson(command.result_json) : null
  return json({
    command: {
      id: command.id,
      action: command.action,
      status: command.status,
      result,
      error: command.error_text || '',
      createdAt: command.created_at,
      claimedAt: command.claimed_at,
      completedAt: command.completed_at,
    },
  })
}

async function pollBridge(request, env, workspace) {
  const payload = await bodyJson(request)
  const clientId = cleanText(payload.clientId, 100)
  const displayName = cleanText(payload.displayName, 80, 'Lokal Claude-bro')
  const version = cleanText(payload.version, 120)
  const bridgeVersion = cleanText(payload.bridgeVersion, 80)
  const projectRoot = cleanText(payload.projectRoot, 1000)
  const readmeFound = payload.readmeFound ? 1 : 0
  const documentsJson = JSON.stringify(Array.isArray(payload.documents) ? payload.documents.slice(0, 20) : [])
  if (!clientId) return json({ error: 'Broklienten mangler identitet.' }, 400)
  const now = new Date().toISOString()
  const staleAt = new Date(Date.now() - 2 * 60 * 1000).toISOString()

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO dojo_bridge_clients
       (workspace_id, client_id, display_name, version, bridge_version, project_root, readme_found, documents_json, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, client_id) DO UPDATE SET
         display_name = excluded.display_name,
         version = excluded.version,
         bridge_version = excluded.bridge_version,
         project_root = excluded.project_root,
         readme_found = excluded.readme_found,
         documents_json = excluded.documents_json,
         last_seen = excluded.last_seen`,
    ).bind(
      workspace.id, clientId, displayName, version || null, bridgeVersion || null,
      projectRoot || null, readmeFound, documentsJson, now,
    ),
    env.DB.prepare(
      `UPDATE dojo_bridge_commands SET status = 'failed', error_text = ?, completed_at = ?
       WHERE workspace_id = ? AND status = 'running' AND claimed_at < ?`,
    ).bind('Broklienten ble koblet fra før handlingen ble fullført.', now, workspace.id, staleAt),
  ])

  const command = await env.DB.prepare(
    `UPDATE dojo_bridge_commands
     SET status = 'running', client_id = ?, claimed_at = ?
     WHERE id = (
       SELECT id FROM dojo_bridge_commands
       WHERE workspace_id = ? AND status = 'queued'
       ORDER BY created_at ASC LIMIT 1
     ) AND status = 'queued'
     RETURNING id, action, payload_json`,
  ).bind(clientId, now, workspace.id).first()

  if (!command) return json({ command: null })
  const commandPayload = parseJson(command.payload_json || '{}', {})
  return json({ command: { id: command.id, action: command.action, payload: commandPayload } })
}

async function completeBridgeCommand(request, env, workspace, commandId) {
  const payload = await bodyJson(request)
  const clientId = cleanText(payload.clientId, 100)
  const succeeded = payload.ok === true
  const resultJson = succeeded ? JSON.stringify(payload.result ?? {}) : null
  const errorText = succeeded ? null : cleanText(payload.error, 2000, 'Brohandlingen feilet.')
  if (!clientId || (resultJson && resultJson.length > 1_800_000)) {
    return json({ error: 'Ugyldig resultat fra broklienten.' }, 400)
  }
  const now = new Date().toISOString()
  const updated = await env.DB.prepare(
    `UPDATE dojo_bridge_commands
     SET status = ?, result_json = ?, error_text = ?, completed_at = ?
     WHERE id = ? AND workspace_id = ? AND client_id = ? AND status = 'running'
     RETURNING id`,
  ).bind(
    succeeded ? 'completed' : 'failed', resultJson, errorText, now,
    commandId, workspace.id, clientId,
  ).first()
  if (!updated) return json({ error: 'Brohandlingen kan ikke fullføres av denne klienten.' }, 409)
  return json({ ok: true })
}

async function dojoApi(request, env, url) {
  if (request.method === 'GET' && url.pathname === '/api/dojo/status') {
    return json({ online: true, storage: 'D1 + R2' })
  }
  if (request.method === 'POST' && url.pathname === '/api/dojo/workspaces') return createWorkspace(request, env)
  if (request.method === 'POST' && url.pathname === '/api/dojo/join') return joinWorkspace(request, env)
  if (request.method === 'POST' && url.pathname === '/api/dojo/bridge/pair') return pairBridge(request, env)

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
  if (request.method === 'GET' && action === 'hq2') return hq2Snapshot(env, workspace)
  if (request.method === 'POST' && action === 'milestones') return createMilestone(request, env, workspace)
  if (request.method === 'POST' && action === 'test-cases') return createTestCase(request, env, workspace)
  if (request.method === 'POST' && action === 'agent-runs') return createAgentRun(request, env, workspace)
  if (request.method === 'POST' && action === 'presence') return heartbeatPresence(request, env, workspace)
  if (request.method === 'POST' && action === 'activities') return createManualActivity(request, env, workspace)
  if (request.method === 'GET' && action === 'bridge/status') return bridgeStatus(env, workspace)
  if (request.method === 'POST' && action === 'bridge/commands') return createBridgeCommand(request, env, workspace)
  if (request.method === 'POST' && action === 'bridge/poll') return pollBridge(request, env, workspace)

  const itemMatch = action.match(/^items\/([^/]+)$/)
  if (itemMatch && request.method === 'PATCH') return updateItem(request, env, workspace, decodeURIComponent(itemMatch[1]))
  if (itemMatch && request.method === 'DELETE') return deleteItem(request, env, workspace, decodeURIComponent(itemMatch[1]))
  const restoreMatch = action.match(/^items\/([^/]+)\/restore$/)
  if (restoreMatch && request.method === 'POST') return restoreItemVersion(request, env, workspace, decodeURIComponent(restoreMatch[1]))

  const milestoneMatch = action.match(/^milestones\/([^/]+)$/)
  if (milestoneMatch && request.method === 'PATCH') return updateMilestone(request, env, workspace, decodeURIComponent(milestoneMatch[1]))

  const testCaseMatch = action.match(/^test-cases\/([^/]+)$/)
  if (testCaseMatch && request.method === 'PATCH') return updateTestCase(request, env, workspace, decodeURIComponent(testCaseMatch[1]))
  if (testCaseMatch && request.method === 'DELETE') return deleteTestCase(request, env, workspace, decodeURIComponent(testCaseMatch[1]))

  const runMatch = action.match(/^agent-runs\/([^/]+)$/)
  if (runMatch && request.method === 'PATCH') return updateAgentRun(request, env, workspace, decodeURIComponent(runMatch[1]))

  const attachmentMatch = action.match(/^attachments\/([^/]+)$/)
  if (attachmentMatch && request.method === 'DELETE') return deleteAttachment(env, workspace, decodeURIComponent(attachmentMatch[1]))

  const bridgeCommandMatch = action.match(/^bridge\/commands\/([^/]+)$/)
  if (bridgeCommandMatch && request.method === 'GET') {
    return getBridgeCommand(env, workspace, decodeURIComponent(bridgeCommandMatch[1]))
  }
  const bridgeResultMatch = action.match(/^bridge\/commands\/([^/]+)\/result$/)
  if (bridgeResultMatch && request.method === 'POST') {
    return completeBridgeCommand(request, env, workspace, decodeURIComponent(bridgeResultMatch[1]))
  }

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
