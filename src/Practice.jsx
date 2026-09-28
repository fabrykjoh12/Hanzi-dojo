import { getLevelLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { buildPracticePlan } from './practicePlan'
import { speechRecognitionSupported } from './speechSupport'
import { useIsMobile } from './useIsMobile'
import { ArrowRight, AlertTriangle, Headphones, PenLine, AlignLeft, Blocks, Music2, Languages, Brush, Play, GraduationCap, BookA, ScanText, Mic, Search, Repeat2, ListChecks, ChevronRight, Layers } from 'lucide-react'

const ICONS = {
  study: Layers,
  weak: AlertTriangle,
  grammarpractice: Repeat2,
  listen: Headphones,
  speak: Mic,
  writing: PenLine,
  fillblank: AlignLeft,
  builder: Blocks,
  tones: Music2,
  kana: Languages,
  cyrillic: Languages,
  strokes: Brush,
  words: BookA,
  known: ListChecks,
  dictionary: Search,
  analyzer: ScanText,
  grammar: GraduationCap,
  youtube: Play,
}


export default function Practice({ profile, track, counts, onNavigate }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const accent = ink(theme.accentHex)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)
  const plan = buildPracticePlan({
    script: theme.script, cjk: theme.cjk, speech: speechRecognitionSupported(),
    weakCount: counts?.failed ? 0 : counts?.weakCount || 0,
    grammarDueCount: counts?.failed ? 0 : counts?.grammarDueCount || 0,
    learnedCount: counts?.failed ? null : counts?.lifetimeLearned ?? null,
  })
  const primary = plan.primary
  const PrimaryIcon = ICONS[primary.key] || Headphones
  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: isMobile ? '24px 16px 40px' : '44px 32px 60px' }}>
      <header style={{ marginBottom: '32px' }}>
        <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-muted)' }}>{levelLabel} · Use what you know</p>
        <h1 style={{ fontSize: '28px', fontWeight: 650, letterSpacing: '-0.03em', color: 'var(--text)', margin: 0 }}>Practice</h1>
      </header>
      <section style={{ padding: '24px', border: '1px solid var(--border)', borderRadius: '16px', background: 'var(--surface)', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '16px' }}><span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{primary.eyebrow}</span><PrimaryIcon size={22} aria-hidden="true" color={accent} /></div>
        <h2 style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: '24px', fontWeight: 650, letterSpacing: '-0.02em' }}>{primary.title}</h2>
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: 'var(--text-muted)', maxWidth: '48ch' }}>{primary.reason}</p>
        <button type="button" onClick={() => onNavigate(primary.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', minHeight: '44px', padding: '10px 16px', border: 'none', borderRadius: '10px', background: 'var(--text)', color: 'var(--bg)', fontFamily: 'inherit', fontSize: '15px', fontWeight: 600, cursor: 'pointer', marginTop: '24px' }}>{primary.cta}<ArrowRight size={18} aria-hidden="true" /></button>
      </section>
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 650, color: 'var(--text)' }}>More drills</h2>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', columnGap: '24px' }}>
          {plan.drills.map(item => <PracticeRow key={item.key} item={item} onClick={() => onNavigate(item.key)} />)}
        </div>
      </section>
      <section>
        <h2 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 650, color: 'var(--text)' }}>Look things up</h2>
        {plan.tools.map(item => <PracticeRow key={item.key} item={item} onClick={() => onNavigate(item.key)} />)}
      </section>
    </div>
  )
}

function PracticeRow({ item, onClick }) {
  const Icon = ICONS[item.key] || Search
  return <button type="button" onClick={onClick} className="hd-press" style={{ display: 'flex', alignItems: 'center', gap: '16px', minHeight: '76px', width: '100%', padding: '16px 0', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', fontFamily: 'inherit', cursor: 'pointer' }}>
    <Icon size={20} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{item.title}</span><span style={{ display: 'block', fontSize: '13px', lineHeight: 1.5, color: 'var(--text-muted)', marginTop: '4px' }}>{item.desc}</span></span>
    <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
  </button>
}
