import { useState, useEffect, useMemo } from 'react'
import { fetchPagedSafe } from './supabasePaging'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel, getLevels } from './utils'
import { cacheSet, cacheGet } from './offline'
import { languageTheme, ink } from './languageTheme'
import { HeroPanel, HeroAction, Eyebrow } from './panels'
import { MICRO, NUM } from './designTokens'
import { heroSentence, firstContentChar } from './homeStory'
import { tiersFor, learnedByLevel, readingGateCount, nextLockedTier } from './storyTiers'
import { isLearned } from './mastery'
import { useIsMobile } from './useIsMobile'
import { todayStr } from './streak'
import { pickDailyStory } from './dailyStory'
import { groupIntoArcs } from './storyArcs'
import { filterStories, STATUS_FILTERS, FORMAT_FILTERS } from './storyList'
import {
  scoreStories, searchStories, sortEntries, shelfLevels, defaultShelfLevel,
  shelfSummary, comfortBand, storyLength, SORT_OPTIONS, DEFAULT_SORT,
} from './storyLibrary'
import { isPracticeFormat, formatLabel, formatEmoji } from './storyFormat'
import StoryReader from './StoryReader'
import StoryCover from './StoryCover'
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Layers, Library, Lock, Search, X,
} from 'lucide-react'

// The library, in one paragraph:
//
//   You pick a level (the rail), and everything written for that level is on one
//   shelf, ordered by how much of it you can already read. Tiers still gate what
//   is open — that is the mastery rule and it has not changed — but they are no
//   longer how you NAVIGATE. Anything a tier hasn't opened yet sits at the
//   bottom of the shelf saying how many words away it is, instead of hiding
//   behind a tab that reads as empty.
//
// Tier definitions live in ./storyTiers (shared with the post-study recap's
// story matcher); ordering, search and the rail live in ./storyLibrary.

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

// How a "% known" is drawn. The harder a story is, the QUIETER its mark — a
// story you can barely read is not an error, it is just further away, and
// shouting at it in red would be exactly the pressure this app promises not to
// apply. Comfortable earns the one bright colour on the card.
function bandColor(band, accentHex) {
  if (band === 'comfortable') return 'var(--success)'
  if (band === 'steady') return ink(accentHex)
  if (band === 'stretch') return 'var(--text-muted)'
  return 'var(--text-faint)'
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

// The one number this library is sorted by, drawn where the eye already is: a
// hairline along the foot of every cover. Scanning the grid, you read the shelf's
// difficulty as a row of bars before you read a single title.
function KnownRail({ pct, accentHex }) {
  if (typeof pct !== 'number') return null
  const color = bandColor(comfortBand(pct).key, accentHex)
  return (
    <div aria-hidden="true" style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, height: '3px',
      background: 'rgba(24,24,27,0.22)', zIndex: 1,
    }}>
      <div style={{ width: Math.max(2, pct) + '%', height: '100%', background: color }} />
    </div>
  )
}

// The same number as words, in the meta row, so it is not colour-only.
function KnownTag({ pct, accentHex }) {
  if (typeof pct !== 'number') return null
  const band = comfortBand(pct)
  return (
    <span
      title={band.label + ' — you already know ' + pct + '% of the words in this one'}
      style={{
        ...metaTag, ...NUM,
        color: bandColor(band.key, accentHex),
        borderColor: 'var(--border)',
      }}
    >
      {pct}% known
    </span>
  )
}

// ─── NORMALIZED STORY CARD ─────────────────────────────────────────────────

