const BRIDGE_URL = 'http://127.0.0.1:43127'

async function request(path, options = {}, timeout = 1800) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(`${BRIDGE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Dojo-Bridge': '1',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'Dojo-broen svarte med en feil.')
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Fant ikke den lokale Dojo-broen.', { cause: error })
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

export const dojoClaudeBridge = {
  async status() {
    return request('/api/status')
  },

  async read(document = 'ROADMAP.md') {
    return request(`/api/roadmap?document=${encodeURIComponent(document)}`)
  },

  async sync(items, members, document = 'ROADMAP.md') {
    return request('/api/roadmap/sync', {
      method: 'POST',
      body: JSON.stringify({ items, members, document }),
    }, 5000)
  },

  async launch(item, items, members, document = 'ROADMAP.md') {
    return request('/api/claude/launch', {
      method: 'POST',
      body: JSON.stringify({ item, items, members, document }),
    }, 8000)
  },
}
