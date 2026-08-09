import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import {
  Palette, Sun, Moon, Keyboard, Eye,
  Volume2, BookOpenCheck, Gauge, Bell, HardDrive, Trash2, CheckCircle2,
  MessagesSquare, ArrowUpRight, Brain, ArrowLeft, Compass,
} from 'lucide-react'
import { RETENTION_PRESETS, presetForRetention, setTargetRetention } from './srs'
import { DISCORD_INVITE_URL, isDiscordConfigured } from './community'
import { externalLinkProps } from './externalLink'
import { useIsMobile } from './useIsMobile'
import { useTheme } from './ThemeContext'
import { languageTheme } from './languageTheme'
import { PageHeader } from './panels'
import { pushSupported, enableReminders, disableReminders, setReminderHour } from './push'
import { audioCount, estimateStorage, clearDownloads, offlineAvailable } from './offline'
import { resetTourSeen } from './tour'
import { pendingWrites } from './syncQueue'
import { buildLabel } from './version'

// The picker shows times the user actually recognizes ("9:00 AM" local),
// while reminder_hour_utc stores UTC for the sender script — convert at the
// boundary in both directions.
function localHourToUtc(localHour) {
  const d = new Date()
  d.setHours(localHour, 0, 0, 0)
  return d.getUTCHours()
}
function utcHourToLocal(utcHour) {
  const d = new Date()
  d.setUTCHours(utcHour, 0, 0, 0)
  return d.getHours()
}
function hourLabel(localHour) {
  const period = localHour < 12 ? 'AM' : 'PM'
  const h12 = localHour % 12 === 0 ? 12 : localHour % 12
  return h12 + ':00 ' + period
}
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h)

function getLanguageDetails(profile) {
  const t = languageTheme(profile.active_language)
  return {
    accentHex: t.accentHex,
    fontFamily: t.font,
    isJapanese: profile.active_language === 'japanese',
  }
}

function BackButton({ onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      minHeight: '40px', padding: '0 14px', borderRadius: '12px',
      border: '1px solid var(--border)', background: hovered ? 'var(--surface-2)' : 'var(--surface)',
      color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
    }}>
      <ArrowLeft size={17} strokeWidth={1.85} color="var(--text-muted)" /> Home
    </button>
  )
}