// One template for every card, story or practice: a fixed 16:9 cover slot (real
// art or the designed fallback) with the readability rail along its foot, the
// title on one line, a single ellipsized description line (no variable-height
// wrapping), then a consistent meta row of level tag · format tag · % known.
function StoryCard({ story, read, accentHex, fontFamily, levelLabel, practice, score, onClick }) {
  const [hovered, setHovered] = useState(false)
  const pct = score ? score.knownPct : null
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
        <KnownRail pct={pct} accentHex={accentHex} />
      </StoryCover>
      <div style={{ padding: '12px 14px 13px', display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
        <div title={story.title} style={{ fontSize: '16px', fontWeight: 750, fontFamily, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
          {story.title}
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>
          {story.english_summary || '—'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '3px', flexWrap: 'nowrap' }}>
          <span style={metaTag}>{levelLabel}</span>
          <span style={metaTag}>{formatEmoji(story)} {formatLabel(story)}</span>
          <span style={{ marginLeft: 'auto' }}>
            <KnownTag pct={pct} accentHex={accentHex} />
          </span>
        </div>
      </div>
    </button>
  )
}

// A story (or a whole series) a tier hasn't opened yet. It is deliberately still
// ON the shelf — seeing the cover of the thing you are five words away from is
// the honest version of "keep going", and much better than a tab that looks
// empty. Not a button: there is nothing to open yet.
function LockedCard({ title, subtitle, note, story, accentHex, fontFamily, isMobile }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', textAlign: 'left', width: '100%',
      border: '1px dashed var(--border)', borderRadius: '16px', overflow: 'hidden',
      background: 'var(--surface)', fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ position: 'relative', filter: 'grayscale(0.55)', opacity: 0.5 }}>
        <StoryCover
          story={story} path={story && story.image_path} accent={accentHex} radius={0}
          style={{ width: '100%', aspectRatio: '16 / 9', border: 'none', borderBottom: '1px solid var(--border)' }}
        />
        <div style={{
          position: 'absolute', top: '8px', left: '8px', width: '22px', height: '22px',
          borderRadius: '999px', background: 'rgba(24,24,27,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1,
        }}>
          <Lock size={12} strokeWidth={2.2} color="#fff" />
        </div>
      </div>
      <div style={{ padding: '12px 14px 13px', display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
        <div title={title} style={{
          fontSize: isMobile ? '15px' : '16px', fontWeight: 750, fontFamily, color: 'var(--text-muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3,
        }}>
          {title}
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>
          {subtitle || '—'}
        </div>
        <div style={{ marginTop: '3px', fontSize: '11.5px', fontWeight: 700, color: accentHex }}>
          {note}
        </div>
      </div>
    </div>
  )
}

// ─── THE LEVEL RAIL ────────────────────────────────────────────────────────

// The shelf picker, and the point of the whole redesign: reading is something
// you CHOOSE a level for, not something the app hands you one tab of. Every
// level you have reached is a chip; the ones ahead are chips too, dimmed, so the
// ladder is visible rather than implied.
function LevelRail({ rail, activeLevel, currentLevel, labelFor, accentHex, onPick }) {
  return (
    <div
      role="tablist" aria-label="Reading level"
      style={{
        display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 2px 8px',
        marginBottom: '14px', scrollbarWidth: 'thin',
      }}
    >
      {rail.map(r => {
        const active = r.level === activeLevel
        const here = r.level === currentLevel
        return (
          <button
            key={r.level} role="tab" aria-selected={active} onClick={() => onPick(r.level)}
            style={{
              flex: '0 0 auto', minWidth: '124px', cursor: 'pointer', textAlign: 'left',
              borderRadius: '14px', padding: '10px 14px 11px',
              border: '1px solid ' + (active ? accentHex + '55' : 'var(--border)'),
              background: active
                ? 'color-mix(in srgb, ' + accentHex + ' 11%, var(--surface))'
                : 'var(--surface)',
              boxShadow: active ? '0 6px 18px rgba(24,24,27,0.07)' : 'none',
              opacity: r.locked ? 0.72 : 1,
              fontFamily: 'Inter, sans-serif',
              transition: 'background 140ms ease, border-color 140ms ease',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '14px', fontWeight: active ? 800 : 700,
              color: active ? ink(accentHex) : 'var(--text)',
            }}>
              {r.locked && <Lock size={12} strokeWidth={2.2} color="var(--text-faint)" />}
              {labelFor(r.level)}
              {here && !r.locked && (
                <span aria-hidden="true" style={{
                  width: '6px', height: '6px', borderRadius: '999px',
                  background: accentHex, marginLeft: '1px',
                }} />
              )}
            </div>
            <div style={{ ...NUM, fontSize: '11.5px', fontWeight: 600, marginTop: '4px', color: 'var(--text-muted)' }}>
              {r.count === 0
                ? 'nothing yet'
                : r.locked
                  ? r.count + (r.count === 1 ? ' story ahead' : ' stories ahead')
                  : r.readCount > 0
                    ? r.readCount + ' of ' + r.count + ' read'
                    : r.count + (r.count === 1 ? ' story' : ' stories')}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── TOOLBAR ───────────────────────────────────────────────────────────────

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
              whiteSpace: 'nowrap',
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// Search over titles, English summaries and the Chinese text itself, so both
// "noodle" and 面条 land on the same story. No <form> — see CLAUDE.md §6.
function SearchField({ value, onChange, accentHex }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '180px' }}>
      <Search
        size={16} strokeWidth={1.9} color="var(--text-faint)"
        style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
      />
      <input
        type="search" value={value} aria-label="Search stories"
        placeholder="Search titles, summaries, or Chinese"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', height: '38px', padding: '0 34px 0 34px',
          borderRadius: '10px', border: '1px solid ' + (focused ? accentHex + '66' : 'var(--border)'),
          background: 'var(--surface)', color: 'var(--text)',
          fontSize: '13.5px', fontFamily: 'Inter, sans-serif', outline: 'none',
          transition: 'border-color 140ms ease',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')} aria-label="Clear search"
          style={{
            position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
            width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '999px',
          }}
        >
          <X size={15} strokeWidth={2.1} color="var(--text-faint)" />
        </button>
      )}
    </div>
  )
}

function LibraryToolbar({ query, setQuery, sort, setSort, status, setStatus, format, setFormat, accentHex }) {
  return (
    <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchField value={query} onChange={setQuery} accentHex={accentHex} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', maxWidth: '100%' }}>
          <Eyebrow style={{ flex: '0 0 auto' }}>Sort</Eyebrow>
          <Segmented options={SORT_OPTIONS} value={sort} onChange={setSort} accentHex={accentHex} label="Sort" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Segmented options={STATUS_FILTERS} value={status} onChange={setStatus} accentHex={accentHex} label="Read status" />
        <Segmented options={FORMAT_FILTERS} value={format} onChange={setFormat} accentHex={accentHex} label="Format" />
      </div>
    </div>
  )
}

// One honest line about the shelf you are looking at.
function ShelfSummary({ summary, accentHex }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: '12px', flexWrap: 'wrap', marginBottom: '18px',
      paddingBottom: '12px', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ ...NUM, fontSize: '13px', fontWeight: 650, color: 'var(--text-muted)' }}>
        {summary.total} {summary.total === 1 ? 'story' : 'stories'}
        {summary.read > 0 ? ' · ' + summary.read + ' read' : ''}
      </div>
      {summary.avgKnownPct != null && (
        <div style={{ ...MICRO, color: 'var(--text-faint)' }}>
          <span style={{ ...NUM, color: ink(accentHex) }}>{summary.avgKnownPct}%</span> of these words are yours
        </div>
      )}
    </div>
  )
}

