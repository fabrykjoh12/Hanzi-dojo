import { useState, useEffect, useMemo } from 'react'
import { fetchPagedSafe } from './supabasePaging'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { cacheSet, cacheGet } from './offline'
import { languageTheme } from './languageTheme'
import { HeroPanel, HeroAction, Eyebrow } from './panels'
import { heroSentence, firstContentChar } from './homeStory'
import { tiersFor, learnedByLevel, readingGateCount, nextLockedTier } from './storyTiers'
import { isLearned } from './mastery'
import { useIsMobile } from './useIsMobile'
import { todayStr } from './streak'
import { pickDailyStory } from './dailyStory'
import { STATUS_FILTERS, FORMAT_FILTERS } from './storyList'
import { formatLabel, formatEmoji } from './storyFormat'
import { seriesHasMore, standaloneStoryDetails } from './storyShelf'
import { buildFlatShelf, buildNextLevelSection } from './storyShelfFlat'
import { calculateStoryReadability } from './storyReading'
import { stripSceneEmoji } from './sceneReading'
import StoryReader from './StoryReader'
import StoryCover from './StoryCover'
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock, Layers, Library, Lock,
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

function pillStyle(color, background, border) {
  return {
    display: 'inline-flex', alignItems: 'center',
    fontSize: '12px', fontWeight: 800,
    color, background, border: '1px solid ' + border,
    padding: '5px 11px', borderRadius: '999px', lineHeight: 1,
  }
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
        height: '40px', padding: '0 14px', borderRadius: '12px',
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

// Small neutral metadata pill used in the card footer.
const metaTag = {
  display: 'inline-flex', alignItems: 'center', gap: '3px',
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: '999px', padding: '3px 8px', lineHeight: 1, whiteSpace: 'nowrap',
}

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

// One template for every card, story or practice: a fixed 16:9 cover slot (real
// art or the designed fallback), the title on one line, a single ellipsized
// description line (no variable-height wrapping), then a consistent meta row of
// level tag · format tag · read/unread.
function StoryCard({ story, read, accentHex, fontFamily, levelLabel, practice, onClick, knownPct = null, locked = false, lockLabel = null }) {
  const [hovered, setHovered] = useState(false)
  const standalone = standaloneStoryDetails(story)
  const lift = hovered && !locked
  return (
    <button
      onClick={locked ? undefined : onClick}
      disabled={locked}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left', width: '100%', padding: 0,
        border: '1px solid ' + (lift ? accentHex + '55' : 'var(--border)'),
        borderRadius: '16px', overflow: 'hidden', cursor: locked ? 'default' : 'pointer',
        background: practice ? accentHex + '0A' : 'var(--surface)',
        boxShadow: lift ? '0 16px 34px rgba(24,24,27,0.10)' : '0 6px 20px rgba(24,24,27,0.05)',
        transform: lift ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 170ms ease', fontFamily: 'Inter, sans-serif',
        opacity: locked ? 0.78 : 1,
      }}
    >
      <StoryCover
        story={story} path={story.image_path} accent={accentHex} radius={0}
        style={{ width: '100%', aspectRatio: '16 / 9', border: 'none', borderBottom: '1px solid var(--border)' }}
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
        {standalone && (
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
      <div style={{ padding: '12px 14px 13px', display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
        <div title={story.title} style={{ fontSize: '16px', fontWeight: 750, fontFamily, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
          {story.title}
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>
          {story.english_summary || '—'}
        </div>
        {standalone && (standalone.chapters || standalone.minutes) && (
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '3px', flexWrap: 'nowrap' }}>
          <span style={metaTag}>{levelLabel}</span>
          <span style={metaTag}>{formatEmoji(story)} {formatLabel(story)}</span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, color: locked ? 'var(--text-muted)' : read ? 'var(--success)' : 'var(--text-faint)', whiteSpace: 'nowrap' }}>
            {locked ? (lockLabel || 'Locked') : read ? 'Read' : 'New'}
          </span>
        </div>
      </div>
    </button>
  )
}

// ─── FILTER ROW ────────────────────────────────────────────────────────────

function Segmented({ options, value, onChange, accentHex, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '3px' }}>
      {options.map(o => {
        const on = o.key === value
        return (
          <button key={o.key} onClick={() => onChange(o.key)} aria-pressed={on}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: '8px', padding: '6px 12px',
              fontSize: '12.5px', fontWeight: on ? 750 : 600, fontFamily: 'Inter, sans-serif',
              background: on ? 'var(--surface)' : 'transparent', color: on ? accentHex : 'var(--text-muted)',
              boxShadow: on ? '0 1px 4px rgba(24,24,27,0.08)' : 'none', transition: 'background 140ms ease',
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function FilterRow({ status, setStatus, format, setFormat, accentHex }) {
  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '22px' }}>
      <Segmented options={STATUS_FILTERS} value={status} onChange={setStatus} accentHex={accentHex} label="Read status" />
      <Segmented options={FORMAT_FILTERS} value={format} onChange={setFormat} accentHex={accentHex} label="Format" />
    </div>
  )
}

// ─── ARC + PRACTICE SECTIONS ───────────────────────────────────────────────

function CardGrid({ children, isMobile }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(232px, 1fr))', gap: '16px' }}>
      {children}
    </div>
  )
}

// Tapping the card RESUMES the series (opens the next unread chapter). The
// chapter-count chip on the cover is a real secondary button that opens the
// chapter list — it's a sibling of the main button (buttons can't nest).
function SeriesCard({ arc, readIds, accentHex, fontFamily, isMobile, onOpen, onOpenChapters, knownPct = null, locked = false, lockLabel = null }) {
  const [hovered, setHovered] = useState(false)
  const readCount = arc.parts.filter(p => readIds.has(p.id)).length
  const total = arc.parts.length
  const done = readCount === total
  const ongoing = seriesHasMore(arc)
  // Open on the cover of where you actually are, not always chapter one.
  const coverStory = arc.parts.find(p => !readIds.has(p.id)) || arc.parts[0]
  const lift = hovered && !locked
  return (
    <div style={{ position: 'relative', paddingRight: '7px', paddingBottom: '7px' }}>
      {/* Stacked edges — decorative, so hidden from the accessibility tree. */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '7px', left: '7px', right: 0, bottom: 0,
        borderRadius: '16px', background: 'var(--surface)',
        border: '1px solid var(--border)', opacity: 0.55,
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', top: '4px', left: '4px', right: '3px', bottom: '3px',
        borderRadius: '16px', background: 'var(--surface)',
        border: '1px solid var(--border)', opacity: 0.8,
      }} />
      <button
        onClick={locked ? undefined : onOpen}
        disabled={locked}
        aria-label={locked ? arc.title : arc.title + ' — continue reading'}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column', textAlign: 'left',
          width: '100%', padding: 0, cursor: locked ? 'default' : 'pointer',
          border: '1px solid ' + (lift ? accentHex + '55' : 'var(--border)'),
          borderRadius: '16px', overflow: 'hidden', background: 'var(--surface)',
          boxShadow: lift ? '0 16px 34px rgba(24,24,27,0.10)' : '0 6px 20px rgba(24,24,27,0.05)',
          transform: lift ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 170ms ease', fontFamily: 'Inter, sans-serif',
          opacity: locked ? 0.78 : 1,
        }}
      >
        <StoryCover
          story={coverStory} path={coverStory && coverStory.image_path} accent={accentHex} radius={0}
          style={{ width: '100%', aspectRatio: '16 / 9', border: 'none', borderBottom: '1px solid var(--border)' }}
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
        <div style={{ padding: '12px 14px 13px', display: 'flex', flexDirection: 'column', gap: '7px', flex: 1 }}>
          <div title={arc.title} style={{
            fontSize: isMobile ? '15px' : '16px', fontWeight: 750, fontFamily, color: 'var(--text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3,
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
            padding: '5px 10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
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
        minHeight: '40px', padding: '0 14px', borderRadius: '12px', marginBottom: '18px',
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
function PracticeSection({ stories, readIds, accentHex, fontFamily, levelLabelFor, isMobile, onOpen }) {
  if (stories.length === 0) return null
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', margin: '0 0 12px', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>Practice Scenarios</h3>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {stories.length} to try — chat, scene & reply-along
        </span>
      </div>
      <CardGrid isMobile={isMobile}>
        {stories.map(story => (
          <StoryCard key={story.id} story={story} read={readIds.has(story.id)} accentHex={accentHex}
            fontFamily={fontFamily} levelLabel={levelLabelFor(story)} practice onClick={() => onOpen(story)} />
        ))}
      </CardGrid>
    </section>
  )
}

function EmptyPanel({ icon: Icon, title, text }) {
  return (
    <div style={{
      textAlign: 'center', color: 'var(--text-muted)', padding: '54px 28px', fontSize: '15px',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '22px', boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
    }}>
      <Icon size={30} strokeWidth={1.8} color="var(--text-faint)" />
      <div style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 800, marginTop: '14px' }}>{title}</div>
      <div style={{ marginTop: '6px', lineHeight: 1.6 }}>{text}</div>
    </div>
  )
}

