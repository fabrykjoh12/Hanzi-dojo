import { useState } from 'react'
import { ChevronRight, Zap } from 'lucide-react'
import StoryCover from './StoryCover'
import { Eyebrow } from './panels'
import { flatPanel } from './designTokens'
import { readableLabel } from './storyBrowse'
import { ink } from './languageTheme'

// The Continue-reading card — the most important object on Stories when the
// learner is mid-series. One vertical cover, the series, where they stand,
// and one action; the WHOLE card is a single semantic button (the Home hero
// pattern: Enter/Space work, the chevron is decorative). What it shows is
// resolved by storyContinue.js — this file only renders the model.

const EYEBROWS = {
  'continue': 'Continue reading',
  'session-locked': 'Today’s story reward',
  'unlocked-today': 'Chapter unlocked',
  'start-here': 'Start here',
}

// The chapter line: where the learner stands in the unit. A manhua episode
// announces itself natively (第三话); a fresh multi-chapter unit sells its
// size; a standalone just names its length via the state line below.
function chapterLine(card) {
  const pos = card.total > 1
    ? (card.progress ? 'Chapter ' + card.chapterNumber + ' of ' + card.total : card.total + ' chapters')
    : null
  // A fresh pick sells its size, not a chapter it hasn't started.
  if (card.kind === 'start-here' && !card.progress) return pos
  const title = card.chapterTitle && card.chapterTitle !== card.seriesTitle ? card.chapterTitle : null
  if (card.nativeLabel) return [card.nativeLabel, title].filter(Boolean).join(' · ')
  return [pos, title].filter(Boolean).join(' · ') || null
}

function stateLine(card) {
  if (card.kind === 'session-locked') return 'Complete today’s session to unlock'
  return [readableLabel(card.knownPct), card.minutes ? card.minutes + ' min' : null]
    .filter(Boolean).join(' · ') || null
}

export default function StoryContinueCard({ card, accentHex, fontFamily, isMobile, onAction }) {
  const [hovered, setHovered] = useState(false)
  const locked = card.kind === 'session-locked'
  const chapter = chapterLine(card)
  const state = stateLine(card)
  const label = [
    EYEBROWS[card.kind] || 'Continue reading',
    card.seriesTitle,
    chapter,
    state,
  ].filter(Boolean).join(' · ')
  return (
    <button
      onClick={onAction}
      aria-label={label}
      data-tour="stories-hero"
      data-continue-card={card.kind}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="hd-rise hd-press"
      style={{
        ...flatPanel({ radius: 20, padding: isMobile ? '14px' : '16px 18px' }),
        display: 'flex', alignItems: 'stretch', gap: isMobile ? '14px' : '18px',
        width: '100%', textAlign: 'left', cursor: 'pointer',
        fontFamily: 'Inter, sans-serif', color: 'var(--text)',
        borderColor: hovered ? accentHex + '55' : 'var(--border)',
        boxShadow: hovered
          ? '0 14px 30px rgba(24,24,27,0.12), inset 0 1px 0 var(--hairline)'
          : 'var(--shadow-1), inset 0 1px 0 var(--hairline)',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        margin: '0 0 26px',
      }}
    >
      <StoryCover
        story={card.chapter} path={card.chapter && card.chapter.image_path}
        accent={accentHex} radius={12} loading="eager"
        style={{
          width: isMobile ? '92px' : '104px', aspectRatio: '2 / 3', flexShrink: 0,
          border: '1px solid var(--border)', alignSelf: 'center',
          filter: locked ? 'saturate(0.55)' : 'none',
        }}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '5px' }}>
        <Eyebrow style={{ color: ink(accentHex) }}>{EYEBROWS[card.kind]}</Eyebrow>
        <div style={{
          fontFamily: fontFamily + ', Inter, sans-serif', fontSize: isMobile ? '19px' : '22px',
          fontWeight: 750, lineHeight: 1.25, letterSpacing: '-0.015em',
          display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden',
        }}>
          {card.seriesTitle}
        </div>
        {chapter && (
          <div style={{
            fontSize: '13px', fontWeight: 650, color: 'var(--text-muted)', fontFamily,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {chapter}
          </div>
        )}
        {state && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', fontWeight: 700, minWidth: 0,
            color: locked ? ink(accentHex) : 'var(--text-muted)',
            whiteSpace: locked ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {locked && <Zap size={13} strokeWidth={2.3} aria-hidden="true" />}
            {state}
          </div>
        )}
      </div>
      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <ChevronRight size={20} strokeWidth={2.1} color={hovered ? ink(accentHex) : 'var(--text-faint)'} />
      </div>
    </button>
  )
}
