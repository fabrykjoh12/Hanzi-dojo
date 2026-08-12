import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { toast } from './toast'
import { useIsMobile } from './useIsMobile'
import { anySheetOpen, subscribeSheets } from './sheetStack'
import { MOBILE_NAV_HEIGHT } from './navMetrics'
import { feedbackStoryContext } from './feedbackContext'
import { BUILD_SHA } from './version'
import { MessageCircleHeart, X, Bug, Lightbulb, MessageSquare } from 'lucide-react'
import { trapDialogFocus } from './dialogFocus'
import { VERMILION } from './palette'
import { IconButton } from './controls'
import { holdLayout } from './controlTokens'

// A small always-available way for users to send bug reports and ideas
// straight into the database, no email/GitHub account required. Floating
// button + a lightweight modal — no <form> tag per project rules, just a
// controlled textarea and a button that inserts a row on click.

const CATEGORIES = [
  { key: 'bug', label: 'Bug', icon: Bug },
  { key: 'idea', label: 'Idea', icon: Lightbulb },
  { key: 'other', label: 'Something else', icon: MessageSquare },
]

// P14-0: vermilion, themed. See ui.jsx.
const PRIMARY = 'var(--primary)'
const PRIMARY_PRESSED = 'var(--primary-pressed)'

// How far the floating button sits above the bottom edge, on a phone.
//
// This was a hardcoded `72px`. The bar has been 62 and is now 58
// (`navMetrics.js`), and this number did not follow either change — it happened
// to still look right because 58 + 14 is 72, which is exactly the kind of
// coincidence that stops being one. There is ONE navigation height in this
// project and this reads it.
const FAB_GAP_ABOVE_NAV = 14

