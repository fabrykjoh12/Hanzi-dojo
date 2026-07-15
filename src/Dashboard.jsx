import { useState, useEffect } from 'react'
import { ArrowLeft, Users, Activity, Clock, BookOpen } from 'lucide-react'
import { supabase } from './supabase'
import { useIsMobile } from './useIsMobile'
import { withConversion, fillDailySeries, storyCompletionRate } from './dashboardMetrics'

const RANGES = [
  { key: 7, label: '7 days' },
  { key: 30, label: '30 days' },
  { key: 90, label: '90 days' },
]

const STAGE_LABELS = {
  landing: 'Landing viewed',
  signup: 'Signed up',
  onboarding: 'Onboarded',
  first_mission: 'First mission',
  first_story: 'First story',
  returned: 'Returned',
}

function rangeBounds(days) {
  const to = new Date()
  const from = new Date()
  from.setUTCDate(from.getUTCDate() - days)
  return {
    fromTs: from.toISOString(),
    toTs: to.toISOString(),
    fromISO: from.toISOString().slice(0, 10),
    toISO: to.toISOString().slice(0, 10),
  }
}

function fmtMs(ms) {
  if (!ms) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return s + 's'
  return Math.floor(s / 60) + 'm ' + (s % 60) + 's'
}

function Card({ children }) {
  return (
    <div style={{
      background: 'var(--surface-glass)', border: '1px solid var(--border)',
      borderRadius: '14px', padding: '18px 20px',
    }}>{children}</div>
  )
}

function Kpi({ icon: Icon, label, value }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
        <Icon size={16} strokeWidth={1.85} /> {label}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', marginTop: '6px' }}>{value}</div>
    </Card>
  )
}

function FunnelBars({ stages }) {
  const rows = withConversion(stages)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {rows.map(r => (
        <div key={r.stage}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '3px' }}>
            <span>{STAGE_LABELS[r.stage] || r.stage}</span>
            <span>{r.count} · {r.pctOfTop}% of top · {r.pctOfPrev}% step</span>
          </div>
          <div style={{ background: 'var(--surface-2)', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
            <div style={{ width: r.pctOfTop + '%', height: '100%', background: '#4F6047', borderRadius: '6px' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function DauChart({ series }) {
  const w = 640, h = 140, pad = 4
  const max = Math.max(1, ...series.map(d => d.dau))
  const step = series.length > 1 ? (w - pad * 2) / (series.length - 1) : 0
  const pts = series.map((d, i) => `${pad + i * step},${h - pad - (d.dau / max) * (h - pad * 2)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label="Daily active users">
      <polyline points={pts} fill="none" stroke="#4F6047" strokeWidth="2" />
    </svg>
  )
}

export default function Dashboard({ onBack }) {
  const isMobile = useIsMobile()
  const [days, setDays] = useState(30)
  const [state, setState] = useState('loading') // loading | ready | empty | error
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    const { fromTs, toTs, fromISO, toISO } = rangeBounds(days)
    async function load() {
      try {
        const [overview, funnel, active, story] = await Promise.all([
          supabase.rpc('admin_overview', { from_ts: fromTs, to_ts: toTs }),
          supabase.rpc('admin_funnel', { from_ts: fromTs, to_ts: toTs }),
          supabase.rpc('admin_active_users', { from_ts: fromTs, to_ts: toTs }),
          supabase.rpc('admin_story_stats', { from_ts: fromTs, to_ts: toTs }),
        ])
        if (cancelled) return
        const firstErr = overview.error || funnel.error || active.error || story.error
        if (firstErr) { setState('error'); return }
        const ov = (overview.data && overview.data[0]) || {}
        const funnelRows = funnel.data || []
        const totalEvents = funnelRows.reduce((s, r) => s + Number(r.count || 0), 0)
        if (totalEvents === 0) { setState('empty'); return }
        setData({
          overview: ov,
          funnel: funnelRows,
          series: fillDailySeries(active.data || [], fromISO, toISO),
          story: story.data || [],
        })
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    }
    load()
    return () => { cancelled = true }
  }, [days])

  const pad = isMobile ? '16px' : '32px'

  return (
    <div style={{ padding: pad, maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <ArrowLeft size={20} strokeWidth={1.85} />
          </button>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Dashboard</h1>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setDays(r.key)} style={{
              padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
              border: '1px solid var(--border)',
              background: days === r.key ? '#E7EDE4' : 'transparent',
              color: days === r.key ? '#4F6047' : 'var(--text-muted)',
              fontWeight: days === r.key ? 600 : 500,
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {state === 'loading' && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {state === 'error' && <Card><p style={{ color: 'var(--text-muted)', margin: 0 }}>Couldn’t load analytics. Confirm the admin migration is applied and you have admin access, then retry.</p></Card>}
      {state === 'empty' && <Card><p style={{ color: 'var(--text-muted)', margin: 0 }}>No analytics yet for this range. Once the analytics migration is applied and traffic (or seeded events) exists, charts appear here.</p></Card>}

      {state === 'ready' && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)' }}>
            <Kpi icon={Users} label="Signups" value={data.overview.signups ?? 0} />
            <Kpi icon={Activity} label="DAU / WAU" value={`${data.overview.dau ?? 0} / ${data.overview.wau ?? 0}`} />
            <Kpi icon={Clock} label="Median session" value={fmtMs(Number(data.overview.median_session_ms))} />
            <Kpi icon={BookOpen} label="Story completion" value={storyCompletionRate(data.story) + '%'} />
          </div>

          <Card>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Activation funnel</h2>
            <FunnelBars stages={data.funnel} />
          </Card>

          <Card>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Daily active users</h2>
            <DauChart series={data.series} />
          </Card>

          <Card>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Stories by language</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data.story.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No story activity yet.</span>}
              {data.story.map(s => (
                <div key={s.language} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <span style={{ textTransform: 'capitalize' }}>{s.language}</span>
                  <span>{s.completed}/{s.opened} completed</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
