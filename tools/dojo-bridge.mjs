import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

let PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BRIDGE_PORT = Number(process.env.DOJO_BRIDGE_PORT || 43127)
const BRIDGE_VERSION = '2.0.0'
const START_MARKER = '<!-- DOJO-HQ:START -->'
const END_MARKER = '<!-- DOJO-HQ:END -->'
const WRITABLE_DOCUMENTS = new Set(['ROADMAP.md', 'TASKS.md'])
const READABLE_DOCUMENTS = new Set(['README.md', 'ROADMAP.md', 'TASKS.md', 'Claude.md'])
const README_LIMIT = 80_000
const STATUS_LABELS = {
  inbox: 'Innboks',
  planned: 'Planlagt',
  progress: 'Pågår',
  review: 'Til test',
  done: 'Ferdig',
}
const TYPE_LABELS = {
  idea: 'Idé',
  plan: 'Plan',
  implement: 'Implementer',
  test: 'Test',
  fix: 'Fiks',
  bug: 'Bug',
}
const PRIORITY_LABELS = {
  low: 'Lav',
  medium: 'Normal',
  high: 'Høy',
  urgent: 'Kritisk',
}

function safeInline(value, fallback = '') {
  return String(value || fallback)
    .replace(/[\r\n]+/g, ' ')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .trim()
}

function documentPath(documentName, { writable = false } = {}) {
  const allowedDocuments = writable ? WRITABLE_DOCUMENTS : READABLE_DOCUMENTS
  const name = allowedDocuments.has(documentName) ? documentName : 'ROADMAP.md'
  return { name, path: resolve(PROJECT_ROOT, name) }
}

function memberNames(members = []) {
  return new Map(members.map(member => [
    member.user_id,
    safeInline(member.display_name || member.profile?.display_name || 'Dojo-medlem'),
  ]))
}

export function renderManagedSection(items = [], members = []) {
  const names = memberNames(members)
  const groups = new Map(Object.keys(STATUS_LABELS).map(status => [status, []]))
  for (const item of items) {
    const status = STATUS_LABELS[item.status] ? item.status : 'inbox'
    groups.get(status).push(item)
  }

  const lines = [
    START_MARKER,
    '## Dojo HQ — synkronisert arbeidskø',
    '',
    '> Denne delen styres av Dojo HQ. Claude Code kan lese den og krysse av ferdige oppgaver.',
    '',
  ]

  for (const [status, label] of Object.entries(STATUS_LABELS)) {
    const statusItems = groups.get(status) || []
    lines.push(`### ${label}`, '')
    if (!statusItems.length) {
      lines.push('_Ingen oppgaver._', '')
      continue
    }
    for (const item of statusItems) {
      const done = item.status === 'done' ? 'x' : ' '
      const meta = [
        TYPE_LABELS[item.item_type] || 'Oppgave',
        PRIORITY_LABELS[item.priority] || 'Normal',
        item.assigned_to ? `@${names.get(item.assigned_to) || 'Dojo-medlem'}` : null,
        item.due_date ? `frist ${safeInline(item.due_date)}` : null,
      ].filter(Boolean).join(' · ')
      lines.push(`- [${done}] **${safeInline(item.title, 'Uten tittel')}** · ${meta}`)
      if (item.description) lines.push(`  - ${safeInline(item.description)}`)
      if (item.tags?.length) lines.push(`  - ${item.tags.map(tag => `\`#${safeInline(tag)}\``).join(' ')}`)
      lines.push(`  <!-- dojo:${safeInline(item.id)} -->`)
    }
    lines.push('')
  }

  lines.push(END_MARKER)
  return lines.join('\n')
}

export function replaceManagedSection(markdown, section) {
  const source = String(markdown || '').trimEnd()
  const start = source.indexOf(START_MARKER)
  const end = source.indexOf(END_MARKER)
  if (start >= 0 && end >= start) {
    return `${source.slice(0, start)}${section}${source.slice(end + END_MARKER.length)}`.trimEnd() + '\n'
  }
  return `${source}\n\n---\n\n${section}\n`.replace(/^\n+/, '')
}

export function parseManagedState(markdown) {
  const source = String(markdown || '')
  const start = source.indexOf(START_MARKER)
  const end = source.indexOf(END_MARKER)
  if (start < 0 || end < start) return { found: false, completedIds: [], openIds: [] }

  const completedIds = []
  const openIds = []
  let pendingDone = false
  let hasPending = false
  for (const line of source.slice(start, end).split(/\r?\n/)) {
    const checkbox = line.match(/^- \[([ xX])\]/)
    if (checkbox) {
      pendingDone = checkbox[1].toLowerCase() === 'x'
      hasPending = true
      continue
    }
    const marker = line.match(/<!--\s*dojo:([a-zA-Z0-9._-]+)\s*-->/)
    if (marker && hasPending) {
      ;(pendingDone ? completedIds : openIds).push(marker[1])
      hasPending = false
    }
  }
  return { found: true, completedIds, openIds }
}

async function readDocument(documentName) {
  const target = documentPath(documentName)
  const content = await readFile(target.path, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return `# ${target.name.replace('.md', '')}\n`
    throw error
  })
  const fileStat = await stat(target.path).catch(() => null)
  return {
    document: target.name,
    content,
    modifiedAt: fileStat?.mtime?.toISOString() || null,
    state: parseManagedState(content),
  }
}

