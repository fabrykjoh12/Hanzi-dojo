import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowUpRight, Bug, CalendarDays, CalendarPlus, Check,
  ChevronDown, ChevronLeft, ChevronRight, Circle, Code2, Copy, Download,
  BookOpenCheck, FileCheck2, FolderSync, FlaskConical, ImagePlus, LayoutGrid, Lightbulb, List, Loader2, Map,
  MessageSquare, Paperclip, Plus, Search, Send, Sparkles, Target,
  RefreshCw, Rocket, Share2, ShieldCheck, SquareTerminal, Trash2, Upload, UserPlus, UsersRound, Wrench, X,
} from 'lucide-react'
import { dojoClient as supabase } from './dojoClient'
import { dojoClaudeBridge } from './dojoClaudeBridge'
import { dojoHQ2Client } from './dojoHQ2Client'
import { DojoCommandCenter, DojoCommandPalette } from './DojoHQ2'
import './DojoHQ.css'

const TYPES = {
  idea: { label: 'Idé', icon: Lightbulb, color: '#7C5CFC' },
  plan: { label: 'Plan', icon: Map, color: '#2F77D0' },
  implement: { label: 'Implementer', icon: Code2, color: '#0A8F68' },
  test: { label: 'Test', icon: FlaskConical, color: '#B06B00' },
  fix: { label: 'Fiks', icon: Wrench, color: '#C65332' },
  bug: { label: 'Bug', icon: Bug, color: '#D63B52' },
}

const STATUSES = [
  { key: 'inbox', label: 'Innboks', note: 'Nye tanker' },
  { key: 'planned', label: 'Planlagt', note: 'Klar for start' },
  { key: 'progress', label: 'Pågår', note: 'Under arbeid' },
  { key: 'review', label: 'Til test', note: 'Sjekk og kvalitet' },
  { key: 'done', label: 'Ferdig', note: 'Levert' },
]

const PRIORITIES = {
  low: { label: 'Lav', color: '#92A09A' },
  medium: { label: 'Normal', color: '#E1A62E' },
  high: { label: 'Høy', color: '#ED7448' },
  urgent: { label: 'Kritisk', color: '#D63B52' },
}

const EMPTY_FORM = {
  title: '', description: '', item_type: 'idea', status: 'inbox',
  priority: 'medium', assigned_to: '', due_date: '', tags: '',
}

const EMPTY_HQ2 = {
  milestones: [],
  testCases: [],
  runs: [],
  activities: [],
  presence: [],
  versions: [],
}

const dateFormatter = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' })
const timeFormatter = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const weekdayFormatter = new Intl.DateTimeFormat('nb-NO', { weekday: 'short' })
const longDateFormatter = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long' })

function startOfWeek(date = new Date()) {
  const next = new Date(date)
  const day = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - day)
  next.setHours(12, 0, 0, 0)
  return next
}

function addDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

function Avatar({ name, title, index = 0 }) {
  return (
    <span className={`dojo-avatar dojo-avatar-${index % 4}`} title={title || name} aria-label={title || name}>
      {initials(name)}
    </span>
  )
}

function TypeBadge({ type, compact = false }) {
  const meta = TYPES[type] || TYPES.idea
  const Icon = meta.icon
  return (
    <span className="dojo-type" style={{ '--type-color': meta.color }}>
      <Icon size={compact ? 12 : 13} strokeWidth={2.1} />
      {!compact && meta.label}
    </span>
  )
}

