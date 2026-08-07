import { useState, useEffect, useMemo, useRef } from 'react'
import { fetchPagedSafe } from './supabasePaging'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { cacheSet, cacheGet } from './offline'
import { toast } from './toast'
import { languageTheme } from './languageTheme'
import { HeroPanel, HeroAction, Eyebrow } from './panels'
import { heroSentence } from './homeStory'
import { tiersFor, learnedByLevel, readingGateCount, nextLockedTier } from './storyTiers'
import { isLearned } from './mastery'
import { useIsMobile } from './useIsMobile'
import { todayStr } from './streak'
import { pickDailyStory } from './dailyStory'
import { formatLabel } from './storyFormat'
import { seriesHasMore, standaloneStoryDetails } from './storyShelf'
import { buildFlatShelf, buildNextLevelSection } from './storyShelfFlat'
import { calculateStoryReadability } from './storyReading'
import { stripSceneEmoji } from './sceneReading'
import StoryReader from './StoryReader'
import StoryCover from './StoryCover'
import StoryFormatIcon from './StoryFormatIcon'
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Clock, CloudOff, Layers, Library, Lock, RefreshCw,
} from 'lucide-react'

// Story tier definitions live in ./storyTiers (shared with the post-study
// recap's story matcher). Tiers are keyed by (language, level) — see tiersFor.

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

function getLanguageDetails(profile, track) {
  const language = track.language || profile.active_language
  const t = languageTheme(language)
  return {
    isJapanese: language === 'japanese',
    accentHex: t.accentHex,
    languageName: t.languageName,
    nativeName: t.nativeName,
    fontFamily: t.font,
  }
}


// ─── STYLE HELPERS ─────────────────────────────────────────────────────────

function pageShell() {
  return { minHeight: '100vh', position: 'relative', overflow: 'hidden' }
}

// The selected "category" is a tier *at a level* — the shelf is cumulative, so
// tier 1 of HSK 1 and tier 1 of HSK 2 are different shelves. Returns a COPY of
// the shared tier object (tiersFor memoizes and returns shared instances, so it
// must never be mutated) tagged with the level it belongs to.
function categoryForStory(story, track) {
  if (!story) return null
  const level = story.level == null ? track.current_level : story.level
  const tier = tiersFor(track.language, level).find(c => c.tier === story.tier)
  return tier ? { ...tier, level } : null
}

// ─── SHARED COMPONENTS ─────────────────────────────────────────────────────

function IconButton({ icon: Icon, label, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        minHeight: '44px', padding: '0 14px', borderRadius: '12px',
        border: '1px solid var(--border)',
        background: hovered ? 'var(--surface-2)' : 'var(--surface)',
        color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650,
        fontFamily: 'Inter, sans-serif', cursor: 'pointer',
        transition: 'background 160ms ease, transform 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <Icon size={17} strokeWidth={1.85} color="var(--text-muted)" />
      {label}
    </button>
  )
}

const metaTag = {
  display: 'inline-flex', alignItems: 'center', gap: '3px',
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: '999px', padding: '3px 8px', lineHeight: 1, whiteSpace: 'nowrap',
}

// Small neutral metadata pill used in the card footer.
// The "% known" chip on a card's cover — the one number the flat shelf sorts
// by, so it's shown where the sort is felt. Dot color tracks readability.
function KnownPctChip({ pct }) {
  if (pct == null) return null
  const dot = pct >= 95 ? '#2F9E6D' : pct >= 85 ? '#7BA05B' : '#CA8A04'
  return (
    <div style={{
      position: 'absolute', bottom: '8px', left: '8px', display: 'flex', alignItems: 'center', gap: '5px',
      fontSize: '10.5px', fontWeight: 800, color: '#fff',
      background: 'rgba(24,24,27,0.62)', borderRadius: '999px', padding: '4px 9px', zIndex: 1,
    }}>
      <span aria-hidden="true" style={{ width: '7px', height: '7px', borderRadius: '50%', background: dot }} />
      {pct}% known
    </div>
  )
}

// The calm lock over a cover: dim + a small centered lock. The card stays
// visible (never hidden) — the footer says what it takes to open it.
function CoverLock() {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 1, background: 'rgba(250,250,248,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '38px', height: '38px', borderRadius: '12px', background: 'var(--surface)',
        border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 14px rgba(24,24,27,0.12)',
      }}>
        <Lock size={18} strokeWidth={2} color="var(--text-muted)" />
      </div>
    </div>
  )
}

// ─── NORMALIZED STORY CARD ─────────────────────────────────────────────────

