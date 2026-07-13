import { readyUrl } from './audioCache'

export function getLevelLabel(language, system, level) {
  if (language === 'japanese' || system === 'jlpt') {
    const map = {
      1: 'N5 · Part 1',
      2: 'N5 · Part 2',
      3: 'N4',
      4: 'N3',
      5: 'N2',
      6: 'N1',
    }
    return map[level] || 'N' + level
  }
  // Russian uses CEFR-style bands (levels 1–6 → A1…C2). See CLAUDE.md §6.
  if (language === 'russian' || system === 'russian') {
    const map = {
      1: 'A1',
      2: 'A2',
      3: 'B1',
      4: 'B2',
      5: 'C1',
      6: 'C2',
    }
    return map[level] || 'Level ' + level
  }
  return 'HSK ' + level
}

export function getSystemLabel(system) {
  if (system === 'jlpt') return 'JLPT'
  if (system === 'hsk_3') return 'HSK 3.0'
  if (system === 'russian') return 'CEFR'
  return system
}

export function getLevelRange(language, system) {
  if (language === 'japanese' || system === 'jlpt') {
    return { min: 1, max: 6 }
  }
  if (language === 'russian' || system === 'russian') {
    return { min: 1, max: 6 }
  }
  return { min: 1, max: 9 }
}

// The list of level numbers for a language/system (for level pickers).
export function getLevels(language, system) {
  const { min, max } = getLevelRange(language, system)
  const out = []
  for (let l = min; l <= max; l += 1) out.push(l)
  return out
}

export function getNextLevel(language, system, level) {
  const { max } = getLevelRange(language, system)
  return level < max ? level + 1 : level
}

// Fisher–Yates shuffle (returns a new array). Replaces the copy in every drill
// file and the biased `sort(() => Math.random() - 0.5)` idiom in Test.jsx.
export function shuffle(items) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

// Public URL for a TTS file in the Supabase audio bucket.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export function getAudioUrl(audioPath) {
  if (!audioPath) return null
  return SUPABASE_URL + '/storage/v1/object/public/audio/' + audioPath
}

// Play a URL on a given <audio> element, with a fallback for iOS WebKit
// (Safari, and Chrome-on-iOS — same underlying media engine) which can fail
// a direct progressive-load play() from some CDNs' Range-request handling
// even though the file itself is fine. If the direct URL errors, retry once
// by fetching the whole file as a blob, which sidesteps Range entirely.
// `onFail` is called only if both attempts fail.
//
// Callers must REUSE one element across plays (create it once, keep it in a
// ref) — never a fresh `new Audio()` per tap. Two iOS behaviors depend on it:
//  - The blob a fallback fetched is cached on the element (`__hdBlobFor`), so
//    when the blob arrives AFTER the tap's user activation expired (fetch is
//    async; iOS then blocks play with NotAllowedError), the clip stays loaded
//    and the NEXT tap plays it synchronously — which iOS allows. A per-tap
//    element threw that work away and every replay failed the same way.
//  - A successfully direct-loaded clip replays via a seek instead of a full
//    reload (iOS Range requests bypass the SW cache, so reloading re-hits
//    the network every tap).
// Each call tags the element with an attempt id: a fallback resolving after a
// newer call has taken over the element is stale and must not touch `el.src`
// or fire `onFail` for the wrong clip.
let nextAttempt = 1
export function playAudioEl(el, url, onFail) {
  const attempt = nextAttempt
  nextAttempt += 1
  el.__hdAttempt = attempt
  const stale = () => el.__hdAttempt !== attempt
  const fail = () => { if (!stale() && onFail) onFail() }
  const playCurrent = () => {
    el.onerror = fail
    try { el.currentTime = 0 } catch { /* not seekable yet — play() handles it */ }
    el.play().catch(e => {
      if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return
      fail()
    })
  }

  // This element already has this exact clip fully loaded (a cached fallback
  // blob, or a direct load that reached HAVE_CURRENT_DATA without erroring):
  // replay it in place, synchronously. readyState >= 2 guards against a rapid
  // second tap taking the fast path while the first direct load is still in
  // flight — in that case we fall through and (re)load, keeping the fallback.
  if (el.__hdBlobFor === url || (el.__hdSrcFor === url && !el.error && el.readyState >= 2)) {
    playCurrent()
    return
  }

  let fallbackStarted = false
  function fallback() {
    if (stale() || fallbackStarted) return
    fallbackStarted = true
    fetch(url)
      .then(res => { if (!res.ok) throw new Error('fetch failed'); return res.blob() })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob)
        if (stale()) { URL.revokeObjectURL(blobUrl); return }
        if (el.__hdBlobUrl) URL.revokeObjectURL(el.__hdBlobUrl)
        el.__hdBlobUrl = blobUrl
        el.__hdBlobFor = url
        el.onerror = fail
        el.src = blobUrl
        return el.play()
      })
      .catch(e => {
        // NotAllowedError here means the blob arrived after the tap's user
        // activation expired (iOS). The clip is loaded and cached on the
        // element now, so the next tap plays it instantly — not a broken file.
        if (e && e.name === 'NotAllowedError') return
        fail()
      })
  }

  // Fresh clip for this element: direct URL first (fast path everywhere),
  // blob fallback on error. Drop any previously cached blob.
  if (el.__hdBlobUrl) { URL.revokeObjectURL(el.__hdBlobUrl); el.__hdBlobUrl = null }
  el.__hdBlobFor = null
  el.__hdSrcFor = url
  el.onerror = fallback
  // If this clip was preloaded (audioCache), play the in-memory object URL
  // directly — that's the only thing that works offline on iOS, where a ranged
  // network request bypasses the SW cache. The object URL is owned by
  // audioCache (never revoked here); the logical clip id stays the remote url.
  el.src = readyUrl(url) || url
  el.play().catch(e => {
    // Expected, not a real failure: autoplay blocked, or play() interrupted
    // by a pause()/src swap from a rapid second tap.
    if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return
    fallback()
  })
}

// Canonical form for an auth email: trim surrounding whitespace and lowercase.
// Used by every auth entry point (login / signup / password reset) so the same
// address typed as " Me@Example.com " always resolves to one account — mobile
// keyboards love to auto-capitalize the first letter, which would otherwise
// create a second, unreachable Supabase user on signup.
export function normalizeEmail(value) {
  return (value || '').trim().toLowerCase()
}

export function normalizeRecallInput(value) {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(/[。、，,.!?！？\s]/g, '')
}

export function isRecallMatch(input, expected) {
  return normalizeRecallInput(input) === normalizeRecallInput(expected)
}
