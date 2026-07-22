import { useState, useEffect } from 'react'
import { ArrowLeft, Users, Activity, Clock, BookOpen, Repeat } from 'lucide-react'
import { supabase } from './supabase'
import { useIsMobile } from './useIsMobile'
import { languageTheme } from './languageTheme'
import {
  withConversion, fillDailySeries, storyCompletionRate,
  filterStoryRows, storyLanguageBreakdown, retentionSummary, retentionAverages,
} from './dashboardMetrics'

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
  // toTs is "now" (the RPC upper bound is exclusive, so today's events up to now
  // are included). fillDailySeries takes a half-open [fromISO, toISO), so the
  // daily series' exclusive upper bound must be TOMORROW for today to be plotted.
  const toExclusive = new Date(to)
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1)
  return {
    fromTs: from.toISOString(),
    toTs: to.toISOString(),
    fromISO: from.toISOString().slice(0, 10),
    toISO: toExclusive.toISOString().slice(0, 10),
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

const ACCENT = '#4F6047'

function langLabel(lang) {
  if (lang === 'unknown' || !lang) return 'Unknown'
  try { return languageTheme(lang).languageName } catch { return lang }
}

// Blended D1/D7/D30 headline + a per-cohort table. Cells that haven't had enough
// days elapse yet show "—" rather than a misleading 0% (see retentionSummary).
function RetentionPanel({ rows, todayISO }) {
  const summary = retentionSummary(rows, todayISO)
  const avg = retentionAverages(rows, todayISO)
  const cell = (c) => (c && c.matured ? c.pct + '%' : '—')
  const headline = (v) => (v === null || v === undefined ? '—' : v + '%')

  if (summary.length === 0) {
    return <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No signup cohorts in this range yet.</span>
  }

  const cols = '1.4fr repeat(4, 1fr)'
  const th = { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }
  const td = { fontSize: '13px', color: 'var(--text)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <div>
      <div style={{ display: 'flex', gap: '18px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {[['D1', avg.d1], ['D7', avg.d7], ['D30', avg.d30]].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{k} retention</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>{headline(v)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '4px 10px', alignItems: 'center' }}>
        <span style={{ ...th, textAlign: 'left' }}>Cohort</span>
        <span style={th}>Size</span>
        <span style={th}>D1</span>
        <span style={th}>D7</span>
        <span style={th}>D30</span>
        {summary.map(r => (
          <Row key={r.day} cells={[r.day, r.size, cell(r.d1), cell(r.d7), cell(r.d30)]} td={td} />
        ))}
      </div>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '10px 0 0' }}>
        “—” means not enough days have elapsed for that cohort yet.
      </p>
    </div>
  )
}

function Row({ cells, td }) {
  return (
    <>
      <span style={{ ...td, textAlign: 'left', color: 'var(--text-muted)' }}>{cells[0]}</span>
      {cells.slice(1).map((c, i) => <span key={i} style={td}>{c}</span>)}
    </>
  )
}

// Story open→complete, filterable by language. Top line is the selected scope's
// completion rate; the list below always shows every language so relative
// performance stays visible (the active one emphasized).
function StoriesPanel({ rows, language, onLanguage }) {
  const breakdown = storyLanguageBreakdown(rows)
  const languages = breakdown.map(b => b.language)
  const scoped = filterStoryRows(rows, language)
  const opened = scoped.reduce((s, r) => s + (Number(r.opened) || 0), 0)
  const completed = scoped.reduce((s, r) => s + (Number(r.completed) || 0), 0)
  const rate = storyCompletionRate(scoped)

  const chip = (key, label) => {
    const on = (key || null) === language
    return (
      <button key={key || 'all'} onClick={() => onLanguage(key || null)} style={{
        padding: '4px 10px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px',
        border: '1px solid var(--border)', fontWeight: on ? 600 : 500,
        background: on ? '#E7EDE4' : 'transparent', color: on ? ACCENT : 'var(--text-muted)',
      }}>{label}</button>
    )
  }

  if (breakdown.length === 0) {
    return <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No story activity yet.</span>
  }

  return (
    <div>
      {languages.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {chip(null, 'All')}
          {languages.map(l => chip(l, langLabel(l)))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '14px' }}>
        <span style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)' }}>{rate}%</span>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>completed · {completed}/{opened} stories</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {breakdown.map(b => {
          const active = !language || language === b.language
          return (
            <div key={b.language} style={{ opacity: active ? 1 : 0.4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '3px' }}>
                <span>{langLabel(b.language)}</span>
                <span>{b.rate}% · {b.completed}/{b.opened}</span>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                <div style={{ width: b.rate + '%', height: '100%', background: ACCENT, borderRadius: '6px' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Dashboard({ onBack }) {
  const isMobile = useIsMobile()
  const [days, setDays] = useState(30)
  const [state, setState] = useState('loading') // loading | ready | empty | error
  const [data, setData] = useState(null)
  const [storyLang, setStoryLang] = useState(null) // null = all languages

  // Show the loading state as soon as the range changes. Adjusting state during
  // render (rather than synchronously inside the effect below) avoids the extra
  // commit React would otherwise schedule — same pattern as DictEntryView.
  const [loadingFor, setLoadingFor] = useState(days)
  if (days !== loadingFor) {
    setLoadingFor(days)
    setState('loading')
  }

  useEffect(() => {
    let cancelled = false
    const { fromTs, toTs, fromISO, toISO } = rangeBounds(days)
    async function load() {
      try {
        const [overview, funnel, active, story, retention] = await Promise.all([
          supabase.rpc('admin_overview', { from_ts: fromTs, to_ts: toTs }),
          supabase.rpc('admin_funnel', { from_ts: fromTs, to_ts: toTs }),
          supabase.rpc('admin_active_users', { from_ts: fromTs, to_ts: toTs }),
          supabase.rpc('admin_story_stats', { from_ts: fromTs, to_ts: toTs }),
          supabase.rpc('admin_retention', { cohort_from: fromTs, cohort_to: toTs }),
        ])
        if (cancelled) return
        const firstErr = overview.error || funnel.error || active.error || story.error || retention.error
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
          retention: retention.data || [],
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
  const todayISO = new Date().toISOString().slice(0, 10)

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
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>
              <Repeat size={16} strokeWidth={1.85} /> Retention by signup cohort
            </h2>
            <RetentionPanel rows={data.retention} todayISO={todayISO} />
          </Card>

          <Card>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Stories</h2>
            <StoriesPanel rows={data.story} language={storyLang} onLanguage={setStoryLang} />
          </Card>
        </div>
      )}
    </div>
  )
}
