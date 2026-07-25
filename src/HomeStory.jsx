import { useEffect, useState } from 'react'
import { ArrowRight, Sunrise } from 'lucide-react'
import { getLevelLabel } from './utils'
import { languageTheme, ink } from './languageTheme'
import { useIsMobile } from './useIsMobile'
import { isReturningFromBreak, gentleReturnMessage, GENTLE_REVIEW_CAP } from './gentleReturn'
import { getDailyStoryCard, firstContentChar } from './homeStory'
import InkWash from './InkWash'

// ── Story-first Home ──────────────────────────────────────────────────────
// An alternative to the ensō Home, from a design conversation. The thesis it
// encodes is the product's own: "every word you learn becomes part of a story
// you can read." So the hero is the STORY you have unlocked, and the card
// queue becomes the means rather than the headline.
//
// Three rules carried over from that proposal, and one deliberate departure:
//
//   1. One block gets atmosphere; everything else stays flat. The ink-wash
//      landscape lives INSIDE the hero panel only. If it sat behind the whole
//      page, the readouts below would have to fight it — which is exactly the
//      problem the app has today with its full-page background.
//   2. Atmosphere stays under ~12% opacity. Past that it stops being texture
//      and starts competing with the text on top of it.
//   3. The wash is tinted into the palette, not photographic — it is drawn
//      from the language's own accent, so it cannot clash.
//
//   DEPARTURE: the proposal gave the two stat blocks their own buttons
//   ("Review now" / "Learn them"), which puts three competing calls to action
//   on the screen. The app's stated principle is one next action — Home is a
//   coach, not a menu (README, and CLAUDE.md records it as a past decision).
//   So the stats are readouts here, and the single primary button adapts:
//   it clears the queue first when cards are due, and opens the story when
//   they are not. The story stays the hero either way — it is the "why".

const MICRO = {
  fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.14em',
  textTransform: 'uppercase',
}
const NUM = { fontVariantNumeric: 'tabular-nums' }

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// A flat readout — a number and what it means. No button: the primary action
// lives in the hero, and two more here would make this a menu again.
function Readout({ value, label, tone, first, isMobile }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      padding: isMobile ? '14px 0 14px 14px' : '16px 0 16px 20px',
      borderLeft: first ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ ...NUM, fontSize: isMobile ? '26px' : '30px', fontWeight: 700, lineHeight: 1, color: tone, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.35 }}>
        {label}
      </div>
    </div>
  )
}