export default function Feedback({ session, profile, view }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  // A blocking sheet is open somewhere: get out of the way entirely.
  //
  // The More sheet renders at z-index 41 and this button at 45, so it floated
  // ON TOP of a modal dialog — visible in the P10 audit's own screenshot. The
  // fix is not a higher z-index on the sheet; a z-index race has no end. The
  // button simply does not exist while a dialog does.
  //
  // `sheetStack` is the same registry Android Back reads, so any overlay that
  // is already a first-class sheet is covered by construction — and any future
  // one has to register there anyway to make Back work (NAV-MODEL §5.2).
  const [sheetOpen, setSheetOpen] = useState(anySheetOpen)
  useEffect(() => subscribeSheets(setSheetOpen), [])
  const [category, setCategory] = useState(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const canSend = category != null && message.trim().length > 0 && !sending

  // Dialog focus management (the ReadingScaffold pattern): remember the opener,
  // focus the panel on open, give focus back on close; Escape closes.
  const panelRef = useRef(null)
  const openerRef = useRef(null)
  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement
    if (panelRef.current) panelRef.current.focus()
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (openerRef.current && openerRef.current.focus) openerRef.current.focus()
    }
  }, [open])

  function close() {
    setOpen(false)
    setCategory(null)
    setMessage('')
    setError(null)
  }

  async function send() {
    if (!canSend) return
    setSending(true)
    setError(null)
    // Context: the open story (registered by the readers — see
    // feedbackContext.js) plus the running build, so a content report lands
    // pinned to the exact story and version it is about.
    const storyCtx = feedbackStoryContext()
    const { error: insertError } = await supabase.from('feedback').insert({
      user_id: session.user.id,
      email: session.user.email || null,
      category,
      message: message.trim(),
      page: view || null,
      language: profile ? profile.active_language : null,
      context: { ...(storyCtx || {}), app_version: BUILD_SHA || null },
    })
    setSending(false)
    if (insertError) {
      setError('Could not send — try again in a moment.')
      return
    }
    close()
    toast({
      kind: 'seal',
      // A LITERAL hex, not `var(--primary)`: Toasts.jsx builds its tint and
      // border by concatenating an alpha suffix onto this value, and
      // `var(--primary)44` is invalid CSS. The token module is still the source
      // of the number — this is the one place it has to arrive as a string.
      accent: VERMILION.base,
      title: 'Thanks for the feedback!',
      body: 'We read every submission.',
    })
  }

  return (
    <>
      {!sheetOpen && (
      <button
        onClick={() => setOpen(true)}
        title="Send feedback"
        aria-label="Send feedback"
        style={{
          position: 'fixed', zIndex: 45,
          right: isMobile ? '16px' : '24px',
          bottom: isMobile
            ? 'calc(' + (MOBILE_NAV_HEIGHT + FAB_GAP_ABOVE_NAV) + 'px + env(safe-area-inset-bottom))'
            : '24px',
          width: '50px', height: '50px', borderRadius: '999px',
          background: PRIMARY, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-2)',
        }}
      >
        <MessageCircleHeart size={22} strokeWidth={1.9} color="#fff" />
      </button>
      )}

      {open && (
        <>
          {/* `app-overlay-viewport` (100dvh) rather than `inset: 0`: the large
              viewport is taller than what a phone actually shows, so a modal
              centred in it sits too low and its Send button can land behind
              the browser/WebView toolbar. */}
          <div
            onClick={close}
            aria-hidden="true"
            className="app-overlay-viewport"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.36)', zIndex: 70 }}
          />
          {/* Centring wrapper, so the panel's max height is a share of the
              visible viewport. `pointerEvents: none` keeps the backdrop's
              tap-to-close working through it. */}
          <div
            className="app-overlay-viewport"
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, zIndex: 71,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="feedback-title"
              tabIndex={-1}
              // `aria-modal` takes the page out of the assistive-tech tree, so
              // Tab has to stay inside this panel or focus lands nowhere.
              onKeyDown={e => trapDialogFocus(e, panelRef.current)}
              style={{
                width: '100%', maxWidth: '440px', maxHeight: '86%', overflowY: 'auto',
                pointerEvents: 'auto',
                background: 'var(--surface)', borderRadius: '18px',
                boxShadow: 'var(--shadow-2)', padding: '24px', outline: 'none',
              }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div id="feedback-title" style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)' }}>Send feedback</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.5 }}>
                    Found a bug, or have an idea? We read every message.
                  </div>
                </div>
                {/* P14-1: was a 28x28 target (20px glyph + 4px padding). The
                    shared control is 44x44 and holdLayout(28) gives back the
                    8px per side, so the layout box, the glyph position and
                    every pixel are unchanged — only the hit area grew. */}
                <IconButton label="Close" icon={X} iconSize={20} tone="var(--text-muted)" onClick={close} style={holdLayout(28)} />
              </div>

              <div role="group" aria-label="Feedback category" style={{ display: 'flex', gap: '8px', marginTop: '18px', flexWrap: 'wrap' }}>
                {CATEGORIES.map(c => {
                  const Icon = c.icon
                  const active = category === c.key
                  return (
                    <button
                      key={c.key}
                      onClick={() => setCategory(c.key)}
                      aria-pressed={active}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '7px',
                        padding: '9px 13px', borderRadius: '12px', cursor: 'pointer',
                        border: '1px solid ' + (active ? PRIMARY : 'var(--border)'),
                        // `var(--primary) + '14'` is not a colour — an alpha-hex
                        // suffix only concatenates onto a literal hex, and a
                        // `var()` string plus two characters is invalid CSS that
                        // silently paints nothing. The tint has to mix.
                        background: active
                          ? 'color-mix(in srgb, var(--primary) 8%, var(--surface-2))'
                          : 'var(--surface-2)',
                        color: active ? PRIMARY_PRESSED : 'var(--text-muted)',
                        fontSize: '13px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      <Icon size={16} strokeWidth={1.9} color={active ? PRIMARY_PRESSED : 'var(--text-muted)'} />
                      {c.label}
                    </button>
                  )
                })}
              </div>

              <textarea
                value={message}
                aria-label="Your feedback"
                onChange={e => setMessage(e.target.value)}
                placeholder={
                  category === 'bug'
                    ? 'What happened, and what did you expect instead?'
                    : category === 'idea'
                      ? 'What would make Hanzi Dojo better?'
                      : "What's on your mind?"
                }
                rows={5}
                style={{
                  width: '100%', marginTop: '14px', padding: '12px 14px',
                  borderRadius: '12px', border: '1px solid var(--border)',
                  background: 'var(--surface-2)', color: 'var(--text)',
                  fontSize: '13.5px', fontFamily: 'Inter, sans-serif', lineHeight: 1.5,
                  resize: 'vertical', boxSizing: 'border-box',
                }}
              />

              {/* When sent from inside a reader, say what the report will be
                  pinned to — no surprises about what gets attached. */}
              {feedbackStoryContext() && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Attached: the story you have open ({feedbackStoryContext().story_title})
                </div>
              )}

              {error && (
                <div role="alert" style={{ fontSize: '13px', color: 'var(--danger)', marginTop: '8px' }}>{error}</div>
              )}

              <button
                onClick={send}
                disabled={!canSend}
                style={{
                  width: '100%', marginTop: '16px', minHeight: '48px', borderRadius: '12px', border: 'none',
                  background: canSend ? PRIMARY : 'var(--surface-2)',
                  color: canSend ? '#fff' : 'var(--text-faint)',
                  fontSize: '15px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                  cursor: canSend ? 'pointer' : 'default',
                }}
              >
                {sending ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
