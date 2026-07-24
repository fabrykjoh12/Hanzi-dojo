import { useEffect, useMemo, useState } from 'react'
import {
  Activity, Bot, Box, Check, ChevronRight, Circle, Clock3, Code2, FileCode2,
  FileText, FlaskConical, GitBranch, GitPullRequest, History, Link2, Loader2,
  MessageSquareText, Milestone, Plus, RefreshCw, RotateCcw, Search, ShieldCheck,
  Sparkles, Target, TestTube2, UsersRound, X, XCircle,
} from 'lucide-react'

const RUN_STATUS = {
  queued: 'Klargjort',
  running: 'Jobber',
  needs_input: 'Trenger svar',
  testing: 'Tester',
  completed: 'Ferdig',
  failed: 'Feilet',
}

const ACTIVITY_LABEL = {
  'item.created': 'Oppgave',
  'item.updated': 'Oppgave',
  'item.deleted': 'Slettet',
  'item.restored': 'Gjenopprettet',
  'comment.created': 'Kommentar',
  'milestone.created': 'Milepæl',
  'milestone.updated': 'Milepæl',
  'test.created': 'Test',
  'test.passed': 'Godkjent',
  'test.failed': 'Feilet',
  'test.pending': 'Test',
  'test.deleted': 'Slettet',
  'run.queued': 'Claude',
  'run.running': 'Claude',
  'run.needs_input': 'Claude',
  'run.testing': 'Claude',
  'run.completed': 'Claude',
  'run.failed': 'Claude',
  decision: 'Beslutning',
  note: 'Notat',
}