export default function Settings({ session, profile, onUpdate, onBack }) {
  const { accentHex, isJapanese } = getLanguageDetails(profile)
  const isMobile = useIsMobile()
  const { theme, setTheme } = useTheme()
  const [reminderBusy, setReminderBusy] = useState(false)
  const [reminderError, setReminderError] = useState(null)
  // Which preference column last failed to save, so the error shows next to
  // the control the user actually touched.
  const [prefError, setPrefError] = useState(null)

  // Defensive reads so the UI works even before the prefs migration is applied.
  const recallMode = profile.recall_mode === 'typed' ? 'typed' : 'flip'
  const audioAutoplay = profile.audio_autoplay !== false
  const furiganaDefault = profile.furigana_default !== false
  const audioSpeed = profile.audio_speed === 0.75 || profile.audio_speed === 0.5 ? profile.audio_speed : 1
  const remindersOn = profile.reminder_enabled === true
  // Supabase returns numeric columns as strings in some client versions, and the
  // column is absent entirely until the migration is applied — presetForRetention
  // falls back to the default preset for anything it can't read.
  const retentionPreset = presetForRetention(Number(profile.target_retention))
  const localHour = utcHourToLocal(
    typeof profile.reminder_hour_utc === 'number' ? profile.reminder_hour_utc : localHourToUtc(9)
  )

  // Persist a single preference column and reflect it live. Optimistic: the UI
  // updates first, and a failed write reverts it and says so — a rejected write
  // must never keep looking saved until the next reload quietly undoes it.
  const savePref = (patch) => {
    const prev = {}
    for (const key of Object.keys(patch)) prev[key] = profile[key]
    setPrefError(null)
    if (onUpdate) onUpdate(patch)
    if (session) {
      const revert = () => {
        if (onUpdate) onUpdate(prev)
        setPrefError(Object.keys(patch)[0])
      }
      supabase.from('profiles').update(patch).eq('id', session.user.id).then(
        ({ error }) => { if (error) revert() },
        () => revert()
      )
    }
  }

  // The inline error line for a control whose save failed — same treatment as
  // the reminder error below.
  const prefErrorLine = (key) => prefError === key ? (
    <div style={{ fontSize: '12.5px', color: 'var(--danger)', marginTop: '10px', lineHeight: 1.5 }}>
      That change didn't save — check your connection and try again.
    </div>
  ) : null

  // The scheduler is a pure module with no database access, so it keeps a
  // device-local mirror of the chosen retention. Sync it from the profile
  // whenever Settings opens, so signing in on a new device picks the value up.
  useEffect(() => {
    setTargetRetention(retentionPreset.value)
  }, [retentionPreset.value])

  const pickRetention = (value) => {
    setTargetRetention(value)
    savePref({ target_retention: value })
  }

  const toggleReminders = async (on) => {
    setReminderError(null)
    setReminderBusy(true)
    if (on) {
      const res = await enableReminders(session, localHourToUtc(localHour))
      if (!res.ok) {
        setReminderError(
          res.error === 'permission-denied'
            ? "Notifications are blocked — allow them for this site in your browser's settings, then try again."
            : "Push notifications aren't supported in this browser."
        )
      } else if (onUpdate) {
        onUpdate({ reminder_enabled: true, reminder_hour_utc: localHourToUtc(localHour) })
      }
    } else {
      await disableReminders(session)
      if (onUpdate) onUpdate({ reminder_enabled: false })
    }
    setReminderBusy(false)
  }

  const changeReminderHour = async (nextLocalHour) => {
    const utc = localHourToUtc(nextLocalHour)
    if (onUpdate) onUpdate({ reminder_hour_utc: utc })
    await setReminderHour(session, utc)
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: isMobile ? '32px 16px 56px' : '52px 32px 72px', position: 'relative', zIndex: 1 }}>
        {onBack && <BackButton onClick={onBack} />}
        <PageHeader title="Settings" meta="Preferences" style={{ marginTop: onBack ? '18px' : 0 }} />
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 22px', maxWidth: '560px' }}>
          Tune how studying feels. Daily goal and reset controls live in Profile.
        </p>

        <div style={{ display: 'grid', gap: '14px' }}>
          {/* Appearance */}
          <Card icon={Palette} title="Appearance" text="Choose a light or dark theme for the whole app." accentHex={accentHex}>
            <Segmented
              accentHex={accentHex}
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { key: 'light', label: 'Light', icon: Sun },
                { key: 'dark', label: 'Dark', icon: Moon },
              ]}
            />
          </Card>

          {/* Recall mode */}
          <Card icon={Keyboard} title="Flashcard recall" text="Flip lets you reveal the answer and grade yourself. Typed asks you to type the reading first, for stronger active recall." accentHex={accentHex}>
            <Segmented
              accentHex={accentHex}
              label="Flashcard recall"
              value={recallMode}
              onChange={(v) => savePref({ recall_mode: v })}
              options={[
                { key: 'flip', label: 'Flip', icon: Eye },
                { key: 'typed', label: 'Typed', icon: Keyboard },
              ]}
            />
            {prefErrorLine('recall_mode')}
          </Card>

          {/* Audio autoplay */}
          <Card icon={Volume2} title="Audio on flip" text="Automatically play the word's pronunciation when you reveal a card." accentHex={accentHex}>
            <Toggle accentHex={accentHex} label="Audio on flip" checked={audioAutoplay} onChange={(v) => savePref({ audio_autoplay: v })} />
            {prefErrorLine('audio_autoplay')}
          </Card>

          {/* Audio speed */}
          <Card icon={Gauge} title="Audio speed" text="Playback speed for flashcard pronunciation. The speed toggle on the card changes this too." accentHex={accentHex}>
            <Segmented
              accentHex={accentHex}
              label="Audio speed"
              value={audioSpeed}
              onChange={(v) => savePref({ audio_speed: v })}
              options={[
                { key: 1, label: '1×', icon: Gauge },
                { key: 0.75, label: '0.75×', icon: Gauge },
                { key: 0.5, label: '0.5×', icon: Gauge },
              ]}
            />
            {prefErrorLine('audio_speed')}
          </Card>

          {/* Furigana default — Japanese only */}
          {isJapanese && (
            <Card icon={BookOpenCheck} title="Furigana by default" text="Show readings above kanji on the front of Japanese flashcards." accentHex={accentHex}>
              <Toggle accentHex={accentHex} label="Furigana by default" checked={furiganaDefault} onChange={(v) => savePref({ furigana_default: v })} />
              {prefErrorLine('furigana_default')}
            </Card>
          )}

          {/* How well you want to remember — the retention dial */}
          <Card
            icon={Brain}
            title="How well you want to remember"
            text="Reviews come back just before you'd forget. You can choose where that line sits — there's no right answer, and no wrong one."
            accentHex={accentHex}
          >
            <PresetChoice
              accentHex={accentHex}
              legend="How well you want to remember"
              name="target-retention"
              value={retentionPreset.value}
              onChange={pickRetention}
              options={RETENTION_PRESETS}
            />
            {prefErrorLine('target_retention')}
          </Card>

          {/* Daily review reminder — opt-in Web Push */}
          <Card
            icon={Bell}
            title="Daily review reminder"
            text={
              pushSupported()
                ? "Get a notification when you have cards waiting. Off by default — nothing is sent unless you turn this on."
                : "Push notifications aren't supported in this browser."
            }
            accentHex={accentHex}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <Toggle
                accentHex={accentHex}
                label="Daily review reminder"
                checked={remindersOn}
                onChange={(v) => toggleReminders(v)}
                disabled={reminderBusy || !pushSupported()}
              />
              {remindersOn && (
                <select
                  value={localHour}
                  onChange={(e) => changeReminderHour(Number(e.target.value))}
                  disabled={reminderBusy}
                  aria-label="Daily reminder time"
                  style={{
                    minHeight: '44px', padding: '0 10px', borderRadius: '10px',
                    border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
                    fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                  }}
                >
                  {HOUR_OPTIONS.map(h => (
                    <option key={h} value={h}>{hourLabel(h)}</option>
                  ))}
                </select>
              )}
            </div>
            {reminderError && (
              <div style={{ fontSize: '12.5px', color: 'var(--danger)', marginTop: '10px', lineHeight: 1.5 }}>{reminderError}</div>
            )}
          </Card>

          {/* Offline downloads + storage */}
          <OfflineStorageCard accentHex={accentHex} />

          {/* Replay the first-run tour */}
          <TourReplayCard accentHex={accentHex} />

          {/* Community — hidden until a real Discord invite is set in community.js */}
          {isDiscordConfigured() && (
            <Card
              icon={MessagesSquare}
              title="Join the community"
              text="Hanzi Dojo is built with its learners. Trade study tips, report bugs, suggest features, and help shape what we build next."
              accentHex={accentHex}
            >
              <a
                {...externalLinkProps(DISCORD_INVITE_URL)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  height: '40px', padding: '0 16px', borderRadius: '12px',
                  border: '1px solid ' + accentHex + '40', background: accentHex + '10',
                  color: accentHex, fontSize: '13px', fontWeight: 750,
                  fontFamily: 'Inter, sans-serif', textDecoration: 'none',
                }}
              >
                <MessagesSquare size={16} strokeWidth={2} color={accentHex} />
                Join our Discord
                <ArrowUpRight size={15} strokeWidth={2} color={accentHex} />
              </a>
            </Card>
          )}

          {/* Build stamp — confirms which version is running. */}
          <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-faint)', fontWeight: 600, marginTop: '4px' }}>
            Version <span style={{ fontFamily: 'ui-monospace, monospace' }}>{buildLabel()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// A quiet row that clears the tour's seen state (tour.js) so the coach marks
// show once more on Home and Stories — for anyone who skipped too fast.
function TourReplayCard({ accentHex }) {
  const [done, setDone] = useState(false)
  const replay = () => { resetTourSeen().then(() => setDone(true)) }
  return (
    <Card
      icon={Compass}
      title="App tour"
      text="The short walkthrough that points out where things live on Home and Stories."
      accentHex={accentHex}
    >
      <button
        onClick={replay}
        disabled={done}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          height: '40px', padding: '0 16px', borderRadius: '12px',
          border: '1px solid var(--border)', background: 'var(--surface-2)',
          color: 'var(--text)', fontSize: '13px', fontWeight: 700,
          fontFamily: 'Inter, sans-serif', cursor: done ? 'default' : 'pointer',
        }}
      >
        {done
          ? <><CheckCircle2 size={16} strokeWidth={2} color="#2F9E6D" /> It will show again on your next visit</>
          : <><Compass size={16} strokeWidth={2} /> Replay the app tour</>}
      </button>
    </Card>
  )
}