async function syncDocument({ document: documentName, items = [], members = [] }) {
  const target = documentPath(documentName, { writable: true })
  const current = await readFile(target.path, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return `# ${target.name.replace('.md', '')}\n`
    throw error
  })
  const section = renderManagedSection(items, members)
  const content = replaceManagedSection(current, section)
  await writeFile(target.path, content, 'utf8')
  return {
    document: target.name,
    itemCount: items.length,
    modifiedAt: new Date().toISOString(),
    state: parseManagedState(content),
  }
}

function claudeVersion() {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', 'claude --version'],
    { cwd: PROJECT_ROOT, encoding: 'utf8', windowsHide: true, timeout: 5000 },
  )
  return result.status === 0 ? result.stdout.trim() : null
}

async function readProjectReadme() {
  const path = resolve(PROJECT_ROOT, 'README.md')
  const content = await readFile(path, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  return {
    found: Boolean(content),
    content: content.slice(0, README_LIMIT),
    truncated: content.length > README_LIMIT,
  }
}

async function projectDiagnostics() {
  const documents = await Promise.all([...READABLE_DOCUMENTS].map(async name => {
    const fileStat = await stat(resolve(PROJECT_ROOT, name)).catch(() => null)
    return {
      name,
      exists: Boolean(fileStat),
      modifiedAt: fileStat?.mtime?.toISOString() || null,
    }
  }))
  return {
    bridgeVersion: BRIDGE_VERSION,
    projectRoot: PROJECT_ROOT,
    readmeFound: documents.some(document => document.name === 'README.md' && document.exists),
    documents,
  }
}

export function buildClaudePrompt(item, documentName, readme = {}) {
  const target = documentPath(documentName, { writable: true }).name
  return [
    '# Hanzi Dojo HQ task',
    '',
    `Work on the selected Dojo HQ item below in the repository at ${PROJECT_ROOT}.`,
    '',
    `- Title: ${safeInline(item.title, 'Untitled task')}`,
    `- Type: ${TYPE_LABELS[item.item_type] || 'Task'}`,
    `- Status: ${STATUS_LABELS[item.status] || 'Inbox'}`,
    `- Priority: ${PRIORITY_LABELS[item.priority] || 'Normal'}`,
    item.due_date ? `- Due: ${safeInline(item.due_date)}` : '- Due: none',
    item.tags?.length ? `- Tags: ${item.tags.map(tag => `#${safeInline(tag)}`).join(', ')}` : '- Tags: none',
    '',
    '## Context',
    safeInline(item.description, 'No description was provided.'),
    '',
    '## README.md project context',
    readme.found
      ? 'The Dojo bridge read README.md from the selected project at launch. Treat the content below as current project context.'
      : 'README.md was not found in the selected project. Inspect the repository for an equivalent project guide before changing code.',
    ...(readme.found ? [
      '',
      '<project-readme>',
      readme.content,
      '</project-readme>',
      ...(readme.truncated ? ['', '_README.md was truncated after 80,000 characters._'] : []),
    ] : []),
    '',
    '## Working agreement',
    `1. Use the embedded README.md context, then read ${target}, TASKS.md, and Claude.md before changing code.`,
    '2. Inspect the repository and make only changes needed for this item.',
    `3. Keep the matching Dojo checklist entry in ${target} current as work progresses.`,
    '4. Run relevant tests and the production build.',
    '5. Do not commit, push, deploy, delete unrelated files, or bypass permission prompts.',
    '6. When the work is genuinely complete, check the matching Dojo item and summarize what changed in the terminal.',
    ...(item.dojo_run_id ? [
      `7. Before your final response, write .dojo/run-result.json as valid JSON with this exact runId: ${safeInline(item.dojo_run_id)}.`,
      '   Use this shape: {"runId":"...","status":"completed","summary":"short result","files":["changed/file"],"tests":["command: passed"],"branch":"","pr_url":"","ci_status":"none"}',
      '   If work cannot be completed, use status "needs_input" or "failed" and explain why in summary.',
    ] : []),
    '',
    `Dojo item id: ${safeInline(item.id)}`,
    ...(item.dojo_run_id ? [`Dojo run id: ${safeInline(item.dojo_run_id)}`] : []),
  ].join('\n')
}

async function launchClaude({ item, items = [], members = [], document: documentName }) {
  if (!item?.id || !item?.title) throw new Error('En gyldig Dojo-oppgave må velges.')
  const readme = await readProjectReadme()
  if (!readme.found) {
    throw new Error('README.md ble ikke funnet i mappen broen er startet fra. Stopp broen og kjør koblingskommandoen på nytt fra prosjektets rotmappe.')
  }
  const synced = await syncDocument({ document: documentName, items, members })
  const taskDirectory = resolve(PROJECT_ROOT, '.dojo')
  const taskPath = resolve(taskDirectory, 'claude-task.md')
  const resultPath = resolve(taskDirectory, 'run-result.json')
  await mkdir(taskDirectory, { recursive: true })
  await unlink(resultPath).catch(error => {
    if (error.code !== 'ENOENT') throw error
  })
  await writeFile(taskPath, buildClaudePrompt(item, synced.document, readme), 'utf8')

  const terminalTitle = `Claude · ${safeInline(item.title).slice(0, 42)}`
  const command = "& claude --permission-mode manual --name 'Dojo HQ task' (Get-Content -Raw -LiteralPath '.dojo\\claude-task.md')"
  const child = spawn(
    'wt.exe',
    ['-w', 'new', 'new-tab', '--title', terminalTitle, '-d', PROJECT_ROOT, 'powershell.exe', '-NoExit', '-NoProfile', '-Command', command],
    { cwd: PROJECT_ROOT, detached: true, stdio: 'ignore', windowsHide: false },
  )
  child.unref()
  return { launched: true, document: synced.document, taskId: item.id, readmeIncluded: readme.found }
}

function allowedOrigin(origin) {
  return !origin || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)
}

function responseHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || 'http://127.0.0.1',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Dojo-Bridge',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  }
}

function sendJson(response, status, payload, origin) {
  response.writeHead(status, responseHeaders(origin))
  response.end(JSON.stringify(payload))
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 2_000_000) throw new Error('Forespørselen er for stor.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export function createDojoBridgeServer() {
  const version = claudeVersion()
  return createServer(async (request, response) => {
    const origin = request.headers.origin || ''
    if (!allowedOrigin(origin)) {
      sendJson(response, 403, { error: 'Denne opprinnelsen får ikke bruke Dojo-broen.' }, '')
      return
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, responseHeaders(origin))
      response.end()
      return
    }
    if (request.headers['x-dojo-bridge'] !== '1') {
      sendJson(response, 403, { error: 'Mangler Dojo-bro-header.' }, origin)
      return
    }

    const url = new URL(request.url || '/', `http://127.0.0.1:${BRIDGE_PORT}`)
    try {
      if (request.method === 'GET' && url.pathname === '/api/status') {
        const roadmap = await readDocument('ROADMAP.md')
        const diagnostics = await projectDiagnostics()
        sendJson(response, 200, {
          connected: true,
          project: 'Hanzi Dojo',
          claudeReady: Boolean(version),
          claudeVersion: version,
          roadmapModifiedAt: roadmap.modifiedAt,
          ...diagnostics,
        }, origin)
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/roadmap') {
        sendJson(response, 200, await readDocument(url.searchParams.get('document')), origin)
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/roadmap/sync') {
        sendJson(response, 200, await syncDocument(await readJson(request)), origin)
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/claude/launch') {
        sendJson(response, 201, await launchClaude(await readJson(request)), origin)
        return
      }
      sendJson(response, 404, { error: 'Ukjent Dojo-bro-endepunkt.' }, origin)
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : 'Ukjent feil.' }, origin)
    }
  })
}

function commandLineOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value.startsWith('--')) continue
    options[value.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true
  }
  return options
}

function remoteSite(value) {
  const site = new URL(String(value || ''))
  const isLocal = ['localhost', '127.0.0.1'].includes(site.hostname)
  if (site.protocol !== 'https:' && !(isLocal && site.protocol === 'http:')) {
    throw new Error('Nettbroen krever en HTTPS-adresse.')
  }
  site.pathname = '/'
  site.search = ''
  site.hash = ''
  return site.toString().replace(/\/$/, '')
}

async function remoteJson(site, path, options = {}, inviteCode = '') {
  const headers = new Headers(options.headers || {})
  headers.set('Content-Type', 'application/json')
  if (inviteCode) headers.set('X-Dojo-Key', inviteCode)
  const response = await fetch(`${site}${path}`, { ...options, headers })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `Nettbroen svarte med HTTP ${response.status}.`)
  return payload
}

async function runBridgeCommand(command) {
  if (command.action === 'read') return readDocument(command.payload?.document)
  if (command.action === 'sync') return syncDocument(command.payload || {})
  if (command.action === 'launch') return launchClaude(command.payload || {})
  throw new Error('Nettbroen ba om en handling denne klienten ikke støtter.')
}

async function consumeRunResult(site, workspaceId, inviteCode) {
  const resultPath = resolve(PROJECT_ROOT, '.dojo', 'run-result.json')
  const source = await readFile(resultPath, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  if (!source) return false
  let payload
  try {
    payload = JSON.parse(source)
  } catch {
    return false
  }
  const runId = safeInline(payload.runId)
  if (!runId) return false
  const status = ['completed', 'failed', 'needs_input', 'testing'].includes(payload.status) ? payload.status : 'completed'
  await remoteJson(
    site,
    `/api/dojo/workspaces/${encodeURIComponent(workspaceId)}/agent-runs/${encodeURIComponent(runId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        summary: payload.summary,
        files: payload.files,
        tests: payload.tests,
        branch: payload.branch,
        pr_url: payload.pr_url,
        ci_status: payload.ci_status,
      }),
    },
    inviteCode,
  )
  await unlink(resultPath)
  console.log(`Claude-resultatet er sendt tilbake til HQ (${status}).`)
  return true
}

async function selfUpdateBridge(baseUrl) {
  const response = await fetch(`${baseUrl}/dojo-cloud-bridge.mjs?bridge-update=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) return false
  const source = await response.text()
  const latestVersion = source.match(/const BRIDGE_VERSION = '([^']+)'/)?.[1]
  if (!latestVersion || latestVersion === BRIDGE_VERSION) return false
  const currentPath = fileURLToPath(import.meta.url)
  await writeFile(currentPath, source, 'utf8')
  console.log(`Oppdaterer Dojo-nettbroen fra ${BRIDGE_VERSION} til ${latestVersion} …`)
  const next = spawn(process.execPath, [currentPath, ...process.argv.slice(2)], {
    cwd: PROJECT_ROOT,
    detached: false,
    stdio: 'inherit',
    windowsHide: false,
  })
  next.unref()
  process.exit(0)
}

