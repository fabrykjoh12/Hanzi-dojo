// Shareable "reading recap" card — turns a finished story's "% known" into a
// branded image a learner can post ("I can read 82% of this Chinese story").
//
// Split so the parts that carry logic are pure and testable:
//   - clampPct / readingShareText  → the caption text (unit-tested)
//   - drawReadingCard              → paints the card onto a 2D context (its
//                                    text content is asserted via a fake ctx)
//   - shareReadingCard             → the browser orchestration (canvas → blob →
//                                    Web Share with the image, else text share,
//                                    else download + copy). Best-effort; never
//                                    throws into the caller.

import { BRAND_NAME, BRAND_URL } from './brand'

export function clampPct(v) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

// The caption shared alongside the image (and the whole message when a platform
// can't take the image). Kept deterministic and free of personal data.
export function readingShareText({ knownPct, languageName, storyTitle, url = BRAND_URL } = {}) {
  const pct = clampPct(knownPct)
  const lang = (languageName || '').trim()
  const langBit = lang ? ' ' + lang : ''
  const title = (storyTitle || '').trim()
  const titleBit = title ? ' “' + title + '”' : ' this story'
  return `I can already read ${pct}% of${titleBit} — a real${langBit} story — on ${BRAND_NAME} 🥋 ${url}`
}

// ── Canvas rendering ────────────────────────────────────────────────────────

function hexA(hex, alpha) {
  const h = (hex || '#000000').replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function roundRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return }
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function ellipsize(ctx, text, maxW) {
  const t = text || ''
  if (ctx.measureText(t).width <= maxW) return t
  let out = t
  while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1)
  return out + '…'
}

// Paint the card onto `ctx` (a 2D context sized `size`×`size`). Pure with respect
// to the context — no DOM, no async — so a fake ctx can assert its text output.
export function drawReadingCard(ctx, { size = 1080, knownPct, languageName, storyTitle, accentHex = '#B83A24', langFont = 'sans-serif' } = {}) {
  const pct = clampPct(knownPct)
  const W = size, H = size
  const cx = W / 2
  const lang = (languageName || '').trim()

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  // Soft accent frame.
  ctx.strokeStyle = hexA(accentHex, 0.20)
  ctx.lineWidth = 3
  roundRectPath(ctx, 48, 48, W - 96, H - 96, 44)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Brand wordmark.
  ctx.fillStyle = accentHex
  ctx.font = '700 46px Poppins, Inter, sans-serif'
  ctx.fillText(BRAND_NAME, cx, 168)

  // Lead-in.
  ctx.fillStyle = '#52525B'
  ctx.font = '600 48px Inter, sans-serif'
  ctx.fillText('I can read', cx, 320)

  // The number — the hero of the card.
  ctx.fillStyle = accentHex
  ctx.font = '800 260px Inter, sans-serif'
  ctx.fillText(pct + '%', cx, 600)

  // Context line.
  ctx.fillStyle = '#52525B'
  ctx.font = '500 40px Inter, sans-serif'
  ctx.fillText(lang ? `of this ${lang} story` : 'of this story', cx, 700)

  // Story title (may be CJK — use the language font).
  if (storyTitle) {
    ctx.fillStyle = '#18181B'
    ctx.font = `700 60px ${langFont}, sans-serif`
    ctx.fillText(ellipsize(ctx, storyTitle, W - 220), cx, 810)
  }

  // Accent underline.
  const barW = 120
  ctx.fillStyle = hexA(accentHex, 0.85)
  roundRectPath(ctx, cx - barW / 2, 858, barW, 6, 3)
  ctx.fill()

  // Footer.
  ctx.fillStyle = '#71717A'
  ctx.font = '600 34px Inter, sans-serif'
  ctx.fillText(BRAND_URL.replace(/^https?:\/\//, ''), cx, 980)

  return ctx
}

async function buildCardFile(opts) {
  if (typeof document === 'undefined') throw new Error('no document')
  const size = 1080
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  // Wait for web fonts so the wordmark and any CJK title render, not a fallback.
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready } catch { /* best effort */ }
  drawReadingCard(ctx, { size, ...opts })
  const blob = await new Promise((resolve) => {
    try { canvas.toBlob(resolve, 'image/png') } catch { resolve(null) }
  })
  if (!blob) throw new Error('toBlob failed')
  return new File([blob], 'hanzi-dojo-reading.png', { type: 'image/png' })
}

function downloadFile(file) {
  try {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch { return false }
}

// Orchestrate the share. Returns { method } describing what happened so the UI
// can give the right confirmation. Never throws — every branch degrades.
//   shared-image | shared-text | downloaded | copied | cancelled | failed
export async function shareReadingCard({ knownPct, languageName, storyTitle, accentHex, langFont, url = BRAND_URL } = {}) {
  const text = readingShareText({ knownPct, languageName, storyTitle, url })

  let file = null
  try { file = await buildCardFile({ knownPct, languageName, storyTitle, accentHex, langFont }) } catch { /* fall back to text-only share below */ }

  const nav = typeof navigator !== 'undefined' ? navigator : null

  // 1. Native share with the image (mobile Safari/Chrome).
  if (file && nav && nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ files: [file], text })
      return { method: 'shared-image' }
    } catch (e) {
      if (e && e.name === 'AbortError') return { method: 'cancelled' }
      // fall through to other methods
    }
  }

  // 2. Native share, text only (platform can't take files).
  if (nav && nav.share) {
    try {
      await nav.share({ text })
      return { method: 'shared-text' }
    } catch (e) {
      if (e && e.name === 'AbortError') return { method: 'cancelled' }
    }
  }

  // 3. Desktop fallback: save the image (if we built one) and copy the caption.
  let copied = false
  try { if (nav && nav.clipboard) { await nav.clipboard.writeText(text); copied = true } } catch { /* ignore */ }
  if (file && downloadFile(file)) return { method: 'downloaded' }
  if (copied) return { method: 'copied' }
  return { method: 'failed' }
}
