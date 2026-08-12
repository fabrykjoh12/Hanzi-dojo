import { useMemo, useState } from 'react'
import {
  ArrowLeft, BookOpen, Check, ChevronRight, Layers, Lock, Play, RotateCcw, Zap,
} from 'lucide-react'
import StoryCover from './StoryCover'
import { chapterRows, seriesCta, readingMinutes } from './storyChapters'
import { recentWordsInStory } from './storyReward'
import { calculateStoryReadability } from './storyReading'
import { stripSceneEmoji } from './sceneReading'
import { formatLabel } from './storyFormat'
import { ink } from './languageTheme'

// The series detail page: pick a chapter the way you'd pick an episode.
//
// One vertical cover, the facts (level · format · length), a short
// description, honest progress, ONE primary action that always knows where
// the learner is, then a compact scannable chapter list. Locked chapters say
// what opens them — "Complete a flashcard session" — once, on the first
// locked row, not ten times down the page.

function ctaLabelFor(cta) {
  if (!cta) return null
  if (cta.kind === 'start') return 'Start story'
  if (cta.kind === 'continue') return cta.chapterNumber > 1 ? 'Continue chapter ' + cta.chapterNumber : 'Continue reading'
  if (cta.kind === 'reread') return 'Read again'
  return null
}

function ChapterRow({ row, accentHex, fontFamily, showLockHint, onOpen }) {
  const [hovered, setHovered] = useState(false)
  const { number, title, nativeLabel, minutes, read, unlocked, current } = row
  const open = unlocked
  const label = [
    'Chapter ' + number, title,
    read ? 'read' : current ? 'up next' : open ? 'available' : 'locked — complete a flashcard session to unlock',
  ].filter(Boolean).join(' · ')
  return (
    <button
      onClick={open ? () => onOpen(row.story) : () => {}}
      aria-disabled={!open}
      aria-label={label}
      className={open ? 'hd-press' : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left',
        minHeight: '56px', padding: '9px 12px', borderRadius: '12px',
        border: '1px solid ' + (current ? accentHex + '3D' : 'transparent'),
        background: current
          ? 'color-mix(in srgb, ' + accentHex + ' 7%, var(--surface))'
          : hovered && open ? 'var(--surface-2)' : 'transparent',
        cursor: open ? 'pointer' : 'default',
        opacity: open || read ? 1 : 0.62,
        fontFamily: 'Inter, sans-serif',
        transition: 'background 140ms ease',
      }}
    >
      <span aria-hidden="true" style={{
        width: '26px', flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
        fontSize: '13px', fontWeight: 700, color: current ? ink(accentHex) : 'var(--text-faint)',
      }}>
        {String(number).padStart(2, '0')}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: '15px', fontWeight: current ? 800 : 700, color: 'var(--text)',
          fontFamily, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {nativeLabel ? nativeLabel + ' · ' + title : title}
        </span>
        <span style={{ display: 'block', marginTop: '2px', fontSize: '12px', fontWeight: 600, color: current ? ink(accentHex) : 'var(--text-muted)' }}>
          {read
            ? 'Read'
            : current
              ? 'Up next'
              : open
                ? 'Available'
                : showLockHint ? 'Complete a flashcard session to unlock' : 'Locked'}
          {minutes ? ' · ' + minutes + ' min' : ''}
        </span>
      </span>
      <span aria-hidden="true" style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {read
          ? <Check size={17} strokeWidth={2.4} color="var(--success)" />
          : open
            ? <ChevronRight size={18} strokeWidth={2.1} color={current ? ink(accentHex) : 'var(--text-faint)'} />
            : <Lock size={15} strokeWidth={2.1} color="var(--text-faint)" />}
      </span>
    </button>
  )
}

