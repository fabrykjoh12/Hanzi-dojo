// Build stamp, injected by vite.config.js (`define`). Lets anyone confirm which
// commit is live — shown in Settings, logged to the console (main.jsx), and
// written to /version.json at the site root. Falls back to 'dev' when running
// unbuilt (e.g. the dev server without the define, or tests).
export const BUILD_SHA = import.meta.env.VITE_BUILD_SHA || 'dev'
export const BUILD_TIME = import.meta.env.VITE_BUILD_TIME || ''

// Short human label, e.g. "abc1234 · Jul 13, 2026". Formats defensively so a
// missing/invalid timestamp never throws.
export function buildLabel() {
  if (!BUILD_TIME) return BUILD_SHA
  const d = new Date(BUILD_TIME)
  if (Number.isNaN(d.getTime())) return BUILD_SHA
  return BUILD_SHA + ' · ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
