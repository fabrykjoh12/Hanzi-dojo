// A logger that cannot print a secret.
//
// Redaction happens at the SINK, not at every call site. Relying on discipline
// ("remember not to log the key") fails exactly once and then the key is in a
// CI log forever; scrubbing the final string means an accidental interpolation
// three layers down is caught too.

export const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 }

// Replace every occurrence of a known secret with a marker. Short values are
// ignored - redacting a 3-character string would mangle ordinary output, and
// nothing that short is a credential.
export function redactSecrets(text, secrets = []) {
  let out = String(text == null ? '' : text)
  for (const secret of secrets) {
    const s = String(secret || '')
    if (s.length < 8) continue
    while (out.indexOf(s) !== -1) out = out.split(s).join('[redacted]')
  }
  return out
}

// Values that must never appear in output. Pass the resolved config so the
// actual credential string is scrubbed, not just an env-var name.
export function secretsFromConfig(config) {
  const out = []
  if (config && config.azure && config.azure.key) out.push(config.azure.key)
  return out
}

function format(value) {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.name + ': ' + value.message
  try { return JSON.stringify(value) } catch { return String(value) }
}

export function createLogger({ level = 'info', secrets = [], sink = console } = {}) {
  const threshold = LEVELS[level] == null ? LEVELS.info : LEVELS[level]
  const emit = (name, method) => (...parts) => {
    if (LEVELS[name] < threshold) return
    const line = redactSecrets(parts.map(format).join(' '), secrets)
    const fn = sink[method] || sink.log
    if (fn) fn.call(sink, line)
  }
  return {
    debug: emit('debug', 'debug'),
    info: emit('info', 'log'),
    warn: emit('warn', 'warn'),
    error: emit('error', 'error'),
    // Machine-readable summary output, redacted like everything else so a
    // structured line can be piped into a file or a CI annotation safely.
    json: (obj) => {
      const line = redactSecrets(JSON.stringify(obj), secrets)
      const fn = sink.log
      if (fn) fn.call(sink, line)
    },
  }
}