// ─── SECTIONS ──────────────────────────────────────────────────────────────

function CardGrid({ children, isMobile }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(232px, 1fr))', gap: '16px' }}>
      {children}
    </div>
  )
}

// The heading above a group on the shelf ("Practice Scenarios · 3 to try").
function SectionHeading({ title, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', margin: '0 0 12px', flexWrap: 'wrap' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>{title}</h3>
      {note && <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{note}</span>}
    </div>
  )
}

// A series as ONE card on the shelf: the cover of the chapter you are actually
// up to, the chapter count, and how far in you are. Tapping it opens the series.
//
// The stacked edges behind the card are the whole point — they say "there is
// more inside this" before you read a word of the label, which is what stops a
// series reading as a single story.
function SeriesCard({ arc, readIds, accentHex, fontFamily, isMobile, knownPct, onOpen }) {
  const [hovered, setHovered] = useState(false)
  const readCount = arc.parts.filter(p => readIds.has(p.id)).length
  const total = arc.parts.length
  const done = readCount === total
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
            {total} chapters
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
          <KnownRail pct={knownPct} accentHex={accentHex} />
        </StoryCover>
        <div style={{ padding: '12px 14px 13px', display: 'flex', flexDirection: 'column', gap: '7px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div title={arc.title} style={{
              flex: 1, minWidth: 0,
              fontSize: isMobile ? '15px' : '16px', fontWeight: 750, fontFamily, color: 'var(--text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3,
            }}>
              {arc.title}
            </div>
            <KnownTag pct={knownPct} accentHex={accentHex} />
          </div>
          <SeriesProgress readCount={readCount} total={total} accentHex={accentHex} />
        </div>
      </button>
    </div>
  )
}

