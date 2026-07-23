import { beforeEach, describe, expect, it } from 'vitest'
import { localDojo } from './dojoLocalClient'

const storage = new Map()

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
  }
  globalThis.CustomEvent = class CustomEvent {}
})

describe('localDojo collaboration file', () => {
  it('starts clean after first-day setup', async () => {
    const result = localDojo.completeSetup({
      workspaceName: 'Vår dojo',
      ownerName: 'Fabian',
      friendName: 'Emil',
      keepExamples: false,
    })

    expect(result.error).toBeNull()
    expect(localDojo.getOverview().settings.setup_complete).toBe(true)
    const { data } = await localDojo.from('dojo_items').select('*')
    expect(data).toEqual([])
  })

  it('merges new work instead of replacing local work', async () => {
    localDojo.completeSetup({ workspaceName: 'Vår dojo', ownerName: 'Fabian', friendName: 'Emil' })
    const workspaceId = localDojo.getOverview().workspace.id
    await localDojo.from('dojo_items').insert({ id: 'local-task', workspace_id: workspaceId, title: 'Lokalt arbeid', status: 'inbox' })

    const incoming = JSON.parse(localDojo.exportData())
    incoming.items.push({
      id: 'friend-task',
      workspace_id: workspaceId,
      title: 'Vennens arbeid',
      status: 'planned',
      created_at: '2099-01-01T00:00:00.000Z',
      updated_at: '2099-01-01T00:00:00.000Z',
    })

    const result = localDojo.importData(JSON.stringify(incoming))
    const { data } = await localDojo.from('dojo_items').select('*')
    expect(result.added).toBe(1)
    expect(data.map(item => item.id).sort()).toEqual(['friend-task', 'local-task'])
  })

  it('carries deletions across imports', async () => {
    localDojo.completeSetup({ workspaceName: 'Vår dojo', ownerName: 'Fabian', friendName: 'Emil' })
    const workspaceId = localDojo.getOverview().workspace.id
    await localDojo.from('dojo_items').insert({ id: 'deleted-task', workspace_id: workspaceId, title: 'Skal bort', status: 'inbox' })
    const beforeDelete = localDojo.exportData()
    await localDojo.from('dojo_items').delete().eq('id', 'deleted-task')
    const deletionFile = localDojo.exportData()

    storage.set('hanzi-dojo-hq-local-v1', beforeDelete)
    localDojo.importData(deletionFile)
    const { data } = await localDojo.from('dojo_items').select('*')
    expect(data.find(item => item.id === 'deleted-task')).toBeUndefined()
  })
})