// One template for every story. The chapter page keeps the fuller card; the
// library passes `shelf` for a visual-first cover, title, and one quiet detail
// line so scanning never turns into reading a dashboard.
function StoryCard({ story, read, accentHex, fontFamily, levelLabel, practice, onClick, knownPct = null, locked = false, lockLabel = null, shelf = false }) {
  const [hovered, setHovered] = useState(false)
  const standalone = standaloneStoryDetails(story)
  const lift = hovered && !locked
  return (
    <button
      onClick={locked ? undefined : onClick}
      disabled={locked}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={shelf ? [story.title, levelLabel, practice ? 'Practice' : formatLabel(story), locked ? lockLabel : read ? 'Read' : null].filter(Boolean).join(' · ') : undefined}
      className="hd-press"
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left', width: '100%', padding: 0,
        border: shelf ? 'none' : '1px solid ' + (lift ? accentHex + '55' : 'var(--border)'),
        borderRadius: '16px', overflow: shelf ? 'visible' : 'hidden', cursor: locked ? 'default' : 'pointer',
        background: shelf ? 'transparent' : practice ? accentHex + '0A' : 'var(--surface)',
        boxShadow: shelf ? 'none' : lift ? '0 16px 34px rgba(24,24,27,0.10)' : '0 6px 20px rgba(24,24,27,0.05)',
        transform: lift ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 170ms ease', fontFamily: 'Inter, sans-serif',
        opacity: locked ? 0.78 : 1,
      }}
    >
      <StoryCover
        story={story} path={story.image_path} accent={accentHex} radius={shelf ? 16 : 0}
        style={{
          width: '100%', aspectRatio: '16 / 9',
          border: shelf ? '1px solid ' + (lift ? accentHex + '66' : 'var(--border)') : '1px solid var(--border)',
          boxShadow: shelf ? (lift ? '0 16px 32px rgba(24,24,27,0.16)' : '0 5px 16px rgba(24,24,27,0.08)') : undefined,
          transition: shelf ? 'border-color 170ms ease, box-shadow 170ms ease' : undefined,
        }}
      >
        {read && (
          <div style={{
            position: 'absolute', top: '8px', right: '8px', width: '22px', height: '22px',
            borderRadius: '999px', background: 'var(--success)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', zIndex: 1,
          }}>
            <CheckCircle2 size={14} strokeWidth={2.4} color="#fff" />
          </div>
        )}
        {practice && (
          <div style={{
            position: 'absolute', top: '8px', left: '8px', fontSize: '10.5px', fontWeight: 800,
            color: '#fff', background: 'rgba(24,24,27,0.55)', borderRadius: '999px', padding: '3px 8px', zIndex: 1,
          }}>Practice</div>
        )}
        {standalone && !shelf && (
          <div style={{
            position: 'absolute', top: '8px', left: '8px', display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '10.5px', fontWeight: 800, color: '#fff',
            background: 'rgba(24,24,27,0.62)', borderRadius: '999px', padding: '4px 9px', zIndex: 1,
          }}>
            <BookOpen size={12} strokeWidth={2.2} color="#fff" aria-hidden="true" />
            Complete story
          </div>
        )}
        {!locked && <KnownPctChip pct={knownPct} />}
        {locked && <CoverLock />}
      </StoryCover>
      <div style={{ padding: shelf ? '10px 2px 2px' : '12px 14px 13px', display: 'flex', flexDirection: 'column', gap: shelf ? '4px' : '5px', flex: 1, width: '100%', minWidth: 0 }}>
        {/* Two lines, not one + ellipsis: `title` never fires on touch, so a
            clipped title was unreadable in the app. The reserved height keeps
            the shelf rows aligned whether a title takes one line or two. */}
        <div title={story.title} style={{
          fontSize: '16px', fontWeight: 750, fontFamily, color: 'var(--text)', lineHeight: 1.3,
          display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
          overflow: 'hidden', minHeight: '2.6em',
        }}>
          {story.title}
        </div>
        {!shelf && <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>
          {story.english_summary || '—'}
        </div>}
        {!shelf && standalone && (standalone.chapters || standalone.minutes) && (
          <div
            aria-label={[
              standalone.chapters ? standalone.chapters + ' chapters' : null,
              standalone.minutes ? 'about ' + standalone.minutes + ' minutes' : null,
            ].filter(Boolean).join(', ')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '18px', color: 'var(--text-muted)', fontSize: '11.5px', fontWeight: 700 }}
          >
            {standalone.chapters && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Layers size={13} strokeWidth={2} aria-hidden="true" />
                {standalone.chapters} chapters
              </span>
            )}
            {standalone.minutes && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} strokeWidth={2} aria-hidden="true" />
                {standalone.minutes} min
              </span>
            )}
          </div>
        )}
        {shelf ? (
          <div style={{ fontSize: '12px', fontWeight: 650, color: locked ? 'var(--text-muted)' : read ? 'var(--success)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {locked ? (lockLabel || 'Locked') : [levelLabel, practice ? 'Practice' : formatLabel(story), standalone?.minutes ? standalone.minutes + ' min' : null].filter(Boolean).join(' · ')}
            {read && !locked ? ' · Read' : ''}
          </div>
        ) : <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '3px', flexWrap: 'nowrap' }}>
          <span style={metaTag}>{levelLabel}</span>
          <span style={metaTag}><StoryFormatIcon story={story} size={13} /> {formatLabel(story)}</span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, color: locked ? 'var(--text-muted)' : read ? 'var(--success)' : 'var(--text-faint)', whiteSpace: 'nowrap' }}>
            {locked ? (lockLabel || 'Locked') : read ? 'Read' : 'New'}
          </span>
        </div>}
      </div>
    </button>
  )
}

// ─── FILTER ROW ────────────────────────────────────────────────────────────

// ─── ARC + PRACTICE SECTIONS ───────────────────────────────────────────────

function CardGrid({ children, isMobile }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(210px, 1fr))', gap: '16px' }}>
      {children}
    </div>
  )
}

function shelfItemStyle(isMobile) {
  return {
    flex: isMobile ? '0 0 min(78vw, 320px)' : '0 0 276px',
    scrollSnapAlign: 'start', minWidth: 0,
  }
}