function OfflineStorageCard({ accentHex }) {
  const [stats, setStats] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [cleared, setCleared] = useState(false)

  async function load() {
    const [clips, est, pend] = await Promise.all([audioCount(), estimateStorage(), pendingWrites()])
    setStats({ clips, usage: est && typeof est.usage === 'number' ? est.usage : null, pending: pend })
  }
  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [])

  if (!offlineAvailable()) return null

  const doClear = async () => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
      return
    }
    setConfirming(false)
    await clearDownloads()
    setCleared(true)
    load()
  }

  const mb = stats && stats.usage != null ? (stats.usage / (1024 * 1024)).toFixed(1) + ' MB' : null
  const rows = []
  if (mb) rows.push('About ' + mb + ' stored on this device')
  if (stats) rows.push(stats.clips + ' pronunciation clip' + (stats.clips === 1 ? '' : 's') + ' saved for offline')
  if (stats && stats.pending > 0) rows.push(stats.pending + ' review' + (stats.pending === 1 ? '' : 's') + ' waiting to sync (kept when you clear)')

  return (
    <Card
      icon={HardDrive}
      title="Offline storage"
      text="Reviews, stories and audio are cached on this device so the app works without a connection. Clearing frees space — your progress and any unsynced reviews are kept."
      accentHex={accentHex}
    >
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '14px' }}>
        {stats ? rows.map((r, i) => <div key={i}>{r}</div>) : 'Checking…'}
      </div>
      <button
        onClick={doClear}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          height: '40px', padding: '0 16px', borderRadius: '12px', cursor: 'pointer',
          border: '1px solid ' + (confirming ? '#DC262655' : 'var(--border)'),
          background: confirming ? '#DC26260D' : 'var(--surface-2)',
          color: confirming ? '#DC2626' : 'var(--text)',
          fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
        }}
      >
        {cleared
          ? <><CheckCircle2 size={16} strokeWidth={2} color="#2F9E6D" /> Cleared</>
          : <><Trash2 size={16} strokeWidth={2} /> {confirming ? 'Tap again to clear' : 'Clear downloaded data'}</>}
      </button>
    </Card>
  )
}

