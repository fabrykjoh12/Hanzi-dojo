import { beforeEach, describe, expect, it, vi } from 'vitest'
import { remoteDojo } from './dojoRemoteClient'

const stateKey = 'hanzi-dojo-hq-online-v1'
const storage = new Map()

function response(payload, status = 200) {
  return new Response(payload == null ? null : JSON.stringify(payload), {
    status,
    headers: payload == null ? {} : { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  storage.clear()
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  }
  globalThis.window = {
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    setInterval,
    clearInterval,
  }
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type
      this.detail = init?.detail
    }
  }
  vi.restoreAllMocks()
})

describe('remoteDojo collaboration client', () => {
  it('creates a workspace and keeps the invite credential on this device', async () => {
    remoteDojo.configure('device-owner', 'Fabian')
    globalThis.fetch = vi.fn(async (_path, options) => response({
      workspace: {
        id: 'workspace-create',
        name: 'Hanzi Dojo HQ',
        invite_code: 'ABCDEFGH2345',
        owner_id: 'device-owner',
        role: 'owner',
      },
    }, options.method === 'POST' ? 201 : 200))

    const { data, error } = await remoteDojo.rpc('create_dojo_workspace', { p_name: 'Hanzi Dojo HQ' })

    expect(error).toBeNull()
    expect(data.invite_code).toBe('ABCDEFGH2345')
    expect(JSON.parse(storage.get(stateKey)).workspaces[0].id).toBe('workspace-create')
  })

  it('resolves the workspace when an item is updated by id', async () => {
    storage.set(stateKey, JSON.stringify({
      identity: { userId: 'device-member', displayName: 'Emil' },
      workspaces: [{ id: 'workspace-update', invite_code: 'ABCDEFGH2345', role: 'member' }],
    }))
    const calls = []
    globalThis.fetch = vi.fn(async (path, options = {}) => {
      calls.push({ path: String(path), options })
      if (String(path).endsWith('/snapshot')) {
        return response({
          workspace: { id: 'workspace-update', name: 'HQ', revision: 2 },
          members: [],
          items: [{ id: 'item-1', workspace_id: 'workspace-update', title: 'Test', status: 'inbox' }],
          comments: [],
          attachments: [],
        })
      }
      return response({ item: { id: 'item-1', status: 'progress' } })
    })

    await remoteDojo.from('dojo_items').select('*').eq('workspace_id', 'workspace-update')
    const result = await remoteDojo.from('dojo_items').update({ status: 'progress' }).eq('id', 'item-1')

    expect(result.error).toBeNull()
    expect(calls.at(-1).path).toBe('/api/dojo/workspaces/workspace-update/items/item-1')
    expect(calls.at(-1).options.method).toBe('PATCH')
    expect(new Headers(calls.at(-1).options.headers).get('X-Dojo-Key')).toBe('ABCDEFGH2345')
  })
})
