import { Fragment, useState } from 'react'
import { getLevelLabel, getSystemLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { Layers, BookOpen, Play, PenLine, ArrowRight, Sunrise, MessagesSquare, Check } from 'lucide-react'
import { isReturningFromBreak, gentleReturnMessage, GENTLE_REVIEW_CAP } from './gentleReturn'
import { DISCORD_INVITE_URL, isDiscordConfigured } from './community'
import EnsoRing from './EnsoRing'
import { dojoProgress } from './enso'

// Ink palette for the three queue states. Earth tones drawn from the dojo
// identity (the language accent, an amber ink, the nav sage) rather than the
// default blue/orange/mint dashboard triad — they sit together instead of
// competing.
const AMBER_INK = '#C2803B'
const SAGE_INK = '#4F6047'

// Small caps eyebrow used for every secondary label on the screen. One rule,
// applied consistently, is most of what makes a layout feel authored.
const MICRO = {
  fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: 'var(--text-faint)',
}

const NUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }

// Shared card chrome: themed surface, a lit top edge, and a two-layer shadow.
function panelStyle({ hovered = false, accentHex, padding }) {
  return {
    position: 'relative',
    background: 'var(--surface)',
    borderRadius: '20px',
    border: '1px solid ' + (hovered ? accentHex + '4D' : 'var(--border)'),
    boxShadow: (hovered ? 'var(--shadow-2)' : 'var(--shadow-1)') + ', inset 0 1px 0 var(--hairline)',
    padding,
    overflow: 'hidden',
  }
}

function FlowStep({ icon, label, index, accentHex, accentInk, active, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = icon
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hd-flow-step hd-press"
      aria-current={active ? 'step' : undefined}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px',
        padding: '4px 2px', border: 'none', background: 'transparent',
        cursor: 'pointer', fontFamily: 'Inter, sans-serif', width: '74px', flexShrink: 0,
      }}
    >
      <div
        className="hd-flow-tile"
        style={{
          width: '46px', height: '46px', borderRadius: '15px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: active ? accentHex : `color-mix(in srgb, ${accentHex} 9%, var(--surface))`,
          border: '1px solid ' + (active ? accentHex : `color-mix(in srgb, ${accentHex} 22%, var(--border))`),
          boxShadow: active ? `0 6px 16px -8px ${accentHex}` : 'none',
        }}
      >
        <Icon size={20} strokeWidth={1.8} color={active ? '#fff' : accentInk} />
      </div>
      <span style={{
        fontSize: '11.5px', fontWeight: active ? 750 : 550, textAlign: 'center',
        color: active ? 'var(--text)' : (hovered ? 'var(--text)' : 'var(--text-muted)'),
        transition: 'color 150ms ease',
      }}>
        {label}
      </span>
      <span style={{ ...MICRO, ...NUM, fontSize: '9px', letterSpacing: '0.1em', opacity: active ? 1 : 0.55, color: active ? accentInk : 'var(--text-faint)' }}>
        {'0' + index}
      </span>
    </button>
  )
}

// The rail between two flow steps. Filled behind steps the learner has passed.
function FlowLink({ done, accentHex }) {
  return (
    <div aria-hidden style={{
      flex: 1, height: '2px', marginTop: '26px', borderRadius: '2px', minWidth: '8px',
      background: done ? `color-mix(in srgb, ${accentHex} 45%, transparent)` : 'var(--border)',
    }} />
  )
}

