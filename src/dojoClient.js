import { localDojo } from './dojoLocalClient'
import { remoteDojo } from './dojoRemoteClient'
import { supabaseDojo } from './dojoSupabaseClient'

// Which storage backend Dojo HQ talks to.
//
//   supabaseDojo  the app's own /hq route — the app's Supabase project, keyed to
//                 the signed-in account, shared between admins. The default.
//   remoteDojo    the hosted standalone build (*.chatgpt.site) and ?online=1 —
//                 Cloudflare worker, device identity, invite code.
//   localDojo     the standalone hq.html entry (which has no auth) and ?local=1 —
//                 device localStorage.
//
// hq.html is served at the site root on the hosted build, so the standalone
// check only catches running that entry locally; the app's own route is /hq.
const params = new URLSearchParams(globalThis.location?.search || '')
const hostedDojo = globalThis.location?.hostname?.endsWith('.chatgpt.site')
const standaloneDojo = globalThis.location?.pathname?.endsWith('hq.html')
const wantsOnline = params.get('online') === '1'
const wantsLocal = params.get('local') === '1'

export const dojoClient = wantsOnline || hostedDojo
  ? remoteDojo
  : (wantsLocal || standaloneDojo ? localDojo : supabaseDojo)
