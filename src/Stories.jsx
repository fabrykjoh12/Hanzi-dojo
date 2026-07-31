import { useState, useEffect } from 'react'
import { fetchPagedSafe } from './supabasePaging'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { cacheSet, cacheGet } from './offline'
import { languageTheme } from './languageTheme'
import { HeroPanel, HeroAction, Eyebrow } from './panels'
import { heroSentence, firstContentChar } from './homeStory'
import { tiersFor, learnedByLevel, readingGateCount, storyLevels, nextLockedTier } from './storyTiers'
import { isLearned } from './mastery'
import { useIsMobile } from './useIsMobile'
import { todayStr } from './streak'
import { pickDailyStory } from './dailyStory'
import { filterStories, STATUS_FILTERS, FORMAT_FILTERS } from './storyList'
import { isPracticeFormat, formatLabel, formatEmoji } from './storyFormat'
import { organizeNarrativeStories, seriesHasMore, standaloneStoryDetails } from './storyShelf'
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

// ─── NORMALIZED STORY CARD ─────────────────────────────────────────────────

// One template for every card, story or practice: a fixed 16:9 cover slot (real
// art or the designed fallback), the title on one line, a single ellipsized
// description line (no variable-height wrapping), then a consistent meta row of
// level tag · format tag · read/unread.
function StoryCard({ story, read, accentHex, fontFamily, levelLabel, practice, onClick }) {
  const [hovered, setHovered] = useState(false)
  const standalone = standaloneStoryDetails(story)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left', width: '100%', padding: 0,
        border: '1px solid ' + (hovered ? accentHex + '55' : 'var(--border)'),
        borderRadius: '16px', overflow: 'hidden', cursor: 'pointer',
        background: practice ? accentHex + '0A' : 'var(--surface)',
        boxShadow: hovered ? '0 16px 34px rgba(24,24,27,0.10)' : '0 6px 20px rgba(24,24,27,0.05)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 170ms ease', fontFamily: 'Inter, sans-serif',
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
          <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, color: read ? 'var(--success)' : 'var(--text-faint)', whiteSpace: 'nowrap' }}>
            {read ? 'Read' : 'New'}
          </span>
        </div>
      </div>
    </button>
  )
}

// ─── TIER TABS (consolidated progress + navigation) ────────────────────────