function ShelfRow({ id, title, subtitle, isMobile, children }) {
  const railRef = useRef(null)
  const scroll = (direction) => {
    const rail = railRef.current
    if (!rail) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    rail.scrollBy({ left: direction * Math.max(rail.clientWidth * 0.78, 280), behavior: reduced ? 'auto' : 'smooth' })
  }
  return (
    <section aria-labelledby={id} className="hd-rise" style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '16px', marginBottom: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <h2 id={id} style={{ margin: 0, color: 'var(--text)', fontSize: isMobile ? '18px' : '20px', fontWeight: 800, letterSpacing: '-0.02em' }}>
            {title}
          </h2>
          {subtitle && <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.45 }}>{subtitle}</p>}
        </div>
        {!isMobile && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button type="button" onClick={() => scroll(-1)} aria-label={'Scroll ' + title + ' left'} className="hd-press" style={railArrowStyle}>
              <ChevronLeft size={19} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => scroll(1)} aria-label={'Scroll ' + title + ' right'} className="hd-press" style={railArrowStyle}>
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div
        ref={railRef}
        data-testid="story-shelf-rail"
        data-shelf={id}
        style={{
          display: 'flex', gap: isMobile ? '14px' : '18px', overflowX: 'auto', overflowY: 'visible',
          overscrollBehaviorInline: 'contain', scrollSnapType: 'x proximity', scrollbarWidth: 'thin',
          padding: '4px 3px 18px', margin: '0 -3px', minWidth: 0,
        }}
      >
        {children}
      </div>
    </section>
  )
}

const railArrowStyle = {
  width: '44px', height: '44px', borderRadius: '999px', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer',
}

// Tapping the card RESUMES the series (opens the next unread chapter). The
// chapter-count chip on the cover is a real secondary button that opens the
// chapter list — it's a sibling of the main button (buttons can't nest).
function SeriesCard({ arc, readIds, accentHex, fontFamily, isMobile, onOpen, onOpenChapters, knownPct = null, locked = false, lockLabel = null, shelf = false }) {
  const [hovered, setHovered] = useState(false)
  const readCount = arc.parts.filter(p => readIds.has(p.id)).length
  const total = arc.parts.length
  const done = readCount === total
  const ongoing = seriesHasMore(arc)
  // Open on the cover of where you actually are, not always chapter one.
  const coverStory = arc.parts.find(p => !readIds.has(p.id)) || arc.parts[0]
  const lift = hovered && !locked
  return (
    <div style={{ position: 'relative', paddingRight: shelf ? 0 : '7px', paddingBottom: shelf ? 0 : '7px' }}>
      {/* Stacked edges — decorative, so hidden from the accessibility tree. */}
      {!shelf && <div aria-hidden="true" style={{
        position: 'absolute', top: '7px', left: '7px', right: 0, bottom: 0,
        borderRadius: '16px', background: 'var(--surface)',
        border: '1px solid var(--border)', opacity: 0.55,
      }} />}
      {!shelf && <div aria-hidden="true" style={{
        position: 'absolute', top: '4px', left: '4px', right: '3px', bottom: '3px',
        borderRadius: '16px', background: 'var(--surface)',
        border: '1px solid var(--border)', opacity: 0.8,
      }} />}
      <button
        onClick={locked ? undefined : onOpen}
        disabled={locked}
        aria-label={locked ? arc.title : arc.title + ' — continue reading'}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="hd-press"
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column', textAlign: 'left',
          width: '100%', padding: 0, cursor: locked ? 'default' : 'pointer',
          border: shelf ? 'none' : '1px solid ' + (lift ? accentHex + '55' : 'var(--border)'),
          borderRadius: '16px', overflow: shelf ? 'visible' : 'hidden', background: shelf ? 'transparent' : 'var(--surface)',
          boxShadow: shelf ? 'none' : lift ? '0 16px 34px rgba(24,24,27,0.10)' : '0 6px 20px rgba(24,24,27,0.05)',
          transform: lift ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 170ms ease', fontFamily: 'Inter, sans-serif',
          opacity: locked ? 0.78 : 1,
        }}
      >
        <StoryCover
          story={coverStory} path={coverStory && coverStory.image_path} accent={accentHex} radius={shelf ? 16 : 0}
          style={{
            width: '100%', aspectRatio: '16 / 9',
            border: shelf ? '1px solid ' + (lift ? accentHex + '66' : 'var(--border)') : '1px solid var(--border)',
            boxShadow: shelf ? (lift ? '0 16px 32px rgba(24,24,27,0.16)' : '0 5px 16px rgba(24,24,27,0.08)') : undefined,
            transition: shelf ? 'border-color 170ms ease, box-shadow 170ms ease' : undefined,
          }}
        >
          {done && (
            <div style={{
              position: 'absolute', top: '8px', right: '8px', width: '22px', height: '22px',
              borderRadius: '999px', background: 'var(--success)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', zIndex: 1,
            }}>
              <CheckCircle2 size={14} strokeWidth={2.4} color="#fff" />
            </div>
          )}
          {!locked && <KnownPctChip pct={knownPct} />}
          {locked && <CoverLock />}
        </StoryCover>
        <div style={{ padding: shelf ? '10px 2px 2px' : '12px 14px 13px', display: 'flex', flexDirection: 'column', gap: shelf ? '5px' : '7px', flex: 1, width: '100%', minWidth: 0 }}>
          <div title={arc.title} style={{
            fontSize: isMobile ? '15px' : '16px', fontWeight: 750, fontFamily, color: 'var(--text)', lineHeight: 1.3,
            display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
            overflow: 'hidden', minHeight: '2.6em',
          }}>
            {arc.title}
          </div>
          {locked
            ? <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)' }}>{lockLabel || 'Locked'}</div>
            : <SeriesProgress readCount={readCount} total={total} accentHex={accentHex} ongoing={ongoing} />}
        </div>
      </button>
      {/* Secondary action: the chapter list. Sits over the cover's top-left. */}
      {onOpenChapters && !locked && (
        <button
          onClick={onOpenChapters}
          aria-label={'All chapters of ' + arc.title}
          style={{
            position: 'absolute', top: '8px', left: '8px', zIndex: 2,
            display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '10.5px', fontWeight: 800, color: '#fff',
            background: 'rgba(24,24,27,0.55)', border: 'none', borderRadius: '999px',
            minHeight: '44px', padding: '5px 10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}
        >
          <Layers size={12} strokeWidth={2.2} color="#fff" />
          {total} chapter{total === 1 ? '' : 's'} ›
        </button>
      )}
      {locked && (
        <div aria-hidden="true" style={{
          position: 'absolute', top: '8px', left: '8px', zIndex: 2,
          display: 'flex', alignItems: 'center', gap: '5px',
          fontSize: '10.5px', fontWeight: 800, color: '#fff',
          background: 'rgba(24,24,27,0.55)', borderRadius: '999px', padding: '5px 10px',
        }}>
          <Layers size={12} strokeWidth={2.2} color="#fff" />
          {total} chapter{total === 1 ? '' : 's'}
        </div>
      )}
    </div>
  )
}

