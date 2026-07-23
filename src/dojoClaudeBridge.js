const LOCAL_BRIDGE_URL = 'http://127.0.0.1:43127'
let cloudWorkspace = null
let cloudMode = false

function wait(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds))
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Dojo-broen svarte med en feil.')
  return payload
}

async function localRequest(path, options = {}, timeout = 1800) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  try {
    return await parseResponse(await fetch(`${LOCAL_BRIDGE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Dojo-Bridge': '1',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    }))
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Fant ikke den lokale Dojo-broen.', { cause: error })
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

async function cloudRequest(path, options = {}) {
  if (!cloudWorkspace?.id || !cloudWorkspace?.invite_code) {
    throw new Error('Velg et arbeidsområde før du kobler til broen.')
  }
  const response = await fetch(
    `/api/dojo/workspaces/${encodeURIComponent(cloudWorkspace.id)}/bridge${path}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Dojo-Key': cloudWorkspace.invite_code,
        ...(options.headers || {}),
      },
    },
  )
  return parseResponse(response)
}

async function runCloudCommand(action, payload, timeout = 70_000) {
  const created = await cloudRequest('/commands', {
    method: 'POST',
    body: JSON.stringify({ action, payload }),
  })
  const commandId = created.command?.id
  if (!commandId) throw new Error('Brohandlingen ble ikke opprettet.')

  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await wait(850)
    const current = await cloudRequest(`/commands/${encodeURIComponent(commandId)}`)
    const command = current.command
    if (command?.status === 'completed') return command.result || {}
    if (command?.status === 'failed') throw new Error(command.error || 'Brohandlingen feilet.')
  }
  throw new Error('Broen brukte for lang tid. Kontroller at broterminalen fortsatt er åpen.')
}

export const dojoClaudeBridge = {
  configure(workspace, { remote = false } = {}) {
    cloudWorkspace = workspace || null
    cloudMode = Boolean(remote)
  },

  async status() {
    if (cloudMode) return cloudRequest('/status')
    return localRequest('/api/status')
  },

  async read(document = 'ROADMAP.md') {
    if (cloudMode) return runCloudCommand('read', { document })
    return localRequest(`/api/roadmap?document=${encodeURIComponent(document)}`)
  },

  async sync(items, members, document = 'ROADMAP.md') {
    if (cloudMode) return runCloudCommand('sync', { items, members, document })
    return localRequest('/api/roadmap/sync', {
      method: 'POST',
      body: JSON.stringify({ items, members, document }),
    }, 5000)
  },

  async launch(item, items, members, document = 'ROADMAP.md') {
    if (cloudMode) return runCloudCommand('launch', { item, items, members, document }, 90_000)
    return localRequest('/api/claude/launch', {
      method: 'POST',
      body: JSON.stringify({ item, items, members, document }),
    }, 8000)
  },
}
