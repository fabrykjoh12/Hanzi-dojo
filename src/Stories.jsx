import { useState, useEffect, useRef } from 'react'
import { getLevelLabel, getSystemLabel, metaLine} from './utils'
import { toast } from './toast'
import { HeroPanel, HeroAction, Eyebrow } from './panels'
import { tiersFor, readingGateCount } from './storyTiers'
import { useIsMobile } from './useIsMobile'
import { todayStr } from './streak'
import { pickDailyStory } from './dailyStory'
import { formatLabel } from './storyFormat'
import { chapterInfo, readingMinutes } from './storyChapters'
import { claimStoryReward } from './storyRewardData'
import StoryCover from './StoryCover'
import StoryPoster from './StoryPoster'
import TourOverlay from './TourOverlay'
import { maybeStartTour, markTourSeen } from './tour'
import { useStoriesData } from './storiesDataContext'
import { getLanguageDetails, pageShell } from './storiesScreenShared'
import {
  ArrowRight, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, CloudOff, Library, RefreshCw, Zap,
} from 'lucide-react'

// The Stories library. Content is organized as SERIES → CHAPTER → READER:
// vertical posters on horizontal rails (continue reading, the current level's
// picks, earlier levels, manhua, practice, the next level's teaser), a hero
// that carries the day's story reward, and a series detail page for choosing
// chapters. Chapter unlocking (one per completed flashcard session) is decided
// in storyChapters.js / storyReward.js — this file only renders it.

// ─── CONSTANTS / SMALL HELPERS ─────────────────────────────────────────────

function isManhuaUnit(unit) {
  return (unit.parts || []).some(p => p && p.presentation === 'manhua')
}

// ─── SHELF ROWS ────────────────────────────────────────────────────────────

// Poster rail item width: ~2.4 posters visible on a phone, fixed on desktop.
function posterItemStyle(isMobile) {
  return {
    flex: isMobile ? '0 0 clamp(128px, 38vw, 168px)' : '0 0 176px',
    scrollSnapAlign: 'start', minWidth: 0,
  }
}

function ShelfRow({ id, title, subtitle, isMobile, children, dataTour }) {
  const railRef = useRef(null)
  const scroll = (direction) => {
    const rail = railRef.current
    if (!rail) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    rail.scrollBy({ left: direction * Math.max(rail.clientWidth * 0.78, 280), behavior: reduced ? 'auto' : 'smooth' })
  }
  return (
    <section aria-labelledby={id} data-tour={dataTour} style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '16px', marginBottom: '10px' }}>
        <div style={{ minWidth: 0 }}>
          <h2 id={id} style={{ margin: 0, color: 'var(--text)', fontSize: isMobile ? '17px' : '19px', fontWeight: 800, letterSpacing: '-0.02em' }}>
            {title}
          </h2>
          {subtitle && <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.45 }}>{subtitle}</p>}
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
          display: 'flex', gap: isMobile ? '12px' : '16px', overflowX: 'auto', overflowY: 'visible',
          overscrollBehaviorInline: 'contain', scrollSnapType: 'x proximity', scrollbarWidth: 'thin',
          padding: '4px 3px 16px', margin: '0 -3px', minWidth: 0,
          // The covers used to sit 3px left of every other element on the page
          // — the heading, the subtitle, the hero all start at the page inset,
          // the posters started 3px outside it. Reported as "off-centre" from a
          // device, and consistent at 320, 390 and 430.
          //
          // Not a margin bug. The padding was applied correctly (the first
          // item's offsetLeft was the padding edge); the RAIL WAS SCROLLED. The
          // snapport defaults to the scrollport's border edge, so snapping the
          // first item's start to it means scrolling by exactly the padding —
          // measured scrollLeft: 3. The negative-margin/padding pattern that
          // keeps shadows and focus rings from being clipped and scroll-snap
          // were fighting, and snap won.
          //
          // scroll-padding is the spec's answer: it moves the snapport in to
          // the padding edge, so the first item snaps at scrollLeft 0 and lands
          // on the page column. The breathing room is untouched.
          scrollPaddingInline: '3px',
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

// ─── FILTER CHIPS ──────────────────────────────────────────────────────────