function Card({ icon: Icon, title, text, accentHex, children }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: '20px',
      border: '1px solid var(--border)', boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
      padding: '22px 24px', display: 'flex', alignItems: 'flex-start', gap: '16px',
    }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '15px',
        background: accentHex + '10', border: '1px solid ' + accentHex + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={21} strokeWidth={1.85} color={accentHex} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 850, color: 'var(--text)', marginBottom: '5px' }}>{title}</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: '14px' }}>{text}</div>
        {children}
      </div>
    </div>
  )
}

function Segmented({ value, onChange, options, accentHex, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', gap: '8px', background: 'var(--surface-2)', padding: '4px', borderRadius: '12px' }}>
      {options.map(opt => {
        const active = value === opt.key
        const Icon = opt.icon
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '8px 16px', borderRadius: '9px', cursor: 'pointer',
              border: '1px solid ' + (active ? accentHex + '40' : 'transparent'),
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
              boxShadow: active ? '0 1px 4px rgba(24,24,27,0.08)' : 'none',
            }}
          >
            <Icon size={16} strokeWidth={2} color={active ? accentHex : 'var(--text-muted)'} />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// A stack of named presets as a real radio group: a fieldset/legend for the
// group name, native radios so arrow keys move between choices and screen
// readers announce "2 of 3", and the trade-off spelled out on every option.
function PresetChoice({ legend, name, value, onChange, options, accentHex }) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
      <legend style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        {legend}
      </legend>
      {options.map(opt => {
        const active = value === opt.value
        return (
          <label
            key={opt.key}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '11px',
              padding: '12px 14px', borderRadius: '13px', cursor: 'pointer',
              border: '1px solid ' + (active ? accentHex + '55' : 'var(--border)'),
              background: active ? accentHex + '0D' : 'var(--surface-2)',
            }}
          >
            <input
              type="radio"
              name={name}
              value={opt.key}
              checked={active}
              onChange={() => onChange(opt.value)}
              style={{ marginTop: '3px', accentColor: accentHex, width: '16px', height: '16px', flexShrink: 0, cursor: 'pointer' }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, color: 'var(--text)' }}>
                {opt.label}
              </span>
              <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.55, marginTop: '2px' }}>
                {opt.blurb}
              </span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

function Toggle({ checked, onChange, accentHex, disabled, label }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      aria-pressed={checked}
      aria-label={label}
      disabled={disabled}
      style={{
        width: '50px', height: '28px', borderRadius: '999px', position: 'relative',
        border: '1px solid ' + (checked ? accentHex : 'var(--border)'),
        background: checked ? accentHex : 'var(--surface-2)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
        transition: 'background 160ms ease, border-color 160ms ease', padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: '2px', left: checked ? '24px' : '2px',
        width: '22px', height: '22px', borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 160ms ease',
      }} />
    </button>
  )
}