export default function SeriesDetail({
  unit, readIds, unlockIds, accentHex, fontFamily, levelLabel, isMobile,
  vocabMap, userCards, recentVocabIds, language,
  isActiveSeries, canMakeActive, onMakeActive,
  onOpenChapter, onBack, onStudy,
}) {
  const rows = useMemo(
    () => chapterRows({ parts: unit.parts || [], readIds, unlockIds }),
    [unit.parts, readIds, unlockIds]
  )
  const parts = unit.parts || []
  const cta = seriesCta({ parts, readIds, unlockIds })
  const readCount = rows.filter(r => r.read).length
  const coverStory = parts[0]
  const totalMinutes = parts.reduce((sum, p) => sum + (readingMinutes(p) || 0), 0)
  const description = (coverStory && coverStory.english_summary) || null
  const firstLockedIdx = rows.findIndex(r => !r.unlocked && !r.read)
  const [ctaHovered, setCtaHovered] = useState(false)

  // "Words you'll recognize" — a handful of recently studied words that appear
  // in the chapter the CTA opens. Only shown before an unread, open chapter.
  const recognize = useMemo(() => {
    if (!cta || (cta.kind !== 'start' && cta.kind !== 'continue')) return []
    const story = cta.chapter
    if (!story || !story.content || !vocabMap) return []
    const content = story.presentation === 'scene' ? stripSceneEmoji(story.content) : story.content
    const { storyWords } = calculateStoryReadability({ content, vocabMap, cards: userCards || {}, language })
    return recentWordsInStory({ storyWords, recentVocabIds: recentVocabIds || [], max: 5 })
  }, [cta && cta.kind, cta && cta.chapter && cta.chapter.id, vocabMap, userCards, recentVocabIds, language]) // eslint-disable-line react-hooks/exhaustive-deps

  const posterWidth = isMobile ? 118 : 200
  const metaLine = [
    levelLabel,
    coverStory ? formatLabel(coverStory) : null,
    parts.length + ' chapter' + (parts.length === 1 ? '' : 's'),
    totalMinutes > 0 ? '~' + totalMinutes + ' min' : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ position: 'relative' }}>
      {/* A quiet wash of the artwork behind the header — atmosphere, not a
          banner. Decorative, faint, and fading out before the chapter list. */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '-40px', left: '-24px', right: '-24px', height: '300px',
        overflow: 'hidden', pointerEvents: 'none', zIndex: 0,
        maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9) 0%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9) 0%, transparent 100%)',
      }}>
        <StoryCover
          story={coverStory} path={coverStory && coverStory.image_path} accent={accentHex} radius={0}
          style={{ position: 'absolute', inset: '-24px', border: 'none', filter: 'blur(34px) saturate(0.9)', opacity: 0.16 }}
        />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <button onClick={onBack} className="hd-press" style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          minHeight: '44px', padding: '0 14px', borderRadius: '12px', marginBottom: '20px',
          border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)',
          fontSize: '13px', fontWeight: 600, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
        }}>
          <ArrowLeft size={17} strokeWidth={1.85} color="var(--text-muted)" /> All stories
        </button>

        <div style={{ display: 'flex', gap: isMobile ? '16px' : '26px', alignItems: 'flex-start', marginBottom: '10px' }}>
          <StoryCover
            story={coverStory} path={coverStory && coverStory.image_path} accent={accentHex} radius={16}
            style={{
              width: posterWidth + 'px', aspectRatio: '2 / 3', flexShrink: 0,
              border: '1px solid var(--border)', boxShadow: 'var(--shadow-2)',
            }}
          />
          <div style={{ flex: 1, minWidth: 0, paddingTop: isMobile ? 0 : '6px' }}>
            <div style={{
              fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginBottom: '7px',
            }}>
              {metaLine}
            </div>
            <h1 style={{
              margin: 0, fontSize: isMobile ? '23px' : '30px', fontWeight: 800,
              color: 'var(--text)', fontFamily, lineHeight: 1.18, letterSpacing: '-0.02em',
            }}>
              {unit.title}
            </h1>
            {description && !isMobile && (
              <p style={{ margin: '11px 0 0', maxWidth: '58ch', fontSize: '13.5px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                {description}
              </p>
            )}
            {!isMobile && (
              <SeriesActions
                cta={cta} readCount={readCount} total={parts.length} accentHex={accentHex}
                isActiveSeries={isActiveSeries} canMakeActive={canMakeActive} onMakeActive={onMakeActive}
                onOpenChapter={onOpenChapter} onStudy={onStudy}
                ctaHovered={ctaHovered} setCtaHovered={setCtaHovered}
              />
            )}
          </div>
        </div>

        {description && isMobile && (
          <p style={{ margin: '4px 0 0', fontSize: '13.5px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
            {description}
          </p>
        )}
        {isMobile && (
          <SeriesActions
            cta={cta} readCount={readCount} total={parts.length} accentHex={accentHex}
            isActiveSeries={isActiveSeries} canMakeActive={canMakeActive} onMakeActive={onMakeActive}
            onOpenChapter={onOpenChapter} onStudy={onStudy}
            ctaHovered={ctaHovered} setCtaHovered={setCtaHovered}
          />
        )}

        {recognize.length > 0 && (
          <div style={{
            marginTop: '20px', padding: '14px 16px', borderRadius: '18px',
            border: '1px solid ' + accentHex + '26',
            background: 'color-mix(in srgb, ' + accentHex + ' 6%, var(--surface))',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              fontSize: '11px', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
              color: ink(accentHex), marginBottom: '9px',
            }}>
              <Zap size={13} strokeWidth={2.3} aria-hidden="true" /> Words you&rsquo;ll recognize
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
              {recognize.map(w => (
                <span key={w.id} style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: '6px',
                  padding: '5px 11px', borderRadius: '999px',
                  border: '1px solid var(--border)', background: 'var(--surface)',
                }}>
                  <span style={{ fontFamily, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{w.word}</span>
                  {w.reading && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{w.reading}</span>}
                </span>
              ))}
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {recognize.length} word{recognize.length === 1 ? '' : 's'} from your recent sessions appear{recognize.length === 1 ? 's' : ''} in this chapter.
            </div>
          </div>
        )}

        <section aria-label="Chapters" style={{ marginTop: '26px' }}>
          <h2 style={{
            display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 8px',
            fontSize: '15px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em',
          }}>
            <Layers size={16} strokeWidth={2.1} color="var(--text-muted)" aria-hidden="true" /> Chapters
          </h2>
          <div style={{
            border: '1px solid var(--border)', borderRadius: '18px', background: 'var(--surface)',
            padding: '6px', display: 'flex', flexDirection: 'column', gap: '1px',
            boxShadow: 'var(--shadow-1)',
          }}>
            {rows.map((row, i) => (
              <ChapterRow
                key={row.story.id} row={row} accentHex={accentHex} fontFamily={fontFamily}
                showLockHint={i === firstLockedIdx}
                onOpen={onOpenChapter}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// Progress + the primary action + the active-series affordance. Rendered in
// the header column on desktop and under the description on mobile.
function SeriesActions({
  cta, readCount, total, accentHex,
  isActiveSeries, canMakeActive, onMakeActive, onOpenChapter, onStudy,
  ctaHovered, setCtaHovered,
}) {
  const pct = total > 0 ? Math.round((readCount / total) * 100) : 0
  const done = total > 0 && readCount === total
  const label = ctaLabelFor(cta)
  const CtaIcon = cta && cta.kind === 'reread' ? RotateCcw : cta && cta.kind === 'start' ? BookOpen : Play
  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ maxWidth: '300px' }}>
        <div style={{ height: '4px', borderRadius: '999px', background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{
            width: pct + '%', height: '100%', borderRadius: '999px',
            background: done ? 'var(--success)' : accentHex, transition: 'width 220ms ease',
          }} />
        </div>
        <div style={{ marginTop: '5px', fontSize: '12px', fontWeight: 700, color: done ? 'var(--success)' : 'var(--text-muted)' }}>
          {done ? 'Series complete' : readCount + ' / ' + total + ' chapters read'}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
        {cta && cta.kind === 'locked' ? (
          <button onClick={onStudy} className="hd-press" style={{
            display: 'inline-flex', alignItems: 'center', gap: '9px',
            minHeight: '48px', padding: '0 20px', borderRadius: '12px', border: 'none',
            background: accentHex, color: '#fff', fontSize: '15px', fontWeight: 800,
            fontFamily: 'Inter, sans-serif', cursor: 'pointer',
          }}>
            <Zap size={17} strokeWidth={2.2} color="#fff" />
            Review flashcards to unlock chapter {cta.chapterNumber}
          </button>
        ) : label ? (
          <button
            onClick={() => onOpenChapter(cta.chapter)}
            onMouseEnter={() => setCtaHovered(true)}
            onMouseLeave={() => setCtaHovered(false)}
            className="hd-press"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '9px',
              minHeight: '48px', padding: '0 22px', borderRadius: '12px', border: 'none',
              background: accentHex, color: '#fff', fontSize: '15px', fontWeight: 800,
              fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              transform: ctaHovered ? 'translateY(-1px)' : 'translateY(0)',
              boxShadow: ctaHovered ? '0 12px 26px ' + accentHex + '3D' : '0 6px 16px ' + accentHex + '2A',
              transition: 'transform 150ms ease, box-shadow 150ms ease',
            }}
          >
            <CtaIcon size={17} strokeWidth={2.2} color="#fff" />
            {label}
          </button>
        ) : null}

        {isActiveSeries ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: '999px', padding: '7px 12px',
          }}>
            <Zap size={13} strokeWidth={2.2} color={ink(accentHex)} aria-hidden="true" />
            Session rewards unlock chapters here
          </span>
        ) : canMakeActive ? (
          <button onClick={onMakeActive} className="hd-press" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            minHeight: '40px', padding: '0 14px', borderRadius: '999px', cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--surface)',
            fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif',
          }}>
            Make this my active series
          </button>
        ) : null}
      </div>

      {cta && cta.kind === 'locked' && (
        <div style={{ marginTop: '9px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Chapter {cta.chapterNumber} unlocks when you complete a flashcard session.
        </div>
      )}
    </div>
  )
}