// Shared by the series card and the series page so the two never disagree about
// how far along you are.
function SeriesProgress({ readCount, total, accentHex }) {
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
          : done ? 'Series complete' : readCount + ' of ' + total + ' read'}
      </div>
    </div>
  )
}

// The series page: every chapter of one arc, in reading order.
function SeriesPage({ arc, readIds, accentHex, fontFamily, levelLabelFor, isMobile, scoreOf, onOpen, onBack }) {
  const readCount = arc.parts.filter(p => readIds.has(p.id)).length
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
          <SeriesProgress readCount={readCount} total={arc.parts.length} accentHex={accentHex} />
        </div>
      </div>

      <CardGrid isMobile={isMobile}>
        {arc.parts.map(story => (
          <StoryCard key={story.id} story={story} read={readIds.has(story.id)} accentHex={accentHex}
            fontFamily={fontFamily} levelLabel={levelLabelFor(story)} score={scoreOf(story.id)}
            onClick={() => onOpen(story)} />
        ))}
      </CardGrid>
    </div>
  )
}

// The whole level is still ahead of the learner. Its covers are shown anyway,
// dimmed — a library you can look into is worth more than a locked door.
function LockedLevelPanel({ levelLabel, count, accentHex }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 20px', marginBottom: '20px',
      background: 'color-mix(in srgb, ' + accentHex + ' 7%, var(--surface))',
      border: '1px solid var(--border)', borderRadius: '18px',
    }}>
      <div style={{
        width: '42px', height: '42px', flex: '0 0 auto', borderRadius: '13px', background: 'var(--surface)',
        border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Lock size={19} strokeWidth={1.9} color="var(--text-faint)" />
      </div>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
          {levelLabel} opens when you get there
        </div>
        <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {count === 0
            ? 'Nothing written for it yet — it will fill up before you arrive.'
            : count + (count === 1 ? ' story is' : ' stories are') + ' already waiting up there.'}
        </div>
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
  // Which level's shelf is open (null → resolve a sensible default once stories
  // load), and the library controls. All of them live only on the browse screen.
  const [shelfLevel, setShelfLevel] = useState(null)
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [query, setQuery] = useState('')
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
  // Covers-only rows for the levels ABOVE the learner: enough to draw a dimmed
  // preview shelf, deliberately without `content` so the payload stays small.
  const [previewStories, setPreviewStories] = useState([])
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

  // Every story's "% known", computed ONCE per (shelf, vocabulary, deck) with a
  // single shared matcher. This is what the library is sorted by, so it has to
  // be the same number the reader shows for the same story — it comes from the
  // same canonical readability computation.
  const scores = useMemo(
    () => scoreStories({ stories, vocabMap, cards: userCards, language: track.language }),
    [stories, vocabMap, userCards, track.language]
  )
  const scoreOf = (id) => scores.get(id) || null

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
    let vocabData = null, cardsData = null, storiesData = null, readsData = null, previewData = null
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
      // The levels AHEAD, for the dimmed preview shelf. Columns only — no
      // `content`, which is the whole weight of a story row.
      const pres = await supabase
        .from('stories').select('id, level, tier, story_number, title, english_summary, image_path, presentation, interactions')
        .eq('language', track.language).eq('system', track.system)
        .gt('level', track.current_level).eq('is_published', true)
        .order('level', { ascending: true }).order('story_number', { ascending: true })
      previewData = pres.data
      const rres = await supabase
        .from('story_reads').select('story_id').eq('user_id', session.user.id)
      readsData = rres.data
    } catch { /* offline — fall back to the cached snapshot below */ }

    if (storiesData && storiesData.length) {
      cacheSet(snapKey, { vocabData, cardsData, storiesData, readsData, previewData })
    } else {
      const snap = await cacheGet(snapKey)
      if (snap) {
        vocabData = vocabData || snap.vocabData
        cardsData = cardsData || snap.cardsData
        storiesData = snap.storiesData
        readsData = readsData || snap.readsData
        previewData = previewData || snap.previewData
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

    // The two story queries split the shelf at the learner's level, and the two
    // halves must not overlap: a row on both would be drawn twice, once open and
    // once as a locked preview. Enforced here rather than trusted from the
    // query, since a cached snapshot can predate a level change.
    setStories((storiesData || []).filter(s => s && (s.level == null || s.level <= track.current_level)))
    setPreviewStories((previewData || []).filter(s => s && s.level > track.current_level))
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
    const shelfLvl = selectedCategory.level
    const tiersWithStories = new Set(
      stories.filter(s => levelOf(s.level) === shelfLvl).map(s => s.tier)
    )
    const nextTierUnlock = nextStory
      ? null
      : nextLockedTier(tiersAt(shelfLvl), learnedAt(shelfLvl), tiersWithStories)

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

  // ── Browse view (rail + toolbar + shelf) ───────────────────────────────

  // Open a story straight into the reader, carrying its shelf (tier + level) so
  // next-story and the tier-unlock nudge keep working.
  const openStory = (story, fromSeries = false) => {
    setSelectedCategory(categoryForStory(story, track))
    setSelectedStory(story)
    setReaderFromSeries(fromSeries)
    setView('reader')
  }

  const levelLabelOf = (level) => getLevelLabel(track.language, track.system, level)
  const levelLabelFor = (story) => levelLabelOf(levelOf(story.level))

  // The rail: every level with something on it, plus the one you are standing
  // on, plus the levels ahead as dimmed previews.
  const rail = shelfLevels({
    levels: getLevels(track.language, track.system),
    stories,
    previewStories,
    currentLevel: track.current_level,
    readIds,
  })
  const activeLevel = (shelfLevel != null && rail.some(r => r.level === shelfLevel))
    ? shelfLevel
    : defaultShelfLevel(rail, track.current_level)
  const activeRail = rail.find(r => r.level === activeLevel) || { level: activeLevel, count: 0, locked: false }

  const pct = totalWords > 0 ? Math.min(100, Math.round((learnedCount / totalWords) * 100)) : 0
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
            scoreOf={scoreOf}
            onOpen={(story) => openStory(story, true)}
            onBack={() => { setView('browse'); setSelectedArc(null) }}
          />
        </div>
      </div>
    )
  }

  const openSeries = (arc) => { setSelectedArc(arc); setView('series') }

  // ── The shelf ──────────────────────────────────────────────────────────
  //
  // One level's stories, grouped by tier only so the tier's unlock rule can be
  // applied, then flattened into entries — a single story or a whole series —
  // and ordered by the learner's chosen sort. Arcs are derived from the FULL
  // tier list, never the filtered one, so a series card always states its real
  // chapter count even when a filter hides some of them.
  const shelfStories = stories.filter(s => levelOf(s.level) === activeLevel)
  const searchHits = new Set(searchStories(shelfStories, query).map(s => s.id))
  const filterHits = new Set(
    filterStories(shelfStories, { status: statusFilter, format: formatFilter }, readIds).map(s => s.id)
  )
  const matches = (s) => s && searchHits.has(s.id) && filterHits.has(s.id)

  const tierSpecs = tiersAt(activeLevel)
  const specFor = (tier) => tierSpecs.find(t => t.tier === tier) || { tier, minWords: 0 }
  const learnedHere = learnedAt(activeLevel)

  const avgPct = (parts) => {
    const vals = parts.map(p => scoreOf(p.id)).filter(Boolean).map(sc => sc.knownPct)
    if (vals.length === 0) return null
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }

  const openEntries = []
  const practiceEntries = []
  const lockedEntries = []

  tierSpecs.forEach(spec => {
    const inTier = shelfStories.filter(s => s.tier === spec.tier)
    if (inTier.length === 0) return
    const unlocked = learnedHere >= spec.minWords
    const remaining = Math.max(1, spec.minWords - learnedHere)
    const narrative = inTier.filter(s => !isPracticeFormat(s))
    const practice = inTier.filter(s => isPracticeFormat(s))

    groupIntoArcs(narrative).forEach(arc => {
      const isSeries = arc.numbered && arc.parts.length > 1
      if (isSeries) {
        if (!arc.parts.some(matches)) return
        const readCount = arc.parts.filter(p => readIds.has(p.id)).length
        const entry = {
          id: 'arc:' + arc.key, kind: 'series', arc,
          level: activeLevel, tier: spec.tier,
          storyNumber: Math.min(...arc.parts.map(p => p.story_number || 0)),
          knownPct: avgPct(arc.parts),
          length: arc.parts.reduce((n, p) => n + storyLength(p), 0),
          read: readCount === arc.parts.length,
          inProgress: readCount > 0 && readCount < arc.parts.length,
          unlocked, remaining,
        }
        ;(unlocked ? openEntries : lockedEntries).push(entry)
        return
      }
      arc.parts.forEach(story => {
        if (!matches(story)) return
        const sc = scoreOf(story.id)
        const entry = {
          id: story.id, kind: 'story', story,
          level: activeLevel, tier: spec.tier, storyNumber: story.story_number || 0,
          knownPct: sc ? sc.knownPct : null,
          length: storyLength(story),
          read: readIds.has(story.id), inProgress: false,
          unlocked, remaining,
        }
        ;(unlocked ? openEntries : lockedEntries).push(entry)
      })
    })

    practice.forEach(story => {
      if (!matches(story)) return
      const sc = scoreOf(story.id)
      const entry = {
        id: story.id, kind: 'story', story, practice: true,
        level: activeLevel, tier: spec.tier, storyNumber: story.story_number || 0,
        knownPct: sc ? sc.knownPct : null,
        length: storyLength(story),
        read: readIds.has(story.id), inProgress: false,
        unlocked, remaining,
      }
      ;(unlocked ? practiceEntries : lockedEntries).push(entry)
    })
  })

  const sortedOpen = sortEntries(openEntries, sort)
  const sortedPractice = sortEntries(practiceEntries, sort)
  const sortedLocked = sortEntries(lockedEntries, 'order')

  // The summary counts the stories that are actually open to the learner on this
  // shelf — not the locked previews, which would flatter the average.
  const summaryPool = shelfStories.filter(s => learnedHere >= specFor(s.tier).minWords)
  const summary = shelfSummary(summaryPool, readIds, scores)

  const filtersOn = query.trim() !== '' || statusFilter !== 'all' || formatFilter !== 'all'
  const previewsHere = previewStories.filter(s => s.level === activeLevel)

  const renderEntry = (entry) => (
    entry.kind === 'series'
      ? (
        <SeriesCard
          key={entry.id} arc={entry.arc} readIds={readIds} accentHex={accentHex}
          fontFamily={fontFamily} isMobile={isMobile} knownPct={entry.knownPct}
          onOpen={() => openSeries(entry.arc)}
        />
      )
      : (
        <StoryCard
          key={entry.id} story={entry.story} read={entry.read} accentHex={accentHex}
          fontFamily={fontFamily} levelLabel={levelLabelFor(entry.story)}
          practice={entry.practice} score={scoreOf(entry.story.id)}
          onClick={() => openStory(entry.story)}
        />
      )
  )

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
                    {getSystemLabel(track.system)} · {getLevelLabel(track.language, track.system, track.current_level)} · {pct}% learned
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
              Pick a level and read anything on its shelf.
            </p>
          </div>
        )}

        {/* Pick your shelf. This is the screen's primary navigation now. */}
        <LevelRail
          rail={rail} activeLevel={activeLevel} currentLevel={track.current_level}
          labelFor={levelLabelOf} accentHex={accentHex} onPick={setShelfLevel}
        />

        <div role="tabpanel" aria-label={levelLabelOf(activeLevel) + ' shelf'}>
        {activeRail.locked ? (
          <div>
            <LockedLevelPanel levelLabel={levelLabelOf(activeLevel)} count={previewsHere.length} accentHex={accentHex} />
            {previewsHere.length > 0 && (
              <CardGrid isMobile={isMobile}>
                {previewsHere.map(s => (
                  <LockedCard
                    key={s.id} story={s} title={s.title} subtitle={s.english_summary}
                    note={'Opens at ' + levelLabelOf(activeLevel)}
                    accentHex={accentHex} fontFamily={fontFamily} isMobile={isMobile}
                  />
                ))}
              </CardGrid>
            )}
          </div>
        ) : (
          <div>
            <LibraryToolbar
              query={query} setQuery={setQuery}
              sort={sort} setSort={setSort}
              status={statusFilter} setStatus={setStatusFilter}
              format={formatFilter} setFormat={setFormatFilter}
              accentHex={accentHex}
            />
            <ShelfSummary summary={summary} accentHex={accentHex} />

            {(sortedOpen.length > 0 || sortedPractice.length > 0 || sortedLocked.length > 0) ? (
              <div style={{ display: 'grid', gap: '32px' }}>
                {sortedOpen.length > 0 && (
                  <section>
                    <CardGrid isMobile={isMobile}>
                      {sortedOpen.map(renderEntry)}
                    </CardGrid>
                  </section>
                )}

                {/* Practice scenarios (chat / scene / reply-along) keep their own
                    section: they are drills, not stories, and mixing them into
                    an arc made them read as broken story cards. */}
                {sortedPractice.length > 0 && (
                  <section>
                    <SectionHeading
                      title="Practice Scenarios"
                      note={sortedPractice.length + ' to try — chat, scene & reply-along'}
                    />
                    <CardGrid isMobile={isMobile}>
                      {sortedPractice.map(renderEntry)}
                    </CardGrid>
                  </section>
                )}

                {/* Still ahead of the learner on THIS level. Shown, not hidden. */}
                {sortedLocked.length > 0 && (
                  <section>
                    <SectionHeading
                      title="Not open yet"
                      note="these unlock themselves as you learn more words"
                    />
                    <CardGrid isMobile={isMobile}>
                      {sortedLocked.map(e => (
                        <LockedCard
                          key={e.id}
                          story={e.kind === 'series' ? e.arc.parts[0] : e.story}
                          title={e.kind === 'series' ? e.arc.title : e.story.title}
                          subtitle={e.kind === 'series'
                            ? e.arc.parts.length + ' chapters'
                            : e.story.english_summary}
                          note={e.remaining + ' more learned word' + (e.remaining === 1 ? '' : 's')}
                          accentHex={accentHex} fontFamily={fontFamily} isMobile={isMobile}
                        />
                      ))}
                    </CardGrid>
                  </section>
                )}
              </div>
            ) : filtersOn ? (
              <EmptyPanel icon={Search} title="Nothing matches" text="No stories on this shelf match what you're looking for — try another level, or clear the filters." />
            ) : (
              <EmptyPanel icon={Library} title="This shelf is empty" text="Nothing is written for this level yet. Try another level on the rail — the shelves below you stay open." />
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
