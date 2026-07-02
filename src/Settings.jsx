import { useState } from 'react'
import { supabase } from './supabase'
import {
  Palette, SlidersHorizontal, Sun, Moon, Keyboard, Eye,
  Volume2, BookOpenCheck, Gauge, Bell,
} from 'lucide-react'
import { useIsMobile } from './useIsMobile'
import { useTheme } from './ThemeContext'
import { languageTheme } from './languageTheme'
import { pushSupported, enableReminders, disableReminders, setReminderHour } from './push'

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

export default function Settings({ session, profile, onUpdate }) {
  const { accentHex, isJapanese } = getLanguageDetails(profile)
  const isMobile = useIsMobile()
  const { theme, setTheme } = useTheme()
  const [reminderBusy, setReminderBusy] = useState(false)
  const [reminderError, setReminderError] = useState(null)

  // Defensive reads so the UI works even before the prefs migration is applied.
  const recallMode = profile.recall_mode === 'typed' ? 'typed' : 'flip'
  const audioAutoplay = profile.audio_autoplay !== false
  const furiganaDefault = profile.furigana_default !== false
  const audioSpeed = profile.audio_speed === 0.75 || profile.audio_speed === 0.5 ? profile.audio_speed : 1
  const remindersOn = profile.reminder_enabled === true
  const localHour = utcHourToLocal(
    typeof profile.reminder_hour_utc === 'number' ? profile.reminder_hour_utc : localHourToUtc(9)
  )

  // Persist a single preference column (best-effort) and reflect it live.
  const savePref = (patch) => {
    if (onUpdate) onUpdate(patch)
    if (session) {
      supabase.from('profiles').update(patch).eq('id', session.user.id).then(() => {})
    }
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
        <div style={{
          width: '68px', height: '68px', borderRadius: '22px',
          background: accentHex + '10', border: '1px solid ' + accentHex + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px',
        }}>
          <SlidersHorizontal size={32} strokeWidth={1.75} color={accentHex} />
        </div>

        <div style={{ color: accentHex, fontSize: '13px', fontWeight: 850, marginBottom: '10px' }}>
          Preferences
        </div>
        <h1 style={{ margin: 0, fontSize: '38px', lineHeight: 1.1, fontWeight: 850, color: 'var(--text)' }}>
          Settings
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.65, margin: '12px 0 30px', maxWidth: '560px' }}>
          Tune how studying feels. Daily goal and reset controls live in Profile.
        </p>

        <div style={{ display: 'grid', gap: '14px' }}>
          {/* Appearance */}
          <Card icon={Palette} title="Appearance" text="Choose a light or dark theme for the whole app." accentHex={accentHex}>
            <Segmented
              accentHex={accentHex}
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
              value={recallMode}
              onChange={(v) => savePref({ recall_mode: v })}
              options={[
                { key: 'flip', label: 'Flip', icon: Eye },
                { key: 'typed', label: 'Typed', icon: Keyboard },
              ]}
            />
          </Card>

          {/* Audio autoplay */}
          <Card icon={Volume2} title="Audio on flip" text="Automatically play the word's pronunciation when you reveal a card." accentHex={accentHex}>
            <Toggle accentHex={accentHex} checked={audioAutoplay} onChange={(v) => savePref({ audio_autoplay: v })} />
          </Card>

          {/* Audio speed */}
          <Card icon={Gauge} title="Audio speed" text="Playback speed for flashcard pronunciation. The speed toggle on the card changes this too." accentHex={accentHex}>
            <Segmented
              accentHex={accentHex}
              value={audioSpeed}
              onChange={(v) => savePref({ audio_speed: v })}
              options={[
                { key: 1, label: '1×', icon: Gauge },
                { key: 0.75, label: '0.75×', icon: Gauge },
                { key: 0.5, label: '0.5×', icon: Gauge },
              ]}
            />
          </Card>

          {/* Furigana default — Japanese only */}
          {isJapanese && (
            <Card icon={BookOpenCheck} title="Furigana by default" text="Show readings above kanji on the front of Japanese flashcards." accentHex={accentHex}>
              <Toggle accentHex={accentHex} checked={furiganaDefault} onChange={(v) => savePref({ furigana_default: v })} />
            </Card>
          )}

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
                checked={remindersOn}
                onChange={(v) => toggleReminders(v)}
                disabled={reminderBusy || !pushSupported()}
              />
              {remindersOn && (
                <select
                  value={localHour}
                  onChange={(e) => changeReminderHour(Number(e.target.value))}
                  disabled={reminderBusy}
                  style={{
                    height: '36px', padding: '0 10px', borderRadius: '10px',
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
        </div>
      </div>
    </div>
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

function Segmented({ value, onChange, options, accentHex }) {
  return (
    <div style={{ display: 'inline-flex', gap: '8px', background: 'var(--surface-2)', padding: '4px', borderRadius: '12px' }}>
      {options.map(opt => {
        const active = value === opt.key
        const Icon = opt.icon
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
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

function Toggle({ checked, onChange, accentHex, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      aria-pressed={checked}
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