const dateTime = new Intl.DateTimeFormat('nb-NO', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function RunCard({ run, item, onUpdate, onOpenItem }) {
  const [summary, setSummary] = useState(run.summary || '')
  const [prUrl, setPrUrl] = useState(run.pr_url || '')
  return (
    <article className={`dojo2-run is-${run.status}`}>
      <header>
        <div><Bot size={18} /><span>{RUN_STATUS[run.status] || run.status}</span></div>
        <time>{dateTime.format(new Date(run.updated_at || run.started_at))}</time>
      </header>
      <button className="dojo2-run-title" onClick={() => onOpenItem(item?.id)}>{item?.title || 'Ukjent oppgave'}<ChevronRight size={16} /></button>
      <textarea
        value={summary}
        onChange={event => setSummary(event.target.value)}
        onBlur={() => { if (summary !== (run.summary || '')) onUpdate(run.id, { summary }) }}
        placeholder="Kort oppsummering fra Claude-økten …"
        rows={2}
      />
      <div className="dojo2-run-statuses" aria-label="Oppdater Claude-status">
        {['running', 'needs_input', 'testing', 'completed', 'failed'].map(status => (
          <button key={status} className={run.status === status ? 'active' : ''} onClick={() => onUpdate(run.id, { status })}>
            {RUN_STATUS[status]}
          </button>
        ))}
      </div>
      <label className="dojo2-inline-field">
        <GitPullRequest size={15} />
        <input
          value={prUrl}
          onChange={event => setPrUrl(event.target.value)}
          onBlur={() => { if (prUrl !== (run.pr_url || '')) onUpdate(run.id, { pr_url: prUrl }) }}
          placeholder="Lenke til pull request"
          type="url"
        />
      </label>
    </article>
  )
}

function OverviewView({ data, items, bridgeStatus, onOpenItem, onUpdateRun }) {
  const activeRuns = data.runs.filter(run => !['completed', 'failed'].includes(run.status))
  const blocked = items.filter(item => item.blocked_reason || (item.depends_on || []).some(id => items.find(candidate => candidate.id === id)?.status !== 'done'))
  const githubItems = items.filter(item => item.github_pr_url || item.github_branch)
  return (
    <div className="dojo2-grid">
      <section className="dojo2-panel dojo2-span-2">
        <header className="dojo2-panel-head">
          <div><Sparkles size={18} /><span><strong>I gang nå</strong><small>Claude-økter og aktivt arbeid</small></span></div>
          <strong>{activeRuns.length}</strong>
        </header>
        {activeRuns.length ? (
          <div className="dojo2-run-grid">
            {activeRuns.map(run => (
              <RunCard key={run.id} run={run} item={items.find(item => item.id === run.item_id)} onUpdate={onUpdateRun} onOpenItem={onOpenItem} />
            ))}
          </div>
        ) : <div className="dojo2-empty"><Bot size={22} /><strong>Ingen aktive Claude-økter</strong><span>Åpne en oppgave og start Claude når dere er klare.</span></div>}
      </section>

      <section className="dojo2-panel">
        <header className="dojo2-panel-head"><div><UsersRound size={18} /><span><strong>Pålogget</strong><small>Oppdatert direkte</small></span></div><strong>{data.presence.length}</strong></header>
        <div className="dojo2-presence">
          {data.presence.map(person => (
            <article key={person.user_id}>
              <i aria-hidden="true" />
              <div><strong>{person.display_name}</strong><span>{items.find(item => item.id === person.active_item_id)?.title || 'I kontrollrommet'}</span></div>
            </article>
          ))}
          {!data.presence.length && <p>Ingen andre er aktive akkurat nå.</p>}
        </div>
      </section>

      <section className="dojo2-panel">
        <header className="dojo2-panel-head"><div><ShieldCheck size={18} /><span><strong>Brodiagnostikk</strong><small>Prosjekt og dokumenter</small></span></div><i className={bridgeStatus.connected ? 'is-good' : ''} /></header>
        <dl className="dojo2-diagnostics">
          <div><dt>Status</dt><dd>{bridgeStatus.connected ? 'Tilkoblet' : 'Frakoblet'}</dd></div>
          <div><dt>README</dt><dd>{bridgeStatus.readmeFound ? 'Funnet' : 'Mangler'}</dd></div>
          <div><dt>Bro</dt><dd>{bridgeStatus.bridgeVersion || '—'}</dd></div>
          <div><dt>Prosjekt</dt><dd title={bridgeStatus.projectRoot}>{bridgeStatus.projectRoot?.split(/[\\/]/).pop() || '—'}</dd></div>
        </dl>
      </section>

      <section className="dojo2-panel">
        <header className="dojo2-panel-head"><div><Link2 size={18} /><span><strong>Blokkeringer</strong><small>Avhengigheter og hindringer</small></span></div><strong>{blocked.length}</strong></header>
        <div className="dojo2-compact-list">
          {blocked.slice(0, 6).map(item => <button key={item.id} onClick={() => onOpenItem(item.id)}><XCircle size={15} /><span><strong>{item.title}</strong><small>{item.blocked_reason || 'Venter på en annen oppgave'}</small></span><ChevronRight size={15} /></button>)}
          {!blocked.length && <p>Ingen registrerte blokkeringer.</p>}
        </div>
      </section>

      <section className="dojo2-panel">
        <header className="dojo2-panel-head"><div><GitBranch size={18} /><span><strong>GitHub-flyt</strong><small>Branch, PR og CI</small></span></div><strong>{githubItems.length}</strong></header>
        <div className="dojo2-compact-list">
          {githubItems.slice(0, 6).map(item => (
            <button key={item.id} onClick={() => item.github_pr_url ? window.open(item.github_pr_url, '_blank', 'noopener,noreferrer') : onOpenItem(item.id)}>
              <GitPullRequest size={15} /><span><strong>{item.title}</strong><small>{item.github_branch || item.github_pr_url}</small></span><i className={`dojo2-ci is-${item.ci_status}`} />
            </button>
          ))}
          {!githubItems.length && <p>Legg branch eller PR-lenke på en oppgave.</p>}
        </div>
      </section>
    </div>
  )
}

function TestLabView({ data, items, attachments, onCreate, onUpdate, onDelete, onCreateBug, onOpenItem }) {
  const [form, setForm] = useState({ item_id: items.find(item => item.status === 'review')?.id || items[0]?.id || '', title: '', expected: '' })
  const counts = {
    pending: data.testCases.filter(test => test.status === 'pending').length,
    passed: data.testCases.filter(test => test.status === 'passed').length,
    failed: data.testCases.filter(test => test.status === 'failed').length,
  }
  return (
    <div className="dojo2-test-layout">
      <section className="dojo2-panel">
        <header className="dojo2-panel-head"><div><Plus size={18} /><span><strong>Nytt testtilfelle</strong><small>Knyttes til en oppgave</small></span></div></header>
        <form className="dojo2-form" onSubmit={async event => {
          event.preventDefault()
          if (!form.item_id || !form.title.trim()) return
          await onCreate(form)
          setForm(current => ({ ...current, title: '', expected: '' }))
        }}>
          <label><span>Oppgave</span><select value={form.item_id} onChange={event => setForm(current => ({ ...current, item_id: event.target.value }))}>{items.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
          <label><span>Hva skal testes?</span><input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="F.eks. lyd starter på mobil" required /></label>
          <label><span>Forventet resultat</span><textarea value={form.expected} onChange={event => setForm(current => ({ ...current, expected: event.target.value }))} placeholder="Beskriv hva som må være sant for at testen består" rows={3} /></label>
          <button className="dojo-primary"><TestTube2 size={17} />Legg til test</button>
        </form>
      </section>
      <section className="dojo2-panel dojo2-test-results">
        <header className="dojo2-panel-head"><div><FlaskConical size={18} /><span><strong>Testkø</strong><small>{counts.pending} venter · {counts.passed} godkjent · {counts.failed} feilet</small></span></div></header>
        <div className="dojo2-tests">
          {data.testCases.map(test => {
            const item = items.find(candidate => candidate.id === test.item_id)
            const screenshotCount = attachments.filter(file => file.item_id === test.item_id).length
            return (
              <article key={test.id} className={`is-${test.status}`}>
                <header><button onClick={() => onOpenItem(test.item_id)}>{item?.title || 'Ukjent oppgave'}</button><span>{screenshotCount} bilder</span></header>
                <h3>{test.title}</h3>
                {test.expected && <p><strong>Forventet:</strong> {test.expected}</p>}
                <textarea defaultValue={test.notes || ''} onBlur={event => onUpdate(test.id, { notes: event.target.value })} placeholder="Faktisk resultat og notater …" rows={2} />
                <footer>
                  <div>
                    <button className={test.status === 'passed' ? 'active pass' : ''} onClick={() => onUpdate(test.id, { status: 'passed' })}><Check size={15} />Bestått</button>
                    <button className={test.status === 'failed' ? 'active fail' : ''} onClick={() => onUpdate(test.id, { status: 'failed' })}><X size={15} />Feilet</button>
                  </div>
                  {test.status === 'failed' && <button onClick={() => onCreateBug(test, item)}>Lag bug</button>}
                  <button aria-label={`Slett ${test.title}`} onClick={() => onDelete(test.id)}><X size={15} /></button>
                </footer>
              </article>
            )
          })}
          {!data.testCases.length && <div className="dojo2-empty"><FlaskConical size={22} /><strong>Ingen tester ennå</strong><span>Legg til akseptansekriteriene dere faktisk skal kontrollere.</span></div>}
        </div>
      </section>
    </div>
  )
}

function DocumentsView({ bridgeStatus, onReadDocument }) {
  const [selected, setSelected] = useState('README.md')
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const load = async name => {
    setSelected(name)
    setLoading(true)
    setError('')
    try { setDocument(await onReadDocument(name)) } catch (nextError) { setError(nextError.message) } finally { setLoading(false) }
  }
  const diagnostics = new Map((bridgeStatus.documents || []).map(entry => [entry.name, entry]))
  return (
    <div className="dojo2-doc-layout">
      <aside className="dojo2-panel dojo2-doc-nav">
        <header className="dojo2-panel-head"><div><FileText size={18} /><span><strong>Prosjektdokumenter</strong><small>Direkte fra prosjektmappen</small></span></div></header>
        {['README.md', 'ROADMAP.md', 'TASKS.md', 'Claude.md'].map(name => {
          const info = diagnostics.get(name)
          return <button key={name} className={selected === name ? 'active' : ''} onClick={() => load(name)} disabled={!bridgeStatus.connected}><FileCode2 size={17} /><span><strong>{name}</strong><small>{info?.exists ? `Oppdatert ${dateTime.format(new Date(info.modifiedAt))}` : 'Ikke funnet'}</small></span><i className={info?.exists ? 'is-good' : ''} /></button>
        })}
      </aside>
      <section className="dojo2-panel dojo2-doc-viewer">
        <header><div><FileCode2 size={18} /><span><strong>{selected}</strong><small>{document?.modifiedAt ? dateTime.format(new Date(document.modifiedAt)) : 'Ikke lastet'}</small></span></div><button onClick={() => load(selected)} disabled={loading || !bridgeStatus.connected} aria-label="Last dokumentet på nytt">{loading ? <Loader2 className="dojo-spin" size={17} /> : <RefreshCw size={17} />}</button></header>
        {error ? <div className="dojo2-doc-error" role="alert"><XCircle size={18} /><span><strong>Kunne ikke lese dokumentet</strong>{error}</span></div>
          : document ? <pre>{document.content}</pre>
            : <div className="dojo2-empty"><FileText size={22} /><strong>Velg et dokument</strong><span>Broen må være tilkoblet for å lese prosjektfiler.</span></div>}
      </section>
    </div>
  )
}

function ActivityView({ data, members, identity, onDecision, onRestore, onOpenItem }) {
  const [decision, setDecision] = useState('')
  const memberName = id => members.find(member => member.user_id === id)?.profile?.display_name || (id === identity.userId ? identity.displayName : 'Dojo-medlem')
  return (
    <div className="dojo2-activity-layout">
      <section className="dojo2-panel">
        <header className="dojo2-panel-head"><div><MessageSquareText size={18} /><span><strong>Beslutningslogg</strong><small>Bevar hvorfor dere valgte noe</small></span></div></header>
        <form className="dojo2-decision" onSubmit={async event => { event.preventDefault(); if (!decision.trim()) return; await onDecision(decision); setDecision('') }}>
          <textarea value={decision} onChange={event => setDecision(event.target.value)} placeholder="Vi valgte X fordi …" rows={4} />
          <button className="dojo-primary" disabled={!decision.trim()}><Plus size={16} />Lagre beslutning</button>
        </form>
        <div className="dojo2-history">
          <header><History size={17} /><strong>Versjonshistorikk</strong></header>
          {data.versions.slice(0, 12).map(version => (
            <article key={version.id}>
              <div><strong>{version.snapshot?.title || 'Oppgave'}</strong><span>{dateTime.format(new Date(version.created_at))} · {memberName(version.actor_id)}</span></div>
              <button onClick={() => onRestore(version.item_id, version.id)}><RotateCcw size={15} />Gjenopprett</button>
            </article>
          ))}
          {!data.versions.length && <p>Historikk opprettes automatisk når oppgaver endres.</p>}
        </div>
      </section>
      <section className="dojo2-panel dojo2-feed-panel">
        <header className="dojo2-panel-head"><div><Activity size={18} /><span><strong>Aktivitet</strong><small>Alt som skjer i arbeidsområdet</small></span></div><strong>{data.activities.length}</strong></header>
        <div className="dojo2-feed">
          {data.activities.map(entry => (
            <article key={entry.id}>
              <i className={`is-${entry.event_type.split('.')[0]}`} />
              <div>
                <header><strong>{memberName(entry.actor_id)}</strong><span>{ACTIVITY_LABEL[entry.event_type] || 'Oppdatering'}</span><time>{dateTime.format(new Date(entry.created_at))}</time></header>
                <button disabled={!entry.item_id} onClick={() => entry.item_id && onOpenItem(entry.item_id)}>{entry.summary}</button>
              </div>
            </article>
          ))}
          {!data.activities.length && <div className="dojo2-empty"><Activity size={22} /><strong>Rolig foreløpig</strong><span>Endringer, tester og Claude-økter dukker opp her.</span></div>}
        </div>
      </section>
    </div>
  )
}

function ReleasesView({ data, items, onCreate, onUpdate, onOpenItem }) {
  const [form, setForm] = useState({ title: '', description: '', target_date: '' })
  return (
    <div className="dojo2-release-layout">
      <section className="dojo2-panel">
        <header className="dojo2-panel-head"><div><Milestone size={18} /><span><strong>Ny milepæl</strong><small>Versjon, beta eller leveranse</small></span></div></header>
        <form className="dojo2-form" onSubmit={async event => { event.preventDefault(); if (!form.title.trim()) return; await onCreate(form); setForm({ title: '', description: '', target_date: '' }) }}>
          <label><span>Navn</span><input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="F.eks. Mobil beta" required /></label>
          <label><span>Mål</span><textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Hva skal være sant når denne leveres?" rows={3} /></label>
          <label><span>Måldato</span><input type="date" value={form.target_date} onChange={event => setForm(current => ({ ...current, target_date: event.target.value }))} /></label>
          <button className="dojo-primary"><Target size={17} />Opprett milepæl</button>
        </form>
      </section>
      <section className="dojo2-panel dojo2-release-list">
        <header className="dojo2-panel-head"><div><Box size={18} /><span><strong>Releases</strong><small>Fra planlagt til levert</small></span></div><strong>{data.milestones.length}</strong></header>
        {data.milestones.map(milestone => {
          const linked = items.filter(item => item.milestone_id === milestone.id)
          const done = linked.filter(item => item.status === 'done').length
          const progress = linked.length ? Math.round(done / linked.length * 100) : 0
          return (
            <article key={milestone.id}>
              <header><div><i style={{ background: milestone.color }} /><span><strong>{milestone.title}</strong><small>{milestone.target_date || 'Ingen måldato'}</small></span></div><select value={milestone.status} onChange={event => onUpdate(milestone.id, { status: event.target.value })}><option value="planned">Planlagt</option><option value="active">Aktiv</option><option value="shipped">Levert</option></select></header>
              {milestone.description && <p>{milestone.description}</p>}
              <div className="dojo2-release-progress"><div><i style={{ width: `${progress}%` }} /></div><span>{done}/{linked.length} · {progress}%</span></div>
              <div className="dojo2-release-items">{linked.slice(0, 6).map(item => <button key={item.id} onClick={() => onOpenItem(item.id)}><Circle size={10} fill={item.status === 'done' ? 'currentColor' : 'none'} />{item.title}</button>)}</div>
            </article>
          )
        })}
        {!data.milestones.length && <div className="dojo2-empty"><Milestone size={22} /><strong>Ingen milepæler ennå</strong><span>Samle oppgaver i en tydelig leveranse.</span></div>}
      </section>
    </div>
  )
}

export function DojoCommandCenter(props) {
  const [tab, setTab] = useState('overview')
  const tabs = [
    ['overview', Sparkles, 'Kontrollrom'],
    ['tests', FlaskConical, 'Testlab'],
    ['documents', FileText, 'Dokumenter'],
    ['activity', Activity, 'Aktivitet'],
    ['releases', Milestone, 'Releases'],
  ]
  return (
    <section className="dojo2">
      <header className="dojo2-hero">
        <div><span>HQ 2.0</span><h2>Fra idé til levert, i én flyt.</h2><p>Planlegg sammen, start Claude, test resultatet og behold hele historien.</p></div>
        <div className="dojo2-health"><i className={props.bridgeStatus.connected ? 'is-good' : ''} /><span><strong>{props.bridgeStatus.connected ? 'Systemet er klart' : 'Broen er frakoblet'}</strong><small>{props.data.presence.length} aktive · {props.data.runs.filter(run => run.status === 'running').length} Claude jobber</small></span></div>
      </header>
      <nav className="dojo2-tabs" aria-label="Kontrollrom">
        {tabs.map(([key, Icon, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon size={17} />{label}</button>)}
      </nav>
      {tab === 'overview' && <OverviewView {...props} />}
      {tab === 'tests' && <TestLabView {...props} onCreate={props.onCreateTest} onUpdate={props.onUpdateTest} onDelete={props.onDeleteTest} />}
      {tab === 'documents' && <DocumentsView {...props} />}
      {tab === 'activity' && <ActivityView {...props} onDecision={props.onAddDecision} onRestore={props.onRestoreVersion} />}
      {tab === 'releases' && <ReleasesView {...props} onCreate={props.onCreateMilestone} onUpdate={props.onUpdateMilestone} />}
    </section>
  )
}

export function DojoCommandPalette({ open, query, onQuery, items, onClose, onView, onOpenItem, onNewItem, onOpenClaude }) {
  const actions = useMemo(() => [
    { id: 'new', label: 'Ny oppgave', note: 'Legg noe i innboksen', icon: Plus, run: onNewItem },
    { id: 'control', label: 'Åpne kontrollrom', note: 'Claude, test, docs og releases', icon: Sparkles, run: () => onView('control') },
    { id: 'board', label: 'Vis brettet', note: 'Kanban og flyt', icon: Box, run: () => onView('board') },
    { id: 'plan', label: 'Åpne ukeplan', note: 'Planlegg kapasitet', icon: Clock3, run: () => onView('plan') },
    { id: 'claude', label: 'Claude og dokumenter', note: 'Brostatus og synk', icon: Code2, run: onOpenClaude },
  ], [onNewItem, onOpenClaude, onView])
  const normalized = query.trim().toLowerCase()
  const visibleActions = actions.filter(action => `${action.label} ${action.note}`.toLowerCase().includes(normalized))
  const visibleItems = normalized ? items.filter(item => `${item.title} ${item.description}`.toLowerCase().includes(normalized)).slice(0, 8) : []
  useEffect(() => {
    if (!open) return undefined
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open])
  if (!open) return null
  return (
    <div className="dojo-command-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dojo-command" role="dialog" aria-modal="true" aria-label="Kommandopalett">
        <label><Search size={19} /><input autoFocus value={query} onChange={event => onQuery(event.target.value)} placeholder="Søk eller skriv en kommando …" /><kbd>ESC</kbd></label>
        <div className="dojo-command-results">
          {visibleActions.length > 0 && <span className="dojo-command-group">Handlinger</span>}
          {visibleActions.map(action => {
            const Icon = action.icon
            return <button key={action.id} onClick={() => { action.run(); onClose() }}><Icon size={17} /><span><strong>{action.label}</strong><small>{action.note}</small></span><ChevronRight size={16} /></button>
          })}
          {visibleItems.length > 0 && <span className="dojo-command-group">Oppgaver</span>}
          {visibleItems.map(item => <button key={item.id} onClick={() => { onOpenItem(item.id); onClose() }}><Target size={17} /><span><strong>{item.title}</strong><small>{item.status} · {item.priority}</small></span><ChevronRight size={16} /></button>)}
          {!visibleActions.length && !visibleItems.length && <div className="dojo2-empty"><Search size={22} /><strong>Ingen treff</strong><span>Prøv oppgavenavn, kontrollrom eller Claude.</span></div>}
        </div>
      </section>
    </div>
  )
}