async function runCloudBridge({ pair, site, project, 'self-update': selfUpdate }) {
  const inviteCode = String(pair || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (inviteCode.length < 10) throw new Error('Invitasjonskoden er ugyldig.')
  const baseUrl = remoteSite(site)
  PROJECT_ROOT = resolve(String(project || process.cwd()))
  const paired = await remoteJson(baseUrl, '/api/dojo/bridge/pair', {
    method: 'POST',
    body: JSON.stringify({ code: inviteCode }),
  })
  const workspace = paired.workspace
  if (!workspace?.id) throw new Error('Arbeidsområdet kunne ikke kobles til.')

  const clientId = crypto.randomUUID()
  const version = claudeVersion() || ''
  const displayName = `${hostname()} · Claude Code`
  let lastConnectionWarning = 0
  let lastDiagnosticsAt = 0
  let diagnostics = await projectDiagnostics()
  let lastUpdateCheck = 0

  console.log(`Dojo-nettbroen er koblet til «${workspace.name}».`)
  console.log(`Prosjekt: ${PROJECT_ROOT}`)
  console.log(version ? `Claude Code: ${version}` : 'Claude Code ble ikke funnet i PATH.')
  console.log(diagnostics.readmeFound ? 'README.md: funnet og klar' : 'README.md: mangler i prosjektmappen')
  console.log(`Broversjon: ${BRIDGE_VERSION}${selfUpdate ? ' · automatisk oppdatering på' : ''}`)
  console.log('La dette vinduet stå åpent mens HQ brukes. Trykk Ctrl+C for å stoppe.')

  for (;;) {
    try {
      if (Date.now() - lastDiagnosticsAt > 10_000) {
        diagnostics = await projectDiagnostics()
        lastDiagnosticsAt = Date.now()
      }
      if (selfUpdate && Date.now() - lastUpdateCheck > 5 * 60_000) {
        lastUpdateCheck = Date.now()
        await selfUpdateBridge(baseUrl)
      }
      await consumeRunResult(baseUrl, workspace.id, inviteCode)
      const polled = await remoteJson(
        baseUrl,
        `/api/dojo/workspaces/${encodeURIComponent(workspace.id)}/bridge/poll`,
        {
          method: 'POST',
          body: JSON.stringify({ clientId, displayName, version, ...diagnostics }),
        },
        inviteCode,
      )
      const command = polled.command
      if (command) {
        console.log(`Utfører ${command.action} fra Dojo HQ …`)
        try {
          const result = await runBridgeCommand(command)
          await remoteJson(
            baseUrl,
            `/api/dojo/workspaces/${encodeURIComponent(workspace.id)}/bridge/commands/${encodeURIComponent(command.id)}/result`,
            {
              method: 'POST',
              body: JSON.stringify({ clientId, ok: true, result }),
            },
            inviteCode,
          )
          console.log(`Ferdig: ${command.action}`)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Ukjent feil.'
          await remoteJson(
            baseUrl,
            `/api/dojo/workspaces/${encodeURIComponent(workspace.id)}/bridge/commands/${encodeURIComponent(command.id)}/result`,
            {
              method: 'POST',
              body: JSON.stringify({ clientId, ok: false, error: message }),
            },
            inviteCode,
          ).catch(() => {})
          console.error(`Kunne ikke utføre ${command.action}: ${message}`)
        }
      }
      lastConnectionWarning = 0
    } catch (error) {
      if (!lastConnectionWarning || Date.now() - lastConnectionWarning > 30_000) {
        console.error(`Mistet kontakt med HQ: ${error instanceof Error ? error.message : 'Ukjent feil.'}`)
        console.error('Prøver automatisk igjen …')
        lastConnectionWarning = Date.now()
      }
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1500))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = commandLineOptions(process.argv.slice(2))
  if (options.pair || options.site) {
    runCloudBridge(options).catch(error => {
      console.error(`Dojo-nettbroen kunne ikke starte: ${error instanceof Error ? error.message : 'Ukjent feil.'}`)
      process.exitCode = 1
    })
  } else {
    const server = createDojoBridgeServer()
    server.on('error', error => {
      if (error.code === 'EADDRINUSE') {
        console.log(`Dojo-broen kjører allerede på http://127.0.0.1:${BRIDGE_PORT}`)
        console.log('For nettversjonen: bruk koblingskommandoen som vises i Claude-panelet.')
        process.exit(0)
      }
      throw error
    })
    server.listen(BRIDGE_PORT, '127.0.0.1', () => {
      console.log(`Dojo-broen er klar på http://127.0.0.1:${BRIDGE_PORT}`)
      console.log(`Prosjekt: ${PROJECT_ROOT}`)
      console.log('La dette vinduet stå åpent mens Dojo HQ brukes.')
    })
  }
}