// ─── MAIN STORIES COMPONENT ────────────────────────────────────────────────

export default function Stories({ session, profile, track, onBack, onNavigate, initialStoryId, initialStoryWords, initialStoryFirstMission, onInitialStoryConsumed }) {
  const [view, setView] = useState('browse')
  // Which tier tab is open (null → resolve a sensible default once stories load),
  // and the library filters. All three live only on the browse screen.
  // The next level's stories (light rows, no content) — the locked "road
  // ahead" section at the end of the shelf.
  const [nextLevelStories, setNextLevelStories] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [formatFilter, setFormatFilter] = useState('all')
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
  const isMobile = useIsMobile()

  const languageDetails = getLanguageDetails(profile, track)
  const { accentHex, nativeName, fontFamily } = languageDetails
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
    const filters = { status: statusFilter, format: formatFilter }
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
  }, [stories, nextLevelStories, vocabMap, userCards, readIds, statusFilter, formatFilter, learnedPerLevel, track.language, track.current_level])

  async function loadData() {
    setLoading(true)

    // Everything the stories screen needs is fetched, then mirrored into
    // IndexedDB so the whole library (list + text + read markers) opens offline.
    // If the network is down, the last good snapshot is served instead.
    const snapKey = 'storiesdata:' + track.language + ':' + track.system + ':' + track.current_level
    let vocabData = null, cardsData = null, storiesData = null, readsData = null, nextData = null
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
    } catch { /* offline — fall back to the cached snapshot below */ }

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

  useEffect(() => {
    const timer = setTimeout(loadData, 0)
    return () => clearTimeout(timer)
  }, [])

  if (loading) {
    return (
      <div style={pageShell()}>
        <div style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{
            width: '88px', height: '88px', borderRadius: '26px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 16px 40px rgba(24,24,27,0.06)',
          }}>
            <BookOpen size={34} strokeWidth={1.75} color={accentHex} />
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
        onBack={() => setView(readerFromSeries && selectedArc ? 'series' : 'browse')}
        onHome={onBack}
        onPractice={onNavigate ? (words) => onNavigate('fillblank', { practiceWords: words }) : null}
        todayWords={todayWords}
        firstMission={firstMission}
        nextStory={nextStory}
        nextTierUnlock={nextTierUnlock}
        onNextStory={() => setSelectedStory(nextStory)}
        isRead={readIds.has(selectedStory.id)}
        onMarkRead={(id) => setReadIds(prev => { const nx = new Set(prev); nx.add(id); return nx })}
      />
    )
  }

  // ── Browse view (tabs + arcs + practice) ────────────────────────────────

  // Open a story straight into the reader, carrying its shelf (tier + level) so
  // next-story and the tier-unlock nudge keep working.
  const openStory = (story, fromSeries = false) => {
    setSelectedCategory(categoryForStory(story, track))
    setSelectedStory(story)
    setReaderFromSeries(fromSeries)
    setView('reader')
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
            onBack={() => { setView('browse'); setSelectedArc(null) }}
          />
        </div>
      </div>
    )
  }

  const openSeries = (arc) => { setSelectedArc(arc); setView('series') }

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: isMobile ? '860px' : '1040px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />

        {/* This screen's one lit block — the same treatment Home gives the card
            queue, here given to the thing Stories is actually about: the story
            waiting for you today. Falls back to a plain title block before
            anything is unlocked. */}
        {daily ? (
          <>
          {/* The page h1 lives OUTSIDE the hero: HeroPanel is role="button",
              and ARIA flattens headings inside a button into its name — an h1
              in there is not exposed as a heading at all. Visually hidden;
              the hero carries the visual title. */}
          <h1 style={{
            position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
            overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
          }}>
            Stories
          </h1>
          <HeroPanel
            accentHex={accentHex}
            seed={track.language + '-stories'}
            watermark={firstContentChar(heroSentence(daily.content))}
            watermarkFont={fontFamily}
            compact={isMobile}
            onClick={() => openStory(daily)}
            style={{ margin: '28px 0 22px' }}
          >
            {({ hovered }) => (
              <div>
                {/* The eyebrow row carries BOTH facts the old header had: what
                    this block is, and which level the learner is actually on.
                    Dropping the latter left Stories unable to say where you are. */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <Eyebrow onHero>
                    Today’s story{readIds.has(daily.id) ? ' · revisit' : ''}
                  </Eyebrow>
                  <Eyebrow onHero style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {getSystemLabel(track.system)} · {getLevelLabel(track.language, track.system, track.current_level)}
                  </Eyebrow>
                </div>
                {/* Title first, opening sentence supporting — the headline names
                    the story; a first sentence can't be told apart from copy.
                    A div, not a heading: inside role="button" a heading would
                    be flattened anyway (the real h1 sits above the hero). */}
                <div style={{
                  fontFamily: fontFamily + ', Inter, sans-serif', color: '#fff',
                  fontSize: isMobile ? '25px' : '31px', fontWeight: 600, lineHeight: 1.32,
                  letterSpacing: '0.01em', margin: '10px 0 8px', maxWidth: '20ch',
                }}>
                  {daily.title}
                </div>
                <div style={{
                  fontSize: '13px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.45,
                  fontFamily: fontFamily + ', Inter, sans-serif',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '46ch',
                }}>
                  {heroSentence(daily.content)} · {getLevelLabel(track.language, track.system, daily.level == null ? track.current_level : daily.level)}
                </div>
                <HeroAction label="Start reading" hovered={hovered} icon={ArrowRight} accentHex={accentHex} />
              </div>
            )}
          </HeroPanel>
          </>
        ) : (
          <div style={{ margin: '28px 0 22px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <span style={pillStyle(accentHex, accentHex + '12', accentHex + '30')}>{nativeName}</span>
              <span style={pillStyle('var(--text-muted)', 'var(--surface-2)', 'var(--border)')}>
                {getSystemLabel(track.system)} · {getLevelLabel(track.language, track.system, track.current_level)}
              </span>
            </div>
            <h1 style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>
              Stories
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
              Everything you can read, from every level you’ve reached.
            </p>
          </div>
        )}

        <FilterRow
          status={statusFilter} setStatus={setStatusFilter}
          format={formatFilter} setFormat={setFormatFilter} accentHex={accentHex}
        />

        {/* The flat shelf: level sections (current level first, then earlier
            levels closest-first), most-readable units first inside each, and
            the next level as a locked teaser at the end. One card per series;
            tier locks render inline on the cards, never as a wall. */}
        {(() => {
          const allSections = aheadSection ? [...sections, aheadSection] : [...sections]
          if (allSections.length === 0) {
            if (statusFilter !== 'all' || formatFilter !== 'all') {
              return <EmptyPanel icon={BookOpen} title="Nothing matches" text="No stories match these filters yet — try switching them back to All." />
            }
            return <EmptyPanel icon={Library} title="No stories yet" text="Stories for your level are on the way. Keep learning words — they'll be here waiting." />
          }
          return (
            <div style={{ display: 'grid', gap: '38px' }}>
              {allSections.map(sec => (
                <section key={sec.level} aria-label={getLevelLabel(track.language, track.system, sec.level)}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                      {getLevelLabel(track.language, track.system, sec.level)}
                    </h2>
                    {sec.isCurrent && (
                      <span style={pillStyle(accentHex, accentHex + '12', accentHex + '30')}>Your level</span>
                    )}
                    {sec.levelLocked ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                        <Lock size={12} strokeWidth={2.2} color="var(--text-faint)" aria-hidden="true" />
                        Unlocks when you pass the {getLevelLabel(track.language, track.system, track.current_level)} test
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {sec.readCount} of {sec.total} read
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: '28px' }}>
                    <CardGrid isMobile={isMobile}>
                      {sec.units.map(u => {
                        const lockLabel = sec.levelLocked
                          ? 'Next level'
                          : u.locked ? 'Learn ' + u.remaining + ' more word' + (u.remaining === 1 ? '' : 's') : null
                        return u.kind === 'series' ? (
                          <SeriesCard
                            key={u.key} arc={u} readIds={readIds} accentHex={accentHex}
                            fontFamily={fontFamily} isMobile={isMobile}
                            knownPct={u.knownPct} locked={u.locked} lockLabel={lockLabel}
                            onOpen={() => { setSelectedArc(u); openStory(u.next, true) }}
                            onOpenChapters={() => openSeries(u)}
                          />
                        ) : (
                          <StoryCard
                            key={u.key} story={u.parts[0]} read={readIds.has(u.parts[0].id)}
                            accentHex={accentHex} fontFamily={fontFamily}
                            levelLabel={levelLabelFor(u.parts[0])}
                            knownPct={u.knownPct} locked={u.locked} lockLabel={lockLabel}
                            onClick={() => openStory(u.parts[0])}
                          />
                        )
                      })}
                    </CardGrid>
                    <PracticeSection
                      stories={sec.practice} readIds={readIds} accentHex={accentHex}
                      fontFamily={fontFamily} levelLabelFor={levelLabelFor} isMobile={isMobile} onOpen={openStory}
                    />
                  </div>
                </section>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
