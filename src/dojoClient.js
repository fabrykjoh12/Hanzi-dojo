import { localDojo } from './dojoLocalClient'
import { remoteDojo } from './dojoRemoteClient'

const params = new URLSearchParams(globalThis.location?.search || '')
const hostedDojo = globalThis.location?.hostname?.endsWith('.chatgpt.site')
export const dojoClient = params.get('online') === '1' || hostedDojo ? remoteDojo : localDojo