function FilterChips({ options, value, onChange, accentHex }) {
  return (
    <div role="group" aria-label="Filter stories" style={{
      display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none',
      padding: '2px 3px 12px', margin: '0 -3px',
    }}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className="hd-press"
            style={{
              flexShrink: 0, minHeight: '38px', padding: '0 15px', borderRadius: '999px',
              border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
              background: active ? accentHex : 'var(--surface)',
              color: active ? '#fff' : 'var(--text-muted)',
              fontSize: '13px', fontWeight: 700, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              transition: 'background 140ms ease, color 140ms ease',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── EMPTY STATE ───────────────────────────────────────────────────────────

function EmptyPanel({ icon: Icon, title, text, actionIcon: ActionIcon, actionLabel, onAction }) {
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
          <button onClick={onAction} className="hd-press" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            minHeight: '44px', padding: '0 16px', borderRadius: '12px',
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650,
            fontFamily: 'Inter, sans-serif', cursor: 'pointer',
          }}>
            <ActionIcon size={17} strokeWidth={1.85} color="var(--text-muted)" />
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── THE HERO ──────────────────────────────────────────────────────────────

// One lit panel, carrying the day's most useful next step: the story reward
// when the learner has a series going (locked → "start flashcards", unlocked →
// "read now", everything open → "continue"), and a featured pick otherwise.
function StoriesHero({ hero, accentHex, fontFamily, isMobile, levelLabelOf }) {
  const coverStory = hero.cover
  return (
    <HeroPanel
      accentHex={accentHex}
      seed={hero.seed}
      padding="0"
      compact={isMobile}
      onClick={hero.onAction}
      style={{ margin: '0 0 26px', minHeight: isMobile ? '280px' : '340px' }}
      dataTour="stories-hero"
    >
      {({ hovered }) => (
        <div style={{ position: 'relative', minHeight: isMobile ? '280px' : '340px', display: 'flex', alignItems: 'end' }}>
          <StoryCover
            story={coverStory} path={coverStory && coverStory.image_path} accent={accentHex} radius={0} loading="eager"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          />
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0,
            background: isMobile
              ? 'linear-gradient(0deg, rgba(13,13,15,0.94) 0%, rgba(13,13,15,0.58) 58%, rgba(13,13,15,0.16) 100%)'
              : 'linear-gradient(90deg, rgba(13,13,15,0.94) 0%, rgba(13,13,15,0.70) 42%, rgba(13,13,15,0.14) 76%)',
          }} />
          <div style={{ position: 'relative', zIndex: 1, padding: isMobile ? '22px 20px' : '34px 38px', maxWidth: isMobile ? '100%' : '620px' }}>
            <Eyebrow onHero>{hero.eyebrow}</Eyebrow>
            {hero.kicker && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px', marginTop: '12px',
                fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em',
                color: '#fff', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)',
                borderRadius: '999px', padding: '6px 12px',
              }}>
                {hero.kickerIcon}
                {hero.kicker}
              </div>
            )}
            <div style={{
              fontFamily: fontFamily + ', Inter, sans-serif', color: '#fff',
              fontSize: isMobile ? '26px' : '36px', fontWeight: 700, lineHeight: 1.18,
              letterSpacing: '-0.02em', margin: '10px 0 8px',
            }}>
              {hero.title}
            </div>
            {hero.subtitle && (
              <div style={{ fontSize: isMobile ? '13px' : '14px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, maxWidth: '52ch' }}>
                {hero.subtitle}
              </div>
            )}
            <div style={{ marginTop: '10px', color: 'rgba(255,255,255,0.64)', fontSize: '12px', fontWeight: 700 }}>
              {hero.metaStory ? levelLabelOf(hero.metaStory) + ' · ' + formatLabel(hero.metaStory) : hero.meta}
            </div>
            <HeroAction label={hero.actionLabel} hovered={hovered} icon={hero.actionIcon || ArrowRight} accentHex={accentHex} />
          </div>
        </div>
      )}
    </HeroPanel>
  )
}

// ─── MAIN STORIES COMPONENT ────────────────────────────────────────────────

