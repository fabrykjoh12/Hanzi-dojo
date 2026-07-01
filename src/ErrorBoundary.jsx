import { Component } from 'react'

// Catches render-time crashes so a public visitor sees a calm recovery screen
// instead of a blank white page. Reloading almost always clears transient
// issues (a stale chunk after a deploy, a flaky network import).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // Best-effort logging; never throw from here.
    try { console.error('[Hanzi Dojo] render error', error, info) } catch (e) { /* noop */ }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', padding: '24px', fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{
          maxWidth: '420px', width: '100%', textAlign: 'center',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '20px', padding: '36px 28px', boxShadow: '0 18px 48px rgba(24,24,27,0.10)',
        }}>
          <div style={{ fontSize: '34px', color: 'var(--chinese-accent)', fontFamily: "'Noto Sans SC', sans-serif", marginBottom: '14px' }}>学</div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 22px' }}>
            The page hit an unexpected error. Reloading usually fixes it — your progress is saved.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              minHeight: '48px', padding: '0 22px', borderRadius: '14px', border: 'none',
              background: '#6E8466', color: '#fff', fontSize: '15px', fontWeight: 750,
              fontFamily: "'Inter', sans-serif", cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