// Shared by the series card and the series page so the two never disagree about
// how far along you are.
function SeriesProgress({ readCount, total, accentHex, ongoing = false }) {
  const pct = total > 0 ? Math.round((readCount / total) * 100) : 0
  const done = readCount === total && total > 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <div style={{ height: '4px', borderRadius: '999px', background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{
          width: pct + '%', height: '100%', borderRadius: '999px',
          background: done ? 'var(--success)' : accentHex, transition: 'width 220ms ease',
        }} />
      </div>
      <div style={{ fontSize: '11.5px', fontWeight: 700, color: done ? 'var(--success)' : 'var(--text-muted)' }}>
        {readCount === 0
          ? 'Not started'
          : done ? (ongoing ? 'All available read' : 'Series complete') : readCount + ' of ' + total + ' read'}
      </div>
    </div>
  )
}

// The series page: every chapter of one arc, in reading order.
function SeriesPage({ arc, readIds, accentHex, fontFamily, levelLabelFor, isMobile, onOpen, onBack }) {
  const readCount = arc.parts.filter(p => readIds.has(p.id)).length
  const ongoing = seriesHasMore(arc)
  return (
    <div>
      <button onClick={onBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        minHeight: '44px', padding: '0 14px', borderRadius: '12px', marginBottom: '18px',
        border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)',
        fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
      }}>
        <ArrowLeft size={17} strokeWidth={1.85} color="var(--text-muted)" /> All stories
      </button>

      <div style={{ marginBottom: '20px' }}>
        <h1 style={{
          margin: '0 0 10px', fontSize: isMobile ? '22px' : '26px', fontWeight: 800,
          color: 'var(--text)', fontFamily, lineHeight: 1.2,
        }}>
          {arc.title}
        </h1>
        <div style={{ maxWidth: '280px' }}>
          <SeriesProgress readCount={readCount} total={arc.parts.length} accentHex={accentHex} ongoing={ongoing} />
        </div>
      </div>

      <CardGrid isMobile={isMobile}>
        {arc.parts.map(story => (
          <StoryCard key={story.id} story={story} read={readIds.has(story.id)} accentHex={accentHex}
            fontFamily={fontFamily} levelLabel={levelLabelFor(story)} onClick={() => onOpen(story)} />
        ))}
      </CardGrid>
    </div>
  )
}

// Practice scenarios (chat / scene / reply) live in their own section with a
// tinted card, so they never look like broken story cards inside an arc.
function EmptyPanel({ icon: Icon, title, text, actionIcon, actionLabel, onAction }) {
  return (
    <div style={{
      textAlign: 'center', color: 'var(--text-muted)', padding: '54px 28px', fontSize: '15px',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '22px', boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
    }}>
      <Icon size={30} strokeWidth={1.8} color="var(--text-faint)" />
      <div style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 800, marginTop: '14px' }}>{title}</div>
      <div style={{ marginTop: '6px', lineHeight: 1.6 }}>{text}</div>
      {actionLabel && (
        <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'center' }}>
          <IconButton icon={actionIcon} label={actionLabel} onClick={onAction} />
        </div>
      )}
    </div>
  )
}

// ─── MAIN STORIES COMPONENT ────────────────────────────────────────────────