// One of the three queue readouts. No pastel block — a colored tick, a tabular
// number and a label, separated by hairlines.
function QueueStat({ label, value, color, first }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, paddingLeft: first ? 0 : '18px',
      borderLeft: first ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
        <span aria-hidden style={{ width: '3px', height: '11px', borderRadius: '2px', background: color, flexShrink: 0 }} />
        <span style={{ ...MICRO, color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div style={{ ...NUM, fontSize: '30px', fontWeight: 700, lineHeight: 1, color, letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
  )
}

export default function Home({ profile, track, counts, onNavigate }) {
  const [dojoHovered, setDojoHovered] = useState(false)
  const [discordHovered, setDiscordHovered] = useState(false)
  const isMobile = useIsMobile()

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  // Every place the accent is used as INK (text, the ensō itself) goes
  // through ink() so it lifts on dark surfaces; tints and borders keep the
  // raw hex, since they already mix into the themed surface.
  const accentInk = ink(accentHex)
  const langChars = theme.nativeName
  const langFont = theme.font
  const systemLabel = getSystemLabel(track.system)
  const levelSuffix = getLevelLabel(profile.active_language, track.system, track.current_level)

  const totalDue = counts.newCount + counts.learnCount + counts.dueCount

  // Daily new-card goal progress.
  const goal = profile.daily_new_cards || 0
  const doneToday = counts.newDoneToday || 0
  const goalComplete = goal > 0 && doneToday >= goal
  const noNewLeft = !goalComplete && counts.newCount === 0

  // How far the ensō has closed: cards cleared today over the whole of today's
  // ask. Nothing due reads as a finished circle, not an empty one.
  const progress = dojoProgress({ done: doneToday, remaining: totalDue })

  // Gentle return: after a break, Study caps the overdue backlog to a calm
  // handful. Surface a warm welcome-back banner only when that cap actually bites
  // (a real backlog), so a small return doesn't get a needless message.
  const gentleReady = Math.min(counts.dueCount || 0, GENTLE_REVIEW_CAP)
  const gentleActive = isReturningFromBreak(profile) && (counts.dueCount || 0) > GENTLE_REVIEW_CAP

  // Guided "next step" in the daily loop: clear the flashcard queue first, then
  // move to reading immersion. This turns Home from a menu into a coach.
  const rec = totalDue > 0
    ? {
        key: 'study', label: 'Review & unlock', icon: Layers,
        reason: totalDue + ' card' + (totalDue === 1 ? '' : 's') + ' to clear — then read what you know',
      }
    : {
        key: 'stories', label: 'Read a story', icon: BookOpen,
        reason: 'Queue clear — read a story to lock today’s words in',
      }

  const flow = [
    { key: 'study', label: 'Flashcards', icon: Layers },
    { key: 'stories', label: 'Stories', icon: BookOpen },
    { key: 'youtube', label: 'Videos', icon: Play },
    { key: 'writing', label: 'Writing', icon: PenLine },
  ]
  const activeIndex = flow.findIndex(s => s.key === rec.key)

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: isMobile ? '28px 16px 40px' : '52px 32px 60px' }}>

      {/* ── Header: language identity ── the native script is the mark, so it
          gets the accent, its own face, and a hairline rule that carries the
          level metadata out to the edge. ── */}
      <div className="hd-rise" style={{ marginBottom: isMobile ? '26px' : '34px' }}>
        <div style={{
          fontSize: isMobile ? '44px' : '54px', fontWeight: 700, color: accentInk,
          lineHeight: 1, fontFamily: langFont, letterSpacing: '-0.02em',
        }}>
          {langChars}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
          <span style={{ ...MICRO, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {systemLabel} · {levelSuffix}
          </span>
          <span aria-hidden style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        </div>
      </div>

      {/* ── Welcome back (gentle return) ── */}
      {gentleActive && (
        <div
          role="status"
          aria-live="polite"
          className="hd-rise"
          style={{
            display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px',
            background: `color-mix(in srgb, ${accentHex} 7%, var(--surface))`,
            border: '1px solid ' + `color-mix(in srgb, ${accentHex} 26%, var(--border))`,
            borderLeft: `3px solid ${accentHex}`,
            borderRadius: '14px', padding: isMobile ? '14px 16px' : '15px 20px',
            animationDelay: '60ms',
          }}
        >
          <Sunrise size={20} strokeWidth={1.9} color={accentInk} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '13.5px', color: 'var(--text)', fontWeight: 550, lineHeight: 1.5 }}>
            {gentleReturnMessage(gentleReady)}
          </span>
        </div>
      )}

      {/* ── Today card ── the whole card is tappable, so starting today's
          cards is always one obvious tap away. ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onNavigate(rec.key)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(rec.key) } }}
        onMouseEnter={() => setDojoHovered(true)}
        onMouseLeave={() => setDojoHovered(false)}
        className="hd-press hd-rise"
        style={{
          ...panelStyle({ hovered: dojoHovered, accentHex, padding: isMobile ? '26px 20px 22px' : '32px 34px 26px' }),
          marginBottom: '18px', cursor: 'pointer', animationDelay: '80ms',
        }}
      >
        {/* A single soft wash behind the ring, so the ensō sits in light rather
            than on a flat white rectangle. */}
        <div aria-hidden style={{
          position: 'absolute', top: '-90px', left: isMobile ? '50%' : '-40px',
          transform: isMobile ? 'translateX(-50%)' : 'none',
          width: '320px', height: '320px', borderRadius: '50%', pointerEvents: 'none',
          background: `radial-gradient(circle, color-mix(in srgb, ${accentHex} 9%, transparent) 0%, transparent 68%)`,
        }} />

        <div style={{
          position: 'relative',
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          alignItems: 'center', gap: isMobile ? '18px' : '30px',
        }}>
          {/* The ensō: closes as today's queue is cleared. */}
          <EnsoRing size={isMobile ? 132 : 152} pct={progress.pct} color={accentInk}>
            {totalDue > 0 ? (
              <>
                <span style={{ ...NUM, fontSize: isMobile ? '34px' : '38px', fontWeight: 700, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.03em' }}>
                  {totalDue}
                </span>
                <span style={{ ...MICRO, fontSize: '9.5px' }}>to clear</span>
              </>
            ) : (
              <>
                <Check size={isMobile ? 30 : 34} strokeWidth={2.4} color={accentInk} />
                <span style={{ ...MICRO, fontSize: '9.5px', marginTop: '4px' }}>circle closed</span>
              </>
            )}
          </EnsoRing>

          <div style={{ flex: 1, minWidth: 0, width: '100%', textAlign: isMobile ? 'center' : 'left' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px',
              justifyContent: isMobile ? 'center' : 'flex-start', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: isMobile ? '21px' : '23px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                Today’s Dojo
              </span>
              {totalDue > 0 ? (
                <span style={{
                  ...MICRO, fontSize: '9.5px', color: accentInk,
                  background: `color-mix(in srgb, ${accentHex} 10%, var(--surface))`,
                  padding: '4px 10px', borderRadius: '999px',
                  border: '1px solid ' + `color-mix(in srgb, ${accentHex} 28%, var(--border))`,
                }}>
                  Cards waiting
                </span>
              ) : (
                <span style={{
                  ...MICRO, fontSize: '9.5px', color: 'var(--text-muted)',
                  background: 'var(--surface-2)', padding: '4px 10px', borderRadius: '999px',
                  border: '1px solid var(--border)',
                }}>
                  All caught up
                </span>
              )}
            </div>

            <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {goalComplete
                ? 'Daily goal complete — nice work.'
                : noNewLeft
                  ? 'No new cards left at this level.'
                  : 'Daily goal: ' + doneToday + ' of ' + goal + ' new cards'}
            </div>

            {/* New / Learning / Due */}
            <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: '20px', textAlign: 'left' }}>
              {[
                { label: 'New', value: counts.newCount, color: accentInk },
                { label: 'Learning', value: counts.learnCount, color: ink(AMBER_INK) },
                { label: 'Due', value: counts.dueCount, color: ink(SAGE_INK) },
              ].map(({ label, value, color }, i) => (
                <QueueStat key={label} label={label} value={value} color={color} first={i === 0} />
              ))}
            </div>
          </div>
        </div>

        {/* Next-step footer — reads as the card's own action bar rather than a
            nested button (the whole card navigates). */}
        <div style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: '12px',
          marginTop: isMobile ? '20px' : '24px', paddingTop: '16px',
          borderTop: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...MICRO, marginBottom: '4px' }}>Next up</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{rec.label}</div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.45 }}>{rec.reason}</div>
          </div>
          <div style={{
            width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: dojoHovered ? accentHex : `color-mix(in srgb, ${accentHex} 10%, var(--surface))`,
            border: '1px solid ' + (dojoHovered ? accentHex : `color-mix(in srgb, ${accentHex} 24%, var(--border))`),
            transform: dojoHovered ? 'translateX(3px)' : 'translateX(0)',
            transition: 'background 180ms ease, transform 180ms cubic-bezier(0.22,1,0.36,1), border-color 180ms ease',
          }}>
            <ArrowRight size={19} strokeWidth={2.2} color={dojoHovered ? '#fff' : accentInk} />
          </div>
        </div>
      </div>

      {/* ── Keep the flow going ── a rail, filled up to where the learner is,
          rather than a row of arrows. ── */}
      <div className="hd-rise" style={{ ...panelStyle({ accentHex, padding: isMobile ? '18px 14px 16px' : '20px 26px 18px' }), animationDelay: '160ms' }}>
        <div style={{ ...MICRO, marginBottom: '14px' }}>Your daily loop</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          {flow.map((step, i) => (
            <Fragment key={step.key}>
              {i > 0 && <FlowLink done={i <= activeIndex} accentHex={accentHex} />}
              <FlowStep
                icon={step.icon}
                label={step.label}
                index={i + 1}
                accentHex={accentHex}
                accentInk={accentInk}
                active={i === activeIndex}
                onClick={() => onNavigate(step.key)}
              />
            </Fragment>
          ))}
        </div>
      </div>

      {/* ── Community — always-visible Discord entry (hidden until a real invite is set) ── */}
      {isDiscordConfigured() && (
        <a
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => setDiscordHovered(true)}
          onMouseLeave={() => setDiscordHovered(false)}
          className="hd-press hd-rise"
          style={{
            ...panelStyle({ hovered: discordHovered, accentHex: '#5865F2', padding: '16px 20px' }),
            display: 'flex', alignItems: 'center', gap: '14px', marginTop: '14px',
            textDecoration: 'none', fontFamily: 'Inter, sans-serif', animationDelay: '220ms',
          }}
        >
          <div style={{
            width: '42px', height: '42px', borderRadius: '13px', flexShrink: 0,
            background: 'color-mix(in srgb, #5865F2 12%, var(--surface))',
            border: '1px solid color-mix(in srgb, #5865F2 30%, var(--border))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MessagesSquare size={21} strokeWidth={1.9} color="#5865F2" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Join our Discord</div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.45, marginTop: '2px' }}>
              Trade study tips, get help, and help shape what we build next.
            </div>
          </div>
          <ArrowRight
            size={18} strokeWidth={2.1} color="#5865F2"
            style={{ flexShrink: 0, transform: discordHovered ? 'translateX(3px)' : 'none', transition: 'transform 180ms cubic-bezier(0.22,1,0.36,1)' }}
          />
        </a>
      )}
    </div>
  )
}