export default function Stories({ onNavigate, onOpenStory, onOpenSeries }) {
  // The shelf owns the shelf. Everything the three Stories destinations share —
  // stories, reads, unlocks, the vocabulary map, the derived sections — lives
  // above all three now (StoriesDataContext.jsx), because the series page and
  // the reader are real pushed and presented screens rather than branches of
  // this component.
  const data = useStoriesData()
  const {
    session, profile, track, stories, readIds, learnedCount,
    learnedPerLevel, loading, loadFailed,
    sections, aheadSection, rewardUnits, activeUnit, rewardState,
  } = data
  const [filter, setFilter] = useState('all')
  const redeemAttempted = useRef(false)
  const isMobile = useIsMobile()

  const { accentHex, fontFamily } = getLanguageDetails(profile, track)

  const levelOf = (lvl) => (lvl == null ? track.current_level : lvl)
  const tiersAt = (lvl) => tiersFor(track.language, levelOf(lvl))
  const learnedAt = (lvl) => readingGateCount({
    level: levelOf(lvl),
    currentLevel: track.current_level,
    learnedAtLevel: learnedPerLevel[levelOf(lvl)] || 0,
    tiers: tiersAt(lvl),
  })
  const CATEGORIES = tiersAt(track.current_level)

  // Ask on every show. The cache answers for free unless an event
  // invalidated it (StoriesDataContext.ensureLoaded), so switching tabs, going
  // into a series and coming back all do no network work at all.
  // No dependency array: it must re-check on every show, which is exactly what
  // <Activity> gives it. `data` changes identity whenever the payload does, and
  // depending on it would mean re-running for reasons that are not shows.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { data.ensureLoaded() })

  // A banked claim (session completed with nothing to unlock at the time)
  // redeems itself the moment an active series with a locked chapter exists —
  // "you already did today's flashcards" should never expire while the day
  // lasts. One attempt per mount; the RPC is idempotent anyway.
  useEffect(() => {
    if (loading || redeemAttempted.current) return
    if (rewardState.state !== 'banked' || !rewardState.chapter) return
    redeemAttempted.current = true
    const chapter = rewardState.chapter
    claimStoryReward({ userId: session.user.id, track, storyId: chapter.id }).then(res => {
      if (res && res.redeemed && res.story_id === chapter.id) {
        data.applyUnlock(chapter.id)
        const info = chapterInfo(chapter, (activeUnit ? activeUnit.parts.indexOf(chapter) : 0))
        toast({ title: 'Chapter unlocked — ' + (info.nativeLabel || 'Chapter ' + info.number), accent: accentHex })
      }
    })
  }, [loading, rewardState, session.user.id, track, activeUnit, accentHex])

  // First-visit tour of the library. It can no longer land on the wrong screen
  // by accident: this component IS the shelf now, and <Activity> stops effects
  // in a hidden root, so a tour can only start while the shelf is on screen.
  const [tourSteps, setTourSteps] = useState(null)
  const profileCreatedAt = profile.created_at
  useEffect(() => {
    if (loading) return undefined
    let alive = true
    const timer = setTimeout(() => {
      maybeStartTour({ screen: 'stories', profileCreatedAt })
        .then(steps => { if (alive && steps) setTourSteps(steps) })
    }, 600)
    return () => { alive = false; clearTimeout(timer) }
  }, [loading, profileCreatedAt])

  // ── Shared actions ───────────────────────────────────────────────────────

  const levelLabelFor = (story) => getLevelLabel(track.language, track.system, story.level == null ? track.current_level : story.level)

  // Opening anything is a NAVIGATION now, not a state change. The shelf asks
  // the model for the destination and stays exactly where it is underneath.
  const openStory = (story) => { if (onOpenStory) onOpenStory(story.id) }
  const openSeries = (arc) => { if (onOpenSeries) onOpenSeries(arc.key) }

  // A unit opens as a series page when it has chapters to choose between, and
  // straight into the reader when it is a single story (no pointless stop).
  const openUnit = (unit) => {
    if (unit.parts.length > 1) openSeries(unit)
    else openStory(unit.parts[0])
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={pageShell()}>
        <div role="status" aria-label="Loading stories" style={{ maxWidth: '1360px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px' }}>
          <div style={{ width: '190px', height: '30px', borderRadius: '8px', background: 'var(--surface-2)', margin: '4px 0 20px' }} />
          <div style={{ height: isMobile ? '280px' : '340px', borderRadius: '24px', background: accentHex + '18', border: '1px solid ' + accentHex + '24', marginBottom: '28px' }} />
          <div style={{ width: '190px', height: '22px', borderRadius: '8px', background: 'var(--surface-2)', marginBottom: '14px' }} />
          <div style={{ display: 'flex', gap: '16px', overflow: 'hidden' }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ flex: isMobile ? '0 0 38vw' : '0 0 176px' }}>
                <div style={{ aspectRatio: '2 / 3', borderRadius: '14px', background: 'var(--surface-2)' }} />
                <div style={{ width: '68%', height: '13px', borderRadius: '6px', background: 'var(--surface-2)', marginTop: '10px' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Browse view ──────────────────────────────────────────────────────────

  const daily = pickDailyStory({ stories, categories: CATEGORIES, learnedCount, readIds, dateStr: todayStr(), tiersFor: tiersAt, learnedFor: learnedAt })

  // The hero: today's story reward when a series is going, a featured pick
  // otherwise. Always exactly one lit panel.
  const buildHero = () => {
    const unitOfStory = (story) => rewardUnits.find(u => u.parts.some(p => p.id === story.id)) || null
    if (rewardState.state === 'locked' || rewardState.state === 'banked') {
      const chapter = rewardState.chapter
      const info = chapterInfo(chapter, activeUnit.parts.indexOf(chapter))
      return {
        seed: track.language + '-reward',
        eyebrow: 'Today’s story reward',
        kicker: 'Complete your flashcards to unlock',
        kickerIcon: <Zap size={13} strokeWidth={2.3} color="#fff" aria-hidden="true" />,
        title: activeUnit.title,
        subtitle: (info.nativeLabel ? info.nativeLabel + ' · ' : 'Chapter ' + info.number + ' · ') + info.title,
        metaStory: chapter,
        cover: chapter.image_path ? chapter : activeUnit.parts[0],
        actionLabel: 'Start flashcards',
        actionIcon: Zap,
        onAction: onNavigate ? () => onNavigate('study') : undefined,
      }
    }
    if (rewardState.state === 'unlocked-today') {
      const story = stories.find(s => s.id === rewardState.storyId)
      if (story && !readIds.has(story.id)) {
        const unit = unitOfStory(story)
        const info = chapterInfo(story, unit ? unit.parts.findIndex(p => p.id === story.id) : 0)
        return {
          seed: track.language + '-reward',
          eyebrow: 'Today’s story reward',
          kicker: 'Chapter unlocked',
          kickerIcon: <CheckCircle2 size={13} strokeWidth={2.4} color="#fff" aria-hidden="true" />,
          title: unit ? unit.title : story.title,
          subtitle: unit ? (info.nativeLabel ? info.nativeLabel + ' · ' : 'Chapter ' + info.number + ' · ') + info.title : story.english_summary,
          metaStory: story,
          cover: story.image_path ? story : (unit ? unit.parts[0] : story),
          actionLabel: 'Read now',
          actionIcon: BookOpen,
          onAction: () => openStory(story),
        }
      }
    }
    if (rewardState.state === 'all-unlocked' && activeUnit) {
      const chapter = rewardState.chapter
      const info = chapterInfo(chapter, activeUnit.parts.indexOf(chapter))
      const readCount = activeUnit.parts.filter(p => readIds.has(p.id)).length
      return {
        seed: track.language + '-continue',
        eyebrow: 'Continue reading',
        kicker: null,
        title: activeUnit.title,
        subtitle: (info.nativeLabel ? info.nativeLabel + ' · ' : 'Chapter ' + info.number + ' · ') + info.title,
        meta: readCount + ' of ' + activeUnit.parts.length + ' chapters read',
        cover: chapter.image_path ? chapter : activeUnit.parts[0],
        actionLabel: 'Continue reading',
        actionIcon: BookOpen,
        onAction: () => openStory(chapter),
      }
    }
    if (!daily) return null
    const unit = unitOfStory(daily)
    return {
      seed: track.language + '-stories',
      eyebrow: rewardState.state === 'series-complete' ? 'Choose your next story' : 'Featured for you',
      kicker: rewardState.state === 'series-complete' ? 'Series complete — pick what’s next' : null,
      title: unit && unit.parts.length > 1 ? unit.title : daily.title,
      subtitle: daily.english_summary || null,
      metaStory: daily,
      cover: daily,
      actionLabel: readIds.has(daily.id) ? 'Read again' : 'Start reading',
      onAction: () => (unit && unit.parts.length > 1 ? openSeries(sectionsUnitFor(unit) || unit) : openStory(daily)),
    }
  }

  // Prefer the tier-aware shelf unit (it carries lock state) when opening a
  // series from the hero; the reward unit is a plain fallback.
  const sectionsUnitFor = (rewardUnit) => sections
    .flatMap(s => s.units)
    .find(u => u.kind === 'series' && u.parts.some(p => rewardUnit.parts.some(rp => rp.id === p.id))) || null

  const hero = buildHero()

  // Filters: All · one chip per level with content · Manhua (when present).
  const levelChips = sections.map(sec => ({
    value: 'level:' + sec.level,
    label: getLevelLabel(track.language, track.system, sec.level),
  }))
  const hasManhua = sections.some(sec => sec.units.some(isManhuaUnit))
  const filterOptions = [
    { value: 'all', label: 'All' },
    ...levelChips,
    ...(hasManhua ? [{ value: 'manhua', label: 'Manhua' }] : []),
  ]

  const primarySection = sections.find(sec => sec.isCurrent) || sections[0] || null
  const continueUnits = sections.flatMap(sec => sec.units.map(unit => ({ unit, section: sec })))
    .filter(({ unit }) => !unit.locked && unit.readCount > 0 && !unit.allRead)
  const manhuaUnits = sections.flatMap(sec => sec.units.filter(isManhuaUnit).map(unit => ({ unit, section: sec })))
  const practiceStories = sections.flatMap(sec => sec.practice.map(story => ({ story, section: sec })))
  const upcomingUnits = aheadSection ? aheadSection.units.map(unit => ({ unit, section: aheadSection })) : []

  const posterFor = ({ unit, section }) => {
    const lockLabel = section.levelLocked
      ? 'Unlocks at ' + getLevelLabel(track.language, track.system, section.level)
      : unit.locked ? 'Learn ' + unit.remaining + ' more word' + (unit.remaining === 1 ? '' : 's') : null
    const series = unit.parts.length > 1
    const first = unit.parts[0]
    const minutes = !series ? readingMinutes(first) : null
    const metaLine = series
      ? [levelLabelFor(first), unit.total + ' chapters'].join(' · ')
      : [levelLabelFor(first), formatLabel(first), minutes ? minutes + ' min' : null].filter(Boolean).join(' · ')
        + (unit.readCount > 0 ? ' · Read' : '')
    return (
      <div key={section.level + '-' + unit.key} style={posterItemStyle(isMobile)}>
        <StoryPoster
          story={first}
          title={unit.title}
          metaLine={metaLine}
          accentHex={accentHex}
          fontFamily={fontFamily}
          read={!series && unit.readCount > 0}
          locked={unit.locked}
          lockLabel={lockLabel}
          manhua={isManhuaUnit(unit)}
          knownPct={unit.knownPct}
          progress={series ? { readCount: unit.readCount, total: unit.total } : null}
          onClick={() => openUnit(unit)}
        />
      </div>
    )
  }

  const sectionRow = (sec) => {
    const units = sec.units.map(unit => ({ unit, section: sec }))
    if (units.length === 0) return null
    const isCurrent = sec.isCurrent
    return (
      <ShelfRow
        key={'level-' + sec.level}
        id={isCurrent ? 'top-picks' : 'level-' + sec.level}
        dataTour={isCurrent ? 'stories-shelf' : undefined}
        title={isCurrent ? 'Top picks for you' : getLevelLabel(track.language, track.system, sec.level)}
        subtitle={isCurrent
          ? getLevelLabel(track.language, track.system, sec.level) + ' · easiest to read first'
          : 'From a level you’ve already passed.'}
        isMobile={isMobile}
      >
        {units.map(posterFor)}
      </ShelfRow>
    )
  }

  const showAll = filter === 'all'
  const filteredLevel = filter.startsWith('level:') ? Number(filter.slice(6)) : null

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: '1360px', margin: '0 auto', padding: isMobile ? '20px 16px 64px' : '34px 32px 80px', position: 'relative', zIndex: 1 }}>
        {/* Stories is a primary destination — no back button; the app nav is
            the way out. */}
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '14px', margin: '0 0 16px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, color: 'var(--text)', fontSize: isMobile ? '26px' : '30px', fontWeight: 820, letterSpacing: '-0.035em' }}>
            Stories
          </h1>
          <Eyebrow>{metaLine(getSystemLabel(track.system), getLevelLabel(track.language, track.system, track.current_level))}</Eyebrow>
        </header>

        {hero ? (
          <StoriesHero hero={hero} accentHex={accentHex} fontFamily={fontFamily} isMobile={isMobile} levelLabelOf={levelLabelFor} />
        ) : loadFailed ? (
          <EmptyPanel
            icon={CloudOff} title="Couldn't load stories"
            text="The library couldn't be reached. Check your connection and try again."
            actionIcon={RefreshCw} actionLabel="Retry" onAction={data.reload}
          />
        ) : (
          <EmptyPanel icon={Library} title="No stories yet" text="Stories for your level are on the way. Keep learning words — they'll be here waiting." />
        )}

        {(sections.length > 0 || aheadSection) && (
          <>
            {filterOptions.length > 2 && (
              <FilterChips options={filterOptions} value={filter} onChange={setFilter} accentHex={accentHex} />
            )}

            <div style={{ display: 'grid', gap: isMobile ? '26px' : '32px' }}>
              {showAll && continueUnits.length > 0 && (
                <ShelfRow id="continue-reading" title="Continue reading" subtitle="Pick up where you left off." isMobile={isMobile}>
                  {continueUnits.map(posterFor)}
                </ShelfRow>
              )}

              {showAll && primarySection && sectionRow(primarySection)}
              {showAll && sections.filter(sec => sec !== primarySection).map(sectionRow)}
              {!showAll && filteredLevel != null && sections.filter(sec => sec.level === filteredLevel).map(sectionRow)}

              {(showAll || filter === 'manhua') && manhuaUnits.length > 0 && (
                <ShelfRow id="manhua" title="Manhua" subtitle="Illustrated episodes — read the panels, tap the bubbles." isMobile={isMobile}>
                  {manhuaUnits.map(posterFor)}
                </ShelfRow>
              )}

              {showAll && practiceStories.length > 0 && (
                <ShelfRow id="practice-stories" title="Practice through stories" subtitle="Short chats, scenes, and reply-alongs." isMobile={isMobile}>
                  {practiceStories.map(({ story, section }) => (
                    <div key={section.level + '-' + story.id} style={posterItemStyle(isMobile)}>
                      <StoryPoster
                        story={story}
                        title={story.title}
                        metaLine={[levelLabelFor(story), 'Practice'].join(' · ') + (readIds.has(story.id) ? ' · Read' : '')}
                        accentHex={accentHex}
                        fontFamily={fontFamily}
                        practice
                        read={readIds.has(story.id)}
                        onClick={() => openStory(story)}
                      />
                    </div>
                  ))}
                </ShelfRow>
              )}

              {showAll && upcomingUnits.length > 0 && (
                <ShelfRow
                  id="coming-up"
                  title={'Coming up in ' + getLevelLabel(track.language, track.system, aheadSection.level)}
                  subtitle={'Unlocks when you pass the ' + getLevelLabel(track.language, track.system, track.current_level) + ' test.'}
                  isMobile={isMobile}
                  dataTour="stories-ahead"
                >
                  {upcomingUnits.map(posterFor)}
                </ShelfRow>
              )}
            </div>
          </>
        )}

        {tourSteps && (
          <TourOverlay
            steps={tourSteps}
            accentHex={accentHex}
            onClose={(outcome) => {
              setTourSteps(null)
              if (outcome) markTourSeen('stories', outcome)
            }}
          />
        )}
      </div>
    </div>
  )
}