export default function HomeStory({ profile, track, counts, session, onNavigate }) {
  const isMobile = useIsMobile()
  const [hovered, setHovered] = useState(false)
  const [daily, setDaily] = useState(undefined) // undefined = loading, null = none

  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const accentInk = ink(accentHex)
  const langFont = theme.font

  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)
  const nextLevelLabel = getLevelLabel(profile.active_language, track.system, track.current_level + 1)

  const totalDue = counts.newCount + counts.learnCount + counts.dueCount
  const learned = counts.learnedCount || 0
  const totalWords = counts.totalWords || 0
  const pct = totalWords > 0 ? Math.min(100, Math.round((learned / totalWords) * 100)) : 0

  const gentleReady = Math.min(counts.dueCount || 0, GENTLE_REVIEW_CAP)
  const gentleActive = isReturningFromBreak(profile) && (counts.dueCount || 0) > GENTLE_REVIEW_CAP

  // Mark the document while this variant is mounted so the page-wide
  // background wash can step back (index.css). A DOM side effect, mirroring
  // how App.jsx applies the theme attribute.
  useEffect(() => {
    document.documentElement.setAttribute('data-home', 'story')
    return () => document.documentElement.removeAttribute('data-home')
  }, [])

  const userId = session?.user?.id
  useEffect(() => {
    let alive = true
    if (!userId) return undefined
    getDailyStoryCard(userId, track, learned).then(res => { if (alive) setDaily(res) })
    return () => { alive = false }
  }, [userId, track, learned])

  // One action. Clear the queue first when there is one; otherwise read.
  const queueFirst = totalDue > 0
  const action = queueFirst
    ? { label: 'Review ' + totalDue + ' first', go: 'study' }
    : { label: 'Start reading', go: 'stories' }

  const today = new Date()

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: isMobile ? '24px 16px 40px' : '44px 32px 60px' }}>

      {/* ── Eyebrow: what day it is, where you are ── */}
      <div className="hd-rise" style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: '12px', marginBottom: '16px',
      }}>
        <span style={{ fontSize: '19px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Today
        </span>
        <span style={{ ...MICRO, color: 'var(--text-faint)' }}>
          {levelLabel} · {WEEKDAY[today.getDay()]}
        </span>
      </div>

      {/* ── Welcome back ── */}
      {gentleActive && (
        <div role="status" aria-live="polite" className="hd-rise" style={{
          display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px',
          background: `color-mix(in srgb, ${accentHex} 7%, var(--surface))`,
          border: '1px solid color-mix(in srgb, ' + accentHex + ' 26%, var(--border))',
          borderLeft: `3px solid ${accentHex}`, borderRadius: '14px',
          padding: '14px 16px', animationDelay: '40ms',
        }}>
          <Sunrise size={20} strokeWidth={1.9} color={accentInk} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '13.5px', color: 'var(--text)', fontWeight: 550, lineHeight: 1.5 }}>
            {gentleReturnMessage(gentleReady)}
          </span>
        </div>
      )}

      {/* ── THE HERO — the only block with atmosphere ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onNavigate(action.go)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(action.go) } }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="hd-press hd-rise"
        style={{
          position: 'relative', overflow: 'hidden', cursor: 'pointer',
          borderRadius: '22px', padding: isMobile ? '20px 20px 22px' : '26px 28px 26px',
          // Deep, saturated ground in the LANGUAGE's own accent — not a fixed
          // clay, so Japanese reads indigo and Russian reads blue.
          background: `linear-gradient(160deg,
            color-mix(in srgb, ${accentHex} 88%, #17110E) 0%,
            color-mix(in srgb, ${accentHex} 70%, #17110E) 100%)`,
          boxShadow: hovered
            ? `0 18px 40px -18px color-mix(in srgb, ${accentHex} 70%, transparent)`
            : `0 10px 28px -18px color-mix(in srgb, ${accentHex} 60%, transparent)`,
          marginBottom: '14px',
        }}
      >
        {/* Contained atmosphere: ink-wash ridgelines, cream on the accent
            ground, at 9% — texture, not photography. */}
        <InkWash seed={track.language} opacity={0.09} />

        {/* The story's own character, oversized and barely there. */}
        {daily?.sentence && (
          <span aria-hidden style={{
            position: 'absolute', right: isMobile ? '-6px' : '8px', bottom: isMobile ? '-26px' : '-34px',
            fontFamily: langFont, fontSize: isMobile ? '116px' : '146px', lineHeight: 0.8,
            fontWeight: 700, color: 'rgba(255,255,255,0.09)', pointerEvents: 'none', userSelect: 'none',
          }}>
            {firstContentChar(daily.sentence)}
          </span>
        )}

        <div style={{ position: 'relative' }}>
          <span style={{ ...MICRO, color: 'rgba(255,255,255,0.62)' }}>
            {daily === null ? 'Your first words' : 'Unlocked and waiting'}
          </span>

          <div style={{
            fontFamily: langFont, color: '#fff',
            fontSize: isMobile ? '25px' : '31px', fontWeight: 600, lineHeight: 1.32,
            letterSpacing: '0.01em', margin: '10px 0 8px', maxWidth: '17ch',
            minHeight: isMobile ? '33px' : '41px',
          }}>
            {daily === undefined ? '' : daily === null ? 'Learn a few words to unlock your first story' : daily.sentence}
          </div>

          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
            {daily === undefined
              ? ' '
              : daily === null
                ? 'Stories open up as soon as you know enough words to enjoy them.'
                : daily.story.title + ' · you know ' + daily.knownPct + '% of it'}
          </div>

          {/* The single call to action. */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            marginTop: '18px', padding: '10px 16px', borderRadius: '11px',
            background: hovered ? '#fff' : 'rgba(255,255,255,0.14)',
            border: '1px solid rgba(255,255,255,0.28)',
            color: hovered ? accentHex : '#fff',
            fontSize: '13.5px', fontWeight: 700,
            transition: 'background 180ms ease, color 180ms ease',
          }}>
            {action.label}
            <ArrowRight size={16} strokeWidth={2.4} style={{ transform: hovered ? 'translateX(3px)' : 'none', transition: 'transform 180ms cubic-bezier(0.22,1,0.36,1)' }} />
          </span>
        </div>
      </div>

      {/* ── Flat readouts. No buttons — the hero owns the action. ── */}
      <div className="hd-rise" style={{
        display: 'flex', background: 'var(--surface)', borderRadius: '16px',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-1), inset 0 1px 0 var(--hairline)',
        padding: isMobile ? '0 14px' : '0 20px', marginBottom: '14px',
        animationDelay: '80ms',
      }}>
        <Readout first value={counts.dueCount + counts.learnCount} label="words due for review" tone={accentInk} isMobile={isMobile} />
        <Readout value={counts.newCount} label="new words today" tone="var(--text)" isMobile={isMobile} />
      </div>

      {/* ── Progress toward the next level ── */}
      <div className="hd-rise" style={{
        background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-1), inset 0 1px 0 var(--hairline)',
        padding: isMobile ? '16px 16px 14px' : '18px 20px 16px', animationDelay: '140ms',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
          <span style={{ fontSize: '13.5px', fontWeight: 650, color: 'var(--text)' }}>
            Toward {nextLevelLabel}
          </span>
          <span style={{ ...NUM, fontSize: '12.5px', color: 'var(--text-muted)' }}>
            {learned} of {totalWords} words
          </span>
        </div>

        <div
          role="img"
          aria-label={learned + ' of ' + totalWords + ' words learned toward ' + nextLevelLabel + ' — ' + pct + '%'}
          style={{ height: '5px', borderRadius: '999px', background: 'var(--surface-2)', overflow: 'hidden' }}
        >
          <div style={{
            width: pct + '%', height: '100%', borderRadius: '999px',
            background: accentInk, transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
          }} />
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '10px', textAlign: 'center' }}>
          {counts.learnCount} learning
          {counts.dueTomorrow > 0 && ' · about ' + counts.dueTomorrow + ' due tomorrow'}
        </div>
      </div>
    </div>
  )
}
