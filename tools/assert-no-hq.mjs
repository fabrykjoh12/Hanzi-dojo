import { existsSync } from 'node:fs'
import process from 'node:process'

// The native app bundle must never ship hq.html — the internal DojoHQ
// control room. `npm run build:native` runs `build:public` first, which
// already excludes hq.html from the Rollup input (see vite.config.js), but
// this is a second, independent check: if that build ever regresses (wrong
// env var, a future refactor of the Sites-build branch), this fails the
// native build loudly instead of silently shipping the control room to
// app-store users.
const hqPath = 'dist/client/hq.html'

if (existsSync(hqPath)) {
  console.error('[assert-no-hq] ' + hqPath + ' exists — the native bundle must not ship DojoHQ.')
  console.error('[assert-no-hq] Did build:native run without DOJO_PUBLIC_BUILD=1?')
  process.exit(1)
}

console.log('[assert-no-hq] OK — dist/client has no hq.html')