export default function Stories({
  session, profile, track, onBack, onNavigate, initialStoryId, initialStoryWords,
  initialStoryFirstMission, onInitialStoryConsumed, routeKind = 'browse',
  routeStoryId = null, routeSeriesKey = null, onStoryRoute, onSeriesRoute, onBrowseRoute,
}) {
  const [view, setView] = useState('browse')
  // The next level's stories (light rows, no content) — the locked "road
  // ahead" section at the end of the shelf.
  const [nextLevelStories, setNextLevelStories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedStory, setSelectedStory] = useState(null)
  // The open series, and whether the reader was entered from inside one — so
  // Back out of a chapter returns to its series rather than dumping you on the
  // shelf with the series closed again.
  const [selectedArc, setSelectedArc] = useState(null)
  const [readerFromSeries, setReaderFromSeries] = useState(false)
  const [stories, setStories] = useState([])
  // Story ids the user has finished (story_reads) — drives read checkmarks,
  // per-tier progress, and the once-only finish XP.
  const [readIds, setReadIds] = useState(new Set())
  const [learnedCount, setLearnedCount] = useState(0)
  const [vocabMap, setVocabMap] = useState({})
  const [userCards, setUserCards] = useState({})
  const [loading, setLoading] = useState(true)
  // The stories fetch failed AND no cached snapshot could stand in (a new
  // device offline, a server error). Distinguished from a genuinely empty
  // library so the shelf can say "couldn't load" instead of "no stories yet".
  const [loadFailed, setLoadFailed] = useState(false)
  // Which unknown /story/:id has already been announced — so a stale deep link
  // toasts once, not on every effect pass.
  const missingStoryNotified = useRef(null)
  const isMobile = useIsMobile()

  const languageDetails = getLanguageDetails(profile, track)
  const { accentHex, fontFamily } = languageDetails
  // Today's studied words (from the post-study deep-link), highlighted in the
  // reader. Captured into state so it survives App clearing the pending value.
  const [todayWords, setTodayWords] = useState([])
  const [firstMission, setFirstMission] = useState(false)
  // Learned words per level — the cumulative shelf gates each level's stories on
  // that level's own progress, not the current level's.
  const [learnedPerLevel, setLearnedPerLevel] = useState({})

  // Tiers for a story's own level (falls back to the current level for a story
  // row with no level, e.g. an old cached snapshot).
  const levelOf = (lvl) => (lvl == null ? track.current_level : lvl)
  const tiersAt = (lvl) => tiersFor(track.language, levelOf(lvl))
  // Learned words counting toward that level's gates. A level the learner has
  // already passed counts as complete — see readingGateCount.
  const learnedAt = (lvl) => readingGateCount({
    level: levelOf(lvl),
    currentLevel: track.current_level,
    learnedAtLevel: learnedPerLevel[levelOf(lvl)] || 0,
    tiers: tiersAt(lvl),
  })
  const CATEGORIES = tiersAt(track.current_level)
  // Stories on one shelf = one tier at one level.
  const storiesIn = (cat) => (cat
    ? stories.filter(s => s.tier === cat.tier && levelOf(s.level) === cat.level)
    : [])

  // The flat shelf, in one memo (before any early return — hooks rule) with a
  // per-story "% known" cache local to the computation: only NEXT chapters are
  // computed (≤ one per unit), and everything that can move the numbers is a
  // dependency. Helpers are re-derived inside so the memo has no unstable deps.
  const { sections, aheadSection } = useMemo(() => {
    const tiersAtL = (lvl) => tiersFor(track.language, lvl == null ? track.current_level : lvl)
    const learnedAtL = (lvl) => readingGateCount({
      level: lvl == null ? track.current_level : lvl,
      currentLevel: track.current_level,
      learnedAtLevel: learnedPerLevel[lvl == null ? track.current_level : lvl] || 0,
      tiers: tiersAtL(lvl),
    })
    const cache = new Map()
    const knownPctFor = (story) => {
      if (cache.has(story.id)) return cache.get(story.id)
      const content = story.presentation === 'scene' ? stripSceneEmoji(story.content) : story.content
      const { knownPct } = calculateStoryReadability({ content, vocabMap, cards: userCards, language: track.language })
      cache.set(story.id, knownPct)
      return knownPct
    }
    const filters = {}
    return {
      sections: buildFlatShelf({
        stories, currentLevel: track.current_level,
        tiersFor: tiersAtL, learnedFor: learnedAtL,
        readIds, filters, knownPctFor,
      }),
      aheadSection: buildNextLevelSection({
        level: track.current_level + 1, stories: nextLevelStories, filters,
      }),
    }
  }, [stories, nextLevelStories, vocabMap, userCards, readIds, learnedPerLevel, track.language, track.current_level])

  async function loadData() {
    setLoading(true)
    setLoadFailed(false)

    // Everything the stories screen needs is fetched, then mirrored into
    // IndexedDB so the whole library (list + text + read markers) opens offline.
    // If the network is down, the last good snapshot is served instead.
    const snapKey = 'storiesdata:' + track.language + ':' + track.system + ':' + track.current_level
    let vocabData = null, cardsData = null, storiesData = null, readsData = null, nextData = null
    let fetchFailed = false
    try {
      // Load all levels so every word in a story is clickable, not just current
      // level — and PAGE it. Unpaged this stopped at PostgREST's 1000-row cap,
      // so on a track with more vocabulary than that the words past the cap were
      // invisible to the reader: untappable in a story, and uncounted in the
      // story's "% known", which silently understated how much a learner could
      // read.
      vocabData = await fetchPagedSafe(() => supabase
        .from('vocabulary').select('*')
        .eq('language', track.language).eq('system', track.system).eq('is_active', true)
        .order('id', { ascending: true }))
      // A committed learner's card count passes 1000 too.
      cardsData = await fetchPagedSafe(() => supabase
        .from('cards').select('vocab_id, is_easy, state, learned, due_at')
        .eq('user_id', session.user.id)
        .order('vocab_id', { ascending: true }))
      // Reading is CUMULATIVE, the way review already is: every level the
      // learner has reached, not just the current one. Advancing a level adds to
      // the shelf instead of emptying it — and a level whose own stories don't
      // exist yet still has a full shelf underneath it.
      const sres = await supabase
        .from('stories').select('*')
        .eq('language', track.language).eq('system', track.system)
        .lte('level', track.current_level).eq('is_published', true)
        .order('level', { ascending: false })
        .order('tier', { ascending: true }).order('story_number', { ascending: true })
      storiesData = sres.data
      const rres = await supabase
        .from('story_reads').select('story_id').eq('user_id', session.user.id)
      readsData = rres.data
      // The next level's stories, WITHOUT content (they're locked — no reader,
      // no % known) — the shelf's "road ahead" teaser section.
      const nres = await supabase
        .from('stories')
        .select('id, title, level, tier, story_number, presentation, panels, image_path, english_summary')
        .eq('language', track.language).eq('system', track.system)
        .eq('level', track.current_level + 1).eq('is_published', true)
        .order('tier', { ascending: true }).order('story_number', { ascending: true })
      nextData = nres.data
    } catch { fetchFailed = true /* offline — fall back to the cached snapshot below */ }

    if (storiesData && storiesData.length) {
      cacheSet(snapKey, { vocabData, cardsData, storiesData, readsData, nextData })
    } else {
      const snap = await cacheGet(snapKey)
      if (snap) {
        vocabData = vocabData || snap.vocabData
        cardsData = cardsData || snap.cardsData
        storiesData = snap.storiesData
        readsData = readsData || snap.readsData
        nextData = nextData || snap.nextData
      } else if (fetchFailed || storiesData == null) {
        // No snapshot to fall back on, and the fetch either threw or came back
        // with no rows at all (a Supabase error result is null, an empty
        // library is []). "No stories yet" would be a false statement about
        // the library — surface a retry instead.
        setLoadFailed(true)
      }
    }

    const map = {}
    ;(vocabData || []).forEach(v => { map[v.word] = v })
    setVocabMap(map)

    const cardsMap = {}
    ;(cardsData || []).forEach(c => { cardsMap[c.vocab_id] = c })
    setUserCards(cardsMap)

    // Per-level learned counts drive each level's own tier gates; the headline
    // progress bar still tracks the current level.
    const perLevel = learnedByLevel(vocabData || [], cardsData || [])
    setLearnedPerLevel(perLevel)
    const currentLevelIds = new Set(
      (vocabData || []).filter(v => v.level === track.current_level).map(v => v.id)
    )
    const learned = (cardsData || []).filter(c => currentLevelIds.has(c.vocab_id) && isLearned(c)).length
    setLearnedCount(learned)

    setStories(storiesData || [])
    setNextLevelStories(nextData || [])
    setReadIds(new Set((readsData || []).map(r => r.story_id)))

    // Deep-link from the post-study recap ("Read unlocked story"): open the
    // recommended story straight into the reader instead of the category list.
    if (initialStoryId) {
      const target = (storiesData || []).find(s => s.id === initialStoryId)
      if (target) {
        const cat = categoryForStory(target, track)
        setSelectedCategory(cat)
        setSelectedStory(target)
        setView('reader')
        if (initialStoryWords && initialStoryWords.length) setTodayWords(initialStoryWords)
        if (initialStoryFirstMission) setFirstMission(true)
      }
      if (onInitialStoryConsumed) onInitialStoryConsumed()
    }

    setLoading(false)
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const timer = setTimeout(loadData, 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (loading) return
    if (routeKind === 'browse') {
      setView('browse')
      setSelectedStory(null)
      setSelectedArc(null)
      setReaderFromSeries(false)
      return
    }
    if (routeKind === 'story' && routeStoryId) {
      const target = stories.find(s => s.id === routeStoryId)
      if (!target) {
        // Loading finished and the id matches nothing — a stale or mistyped
        // link. Say so briefly and settle the URL back on the shelf instead of
        // leaving it claiming a story that isn't rendered. Skipped while the
        // load itself failed: a retry may still find the story.
        if (!loadFailed && missingStoryNotified.current !== routeStoryId) {
          missingStoryNotified.current = routeStoryId
          toast({ title: "That story isn't available", accent: accentHex })
          if (onBrowseRoute) onBrowseRoute()
        }
        return
      }
      if (view === 'reader' && selectedStory?.id === target.id) return
      setSelectedCategory(categoryForStory(target, track))
      setSelectedStory(target)
      setReaderFromSeries(false)
      setView('reader')
      return
    }
    if (routeKind === 'series' && routeSeriesKey) {
      const unit = sections.flatMap(s => s.units).find(u => u.kind === 'series' && u.key === routeSeriesKey)
      if (!unit || (view === 'series' && selectedArc?.key === unit.key)) return
      setSelectedArc(unit)
      setSelectedStory(null)
      setView('series')
    }
  }, [loading, loadFailed, routeKind, routeStoryId, routeSeriesKey, stories, sections, selectedStory?.id, selectedArc?.key, view, track, accentHex, onBrowseRoute])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return (
      <div style={pageShell()}>
        <div role="status" aria-label="Loading stories" style={{ maxWidth: '1360px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px' }}>
          <div style={{ width: '82px', height: '44px', borderRadius: '12px', background: 'var(--surface-2)', marginBottom: '22px' }} />
          <div style={{ height: isMobile ? '300px' : '360px', borderRadius: '24px', background: accentHex + '18', border: '1px solid ' + accentHex + '24', marginBottom: '34px' }} />
          <div style={{ width: '190px', height: '24px', borderRadius: '8px', background: 'var(--surface-2)', marginBottom: '14px' }} />
          <div style={{ display: 'flex', gap: '16px', overflow: 'hidden' }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ flex: isMobile ? '0 0 76vw' : '0 0 276px' }}>
                <div style={{ aspectRatio: '16 / 9', borderRadius: '16px', background: 'var(--surface-2)' }} />
                <div style={{ width: '68%', height: '14px', borderRadius: '6px', background: 'var(--surface-2)', marginTop: '11px' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Reader view ────────────────────────────────────────────────────────
  if (view === 'reader' && selectedStory && selectedCategory) {
    // "Next story" stays inside the same shelf: same tier AND same level.
    const catStories = storiesIn(selectedCategory)
    const currentIdx = catStories.findIndex(s => s.id === selectedStory.id)
    const nextStory = currentIdx >= 0 && currentIdx < catStories.length - 1
      ? catStories[currentIdx + 1] : null
    // When there's no next story left to read in this tier, point the reader at
    // the next locked tier so finishing ends in "learn N more to unlock…" rather
    // than a dead end. Only tiers of THIS story's level that actually have
    // stories are offered, gated by that level's own thresholds.
    const shelfLevel = selectedCategory.level
    const tiersWithStories = new Set(
      stories.filter(s => levelOf(s.level) === shelfLevel).map(s => s.tier)
    )
    const nextTierUnlock = nextStory
      ? null
      : nextLockedTier(tiersAt(shelfLevel), learnedAt(shelfLevel), tiersWithStories)

    return (
      <StoryReader
        story={selectedStory}
        vocabMap={vocabMap}
        userCards={userCards}
        setUserCards={setUserCards}
        session={session}
        profile={profile}
        track={track}
        onBack={() => {
          if (readerFromSeries && selectedArc) {
            setView('series')
            if (onSeriesRoute) onSeriesRoute(selectedArc.key)
          } else {
            setView('browse')
            if (onBrowseRoute) onBrowseRoute()
          }
        }}
        onHome={onBack}
        onPractice={onNavigate ? (words) => onNavigate('fillblank', { practiceWords: words }) : null}
        todayWords={todayWords}
        firstMission={firstMission}
        nextStory={nextStory}
        nextTierUnlock={nextTierUnlock}
        onNextStory={() => {
          setSelectedStory(nextStory)
          if (nextStory && onStoryRoute) onStoryRoute(nextStory.id)
        }}
        isRead={readIds.has(selectedStory.id)}
        onMarkRead={(id) => setReadIds(prev => { const nx = new Set(prev); nx.add(id); return nx })}
      />
    )
  }

  // ── Browse view (feature + horizontal shelves) ─────────────────────────

  // Open a story straight into the reader, carrying its shelf (tier + level) so
  // next-story and the tier-unlock nudge keep working.
  const openStory = (story, fromSeries = false) => {
    setSelectedCategory(categoryForStory(story, track))
    setSelectedStory(story)
    setReaderFromSeries(fromSeries)
    setView('reader')
    if (onStoryRoute) onStoryRoute(story.id)
  }

  const levelLabelFor = (story) => getLevelLabel(track.language, track.system, story.level == null ? track.current_level : story.level)
  const daily = pickDailyStory({ stories, categories: CATEGORIES, learnedCount, readIds, dateStr: todayStr(), tiersFor: tiersAt, learnedFor: learnedAt })


  // ── Series view: one arc's chapters ────────────────────────────────────
  if (view === 'series' && selectedArc) {
    return (
      <div style={pageShell()}>
        <div style={{ maxWidth: isMobile ? '860px' : '1040px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
          <SeriesPage
            arc={selectedArc}
            readIds={readIds}
            accentHex={accentHex}
            fontFamily={fontFamily}
            levelLabelFor={levelLabelFor}
            isMobile={isMobile}
            onOpen={(story) => openStory(story, true)}
            onBack={() => {
              setView('browse')
              setSelectedArc(null)
              if (onBrowseRoute) onBrowseRoute()
            }}
          />
        </div>
      </div>
    )
  }

  const openSeries = (arc) => {
    setSelectedArc(arc)
    setView('series')
    if (onSeriesRoute) onSeriesRoute(arc.key)
  }

  const primarySection = sections.find(sec => sec.isCurrent) || sections[0] || null
  const continueUnits = sections.flatMap(sec => sec.units.map(unit => ({ unit, section: sec })))
    .filter(({ unit }) => !unit.locked && unit.readCount > 0 && !unit.allRead)
  const continueKeys = new Set(continueUnits.map(({ unit }) => unit.key))
  const primaryUnits = primarySection
    ? primarySection.units.filter(unit => !continueKeys.has(unit.key)).map(unit => ({ unit, section: primarySection }))
    : []
  const moreUnits = sections
    .filter(sec => sec !== primarySection)
    .flatMap(sec => sec.units.map(unit => ({ unit, section: sec })))
  const practiceStories = sections.flatMap(sec => sec.practice.map(story => ({ story, section: sec })))
  const upcomingUnits = aheadSection ? aheadSection.units.map(unit => ({ unit, section: aheadSection })) : []

  const renderUnit = ({ unit, section }) => {
    const lockLabel = section.levelLocked
      ? 'Next level'
      : unit.locked ? 'Learn ' + unit.remaining + ' more word' + (unit.remaining === 1 ? '' : 's') : null
    return (
      <div key={section.level + '-' + unit.key} style={shelfItemStyle(isMobile)}>
        {unit.kind === 'series' ? (
          <SeriesCard
            arc={unit} readIds={readIds} accentHex={accentHex}
            fontFamily={fontFamily} isMobile={isMobile} shelf
            knownPct={unit.knownPct} locked={unit.locked} lockLabel={lockLabel}
            onOpen={() => { setSelectedArc(unit); openStory(unit.next, true) }}
            onOpenChapters={() => openSeries(unit)}
          />
        ) : (
          <StoryCard
            story={unit.parts[0]} read={readIds.has(unit.parts[0].id)} shelf
            accentHex={accentHex} fontFamily={fontFamily}
            levelLabel={levelLabelFor(unit.parts[0])}
            knownPct={unit.knownPct} locked={unit.locked} lockLabel={lockLabel}
            onClick={() => openStory(unit.parts[0])}
          />
        )}
      </div>
    )
  }

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: '1360px', margin: '0 auto', padding: isMobile ? '24px 16px 64px' : '38px 32px 80px', position: 'relative', zIndex: 1 }}>
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />

        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '14px', margin: '22px 0 14px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, color: 'var(--text)', fontSize: isMobile ? '26px' : '30px', fontWeight: 820, letterSpacing: '-0.035em' }}>
            Stories
          </h1>
          <Eyebrow>{getSystemLabel(track.system)} · {getLevelLabel(track.language, track.system, track.current_level)}</Eyebrow>
        </header>

        {daily ? (
          <HeroPanel
            accentHex={accentHex}
            seed={track.language + '-stories'}
            padding="0"
            compact={isMobile}
            onClick={() => openStory(daily)}
            style={{ margin: '0 0 34px', minHeight: isMobile ? '300px' : '360px' }}
          >
            {({ hovered }) => (
              <div style={{ position: 'relative', minHeight: isMobile ? '300px' : '360px', display: 'flex', alignItems: 'end' }}>
                <StoryCover
                  story={daily} path={daily.image_path} accent={accentHex} radius={0} loading="eager"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                />
                <div aria-hidden="true" style={{
                  position: 'absolute', inset: 0,
                  background: isMobile
                    ? 'linear-gradient(0deg, rgba(13,13,15,0.94) 0%, rgba(13,13,15,0.58) 58%, rgba(13,13,15,0.16) 100%)'
                    : 'linear-gradient(90deg, rgba(13,13,15,0.94) 0%, rgba(13,13,15,0.70) 42%, rgba(13,13,15,0.14) 76%)',
                }} />
                <div style={{ position: 'relative', zIndex: 1, padding: isMobile ? '24px 22px' : '36px 40px', maxWidth: isMobile ? '100%' : '600px' }}>
                  <Eyebrow onHero>Featured for you</Eyebrow>
                  <div style={{
                    fontFamily: fontFamily + ', Inter, sans-serif', color: '#fff',
                    fontSize: isMobile ? '28px' : '38px', fontWeight: 700, lineHeight: 1.18,
                    letterSpacing: '-0.02em', margin: '10px 0 10px',
                  }}>
                    {daily.title}
                  </div>
                  <div style={{ fontSize: isMobile ? '13px' : '14px', color: 'rgba(255,255,255,0.80)', lineHeight: 1.55, maxWidth: '52ch' }}>
                    {daily.english_summary || heroSentence(daily.content)}
                  </div>
                  <div style={{ marginTop: '10px', color: 'rgba(255,255,255,0.64)', fontSize: '12px', fontWeight: 700 }}>
                    {getLevelLabel(track.language, track.system, daily.level == null ? track.current_level : daily.level)} · {formatLabel(daily)}
                  </div>
                  <HeroAction label={readIds.has(daily.id) ? 'Read again' : 'Start reading'} hovered={hovered} icon={ArrowRight} accentHex={accentHex} />
                </div>
              </div>
            )}
          </HeroPanel>
        ) : loadFailed ? (
          <EmptyPanel
            icon={CloudOff} title="Couldn't load stories"
            text="The library couldn't be reached. Check your connection and try again."
            actionIcon={RefreshCw} actionLabel="Retry" onAction={loadData}
          />
        ) : (
          <EmptyPanel icon={Library} title="No stories yet" text="Stories for your level are on the way. Keep learning words — they'll be here waiting." />
        )}

        {(sections.length > 0 || aheadSection) && (
          <div style={{ display: 'grid', gap: isMobile ? '28px' : '34px' }}>
            {continueUnits.length > 0 && (
              <ShelfRow id="continue-reading" title="Continue reading" subtitle="Pick up where you left off." isMobile={isMobile}>
                {continueUnits.map(renderUnit)}
              </ShelfRow>
            )}

            {primarySection && (
              <ShelfRow
                id="top-picks"
                title="Top picks for you"
                subtitle={getLevelLabel(track.language, track.system, primarySection.level) + ' · easiest to read first'}
                isMobile={isMobile}
              >
                {(primaryUnits.length ? primaryUnits : primarySection.units.map(unit => ({ unit, section: primarySection }))).map(renderUnit)}
              </ShelfRow>
            )}

            {moreUnits.length > 0 && (
              <ShelfRow id="more-stories" title="More stories you can read" subtitle="From levels you’ve already reached." isMobile={isMobile}>
                {moreUnits.map(renderUnit)}
              </ShelfRow>
            )}

            {practiceStories.length > 0 && (
              <ShelfRow id="practice-stories" title="Practice through stories" subtitle="Short chats, scenes, and reply-alongs." isMobile={isMobile}>
                {practiceStories.map(({ story, section }) => (
                  <div key={section.level + '-' + story.id} style={shelfItemStyle(isMobile)}>
                    <StoryCard
                      story={story} read={readIds.has(story.id)} shelf practice
                      accentHex={accentHex} fontFamily={fontFamily}
                      levelLabel={levelLabelFor(story)} onClick={() => openStory(story)}
                    />
                  </div>
                ))}
              </ShelfRow>
            )}

            {upcomingUnits.length > 0 && (
              <ShelfRow
                id="coming-up"
                title={'Coming up in ' + getLevelLabel(track.language, track.system, aheadSection.level)}
                subtitle={'Unlocks when you pass the ' + getLevelLabel(track.language, track.system, track.current_level) + ' test.'}
                isMobile={isMobile}
              >
                {upcomingUnits.map(renderUnit)}
              </ShelfRow>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
