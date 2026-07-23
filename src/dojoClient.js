import { localDojo } from './dojoLocalClient'
import { remoteDojo } from './dojoRemoteClient'

const params = new URLSearchParams(globalThis.location?.search || '')
export const dojoClient = params.get('online') === '1' ? remoteDojo : localDojo