function ItemCard({ item, attachments, commentCount, memberName, onOpen, onDragStart }) {
  const image = attachments.find(file => file.item_id === item.id && file.mime_type?.startsWith('image/') && file.url)
  const priority = PRIORITIES[item.priority] || PRIORITIES.medium
  const assignee = memberName(item.assigned_to)

  const openFromKey = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(item)
    }
  }

  return (
    <article
      className="dojo-card"
      tabIndex={0}
      role="button"
      draggable
      onDragStart={(event) => onDragStart(event, item.id)}
      onClick={() => onOpen(item)}
      onKeyDown={openFromKey}
      aria-label={`Åpne ${item.title}`}
    >
      {image && <img className="dojo-card-cover" src={image.url} alt={image.file_name || ''} loading="lazy" />}
      <div className="dojo-card-topline">
        <TypeBadge type={item.item_type} />
        <ArrowUpRight className="dojo-card-arrow" size={16} aria-hidden="true" />
      </div>
      <h3>{item.title}</h3>
      {item.description && <p>{item.description}</p>}
      {item.tags?.length > 0 && (
        <div className="dojo-tags">
          {item.tags.slice(0, 3).map(tag => <span key={tag}>#{tag}</span>)}
        </div>
      )}
      <div className="dojo-card-meta">
        <span className="dojo-priority"><i style={{ background: priority.color }} />{priority.label}</span>
        <span className="dojo-card-counts">
          {commentCount > 0 && <span><MessageSquare size={13} />{commentCount}</span>}
          {attachments.length > 0 && <span><Paperclip size={13} />{attachments.length}</span>}
        </span>
        {assignee && <Avatar name={assignee} title={`Tildelt ${assignee}`} />}
      </div>
    </article>
  )
}

function WorkspaceGate({ onCreate, onJoin, busy, setupError, online = false }) {
  const sharedCode = online ? normalizeInviteCode(new URLSearchParams(window.location.hash.slice(1)).get('join')) : ''
  const [mode, setMode] = useState(sharedCode ? 'join' : 'create')
  const [workspaceName, setWorkspaceName] = useState('Hanzi Dojo HQ')
  const [displayName, setDisplayName] = useState('')
  const [inviteCode, setInviteCode] = useState(sharedCode)

  return (
    <div className="dojo-gate-wrap">
      <div className="dojo-gate-mark">道</div>
      <section className="dojo-gate">
        <span className="dojo-eyebrow"><Sparkles size={14} /> Samarbeidsområdet</span>
        <h1>{setupError ? 'HQ-et er tegnet og klart.' : 'Bygg noe rått, sammen.'}</h1>
        <p>
          {setupError
            ? 'Databasen må kobles på før dere kan lagre og dele. Resten av arbeidsområdet er klart.'
            : online
              ? 'Opprett et delt HQ eller åpne invitasjonslenken fra vennen din. Endringer og bilder synkroniseres automatisk.'
              : 'Samle idéer, bugs, tester, bilder og planer i én skarp arbeidsflyt.'}
        </p>

        {!setupError && (
          <>
            <div className="dojo-gate-tabs" role="tablist" aria-label="Velg oppsett">
              <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')} role="tab">Lag HQ</button>
              <button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')} role="tab">Bli med</button>
            </div>

            {mode === 'create' ? (
              <form onSubmit={(event) => { event.preventDefault(); onCreate(workspaceName, displayName) }}>
                <label htmlFor="create-display-name">Ditt navn</label>
                <input id="create-display-name" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="F.eks. Fabian" maxLength={60} autoComplete="name" required />
                <label htmlFor="workspace-name">Navn på arbeidsområdet</label>
                <input id="workspace-name" value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} maxLength={80} required />
                <button className="dojo-primary dojo-full" disabled={busy || !workspaceName.trim() || !displayName.trim()}>
                  {busy ? <Loader2 className="dojo-spin" size={18} /> : <Plus size={18} />}
                  Opprett arbeidsområde
                </button>
              </form>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); onJoin(inviteCode, displayName) }}>
                <label htmlFor="join-display-name">Ditt navn</label>
                <input id="join-display-name" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="F.eks. Emil" maxLength={60} autoComplete="name" required />
                <label htmlFor="invite-code">Invitasjonskode fra vennen din</label>
                <input id="invite-code" value={inviteCode} onChange={event => setInviteCode(normalizeInviteCode(event.target.value))} placeholder="F.eks. A1B2C3D4E5F6" maxLength={12} spellCheck="false" autoComplete="off" required />
                <button className="dojo-primary dojo-full" disabled={busy || inviteCode.length !== 12 || !displayName.trim()}>
                  {busy ? <Loader2 className="dojo-spin" size={18} /> : <UserPlus size={18} />}
                  Bli med i HQ
                </button>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function normalizeInviteCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const field = document.createElement('textarea')
  field.value = value
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  document.execCommand('copy')
  field.remove()
}

function syncTime(value, fallback = 'Ikke ennå') {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : timeFormatter.format(date)
}

function LaunchModal({ overview, defaultOwnerName, onSubmit, onImport, busy }) {
  const owner = overview.members.find(member => member.user_id === 'local-user')
  const friend = overview.members.find(member => member.user_id === 'dojo-friend')
  const [form, setForm] = useState({
    workspaceName: overview.workspace?.name || 'Hanzi Dojo HQ',
    ownerName: defaultOwnerName || owner?.display_name || 'Fabian',
    friendName: friend?.display_name === 'Dojo-venn' ? '' : (friend?.display_name || ''),
    role: 'owner',
    keepExamples: false,
  })
  const change = (key, value) => setForm(current => ({ ...current, [key]: value }))

  return (
    <div className="dojo-launch-backdrop">
      <section className="dojo-launch" role="dialog" aria-modal="true" aria-labelledby="launch-title">
        <div className="dojo-launch-mark">道</div>
        <span className="dojo-eyebrow"><Sparkles size={14} /> Gjør dojoen til deres</span>
        <h1 id="launch-title">Klar til første ekte oppgave.</h1>
        <p>Alt lagres automatisk på enheten. Dere samarbeider ved å dele én Dojo-fil som alltid slås trygt sammen ved import.</p>

        <form onSubmit={event => { event.preventDefault(); onSubmit(form) }}>
          <label htmlFor="launch-workspace">Navn på arbeidsområdet</label>
          <input id="launch-workspace" value={form.workspaceName} onChange={event => change('workspaceName', event.target.value)} maxLength={80} required />
          <div className="dojo-form-grid">
            <div><label htmlFor="launch-owner">Ditt navn</label><input id="launch-owner" value={form.ownerName} onChange={event => change('ownerName', event.target.value)} maxLength={60} required /></div>
            <div><label htmlFor="launch-friend">Vennens navn</label><input id="launch-friend" value={form.friendName} onChange={event => change('friendName', event.target.value)} placeholder="F.eks. Emil" maxLength={60} required /></div>
          </div>

          <fieldset className="dojo-role-choice">
            <legend>Hvem bruker denne enheten?</legend>
            <button type="button" className={form.role === 'owner' ? 'active' : ''} onClick={() => change('role', 'owner')}><UsersRound size={17} />{form.ownerName || 'Meg'}</button>
            <button type="button" className={form.role === 'friend' ? 'active' : ''} onClick={() => change('role', 'friend')}><UsersRound size={17} />{form.friendName || 'Vennen min'}</button>
          </fieldset>

          <label className="dojo-check-row">
            <input type="checkbox" checked={form.keepExamples} onChange={event => change('keepExamples', event.target.checked)} />
            <span><strong>Behold demooppgavene</strong><small>Ellers starter dere med et helt tomt arbeidsområde.</small></span>
          </label>

          <button className="dojo-primary dojo-full dojo-launch-primary" disabled={busy || !form.workspaceName.trim() || !form.ownerName.trim() || !form.friendName.trim()}>
            {busy ? <Loader2 className="dojo-spin" size={18} /> : <ArrowUpRight size={18} />}
            Start å bruke HQ
          </button>
        </form>

        <div className="dojo-launch-import">
          <span>Har vennen din allerede laget dojoen?</span>
          <button type="button" className="dojo-ghost" onClick={onImport}><Upload size={16} />Importer Dojo-fil</button>
        </div>
      </section>
    </div>
  )
}

function CollaborationModal({ overview, members, identity, workspace, online = false, copied = false, onClose, onImport, onDownload, onShare, onCopyCode, onIdentityChange, busy }) {
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dojo-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dojo-modal dojo-collab-modal" role="dialog" aria-modal="true" aria-labelledby="collab-title">
        <div className="dojo-modal-head">
          <div><span className="dojo-kicker">Samarbeid uten Supabase</span><h2 id="collab-title">{online ? 'Live HQ. Samme plan.' : 'Én fil. Begges arbeid.'}</h2></div>
          <button className="dojo-icon-btn" onClick={onClose} aria-label="Lukk"><X size={20} /></button>
        </div>

        <div className={`dojo-local-status${online ? ' is-live' : ''}`}><ShieldCheck size={20} /><div><strong>{online ? 'Delt lagring er aktiv' : 'Alt er lagret lokalt'}</strong><span>{online ? `${members.length} ${members.length === 1 ? 'medlem' : 'medlemmer'} · D1 + R2 · automatisk synk` : `Revisjon ${overview.settings?.revision || 0} · endringer lagres automatisk`}</span></div>{online && <i aria-hidden="true" />}</div>

        {online ? (
          <div className="dojo-invite-block">
            <span>Invitasjonskode</span>
            <div><code>{workspace?.invite_code || '••••••••••••'}</code><button className="dojo-ghost" onClick={onCopyCode} disabled={!workspace?.invite_code}><Check size={16} />Kopier kode</button></div>
            <p>Invitasjonslenken inneholder koden lokalt i nettleseren. Den blir ikke sendt til serveren før vennen din velger å bli med.</p>
          </div>
        ) : (
          <label className="dojo-identity-field" htmlFor="dojo-identity"><span>Du jobber som</span><select id="dojo-identity" value={identity.userId} onChange={event => onIdentityChange(event.target.value)}>{members.map(member => <option key={member.user_id} value={member.user_id}>{member.profile?.display_name || member.display_name || 'Dojo-medlem'}</option>)}</select></label>
        )}

        <div className="dojo-sync-actions">
          <button className="dojo-primary" onClick={onShare} disabled={busy}><Share2 size={17} />{online ? (copied ? 'Lenke kopiert' : 'Kopier invitasjonslenke') : 'Del nyeste fil'}</button>
          {!online && <button className="dojo-ghost" onClick={onImport} disabled={busy}><Upload size={17} />Importer og slå sammen</button>}
          {!online && <button className="dojo-ghost" onClick={onDownload} disabled={busy}><Download size={17} />Last ned kopi</button>}
        </div>

        <div className="dojo-sync-timeline">
          <article><span>1</span><div><strong>{online ? 'Send invitasjonslenken' : 'Gjør endringene dine'}</strong><p>{online ? 'Vennen din åpner lenken, skriver navnet sitt og blir med.' : 'Oppgaver, kommentarer og bilder lagres med én gang.'}</p></div></article>
          <article><span>2</span><div><strong>{online ? 'Planlegg sammen' : 'Del nyeste fil'}</strong><p>{online ? 'Endringer dukker automatisk opp hos begge omtrent hvert fjerde sekund.' : 'Send den direkte i meldingsappen dere allerede bruker.'}</p></div></article>
          <article><span>3</span><div><strong>{online ? 'Bruk bilder og kommentarer' : 'Importer når du får den tilbake'}</strong><p>{online ? 'Skjermbilder ligger i delt bildelager, ikke i nettleseren.' : 'Nye og endrede ting flettes sammen. Slettinger følger også med.'}</p></div></article>
        </div>

        <footer className="dojo-sync-meta">
          {online
            ? <><span><UsersRound size={14} />Du jobber som {identity.displayName}</span><span><RefreshCw size={14} />Live synk er på</span></>
            : <><span><FileCheck2 size={14} />Sist importert: {syncTime(overview.settings?.last_import_at)}</span><span><Share2 size={14} />Sist delt: {syncTime(overview.settings?.last_export_at)}</span></>}
        </footer>
      </section>
    </div>
  )
}

function ClaudePanel({ status, roadmapInfo, documentName, onDocumentChange, onClose, onSync, onPull, onCheck, busy, online, pairCommand }) {
  const [commandCopied, setCommandCopied] = useState(false)

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const connected = status.connected && status.claudeReady
  const copyCommand = async () => {
    try {
      await copyText(pairCommand)
      setCommandCopied(true)
      window.setTimeout(() => setCommandCopied(false), 1800)
    } catch {
      setCommandCopied(false)
    }
  }

  return (
    <div className="dojo-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dojo-modal dojo-claude-modal" role="dialog" aria-modal="true" aria-labelledby="claude-panel-title">
        <div className="dojo-modal-head">
          <div><span className="dojo-kicker">{online ? 'Sikker nettbro' : 'Lokal utviklerbro'}</span><h2 id="claude-panel-title">HQ ↔ Claude Code</h2></div>
          <button className="dojo-icon-btn" onClick={onClose} aria-label="Lukk"><X size={20} /></button>
        </div>

        <div className={`dojo-bridge-status ${connected ? 'is-online' : 'is-offline'}`}>
          <SquareTerminal size={22} />
          <div>
            <strong>{connected ? 'Claude Code er klar' : status.connected ? 'Broen er koblet til' : online ? 'Koble prosjektet til dette HQ-et' : 'Den lokale broen er ikke startet'}</strong>
            <span>{connected ? `${status.claudeVersion} · ${status.clientName || 'manuelle tillatelser'}` : status.connected ? 'Claude-kommandoen ble ikke funnet i terminalens PATH.' : online ? 'Kopier kommandoen under og kjør den fra prosjektmappen.' : 'Start broen én gang og la terminalen stå åpen.'}</span>
          </div>
          <i aria-hidden="true" />
        </div>

        {!connected && (
          <div className="dojo-bridge-command">
            <div>
              <span>Kjør dette fra prosjektmappen:</span>
              <code>{pairCommand}</code>
            </div>
            <button type="button" onClick={copyCommand}>
              {commandCopied ? <Check size={16} /> : <Copy size={16} />}
              {commandCopied ? 'Kopiert' : 'Kopier kommando'}
            </button>
          </div>
        )}

        {!connected && <button type="button" className="dojo-ghost dojo-bridge-check" onClick={onCheck}><RefreshCw size={16} />Sjekk koblingen igjen</button>}

        <div className="dojo-document-choice" role="group" aria-label="Velg planfil">
          <button className={documentName === 'ROADMAP.md' ? 'active' : ''} onClick={() => onDocumentChange('ROADMAP.md')}>ROADMAP.md</button>
          <button className={documentName === 'TASKS.md' ? 'active' : ''} onClick={() => onDocumentChange('TASKS.md')}>TASKS.md</button>
        </div>

        <div className="dojo-context-file">
          <BookOpenCheck size={18} />
          <div><strong>README.md følger alltid med</strong><span>Leses på nytt fra prosjektmappen hver gang Claude åpnes.</span></div>
          <Check size={16} aria-hidden="true" />
        </div>

        <div className="dojo-bridge-actions">
          <button className="dojo-primary" onClick={onSync} disabled={!connected || busy}>
            {busy ? <Loader2 className="dojo-spin" size={17} /> : <BookOpenCheck size={17} />}
            Skriv HQ til planen
          </button>
          <button className="dojo-ghost" onClick={onPull} disabled={!connected || busy}>
            <RefreshCw size={17} />
            Hent ferdig-status
          </button>
        </div>

        <div className="dojo-bridge-explainer">
          <article><span>01</span><div><strong>HQ skriver en avgrenset del</strong><p>Resten av roadmapen blir stående urørt.</p></div></article>
          <article><span>02</span><div><strong>Claude leser planen først</strong><p>Den valgte oppgaven åpnes i en ekte Claude Code-terminal.</p></div></article>
          <article><span>03</span><div><strong>Ferdig arbeid hentes tilbake</strong><p>Avkryssede oppgaver kan markeres ferdige i HQ med ett trykk.</p></div></article>
        </div>

        <footer className="dojo-bridge-footer">
          <span><ShieldCheck size={14} />Ingen vilkårlige terminalkommandoer fra nettleseren</span>
          <span>{roadmapInfo?.itemCount != null ? `${roadmapInfo.itemCount} oppgaver sist skrevet` : 'Ikke synkronisert ennå'}</span>
        </footer>
      </section>
    </div>
  )
}

function CreateItemModal({ onClose, onSubmit, members, initialStatus, initialDueDate, busy, maxFileMb = 1.5 }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, status: initialStatus || 'inbox', due_date: initialDueDate || '' })
  const [files, setFiles] = useState([])
  const titleRef = useRef(null)

  useEffect(() => {
    const timer = window.setTimeout(() => titleRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const change = (key, value) => setForm(current => ({ ...current, [key]: value }))
  return (
    <div className="dojo-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dojo-modal" role="dialog" aria-modal="true" aria-labelledby="new-item-title">
        <div className="dojo-modal-head">
          <div><span className="dojo-kicker">Nytt arbeid</span><h2 id="new-item-title">Hva skal inn i dojoen?</h2></div>
          <button className="dojo-icon-btn" onClick={onClose} aria-label="Lukk"><X size={20} /></button>
        </div>
        <form onSubmit={event => { event.preventDefault(); onSubmit(form, files) }}>
          <label htmlFor="item-title">Tittel</label>
          <input ref={titleRef} id="item-title" value={form.title} onChange={event => change('title', event.target.value)} placeholder="Skriv tydelig hva som skal gjøres" maxLength={180} required />

          <label htmlFor="item-description">Detaljer</label>
          <textarea id="item-description" value={form.description} onChange={event => change('description', event.target.value)} placeholder="Kontekst, ønsket resultat, steg eller lenker …" rows={4} />

          <div className="dojo-form-grid dojo-form-grid-3">
            <div><label htmlFor="item-type">Type</label><select id="item-type" value={form.item_type} onChange={event => change('item_type', event.target.value)}>{Object.entries(TYPES).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></div>
            <div><label htmlFor="item-priority">Prioritet</label><select id="item-priority" value={form.priority} onChange={event => change('priority', event.target.value)}>{Object.entries(PRIORITIES).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></div>
            <div><label htmlFor="item-status">Status</label><select id="item-status" value={form.status} onChange={event => change('status', event.target.value)}>{STATUSES.map(status => <option key={status.key} value={status.key}>{status.label}</option>)}</select></div>
          </div>

          <div className="dojo-form-grid">
            <div><label htmlFor="item-assignee">Tildel</label><select id="item-assignee" value={form.assigned_to} onChange={event => change('assigned_to', event.target.value)}><option value="">Ingen ennå</option>{members.map(member => <option key={member.user_id} value={member.user_id}>{member.profile?.display_name || 'Dojo-medlem'}</option>)}</select></div>
            <div><label htmlFor="item-due">Frist</label><input id="item-due" type="date" value={form.due_date} onChange={event => change('due_date', event.target.value)} /></div>
          </div>

          <label htmlFor="item-tags">Emneknagger</label>
          <input id="item-tags" value={form.tags} onChange={event => change('tags', event.target.value)} placeholder="lyd, mobil, hsk4" />

          <label className="dojo-upload-zone" htmlFor="item-files">
            <ImagePlus size={22} />
            <span><strong>Legg ved skjermbilder</strong><small>PNG, JPG, WebP eller GIF · maks {String(maxFileMb).replace('.', ',')} MB</small></span>
            <input id="item-files" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={event => setFiles(Array.from(event.target.files || []))} />
          </label>
          {files.length > 0 && <div className="dojo-file-list">{files.map(file => <span key={`${file.name}-${file.size}`}><Paperclip size={13} />{file.name}</span>)}</div>}

          <div className="dojo-modal-actions">
            <button type="button" className="dojo-ghost" onClick={onClose}>Avbryt</button>
            <button className="dojo-primary" disabled={busy || !form.title.trim()}>{busy ? <Loader2 className="dojo-spin" size={18} /> : <Plus size={18} />}Legg til</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function ItemDetail({
  item, items, attachments, comments, members, milestones, testCases, runs, memberName,
  onClose, onUpdate, onDelete, onComment, onUpload, onRemoveAttachment, onOpenClaude,
  onUpdateTest, claudeConnected, busy,
}) {
  const [description, setDescription] = useState(item?.description || '')
  const [comment, setComment] = useState('')

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const itemAttachments = attachments.filter(file => file.item_id === item.id)
  const itemComments = comments.filter(entry => entry.item_id === item.id)

  return (
    <div className="dojo-detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="dojo-detail" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <header className="dojo-detail-head">
          <TypeBadge type={item.item_type} />
          <button className="dojo-icon-btn" onClick={onClose} aria-label="Lukk"><X size={20} /></button>
        </header>
        <div className="dojo-detail-scroll">
          <h2 id="detail-title">{item.title}</h2>
          <div className="dojo-detail-fields">
            <label><span>Status</span><select value={item.status} onChange={event => onUpdate(item.id, { status: event.target.value })}>{STATUSES.map(status => <option key={status.key} value={status.key}>{status.label}</option>)}</select></label>
            <label><span>Type</span><select value={item.item_type} onChange={event => onUpdate(item.id, { item_type: event.target.value })}>{Object.entries(TYPES).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></label>
            <label><span>Prioritet</span><select value={item.priority} onChange={event => onUpdate(item.id, { priority: event.target.value })}>{Object.entries(PRIORITIES).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></label>
            <label><span>Tildelt</span><select value={item.assigned_to || ''} onChange={event => onUpdate(item.id, { assigned_to: event.target.value || null })}><option value="">Ingen</option>{members.map(member => <option key={member.user_id} value={member.user_id}>{member.profile?.display_name || 'Dojo-medlem'}</option>)}</select></label>
            <label><span>Frist</span><input type="date" value={item.due_date || ''} onChange={event => onUpdate(item.id, { due_date: event.target.value || null })} /></label>
          </div>

          <section className="dojo-detail-section dojo-delivery-section">
            <div className="dojo-section-title"><h3>Leveranse og avhengigheter</h3><span>{item.ci_status && item.ci_status !== 'none' ? `CI: ${item.ci_status}` : 'Klar for plan'}</span></div>
            <div className="dojo-detail-fields">
              <label>
                <span>Milepæl</span>
                <select value={item.milestone_id || ''} onChange={event => onUpdate(item.id, { milestone_id: event.target.value || null })}>
                  <option value="">Ingen milepæl</option>
                  {milestones.map(milestone => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
                </select>
              </label>
              <label>
                <span>Avhenger av</span>
                <select
                  value=""
                  onChange={event => {
                    const dependency = event.target.value
                    if (dependency) onUpdate(item.id, { depends_on: [...new Set([...(item.depends_on || []), dependency])] })
                  }}
                >
                  <option value="">Legg til avhengighet</option>
                  {items.filter(candidate => candidate.id !== item.id && !(item.depends_on || []).includes(candidate.id)).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
                </select>
              </label>
              <label><span>Git branch</span><input defaultValue={item.github_branch || ''} onBlur={event => onUpdate(item.id, { github_branch: event.target.value.trim() })} placeholder="feature/..." /></label>
              <label><span>Pull request</span><input type="url" defaultValue={item.github_pr_url || ''} onBlur={event => onUpdate(item.id, { github_pr_url: event.target.value.trim() })} placeholder="https://github.com/..." /></label>
              <label>
                <span>CI-status</span>
                <select value={item.ci_status || 'none'} onChange={event => onUpdate(item.id, { ci_status: event.target.value })}>
                  <option value="none">Ikke satt</option>
                  <option value="pending">Kjører</option>
                  <option value="passing">Bestått</option>
                  <option value="failing">Feiler</option>
                </select>
              </label>
            </div>
            {(item.depends_on || []).length > 0 && (
              <div className="dojo-dependency-chips">
                {(item.depends_on || []).map(dependencyId => {
                  const dependency = items.find(candidate => candidate.id === dependencyId)
                  return <button key={dependencyId} onClick={() => onUpdate(item.id, { depends_on: (item.depends_on || []).filter(id => id !== dependencyId) })}>{dependency?.title || 'Ukjent oppgave'}<X size={13} /></button>
                })}
              </div>
            )}
            <label className="dojo-blocked-field">
              <span>Blokkering</span>
              <textarea defaultValue={item.blocked_reason || ''} onBlur={event => onUpdate(item.id, { blocked_reason: event.target.value.trim() })} placeholder="Hva stopper oppgaven akkurat nå?" rows={2} />
            </label>
          </section>

          <section className="dojo-detail-section">
            <h3>Beskrivelse</h3>
            <textarea value={description} onChange={event => setDescription(event.target.value)} onBlur={() => { if (description !== item.description) onUpdate(item.id, { description }) }} placeholder="Legg til kontekst og akseptansekriterier …" rows={6} />
          </section>

          <section className="dojo-detail-section">
            <div className="dojo-section-title"><h3>Tester</h3><span>{testCases.length}</span></div>
            <div className="dojo-item-tests">
              {testCases.map(test => (
                <article key={test.id} className={`is-${test.status}`}>
                  <span>{test.title}</span>
                  <div>
                    <button className={test.status === 'passed' ? 'active' : ''} onClick={() => onUpdateTest(test.id, { status: 'passed' })}><Check size={14} />Bestått</button>
                    <button className={test.status === 'failed' ? 'active' : ''} onClick={() => onUpdateTest(test.id, { status: 'failed' })}><X size={14} />Feilet</button>
                  </div>
                </article>
              ))}
              {!testCases.length && <p className="dojo-empty-copy">Legg til akseptansetester fra Testlab i kontrollrommet.</p>}
            </div>
          </section>

          {runs.length > 0 && (
            <section className="dojo-detail-section">
              <div className="dojo-section-title"><h3>Claude-historikk</h3><span>{runs.length}</span></div>
              <div className="dojo-item-runs">
                {runs.slice(0, 5).map(run => <article key={run.id}><i className={`is-${run.status}`} /><span><strong>{run.status.replace('_', ' ')}</strong><small>{run.summary || 'Ingen oppsummering ennå'}</small></span></article>)}
              </div>
            </section>
          )}

          <section className="dojo-detail-section">
            <div className="dojo-section-title"><h3>Vedlegg</h3><label className="dojo-mini-upload"><Upload size={15} />Last opp<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={event => onUpload(item.id, Array.from(event.target.files || []))} /></label></div>
            {itemAttachments.length === 0 ? <p className="dojo-empty-copy">Ingen bilder ennå.</p> : (
              <div className="dojo-attachment-grid">
                {itemAttachments.map(file => (
                  <figure key={file.id}>
                    {file.url ? <img src={file.url} alt={file.file_name} loading="lazy" /> : <div className="dojo-image-placeholder"><ImagePlus size={22} /></div>}
                    <figcaption><span>{file.file_name}</span><button onClick={() => onRemoveAttachment(file)} aria-label={`Slett ${file.file_name}`}><X size={14} /></button></figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>

          <section className="dojo-detail-section">
            <h3>Kommentarer <span>{itemComments.length}</span></h3>
            <div className="dojo-comments">
              {itemComments.length === 0 && <p className="dojo-empty-copy">Start samtalen om denne oppgaven.</p>}
              {itemComments.map((entry, index) => (
                <article key={entry.id}>
                  <Avatar name={memberName(entry.author_id)} index={index} />
                  <div><header><strong>{memberName(entry.author_id)}</strong><time>{timeFormatter.format(new Date(entry.created_at))}</time></header><p>{entry.body}</p></div>
                </article>
              ))}
            </div>
            <form className="dojo-comment-form" onSubmit={event => { event.preventDefault(); if (!comment.trim()) return; onComment(item.id, comment); setComment('') }}>
              <input aria-label="Ny kommentar" value={comment} onChange={event => setComment(event.target.value)} placeholder="Skriv en kommentar …" />
              <button aria-label="Send kommentar" disabled={!comment.trim() || busy}><Send size={17} /></button>
            </form>
          </section>

          <section className="dojo-claude-task-card">
            <div><SquareTerminal size={20} /><span><strong>Jobb videre i Claude Code</strong><small>Roadmapen synkroniseres før terminalen åpnes.</small></span></div>
            <button className="dojo-primary" onClick={() => onOpenClaude(item)} disabled={busy}>
              <Rocket size={16} />{claudeConnected ? 'Åpne oppgaven' : 'Koble til'}
            </button>
          </section>

          <button className="dojo-delete" onClick={() => onDelete(item)}><Trash2 size={16} />Slett oppgave</button>
        </div>
      </aside>
    </div>
  )
}

export default function DojoHQ({ session, profile }) {
  const [standaloneIdentity, setStandaloneIdentity] = useState(() => supabase.getIdentity())
  const localSession = session || { user: { id: standaloneIdentity.userId, email: `${standaloneIdentity.userId}@dojo.local` } }
  const localProfile = profile || { display_name: standaloneIdentity.displayName }
  const importRef = useRef(null)
  const [overview, setOverview] = useState(() => supabase.getOverview())
  const [workspaces, setWorkspaces] = useState([])
  const [activeWorkspace, setActiveWorkspace] = useState(null)
  const [items, setItems] = useState([])
  const [members, setMembers] = useState([])
  const [attachments, setAttachments] = useState([])
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [setupError, setSetupError] = useState(false)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [viewMode, setViewMode] = useState('board')
  const [weekOffset, setWeekOffset] = useState(0)
  const [newItemOpen, setNewItemOpen] = useState(false)
  const [newItemStatus, setNewItemStatus] = useState('inbox')
  const [newItemDueDate, setNewItemDueDate] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [copied, setCopied] = useState(false)
  const [showSetup, setShowSetup] = useState(() => !supabase.getOverview().settings?.setup_complete)
  const [collabOpen, setCollabOpen] = useState(false)
  const [claudePanelOpen, setClaudePanelOpen] = useState(false)
  const [bridgeBusy, setBridgeBusy] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState({ connected: false, claudeReady: false, claudeVersion: '' })
  const [roadmapDocument, setRoadmapDocument] = useState('ROADMAP.md')
  const [roadmapInfo, setRoadmapInfo] = useState(null)
  const [hq2Data, setHq2Data] = useState(EMPTY_HQ2)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')

  const flash = useCallback((message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2800)
  }, [])

  const checkBridge = useCallback(async () => {
    dojoClaudeBridge.configure(activeWorkspace, { remote: supabase.isRemote })
    if (!activeWorkspace) {
      const offline = { connected: false, claudeReady: false, claudeVersion: '' }
      setBridgeStatus(offline)
      return offline
    }
    try {
      const status = await dojoClaudeBridge.status()
      setBridgeStatus(status)
      return status
    } catch {
      const offline = { connected: false, claudeReady: false, claudeVersion: '' }
      setBridgeStatus(offline)
      return offline
    }
  }, [activeWorkspace])

  const loadWorkspaces = useCallback(async (preferredId) => {
    const { data, error } = await supabase
      .from('dojo_workspace_members')
      .select('role, workspace:dojo_workspaces!inner(id,name,invite_code,owner_id,created_at)')
      .eq('user_id', localSession.user.id)
      .order('joined_at', { ascending: true })

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205' || /dojo_workspace/i.test(error.message || '')) setSetupError(true)
      else flash('Kunne ikke hente arbeidsområdet akkurat nå.')
      setLoading(false)
      return
    }

    const next = (data || []).map(row => ({ ...row.workspace, role: row.role }))
    setWorkspaces(next)
    setActiveWorkspace(current => next.find(workspace => workspace.id === (preferredId || current?.id)) || next[0] || null)
    setLoading(false)
  }, [flash, localSession.user.id])

  const loadWorkspace = useCallback(async (workspace) => {
    if (!workspace) return
    const [itemsResult, membersResult, attachmentsResult, commentsResult] = await Promise.all([
      supabase.from('dojo_items').select('*').eq('workspace_id', workspace.id).order('updated_at', { ascending: false }),
      supabase.from('dojo_workspace_members').select('user_id,role,joined_at,profile:profiles!dojo_workspace_members_user_id_fkey(display_name)').eq('workspace_id', workspace.id).order('joined_at'),
      supabase.from('dojo_attachments').select('*').eq('workspace_id', workspace.id).order('created_at'),
      supabase.from('dojo_comments').select('id,item_id,author_id,body,created_at').eq('workspace_id', workspace.id).order('created_at'),
    ])

    const firstError = itemsResult.error || membersResult.error || attachmentsResult.error || commentsResult.error
    if (firstError) { flash('HQ-et mistet forbindelsen. Prøv igjen om litt.'); return }

    const signed = await Promise.all((attachmentsResult.data || []).map(async file => {
      const { data } = await supabase.storage.from('dojo-attachments').createSignedUrl(file.storage_path, 3600)
      return { ...file, url: data?.signedUrl || '' }
    }))

    setItems(itemsResult.data || [])
    setMembers(membersResult.data || [])
    setAttachments(signed)
    setComments(commentsResult.data || [])
    setOverview(supabase.getOverview())
  }, [flash])

  const loadHQ2 = useCallback(async (workspace = activeWorkspace) => {
    if (!supabase.isRemote || !workspace) {
      setHq2Data(EMPTY_HQ2)
      return EMPTY_HQ2
    }
    const identity = {
      userId: localSession.user.id,
      displayName: localProfile.display_name || localSession.user.email?.split('@')[0] || 'Dojo-medlem',
    }
    dojoHQ2Client.configure(workspace, identity)
    try {
      const snapshot = await dojoHQ2Client.snapshot()
      setHq2Data(snapshot)
      return snapshot
    } catch (error) {
      flash(error.message || 'Kunne ikke laste kontrollrommet.')
      return null
    }
  }, [activeWorkspace, flash, localProfile.display_name, localSession.user.email, localSession.user.id])

  useEffect(() => {
    supabase.configure(localSession.user.id, localProfile.display_name || localSession.user.email?.split('@')[0])
  }, [localProfile.display_name, localSession.user.email, localSession.user.id])

  useEffect(() => {
    const initial = window.setTimeout(checkBridge, 0)
    const timer = window.setInterval(checkBridge, 12000)
    const onVisibility = () => { if (!document.hidden) checkBridge() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [checkBridge])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => loadWorkspaces(), 0)
    return () => window.clearTimeout(initialLoad)
  }, [loadWorkspaces])

  useEffect(() => {
    if (!activeWorkspace) return undefined
    const initialLoad = window.setTimeout(() => loadWorkspace(activeWorkspace), 0)
    let refreshTimer
    const refresh = () => {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => loadWorkspace(activeWorkspace), 140)
    }
    const channel = supabase.channel(`dojo-hq-${activeWorkspace.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dojo_items', filter: `workspace_id=eq.${activeWorkspace.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dojo_comments', filter: `workspace_id=eq.${activeWorkspace.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dojo_attachments', filter: `workspace_id=eq.${activeWorkspace.id}` }, refresh)
      .subscribe()

    return () => { window.clearTimeout(initialLoad); window.clearTimeout(refreshTimer); supabase.removeChannel(channel) }
  }, [activeWorkspace, loadWorkspace])

  useEffect(() => {
    if (!supabase.isRemote || !activeWorkspace) return undefined
    const initial = window.setTimeout(() => loadHQ2(activeWorkspace), 0)
    const timer = window.setInterval(() => loadHQ2(activeWorkspace), 7000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [activeWorkspace, loadHQ2])

  useEffect(() => {
    if (!supabase.isRemote || !activeWorkspace) return undefined
    const identity = {
      userId: localSession.user.id,
      displayName: localProfile.display_name || localSession.user.email?.split('@')[0] || 'Dojo-medlem',
    }
    dojoHQ2Client.configure(activeWorkspace, identity)
    const sendHeartbeat = () => dojoHQ2Client.heartbeat(selectedId).catch(() => {})
    const initial = window.setTimeout(sendHeartbeat, 0)
    const timer = window.setInterval(sendHeartbeat, 12000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [activeWorkspace, localProfile.display_name, localSession.user.email, localSession.user.id, selectedId])

  useEffect(() => {
    const onKey = event => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      setCommandOpen(true)
      setCommandQuery('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selectedItem = items.find(item => item.id === selectedId) || null

  const memberName = useCallback((userId) => {
    if (!userId) return ''
    const member = members.find(entry => entry.user_id === userId)
    if (member?.profile?.display_name) return member.profile.display_name
    if (userId === localSession.user.id) return localProfile.display_name || localSession.user.email?.split('@')[0] || 'Deg'
    return 'Dojo-venn'
  }, [localProfile.display_name, localSession.user.email, localSession.user.id, members])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter(item => {
      const matchesType = typeFilter === 'all' || item.item_type === typeFilter
      const haystack = `${item.title} ${item.description} ${(item.tags || []).join(' ')}`.toLowerCase()
      return matchesType && (!query || haystack.includes(query))
    })
  }, [items, search, typeFilter])

  const stats = useMemo(() => {
    const open = items.filter(item => item.status !== 'done').length
    const done = items.filter(item => item.status === 'done').length
    return {
      open,
      review: items.filter(item => item.status === 'review').length,
      bugs: items.filter(item => item.item_type === 'bug' && item.status !== 'done').length,
      donePct: items.length ? Math.round((done / items.length) * 100) : 0,
    }
  }, [items])

  const planner = useMemo(() => {
    const firstDay = addDays(startOfWeek(), weekOffset * 7)
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(firstDay, index)
      return { date, key: dateKey(date), isToday: dateKey(date) === dateKey(new Date()), isWeekend: index > 4 }
    })
    const dayKeys = new Set(days.map(day => day.key))
    const today = dateKey(new Date())
    const openItems = filteredItems.filter(item => item.status !== 'done')
    const byDay = Object.fromEntries(days.map(day => [day.key, filteredItems.filter(item => item.due_date === day.key)]))
    const thisWeek = openItems.filter(item => item.due_date && dayKeys.has(item.due_date))
    const backlog = openItems.filter(item => !item.due_date)
    const overdue = openItems.filter(item => item.due_date && item.due_date < today)
    const later = openItems.filter(item => item.due_date && item.due_date > days[6].key)
    const freeDays = days.filter(day => (byDay[day.key] || []).filter(item => item.status !== 'done').length < 2).length
    const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 }
    const focus = [...new globalThis.Map([...overdue, ...thisWeek].map(item => [item.id, item])).values()]
      .sort((a, b) => (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0))
      .slice(0, 3)
    return {
      firstDay,
      days,
      byDay,
      thisWeek,
      backlog,
      overdue,
      later,
      focus,
      freeDays,
      label: `${longDateFormatter.format(days[0].date)} – ${longDateFormatter.format(days[6].date)}`,
    }
  }, [filteredItems, weekOffset])

  const applyDisplayName = (displayName) => {
    const current = supabase.getIdentity()
    supabase.configure(current.userId, displayName.trim())
    const next = supabase.getIdentity()
    setStandaloneIdentity(next)
    return next
  }

  const createWorkspace = async (name, displayName = localProfile.display_name) => {
    setBusy(true)
    applyDisplayName(displayName)
    const { data, error } = await supabase.rpc('create_dojo_workspace', { p_name: name })
    setBusy(false)
    if (error) { flash(error.message || 'Kunne ikke opprette HQ.'); return }
    flash('HQ opprettet. Nå kan du invitere vennen din.')
    loadWorkspaces(data?.id)
  }

  const joinWorkspace = async (code, displayName = localProfile.display_name) => {
    setBusy(true)
    applyDisplayName(displayName)
    const { data, error } = await supabase.rpc('join_dojo_workspace', { p_invite_code: code })
    setBusy(false)
    if (error) { flash('Fant ikke den invitasjonskoden.'); return }
    flash('Du er inne i dojoen.')
    loadWorkspaces(data?.id)
  }

  const uploadFiles = async (itemId, files) => {
    if (!files.length || !activeWorkspace) return
    const maxBytes = (supabase.isRemote ? 5 : 1.5) * 1024 * 1024
    const validFiles = files.filter(file => file.type.startsWith('image/') && file.size <= maxBytes)
    if (validFiles.length !== files.length) flash(`Noen filer ble hoppet over. Bruk bilder under ${supabase.isRemote ? '5' : '1,5'} MB.`)
    for (const file of validFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120)
      const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const storagePath = `${activeWorkspace.id}/${itemId}/${unique}-${safeName}`
      const upload = await supabase.storage.from('dojo-attachments').upload(storagePath, file, { contentType: file.type, upsert: false })
      if (upload.error) { flash(`Kunne ikke laste opp ${file.name}.`); continue }
      const insert = await supabase.from('dojo_attachments').insert({
        workspace_id: activeWorkspace.id, item_id: itemId, created_by: localSession.user.id,
        storage_path: storagePath, file_name: file.name, mime_type: file.type, size_bytes: file.size,
      })
      if (insert.error) await supabase.storage.from('dojo-attachments').remove([storagePath])
    }
  }

  const createItem = async (form, files) => {
    if (!activeWorkspace) return
    setBusy(true)
    const payload = {
      ...form,
      workspace_id: activeWorkspace.id,
      created_by: localSession.user.id,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || null,
      tags: form.tags.split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean).slice(0, 8),
      title: form.title.trim(),
      description: form.description.trim(),
    }
    const { data, error } = await supabase.from('dojo_items').insert(payload).select().single()
    if (!error && data) await uploadFiles(data.id, files)
    setBusy(false)
    if (error) { flash('Oppgaven kunne ikke lagres.'); return }
    setNewItemOpen(false)
    flash('Lagt til i dojoen.')
    loadWorkspace(activeWorkspace)
  }

  const updateItem = async (id, patch) => {
    setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item))
    const payload = supabase.isRemote ? { ...patch, _actor_id: localSession.user.id } : patch
    const { error } = await supabase.from('dojo_items').update(payload).eq('id', id)
    if (error) { flash('Endringen ble ikke lagret.'); loadWorkspace(activeWorkspace) }
    else if (supabase.isRemote) loadHQ2(activeWorkspace)
  }

  const syncRoadmap = async () => {
    setBridgeBusy(true)
    try {
      const result = await dojoClaudeBridge.sync(items, members, roadmapDocument)
      setRoadmapInfo(result)
      setBridgeStatus(current => ({ ...current, connected: true }))
      flash(`${roadmapDocument} er oppdatert med ${result.itemCount} oppgaver.`)
      return result
    } catch (error) {
      setBridgeStatus({ connected: false, claudeReady: false, claudeVersion: '' })
      flash(error.message || 'Kunne ikke skrive roadmapen.')
      return null
    } finally {
      setBridgeBusy(false)
    }
  }

  const pullRoadmapStatus = async () => {
    setBridgeBusy(true)
    try {
      const result = await dojoClaudeBridge.read(roadmapDocument)
      const completed = new Set(result.state?.completedIds || [])
      const changed = items.filter(item => completed.has(item.id) && item.status !== 'done')
      for (const item of changed) {
        await supabase.from('dojo_items').update({ status: 'done' }).eq('id', item.id)
      }
      setRoadmapInfo({ ...result, itemCount: (result.state?.completedIds?.length || 0) + (result.state?.openIds?.length || 0) })
      if (changed.length) await loadWorkspace(activeWorkspace)
      flash(changed.length ? `${changed.length} oppgaver ble markert ferdige.` : 'HQ og roadmapen er allerede enige.')
    } catch (error) {
      setBridgeStatus({ connected: false, claudeReady: false, claudeVersion: '' })
      flash(error.message || 'Kunne ikke lese roadmapen.')
    } finally {
      setBridgeBusy(false)
    }
  }

  const openInClaude = async (item) => {
    if (!bridgeStatus.connected || !bridgeStatus.claudeReady) {
      setClaudePanelOpen(true)
      checkBridge()
      return
    }
    setBridgeBusy(true)
    let runId = null
    try {
      if (supabase.isRemote) {
        const created = await dojoHQ2Client.createRun(item.id)
        runId = created.run?.id || null
      }
      const result = await dojoClaudeBridge.launch(
        runId ? { ...item, dojo_run_id: runId } : item,
        items,
        members,
        roadmapDocument,
      )
      if (runId) await dojoHQ2Client.updateRun(runId, { status: 'running' })
      setRoadmapInfo(current => ({ ...(current || {}), document: result.document, itemCount: items.length }))
      if (supabase.isRemote) loadHQ2(activeWorkspace)
      flash(result.readmeIncluded
        ? 'Claude Code åpnes med oppgaven og README.md som kontekst.'
        : 'Claude Code åpnes, men README.md ble ikke funnet i prosjektmappen.')
    } catch (error) {
      flash(error.message || 'Kunne ikke åpne Claude Code.')
      if (runId) await dojoHQ2Client.updateRun(runId, { status: 'failed', summary: error.message }).catch(() => {})
      checkBridge()
      if (supabase.isRemote) loadHQ2(activeWorkspace)
    } finally {
      setBridgeBusy(false)
    }
  }

  const scheduleItem = (item, dueDate) => {
    updateItem(item.id, { due_date: dueDate, status: item.status === 'inbox' ? 'planned' : item.status })
  }

  const quickPlan = (item) => {
    const today = dateKey(new Date())
    const available = planner.days.filter(day => weekOffset !== 0 || day.key >= today)
    const candidates = available.length ? available : planner.days
    const bestDay = [...candidates].sort((a, b) => {
      const aCount = (planner.byDay[a.key] || []).filter(entry => entry.status !== 'done').length
      const bCount = (planner.byDay[b.key] || []).filter(entry => entry.status !== 'done').length
      return aCount - bCount
    })[0]
    if (!bestDay) return
    scheduleItem(item, bestDay.key)
    flash(`${item.title} er lagt til ${weekdayFormatter.format(bestDay.date)}.`)
  }

  const deleteItem = async (item) => {
    if (!window.confirm(`Slette «${item.title}»? Dette kan ikke angres.`)) return
    const paths = attachments.filter(file => file.item_id === item.id).map(file => file.storage_path)
    if (paths.length) await supabase.storage.from('dojo-attachments').remove(paths)
    const { error } = await supabase.from('dojo_items').delete().eq('id', item.id)
    if (error) { flash('Kunne ikke slette oppgaven.'); return }
    setSelectedId(null)
    flash('Oppgaven er slettet.')
    loadWorkspace(activeWorkspace)
  }

  const addComment = async (itemId, body) => {
    setBusy(true)
    const { error } = await supabase.from('dojo_comments').insert({ workspace_id: activeWorkspace.id, item_id: itemId, author_id: localSession.user.id, body: body.trim() })
    setBusy(false)
    if (error) flash('Kommentaren ble ikke sendt.')
  }

  const runHQ2Mutation = async (operation, successMessage) => {
    try {
      await operation()
      await loadHQ2(activeWorkspace)
      if (successMessage) flash(successMessage)
      return true
    } catch (error) {
      flash(error.message || 'Endringen kunne ikke lagres.')
      return false
    }
  }

  const createMilestone = payload => runHQ2Mutation(
    () => dojoHQ2Client.createMilestone(payload),
    'Milepælen er opprettet.',
  )

  const updateMilestone = (id, payload) => runHQ2Mutation(
    () => dojoHQ2Client.updateMilestone(id, payload),
    'Milepælen er oppdatert.',
  )

  const createTest = payload => runHQ2Mutation(
    () => dojoHQ2Client.createTestCase(payload),
    'Testen er lagt i køen.',
  )

  const updateTest = (id, payload) => runHQ2Mutation(
    () => dojoHQ2Client.updateTestCase(id, payload),
    payload.status === 'passed' ? 'Testen er godkjent.' : payload.status === 'failed' ? 'Testen er markert som feilet.' : '',
  )

  const deleteTest = id => runHQ2Mutation(
    () => dojoHQ2Client.deleteTestCase(id),
    'Testen er slettet.',
  )

  const updateRun = (id, payload) => runHQ2Mutation(
    () => dojoHQ2Client.updateRun(id, payload),
    '',
  )

  const addDecision = summary => runHQ2Mutation(
    () => dojoHQ2Client.addDecision(summary),
    'Beslutningen er lagret.',
  )

  const restoreVersion = async (itemId, versionId) => {
    if (!window.confirm('Gjenopprette denne versjonen av oppgaven? Dagens versjon beholdes i historikken.')) return
    const restored = await runHQ2Mutation(
      () => dojoHQ2Client.restoreItem(itemId, versionId),
      'Oppgaven er gjenopprettet.',
    )
    if (restored) await loadWorkspace(activeWorkspace)
  }

  const createBugFromTest = async (test, sourceItem) => {
    const { data, error } = await supabase.from('dojo_items').insert({
      workspace_id: activeWorkspace.id,
      created_by: localSession.user.id,
      title: `Test feilet: ${test.title}`,
      description: [
        sourceItem ? `Opprettet fra «${sourceItem.title}».` : '',
        test.expected ? `Forventet: ${test.expected}` : '',
        test.notes ? `Faktisk resultat: ${test.notes}` : '',
      ].filter(Boolean).join('\n\n'),
      item_type: 'bug',
      status: 'inbox',
      priority: 'high',
      tags: ['testfeil'],
      assigned_to: sourceItem?.assigned_to || null,
      due_date: null,
    }).select().single()
    if (error || !data) {
      flash('Kunne ikke opprette bug fra testen.')
      return
    }
    await Promise.all([loadWorkspace(activeWorkspace), loadHQ2(activeWorkspace)])
    setSelectedId(data.id)
    flash('Buggen er opprettet og klar for arbeid.')
  }

  const removeAttachment = async (file) => {
    if (!window.confirm(`Slette ${file.file_name}?`)) return
    await supabase.storage.from('dojo-attachments').remove([file.storage_path])
    const { error } = await supabase.from('dojo_attachments').delete().eq('id', file.id)
    if (error) flash('Vedlegget kunne ikke slettes.')
    else loadWorkspace(activeWorkspace)
  }

  const finishSetup = async (values) => {
    setBusy(true)
    const result = supabase.completeSetup({ ...values, ownerId: session?.user?.id || 'local-user' })
    setBusy(false)
    if (result.error) { flash('Oppsettet kunne ikke lagres.'); return }
    setStandaloneIdentity(result.identity)
    setOverview(supabase.getOverview())
    setShowSetup(false)
    flash('Dojoen er klar. Legg inn den første ekte oppgaven.')
    loadWorkspaces()
  }

  const changeIdentity = (userId) => {
    const result = supabase.setIdentity(userId)
    if (result.error) { flash('Kunne ikke bytte bruker.'); return }
    setStandaloneIdentity(result.identity)
    setOverview(supabase.getOverview())
    flash(`Du jobber nå som ${result.identity.displayName}.`)
  }

  const exportWorkspace = async (share = false) => {
    supabase.markExported()
    const content = supabase.exportData()
    const fileName = `hanzi-dojo-hq-${new Date().toISOString().slice(0, 10)}.dojo.json`
    const file = new File([content], fileName, { type: 'application/json' })
    setOverview(supabase.getOverview())

    if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: activeWorkspace?.name || 'Hanzi Dojo HQ', text: 'Nyeste arbeidsfil fra Hanzi Dojo HQ' })
        setCopied(true)
        flash('Arbeidsfilen er delt.')
        window.setTimeout(() => setCopied(false), 1800)
        return
      } catch (error) {
        if (error?.name === 'AbortError') return
      }
    }

    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
    setCopied(true)
    flash(share ? 'Filen er lastet ned. Send den til vennen din.' : 'En sikker arbeidskopi er lastet ned.')
    window.setTimeout(() => setCopied(false), 1800)
  }

  const inviteLink = () => {
    if (!activeWorkspace?.invite_code) return ''
    const url = new URL('/', window.location.origin)
    url.searchParams.set('online', '1')
    url.hash = `join=${activeWorkspace.invite_code}`
    return url.toString()
  }

  const copyInvite = async (codeOnly = false) => {
    const value = codeOnly ? activeWorkspace?.invite_code : inviteLink()
    if (!value) { flash('Invitasjonskoden er ikke tilgjengelig ennå.'); return }
    try {
      await copyText(value)
      setCopied(true)
      flash(codeOnly ? 'Invitasjonskoden er kopiert.' : 'Invitasjonslenken er kopiert. Send den til vennen din.')
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      flash('Kunne ikke kopiere automatisk. Marker koden og kopier den.')
    }
  }

  const shareWorkspace = () => supabase.isRemote ? copyInvite(false) : exportWorkspace(true)

  const importWorkspace = async (file) => {
    if (!file) return
    const importedDuringSetup = showSetup
    const result = supabase.importData(await file.text())
    if (result.error) { flash('Denne filen kunne ikke leses som et Dojo HQ.'); return }
    setOverview(supabase.getOverview())
    setShowSetup(false)
    if (importedDuringSetup) setCollabOpen(true)
    flash(result.added ? `${result.added} nye oppgaver ble slått sammen.` : 'Arbeidsfilen er slått sammen. Alt er oppdatert.')
    loadWorkspaces()
  }

  const openNew = (status, dueDate = '') => { setNewItemStatus(status || 'inbox'); setNewItemDueDate(dueDate); setNewItemOpen(true) }
  const attachmentFor = itemId => attachments.filter(file => file.item_id === itemId)
  const commentCountFor = itemId => comments.filter(entry => entry.item_id === itemId).length
  const bridgePairCommand = supabase.isRemote && activeWorkspace?.invite_code
    ? `$p=Join-Path $env:TEMP 'dojo-cloud-bridge.mjs'; Invoke-WebRequest -UseBasicParsing '${window.location.origin}/dojo-cloud-bridge.mjs?v=${import.meta.env.VITE_BUILD_SHA}' -OutFile $p; node $p --pair '${activeWorkspace.invite_code}' --site '${window.location.origin}' --project (Get-Location) --self-update`
    : 'npm run dojo:bridge'

  if (loading) return <div className="dojo-loading"><div className="dojo-loading-mark">道</div><span>Laster HQ</span></div>
  if (!activeWorkspace) return <WorkspaceGate onCreate={createWorkspace} onJoin={joinWorkspace} busy={busy} setupError={setupError} online={supabase.isRemote} />

  return (
    <div className="dojo-hq">
      <header className="dojo-topbar">
        <div className="dojo-wordmark"><span>道</span><strong>DOJO / HQ</strong></div>
        <div className="dojo-top-actions">
          {workspaces.length > 1 ? (
            <label className="dojo-workspace-picker"><span className="sr-only">Arbeidsområde</span><select value={activeWorkspace.id} onChange={event => setActiveWorkspace(workspaces.find(workspace => workspace.id === event.target.value))}>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><ChevronDown size={15} /></label>
          ) : <span className="dojo-workspace-name">{activeWorkspace.name}</span>}
          <div className="dojo-avatars" aria-label={`${members.length} medlemmer`}>{members.slice(0, 4).map((member, index) => <Avatar key={member.user_id} name={memberName(member.user_id)} index={index} />)}</div>
          <button className="dojo-share dojo-command-button" onClick={() => { setCommandQuery(''); setCommandOpen(true) }} title="Kommandopalett (Ctrl+K)"><Search size={16} /><span>Finn</span><kbd>Ctrl K</kbd></button>
          <button className={`dojo-share dojo-claude-button ${bridgeStatus.connected && bridgeStatus.claudeReady ? 'is-online' : ''}`} onClick={() => setClaudePanelOpen(true)} title="Claude Code og roadmap"><SquareTerminal size={16} /><span>Claude</span><i aria-hidden="true" /></button>
          <button className="dojo-share dojo-share-secondary dojo-sync-button" onClick={() => setCollabOpen(true)} title={supabase.isRemote ? 'Live samarbeid' : 'Samarbeid og arbeidsfil'}>{supabase.isRemote ? <UsersRound size={16} /> : <FolderSync size={16} />}<span>{supabase.isRemote ? 'Live' : 'Arbeidsfil'}</span><i aria-hidden="true" /></button>
          <input ref={importRef} className="sr-only" type="file" accept="application/json,.json,.dojo.json" onChange={event => { importWorkspace(event.target.files?.[0]); event.target.value = '' }} />
          <button className="dojo-share" onClick={shareWorkspace}>{copied ? <Check size={16} /> : <Share2 size={16} />}<span>{copied ? 'Kopiert' : 'Del'}</span></button>
        </div>
      </header>

      <section className={`dojo-hero${viewMode === 'plan' || viewMode === 'control' ? ' dojo-hero-planning' : ''}${viewMode === 'control' ? ' dojo-hero-control' : ''}`}>
        <div className="dojo-hero-copy">
          <span className="dojo-eyebrow"><Circle size={8} fill="currentColor" /> {supabase.isRemote ? 'Live arbeidsrom · D1 + R2 · ingen Supabase' : 'Lokal arbeidsfil · ingen Supabase'}</span>
          <h1>Bygg. Test.<br /><em>Levér.</em></h1>
          <p>{supabase.isRemote ? 'Alle tanker, feil, bilder og neste trekk for Hanzi Dojo — delt mellom dere og automatisk synkronisert.' : 'Alle tanker, feil og neste trekk for Hanzi Dojo — lagret på enheten din. Eksporter arbeidsfilen når du vil sende siste versjon til vennen din.'}</p>
          <button className="dojo-primary dojo-hero-cta" onClick={() => openNew('inbox')}><Plus size={19} />Legg til noe</button>
        </div>
        <div className="dojo-stat-grid">
          <article className="dojo-stat dojo-stat-lime"><span>Åpent nå</span><strong>{String(stats.open).padStart(2, '0')}</strong><small>ting i flyt <ArrowUpRight size={13} /></small></article>
          <article className="dojo-stat"><span>Til testing</span><strong>{String(stats.review).padStart(2, '0')}</strong><small>klar for dere</small></article>
          <article className="dojo-stat"><span>Aktive bugs</span><strong>{String(stats.bugs).padStart(2, '0')}</strong><small>{stats.bugs === 0 ? 'rent brett' : 'må sjekkes'}</small></article>
          <article className="dojo-stat dojo-stat-progress"><span>Levert</span><strong>{stats.donePct}%</strong><div className="dojo-progress"><i style={{ width: `${stats.donePct}%` }} /></div></article>
        </div>
      </section>

      <main className="dojo-workspace">
        <div className="dojo-toolbar">
          <div className="dojo-view-tabs" role="tablist" aria-label="Visning">
            <button className={viewMode === 'control' ? 'active' : ''} onClick={() => setViewMode('control')}><Sparkles size={16} />Kontrollrom</button>
            <button className={viewMode === 'board' ? 'active' : ''} onClick={() => setViewMode('board')}><LayoutGrid size={16} />Brett</button>
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}><List size={16} />Liste</button>
            <button className={viewMode === 'plan' ? 'active' : ''} onClick={() => setViewMode('plan')}><CalendarDays size={16} />Ukeplan</button>
          </div>
          <div className="dojo-filters">
            <label className="dojo-search"><Search size={16} /><input aria-label="Søk i HQ" value={search} onChange={event => setSearch(event.target.value)} placeholder="Søk …" /></label>
            <label className="dojo-type-filter"><span className="sr-only">Filtrer type</span><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">Alle typer</option>{Object.entries(TYPES).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select><ChevronDown size={14} /></label>
            <button className="dojo-primary dojo-toolbar-add" onClick={() => openNew('inbox')}><Plus size={17} /><span>Ny oppgave</span></button>
          </div>
        </div>

        {viewMode === 'control' && (
          <DojoCommandCenter
            data={hq2Data}
            items={items}
            members={members}
            identity={{
              userId: localSession.user.id,
              displayName: localProfile.display_name || localSession.user.email?.split('@')[0] || 'Dojo-medlem',
            }}
            bridgeStatus={bridgeStatus}
            attachments={attachments}
            onOpenItem={setSelectedId}
            onUpdateRun={updateRun}
            onCreateTest={createTest}
            onUpdateTest={updateTest}
            onDeleteTest={deleteTest}
            onCreateBug={createBugFromTest}
            onReadDocument={name => dojoClaudeBridge.read(name)}
            onAddDecision={addDecision}
            onRestoreVersion={restoreVersion}
            onCreateMilestone={createMilestone}
            onUpdateMilestone={updateMilestone}
          />
        )}

        {viewMode === 'board' && (
          <div className="dojo-board">
            {STATUSES.map(status => {
              const columnItems = filteredItems.filter(item => item.status === status.key)
              return (
                <section className="dojo-column" key={status.key} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); if (id) updateItem(id, { status: status.key }) }}>
                  <header><div><span>{status.label}</span><small>{status.note}</small></div><strong>{columnItems.length}</strong></header>
                  <div className="dojo-column-items">
                    {columnItems.map(item => <ItemCard key={item.id} item={item} attachments={attachmentFor(item.id)} commentCount={commentCountFor(item.id)} memberName={memberName} onOpen={next => setSelectedId(next.id)} onDragStart={(event, id) => event.dataTransfer.setData('text/plain', id)} />)}
                    {columnItems.length === 0 && <div className="dojo-column-empty"><Circle size={14} />Slipp noe her</div>}
                  </div>
                  <button className="dojo-add-inline" onClick={() => openNew(status.key)}><Plus size={15} />Legg til</button>
                </section>
              )
            })}
          </div>
        )}

        {viewMode === 'list' && (
          <div className="dojo-list-view">
            <div className="dojo-list-head"><span>Oppgave</span><span>Type</span><span>Status</span><span>Prioritet</span><span>Ansvarlig</span><span>Frist</span></div>
            {filteredItems.map(item => (
              <button className="dojo-list-row" key={item.id} onClick={() => setSelectedId(item.id)}>
                <strong>{item.title}</strong><TypeBadge type={item.item_type} /><span>{STATUSES.find(status => status.key === item.status)?.label}</span><span className="dojo-priority"><i style={{ background: PRIORITIES[item.priority]?.color }} />{PRIORITIES[item.priority]?.label}</span><span>{memberName(item.assigned_to) || '—'}</span><span>{item.due_date ? dateFormatter.format(new Date(`${item.due_date}T12:00:00`)) : '—'}</span>
              </button>
            ))}
            {filteredItems.length === 0 && <div className="dojo-big-empty"><Search size={24} /><h3>Ingen treff</h3><p>Prøv et annet søk eller lag den første oppgaven.</p></div>}
          </div>
        )}

        {viewMode === 'plan' && (
          <div className="dojo-planner">
            <header className="dojo-planner-head">
              <div>
                <span className="dojo-kicker">Planleggingsrom</span>
                <h2>En uke dere faktisk kan gjennomføre.</h2>
                <p>Dra oppgaver fra uplanlagt-køen til en dag, eller bruk lynknappen for å finne første rolige plass.</p>
              </div>
              <div className="dojo-week-control" aria-label="Velg uke">
                <button onClick={() => setWeekOffset(offset => offset - 1)} aria-label="Forrige uke"><ChevronLeft size={18} /></button>
                <div><span>{weekOffset === 0 ? 'Denne uken' : weekOffset === 1 ? 'Neste uke' : weekOffset === -1 ? 'Forrige uke' : 'Valgt uke'}</span><strong>{planner.label}</strong></div>
                <button onClick={() => setWeekOffset(offset => offset + 1)} aria-label="Neste uke"><ChevronRight size={18} /></button>
                {weekOffset !== 0 && <button className="dojo-week-today" onClick={() => setWeekOffset(0)}>I dag</button>}
              </div>
            </header>

            <section className="dojo-planner-metrics" aria-label="Ukeoversikt">
              <article><Target size={19} /><div><span>Planlagt</span><strong>{planner.thisWeek.length}</strong></div><small>denne uken</small></article>
              <article className={planner.overdue.length ? 'is-alert' : ''}><AlertTriangle size={19} /><div><span>Forsinket</span><strong>{planner.overdue.length}</strong></div><small>{planner.overdue.length ? 'trenger et valg' : 'alt i rute'}</small></article>
              <article><CalendarDays size={19} /><div><span>Luft i planen</span><strong>{planner.freeDays}</strong></div><small>dager med kapasitet</small></article>
              <article><FlaskConical size={19} /><div><span>Til test</span><strong>{planner.thisWeek.filter(item => item.status === 'review').length}</strong></div><small>før dere leverer</small></article>
            </section>

            {planner.focus.length > 0 && (
              <section className="dojo-focus-strip">
                <header><div><Target size={16} /><span>Fokus denne uken</span></div><small>Prioritert automatisk etter hast og frist</small></header>
                <div>
                  {planner.focus.map((item, index) => (
                    <button key={item.id} onClick={() => setSelectedId(item.id)}>
                      <span className="dojo-focus-number">0{index + 1}</span>
                      <div><TypeBadge type={item.item_type} /><strong>{item.title}</strong></div>
                      {item.due_date && <time className={item.due_date < dateKey(new Date()) ? 'late' : ''}>{dateFormatter.format(new Date(`${item.due_date}T12:00:00`))}</time>}
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="dojo-planner-scroll" aria-label="Ukeplan">
              <aside
                className="dojo-backlog"
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.preventDefault()
                  const item = items.find(entry => entry.id === event.dataTransfer.getData('text/plain'))
                  if (item) updateItem(item.id, { due_date: null })
                }}
              >
                <header><div><span>Uplanlagt</span><small>Dra inn i uken</small></div><strong>{planner.backlog.length}</strong></header>
                <div className="dojo-backlog-list">
                  {planner.backlog.map(item => (
                    <article
                      key={item.id}
                      draggable
                      tabIndex={0}
                      role="button"
                      onDragStart={event => event.dataTransfer.setData('text/plain', item.id)}
                      onClick={() => setSelectedId(item.id)}
                      onKeyDown={event => { if (event.key === 'Enter') setSelectedId(item.id) }}
                    >
                      <div><TypeBadge type={item.item_type} /><span className="dojo-priority"><i style={{ background: PRIORITIES[item.priority]?.color }} />{PRIORITIES[item.priority]?.label}</span></div>
                      <h3>{item.title}</h3>
                      <footer>
                        <span>{memberName(item.assigned_to) || 'Ikke tildelt'}</span>
                        <button onClick={event => { event.stopPropagation(); quickPlan(item) }} aria-label={`Hurtigplanlegg ${item.title}`} title="Finn første ledige dag"><CalendarPlus size={16} /></button>
                      </footer>
                    </article>
                  ))}
                  {planner.backlog.length === 0 && <div className="dojo-backlog-empty"><Check size={18} /><span>Alt har fått en plass</span></div>}
                </div>
                <button className="dojo-add-inline" onClick={() => openNew('inbox')}><Plus size={15} />Legg i køen</button>
              </aside>

              {planner.days.map(day => {
                const dayItems = planner.byDay[day.key] || []
                const activeCount = dayItems.filter(item => item.status !== 'done').length
                return (
                  <section
                    key={day.key}
                    className={`dojo-day${day.isToday ? ' is-today' : ''}${day.isWeekend ? ' is-weekend' : ''}`}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => {
                      event.preventDefault()
                      const item = items.find(entry => entry.id === event.dataTransfer.getData('text/plain'))
                      if (item) scheduleItem(item, day.key)
                    }}
                  >
                    <header>
                      <div><span>{weekdayFormatter.format(day.date).replace('.', '')}</span><strong>{day.date.getDate()}</strong></div>
                      <div className="dojo-day-actions">
                        <div className="dojo-capacity" aria-label={`${activeCount} planlagte oppgaver`}>
                          {[0, 1, 2].map(index => <i key={index} className={index < activeCount ? 'filled' : ''} />)}
                        </div>
                        <button onClick={() => openNew('planned', day.key)} aria-label={`Legg til oppgave ${weekdayFormatter.format(day.date)}`}><Plus size={14} /></button>
                      </div>
                    </header>
                    <div className="dojo-day-items">
                      {dayItems.map(item => (
                        <button
                          key={item.id}
                          draggable
                          className={`dojo-day-task${item.status === 'done' ? ' is-done' : ''}`}
                          onDragStart={event => event.dataTransfer.setData('text/plain', item.id)}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <div><TypeBadge type={item.item_type} compact /><span style={{ background: PRIORITIES[item.priority]?.color }} /></div>
                          <strong>{item.title}</strong>
                          <footer><span>{memberName(item.assigned_to) || 'Åpen'}</span>{item.status === 'review' && <FlaskConical size={13} />}</footer>
                        </button>
                      ))}
                      {dayItems.length === 0 && <button className="dojo-day-empty" onClick={() => openNew('planned', day.key)}><Plus size={14} /><span>Slipp her eller legg til</span></button>}
                    </div>
                  </section>
                )
              })}
            </div>

            {planner.later.length > 0 && (
              <section className="dojo-later-strip">
                <header><div><CalendarDays size={16} /><span>Senere i planen</span></div><small>{planner.later.length} oppgaver etter denne uken</small></header>
                <div>
                  {planner.later.slice(0, 6).map(item => (
                    <button key={item.id} onClick={() => setSelectedId(item.id)}><TypeBadge type={item.item_type} compact /><strong>{item.title}</strong><time>{dateFormatter.format(new Date(`${item.due_date}T12:00:00`))}</time></button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {showSetup && <LaunchModal overview={overview} defaultOwnerName={localProfile.display_name} onSubmit={finishSetup} onImport={() => importRef.current?.click()} busy={busy} />}
      {collabOpen && <CollaborationModal overview={overview} members={members} identity={standaloneIdentity} workspace={activeWorkspace} online={supabase.isRemote} copied={copied} onClose={() => setCollabOpen(false)} onImport={() => importRef.current?.click()} onDownload={() => exportWorkspace(false)} onShare={shareWorkspace} onCopyCode={() => copyInvite(true)} onIdentityChange={changeIdentity} busy={busy} />}
      {claudePanelOpen && <ClaudePanel status={bridgeStatus} roadmapInfo={roadmapInfo} documentName={roadmapDocument} onDocumentChange={setRoadmapDocument} onClose={() => setClaudePanelOpen(false)} onSync={syncRoadmap} onPull={pullRoadmapStatus} onCheck={checkBridge} busy={bridgeBusy} online={supabase.isRemote} pairCommand={bridgePairCommand} />}
      {newItemOpen && <CreateItemModal onClose={() => setNewItemOpen(false)} onSubmit={createItem} members={members} initialStatus={newItemStatus} initialDueDate={newItemDueDate} busy={busy} maxFileMb={supabase.isRemote ? 5 : 1.5} />}
      {selectedItem && <ItemDetail key={selectedItem.id} item={selectedItem} items={items} attachments={attachments} comments={comments} members={members} milestones={hq2Data.milestones} testCases={hq2Data.testCases.filter(test => test.item_id === selectedItem.id)} runs={hq2Data.runs.filter(run => run.item_id === selectedItem.id)} memberName={memberName} onClose={() => setSelectedId(null)} onUpdate={updateItem} onDelete={deleteItem} onComment={addComment} onUpload={async (id, files) => { setBusy(true); await uploadFiles(id, files); setBusy(false); loadWorkspace(activeWorkspace) }} onRemoveAttachment={removeAttachment} onOpenClaude={openInClaude} onUpdateTest={updateTest} claudeConnected={bridgeStatus.connected && bridgeStatus.claudeReady} busy={busy || bridgeBusy} />}

      <DojoCommandPalette
        open={commandOpen}
        query={commandQuery}
        onQuery={setCommandQuery}
        items={items}
        onClose={() => setCommandOpen(false)}
        onView={setViewMode}
        onOpenItem={setSelectedId}
        onNewItem={() => openNew('inbox')}
        onOpenClaude={() => setClaudePanelOpen(true)}
      />

      {notice && <div className="dojo-toast" role="status"><Check size={16} />{notice}</div>}
    </div>
  )
}