// Replaces the stacked "Immersion unlocks" bar + First/Growing/Fluent stepper
// with one control: the three tiers as tabs, each showing a lock + "N more
// words" when nothing in it is readable yet, and the overall unlock % as a small
// label in the same bar. `tierInfo(tier)` returns the per-tab lock/summary.
function TierTabs({ tiers, activeTier, tierInfo, pct, accentHex, onPick }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div role="tablist" aria-label="Story tiers" style={{
        display: 'flex', gap: '6px', background: 'var(--surface-2)',
        border: '1px solid var(--border)', borderRadius: '14px', padding: '6px', overflowX: 'auto',
      }}>
        {tiers.map(t => {
          const info = tierInfo(t.tier)
          const active = t.tier === activeTier
          return (
            <button
              key={t.tier} role="tab" aria-selected={active} onClick={() => onPick(t.tier)}
              style={{
                flex: '1 1 0', minWidth: '112px', border: 'none', cursor: 'pointer',
                borderRadius: '10px', padding: '9px 10px 8px', textAlign: 'center',
                background: active ? 'var(--surface)' : 'transparent',
                boxShadow: active ? '0 2px 10px rgba(24,24,27,0.10)' : 'none',
                fontFamily: 'Inter, sans-serif', transition: 'background 140ms ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', fontSize: '13.5px', fontWeight: active ? 800 : 650, color: active ? 'var(--text)' : 'var(--text-muted)' }}>
                {info.locked && <Lock size={12} strokeWidth={2.2} color="var(--text-faint)" />}
                {t.label}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '3px', color: info.locked ? 'var(--text-faint)' : accentHex }}>
                {info.locked
                  ? info.remaining + ' more word' + (info.remaining === 1 ? '' : 's')
                  : (info.comingSoon ? 'coming soon' : info.storyCount + ' ' + (info.storyCount === 1 ? 'story' : 'stories'))}
              </div>
            </button>
          )
        })}
      </div>
      <div style={{ textAlign: 'right', marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
        {pct}% of this level unlocked
      </div>
    </div>
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

// The heading above a group on the shelf ("Series · 2 to follow").
function SectionHeading({ title, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', margin: '0 0 12px', flexWrap: 'wrap' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>{title}</h3>
      {note && <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{note}</span>}
    </div>
  )
}

// A series as ONE card on the shelf: the cover of its first chapter, the
// chapter count, and how far in you are. Tapping it opens the series page.
//
// The stacked edges behind the card are the whole point — they say "there is
// more inside this" before you read a word of the label, which is what stops a
// series reading as a single story.
function SeriesCard({ arc, readIds, accentHex, fontFamily, isMobile, onOpen }) {
  const [hovered, setHovered] = useState(false)
  const readCount = arc.parts.filter(p => readIds.has(p.id)).length
  const total = arc.parts.length
  const done = readCount === total
  const ongoing = seriesHasMore(arc)
  // Open on the cover of where you actually are, not always chapter one.
  const coverStory = arc.parts.find(p => !readIds.has(p.id)) || arc.parts[0]
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
        onClick={onOpen}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column', textAlign: 'left',
          width: '100%', padding: 0, cursor: 'pointer',
          border: '1px solid ' + (hovered ? accentHex + '55' : 'var(--border)'),
          borderRadius: '16px', overflow: 'hidden', background: 'var(--surface)',
          boxShadow: hovered ? '0 16px 34px rgba(24,24,27,0.10)' : '0 6px 20px rgba(24,24,27,0.05)',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 170ms ease', fontFamily: 'Inter, sans-serif',
        }}
      >
        <StoryCover
          story={coverStory} path={coverStory && coverStory.image_path} accent={accentHex} radius={0}
          style={{ width: '100%', aspectRatio: '16 / 9', border: 'none', borderBottom: '1px solid var(--border)' }}
        >
          <div style={{
            position: 'absolute', top: '8px', left: '8px', display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '10.5px', fontWeight: 800, color: '#fff',
            background: 'rgba(24,24,27,0.55)', borderRadius: '999px', padding: '3px 9px', zIndex: 1,
          }}>
            <Layers size={12} strokeWidth={2.2} color="#fff" />
            {total} chapter{total === 1 ? '' : 's'}
          </div>
          {done && (
            <div style={{
              position: 'absolute', top: '8px', right: '8px', width: '22px', height: '22px',
              borderRadius: '999px', background: 'var(--success)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', zIndex: 1,
            }}>
              <CheckCircle2 size={14} strokeWidth={2.4} color="#fff" />
            </div>
          )}
        </StoryCover>
        <div style={{ padding: '12px 14px 13px', display: 'flex', flexDirection: 'column', gap: '7px', flex: 1 }}>
          <div title={arc.title} style={{
            fontSize: isMobile ? '15px' : '16px', fontWeight: 750, fontFamily, color: 'var(--text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3,
          }}>
            {arc.title}
          </div>
          <SeriesProgress readCount={readCount} total={total} accentHex={accentHex} ongoing={ongoing} />
        </div>
      </button>
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

// The locked state for a tier that has nothing readable yet.
function LockedTierPanel({ remaining, accentHex }) {
  return (
    <div style={{
      textAlign: 'center', padding: '48px 28px', background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: '22px', boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
    }}>
      <div style={{ width: '52px', height: '52px', borderRadius: '16px', margin: '0 auto', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Lock size={24} strokeWidth={1.8} color="var(--text-faint)" />
      </div>
      <div style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 800, marginTop: '14px' }}>Keep learning to unlock</div>
      <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6 }}>
        <strong style={{ color: accentHex, fontWeight: 700 }}>{remaining}</strong> more learned word{remaining === 1 ? '' : 's'} and this tier’s stories open up.
      </div>
    </div>
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
  const [activeTier, setActiveTier] = useState(null)
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
  // Real size of the current level's deck (set in loadData) — not a hardcoded
  // per-language guess, so the progress denominator is right for every language.
  const [totalWords, setTotalWords] = useState(0)
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

  async function loadData() {
    setLoading(true)

    // Everything the stories screen needs is fetched, then mirrored into
    // IndexedDB so the whole library (list + text + read markers) opens offline.
    // If the network is down, the last good snapshot is served instead.
    const snapKey = 'storiesdata:' + track.language + ':' + track.system + ':' + track.current_level
    let vocabData = null, cardsData = null, storiesData = null, readsData = null
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
    } catch { /* offline — fall back to the cached snapshot below */ }

    if (storiesData && storiesData.length) {
      cacheSet(snapKey, { vocabData, cardsData, storiesData, readsData })
    } else {
      const snap = await cacheGet(snapKey)
      if (snap) {
        vocabData = vocabData || snap.vocabData
        cardsData = cardsData || snap.cardsData
        storiesData = snap.storiesData
        readsData = readsData || snap.readsData
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
    setTotalWords(currentLevelIds.size)
    const learned = (cardsData || []).filter(c => currentLevelIds.has(c.vocab_id) && isLearned(c)).length
    setLearnedCount(learned)

    setStories(storiesData || [])
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

  // The levels (current first, then down) that contribute a tier's stories, each
  // tagged with its own unlock state — the cumulative shelf, sliced by tier.
  const shelvesForTier = (tier) => {
    const out = []
    for (const level of storyLevels(stories, track.current_level)) {
      const spec = tiersAt(level).find(t => t.tier === tier)
      if (!spec) continue
      const levelStories = stories.filter(s => s.tier === tier && levelOf(s.level) === level)
      if (levelStories.length === 0 && level !== track.current_level) continue
      const learned = learnedAt(level)
      out.push({ level, spec, learned, unlocked: learned >= spec.minWords, stories: levelStories })
    }
    return out
  }

  // Per-tab lock/summary for the tab bar: locked (with the smallest remaining
  // gap) when nothing in the tier is readable yet; else a story count, or
  // "coming soon" when it is unlocked but no content exists.
  const tierInfo = (tier) => {
    const shelves = shelvesForTier(tier)
    const readable = shelves.filter(sh => sh.unlocked && sh.stories.length > 0)
    if (readable.length > 0) {
      return { locked: false, comingSoon: false, storyCount: readable.reduce((n, sh) => n + sh.stories.length, 0) }
    }
    const lockedWithStories = shelves.filter(sh => !sh.unlocked && sh.stories.length > 0)
    if (lockedWithStories.length > 0) {
      const remaining = Math.min(...lockedWithStories.map(sh => sh.spec.minWords - sh.learned))
      return { locked: true, remaining: Math.max(1, remaining), comingSoon: false, storyCount: 0 }
    }
    const cur = shelves.find(sh => sh.level === track.current_level)
    if (cur && !cur.unlocked) return { locked: true, remaining: Math.max(1, cur.spec.minWords - cur.learned), comingSoon: false, storyCount: 0 }
    return { locked: false, comingSoon: true, storyCount: 0 }
  }

  // The open tab: the learner's choice, else the first tier with readable
  // stories, else the first tier.
  const defaultTier = (CATEGORIES.find(t => { const i = tierInfo(t.tier); return !i.locked && !i.comingSoon }) || CATEGORIES[0] || { tier: 1 }).tier
  const currentTier = activeTier != null ? activeTier : defaultTier

  const pct = totalWords > 0 ? Math.min(100, Math.round((learnedCount / totalWords) * 100)) : 0
  const levelLabelFor = (story) => getLevelLabel(track.language, track.system, story.level == null ? track.current_level : story.level)
  const daily = pickDailyStory({ stories, categories: CATEGORIES, learnedCount, readIds, dateStr: todayStr(), tiersFor: tiersAt, learnedFor: learnedAt })
  const activeShelves = shelvesForTier(currentTier)
  const activeInfo = tierInfo(currentTier)
  const multiLevel = activeShelves.filter(sh => sh.stories.length > 0).length > 1

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
                <h1 style={{
                  fontFamily: fontFamily + ', Inter, sans-serif', color: '#fff',
                  fontSize: isMobile ? '25px' : '31px', fontWeight: 600, lineHeight: 1.32,
                  letterSpacing: '0.01em', margin: '10px 0 8px', maxWidth: '20ch',
                }}>
                  {heroSentence(daily.content)}
                </h1>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 }}>
                  {daily.title} · {getLevelLabel(track.language, track.system, daily.level == null ? track.current_level : daily.level)}
                </div>
                <HeroAction label="Start reading" hovered={hovered} icon={ArrowRight} accentHex={accentHex} />
              </div>
            )}
          </HeroPanel>
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

        {/* One control replaces the old progress bar + ladder: tiers as tabs. */}
        <TierTabs
          tiers={CATEGORIES} activeTier={currentTier} tierInfo={tierInfo}
          pct={pct} accentHex={accentHex} onPick={setActiveTier}
        />

        <FilterRow
          status={statusFilter} setStatus={setStatusFilter}
          format={formatFilter} setFormat={setFormatFilter} accentHex={accentHex}
        />

        <div role="tabpanel" aria-label={(CATEGORIES.find(t => t.tier === currentTier) || {}).label || 'Stories'}>
        {(() => {
          const filters = { status: statusFilter, format: formatFilter }
          const blocks = []
          activeShelves.forEach(sh => {
            if (!sh.unlocked) return   // a locked shelf shows nothing (only the current level can be locked → handled below)
            const filtered = filterStories(sh.stories, filters, readIds)
            const narrative = filtered.filter(s => !isPracticeFormat(s))
            const practice = filtered.filter(s => isPracticeFormat(s))
            if (narrative.length === 0 && practice.length === 0) return
            const { standaloneStories, seriesArcs, looseStories } = organizeNarrativeStories(narrative)
            const showLooseHeader = standaloneStories.length > 0 || seriesArcs.length > 0
            blocks.push(
              <section key={sh.level}>
                {multiLevel && (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                      {getLevelLabel(track.language, track.system, sh.level)}
                    </h2>
                    {sh.level === track.current_level && (
                      <span style={pillStyle(accentHex, accentHex + '12', accentHex + '30')}>Your level</span>
                    )}
                  </div>
                )}
                <div style={{ display: 'grid', gap: '28px' }}>
                  {standaloneStories.length > 0 && (
                    <section aria-labelledby={'standalone-stories-' + sh.level}>
                      <div id={'standalone-stories-' + sh.level}>
                        <SectionHeading title="Standalone stories" note="Complete in one sitting" />
                      </div>
                      <CardGrid isMobile={isMobile}>
                        {standaloneStories.map(story => (
                          <StoryCard key={story.id} story={story} read={readIds.has(story.id)} accentHex={accentHex}
                            fontFamily={fontFamily} levelLabel={levelLabelFor(story)} onClick={() => openStory(story)} />
                        ))}
                      </CardGrid>
                    </section>
                  )}
                  {seriesArcs.length > 0 && (
                    <section aria-labelledby={'story-series-' + sh.level}>
                      <div id={'story-series-' + sh.level}>
                        <SectionHeading title="Series" note={seriesArcs.length + ' to follow'} />
                      </div>
                      <CardGrid isMobile={isMobile}>
                        {seriesArcs.map(arc => (
                          <SeriesCard
                            key={arc.key} arc={arc} readIds={readIds} accentHex={accentHex}
                            fontFamily={fontFamily} isMobile={isMobile} onOpen={() => openSeries(arc)}
                          />
                        ))}
                      </CardGrid>
                    </section>
                  )}
                  {looseStories.length > 0 && (
                    <section>
                      {showLooseHeader && <SectionHeading title="More stories" note={looseStories.length + ' to read'} />}
                      <CardGrid isMobile={isMobile}>
                        {looseStories.map(story => (
                          <StoryCard key={story.id} story={story} read={readIds.has(story.id)} accentHex={accentHex}
                            fontFamily={fontFamily} levelLabel={levelLabelFor(story)} onClick={() => openStory(story)} />
                        ))}
                      </CardGrid>
                    </section>
                  )}
                  <PracticeSection
                    stories={practice} readIds={readIds} accentHex={accentHex}
                    fontFamily={fontFamily} levelLabelFor={levelLabelFor} isMobile={isMobile} onOpen={openStory}
                  />
                </div>
              </section>
            )
          })

          if (blocks.length > 0) return <div style={{ display: 'grid', gap: '38px' }}>{blocks}</div>
          if (activeInfo.locked) return <LockedTierPanel remaining={activeInfo.remaining} accentHex={accentHex} />
          if (statusFilter !== 'all' || formatFilter !== 'all') {
            return <EmptyPanel icon={BookOpen} title="Nothing matches" text="No stories match these filters yet — try switching them back to All." />
          }
          return <EmptyPanel icon={Library} title="No stories yet" text="Stories for this tier are on the way. Keep learning words — they'll be here waiting." />
        })()}
        </div>
      </div>
    </div>
  )
}
