import { useState } from 'react'
import { supabase } from './supabase'
import { toast } from './toast'
import { useIsMobile } from './useIsMobile'
import { MessageCircleHeart, X, Bug, Lightbulb, MessageSquare } from 'lucide-react'

// A small always-available way for users to send bug reports and ideas
// straight into the database, no email/GitHub account required. Floating
// button + a lightweight modal — no <form> tag per project rules, just a
// controlled textarea and a button that inserts a row on click.

const CATEGORIES = [
  { key: 'bug', label: 'Bug', icon: Bug },
  { key: 'idea', label: 'Idea', icon: Lightbulb },
  { key: 'other', label: 'Something else', icon: MessageSquare },
]

const SAGE = '#6E8466'
const SAGE_DARK = '#5C7155'

export default function Feedback({ session, profile, view }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const canSend = category != null && message.trim().length > 0 && !sending

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
    const { error: insertError } = await supabase.from('feedback').insert({
      user_id: session.user.id,
      email: session.user.email || null,
      category,
      message: message.trim(),
      page: view || null,
      language: profile ? profile.active_language : null,
    })
    setSending(false)
    if (insertError) {
      setError('Could not send — try again in a moment.')
      return
    }
    close()
    toast({
      kind: 'seal',
      accent: SAGE,
      title: 'Thanks for the feedback!',
      body: 'We read every submission.',
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Send feedback"
        aria-label="Send feedback"
        style={{
          position: 'fixed', zIndex: 45,
          right: isMobile ? '16px' : '24px',
          bottom: isMobile ? 'calc(72px + env(safe-area-inset-bottom))' : '24px',
          width: '50px', height: '50px', borderRadius: '999px',
          background: SAGE, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 26px rgba(24,24,27,0.22)',
        }}
      >
        <MessageCircleHeart size={22} strokeWidth={1.9} color="#fff" />
      </button>

      {open && (
        <>
          <div
            onClick={close}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.36)', zIndex: 70 }}
          />
          <div style={{
            position: 'fixed', zIndex: 71,
            left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: '100%', maxWidth: '440px', maxHeight: '86vh', overflowY: 'auto',
            background: 'var(--surface)', borderRadius: '22px',
            boxShadow: '0 24px 70px rgba(0,0,0,0.28)', padding: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>Send feedback</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.5 }}>
                  Found a bug, or have an idea? We read every message.
                </div>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
              >
                <X size={20} strokeWidth={1.9} color="var(--text-muted)" />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '18px', flexWrap: 'wrap' }}>
              {CATEGORIES.map(c => {
                const Icon = c.icon
                const active = category === c.key
                return (
                  <button
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '7px',
                      padding: '9px 13px', borderRadius: '12px', cursor: 'pointer',
                      border: '1px solid ' + (active ? SAGE : 'var(--border)'),
                      background: active ? SAGE + '14' : 'var(--surface-2)',
                      color: active ? SAGE_DARK : 'var(--text-muted)',
                      fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    <Icon size={16} strokeWidth={1.9} color={active ? SAGE_DARK : 'var(--text-muted)'} />
                    {c.label}
                  </button>
                )
              })}
            </div>

            <textarea
              value={message}
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
                borderRadius: '14px', border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: 'var(--text)',
                fontSize: '14px', fontFamily: 'Inter, sans-serif', lineHeight: 1.5,
                resize: 'vertical', boxSizing: 'border-box',
              }}
            />

            {error && (
              <div style={{ fontSize: '12.5px', color: 'var(--danger)', marginTop: '8px' }}>{error}</div>
            )}

            <button
              onClick={send}
              disabled={!canSend}
              style={{
                width: '100%', marginTop: '16px', minHeight: '48px', borderRadius: '14px', border: 'none',
                background: canSend ? SAGE : 'var(--surface-2)',
                color: canSend ? '#fff' : 'var(--text-faint)',
                fontSize: '14.5px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
                cursor: canSend ? 'pointer' : 'default',
              }}
            >
              {sending ? 'Sending…' : 'Send feedback'}
            </button>
          </div>
        </>
      )}
    </>
  )
}
