import { useState } from 'react'
import { CountUp } from './ui'
import { levelTitle, nextTitle } from './xp'
import { offlineAvailable } from './offline'
import { prefetchLevel } from './prefetch'
import {
  ArrowLeft, CheckCircle2, Sparkles, TrendingUp, Snowflake, Sunrise,
  MessageCircleMore, ChevronRight, BookOpen, Download, CheckCheck,
} from 'lucide-react'

// The study session's completed/"done" screen, extracted verbatim from Study.jsx
// so that file stays focused on the active card + grading loop. This component is
// purely presentational: Study still owns all state (recap tally, forecast,
// story unlock, chat mission) and side effects, and passes them + callbacks in.

const SAGE = '#6E8466'
const SAGE_DARK = '#5C7155'

// Full-width sage call-to-action (kept identical to Study's own PrimaryButton so
// the "Back home" button looks and behaves exactly as before).
function PrimaryButton({ onClick, children, icon: Icon }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
        width: '100%', minHeight: '54px', borderRadius: '16px', border: 'none',
        background: hovered ? SAGE_DARK : SAGE, color: '#fff',
        fontSize: '15px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer', transition: 'background 160ms ease, transform 160ms ease, box-shadow 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered ? '0 12px 28px rgba(110,132,102,0.28)' : '0 6px 18px rgba(110,132,102,0.18)',
      }}
    >
      <Icon size={18} strokeWidth={2.1} color="#fff" />
      {children}
    </button>
  )
}

// "First Story Unlocked" recap module — connects the words just studied to a
// story the user can now read (the core product loop, made felt). Renders a
// readable-story CTA when one is available, or a calm "learn N more" nudge when
// the next tier is still locked. Given only when the session had graded cards.
function StoryUnlockCard({ unlock, accentHex, langFont, firstRun, onRead }) {
  const [hovered, setHovered] = useState(false)
  const { story, knownPct, sessionWordsInStory, isRead, wordsToUnlock, nextTierLabel } = unlock

  // No unlocked story yet: gentle progress nudge toward the next tier.
  if (!story) {
    if (!wordsToUnlock || wordsToUnlock <= 0) return null
    return (
      <div style={{
        width: '100%', marginBottom: '12px', textAlign: 'left',
        background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '18px',
        padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px',
      }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '14px', flexShrink: 0, background: accentHex + '12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BookOpen size={22} strokeWidth={1.9} color={accentHex} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>Keep going</div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.45, marginTop: '2px' }}>
            Learn {wordsToUnlock} more word{wordsToUnlock === 1 ? '' : 's'} to unlock{nextTierLabel ? ' ' + nextTierLabel : ' your next story'}.
          </div>
        </div>
      </div>
    )
  }

  const hits = sessionWordsInStory.length
  return (
    <div style={{
      width: '100%', marginBottom: '12px', textAlign: 'left',
      background: accentHex + '0D', border: '1px solid ' + accentHex + '2A', borderRadius: '18px',
      padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '14px', flexShrink: 0, background: accentHex + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BookOpen size={22} strokeWidth={1.9} color={accentHex} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.3px', textTransform: 'uppercase', color: accentHex }}>
            {isRead ? 'Read next' : 'Story unlocked'}
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)', fontFamily: langFont, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {story.title}
          </div>
        </div>
        <div style={{
          flexShrink: 0, textAlign: 'center', padding: '6px 12px', borderRadius: '12px',
          background: 'var(--surface)', border: '1px solid ' + accentHex + '2A',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 850, color: accentHex, lineHeight: 1 }}>{knownPct}%</div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginTop: '2px' }}>known</div>
        </div>
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {hits > 0
          ? <><strong style={{ color: 'var(--text)', fontWeight: 700 }}>{hits}</strong> of today’s word{hits === 1 ? '' : 's'} appear{hits === 1 ? 's' : ''} here — read it now to lock {hits === 1 ? 'it' : 'them'} in.</>
          : <>You can read <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{knownPct}%</strong> of this story — read it to reinforce today’s words.</>}
      </div>
      <button
        onClick={() => onRead(story.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
          width: '100%', minHeight: '48px', borderRadius: '14px', border: 'none',
          background: hovered ? accentHex : accentHex + 'E6', color: '#fff',
          fontSize: '14.5px', fontWeight: 800, fontFamily: 'Inter, sans-serif',
          cursor: 'pointer', transition: 'background 160ms ease, transform 160ms ease',
          transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        }}
      >
        <BookOpen size={18} strokeWidth={2.1} color="#fff" />
        {isRead ? 'Read it again' : (firstRun ? 'Read your first story' : 'Read unlocked story')}
      </button>
    </div>
  )
}

// "Save this level for offline": warms the vocabulary snapshot and every
// pronunciation MP3 into the offline caches so a later no-network session has
// its cards and audio. Hidden when IndexedDB isn't available.
function OfflineSaveButton({ track, accentHex }) {
  const [state, setState] = useState('idle') // idle | saving | done
  const [pct, setPct] = useState(0)
  if (!offlineAvailable()) return null

  const run = async () => {
    if (state === 'saving') return
    setState('saving')
    setPct(0)
    try {
      await prefetchLevel(track, track.current_level, (done, total) => {
        setPct(total ? Math.round((done / total) * 100) : 100)
      })
      setState('done')
    } catch {
      setState('idle')
    }
  }

  const label = state === 'saving'
    ? 'Saving for offline… ' + pct + '%'
    : state === 'done'
      ? 'Saved — reviews and audio work offline'
      : 'Save this level for offline'
  const Icon = state === 'done' ? CheckCheck : Download

  return (
    <button onClick={run} disabled={state !== 'idle'} style={{
      width: '100%', marginBottom: '10px', padding: '12px 16px', borderRadius: '14px',
      border: '1px solid ' + accentHex + '2A', background: accentHex + '0D', color: accentHex,
      cursor: state === 'idle' ? 'pointer' : 'default', font: '700 13.5px Inter, sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    }}>
      <Icon size={16} strokeWidth={2.2} /> {label}
    </button>
  )
}

// The completed-session recap card. Study.jsx wraps this in the page shell and
// still renders the chat-mission modal itself (it owns that state); this
// component renders the card and calls back for read-story / open-mission / back.
export default function SessionRecap({
  recap, isWeak, firstRun, accentHex, langFont, forecast, storyUnlock, track,
  mission, onOpenMission, onReadStory, onBack,
}) {
  const s = recap
  const didStudy = Boolean(s && s.graded > 0)
  // A brand-new learner's first session gets framing that names the milestone
  // and points at the story their words just unlocked.
  const firstDone = Boolean(firstRun && didStudy)

  // The single most useful next action, so the recap ends with a direct
  // "do this next" instead of a menu the learner has to weigh. Priority:
  // read the just-unlocked story that holds today's words → use them in the
  // chat conversation → re-read a story → (nothing actionable) go home.
  const story = storyUnlock && storyUnlock.story
  const nextStep = story && !storyUnlock.isRead
    ? { label: 'Read “' + story.title + '” now', sub: 'Lock in the words you just studied', icon: BookOpen, onClick: () => onReadStory(story.id) }
    : mission
      ? { label: 'Use today’s words in a chat', sub: mission.scenario.en, icon: MessageCircleMore, onClick: onOpenMission }
      : story
        ? { label: 'Read it again', sub: 'Re-reading cements the vocabulary', icon: BookOpen, onClick: () => onReadStory(story.id) }
        : null

  const accuracy = s && s.reviewedTotal > 0 ? Math.round((s.reviewedRight / s.reviewedTotal) * 100) : null
  const recapStats = s ? [
    { label: 'Cards studied', value: s.graded, color: accentHex },
    { label: 'New learned', value: s.newLearned, color: '#3E63DD' },
    { label: 'To review', value: s.graduated, color: '#2F9E6D' },
  ] : []
  if (accuracy !== null) recapStats.push({ label: 'Accuracy', value: accuracy, suffix: '%', color: '#D97706' })

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: '520px', textAlign: 'center',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '24px', padding: '40px 34px',
        boxShadow: '0 22px 60px rgba(24,24,27,0.07)',
      }}>
        <div style={{
          width: '58px', height: '58px', borderRadius: '18px',
          margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: accentHex + '10', border: '1px solid ' + accentHex + '18',
        }}>
          <CheckCircle2 size={28} strokeWidth={1.9} color={accentHex} />
        </div>
        <h1 style={{ fontSize: '26px', fontWeight: 750, marginBottom: '8px', color: 'var(--text)' }}>
          {firstDone ? 'Your first words, learned' : (didStudy ? 'Session complete' : 'All done for now')}
        </h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: didStudy ? '26px' : '28px', fontSize: '15px', lineHeight: 1.6 }}>
          {firstDone
            ? 'You learned your first ' + s.newLearned + ' word' + (s.newLearned === 1 ? '' : 's') + '. These words appear in your first story below — read it to lock them in.'
            : didStudy
              ? 'Nice, steady work. Every review nudges these words further into memory.'
              : isWeak
                ? 'No weak words to clean up right now — your tricky cards are settling.'
                : 'No cards are waiting. Come back later, or continue the loop with stories.'}
        </p>

        {didStudy && s.xpEarned > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            margin: '0 auto 20px', padding: '8px 16px', borderRadius: '999px',
            background: '#6E84661A', border: '1px solid #6E846633',
            color: '#5C7155', fontSize: '14px', fontWeight: 750,
          }}>
            <Sparkles size={15} strokeWidth={2} color="#6E8466" />
            +<CountUp value={s.xpEarned} /> XP
          </div>
        )}

        {didStudy && s.leveledTo > 0 && (
          <div style={{
            margin: '0 auto 22px', padding: '16px 18px', borderRadius: '18px',
            background: accentHex + '0D', border: '1px solid ' + accentHex + '2A',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accentHex, fontSize: '17px', fontWeight: 850 }}>
              <TrendingUp size={19} strokeWidth={2.2} color={accentHex} />
              Level {s.leveledTo} — {levelTitle(s.leveledTo)}
            </div>
            {s.freezesEarned > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#3E63DD', fontSize: '13px', fontWeight: 700 }}>
                <Snowflake size={15} strokeWidth={2} color="#3E63DD" />
                +{s.freezesEarned} streak freeze{s.freezesEarned === 1 ? '' : 's'} earned
              </div>
            )}
            {nextTitle(s.leveledTo) && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                Next rank: {nextTitle(s.leveledTo).name} at level {nextTitle(s.leveledTo).min}
              </div>
            )}
          </div>
        )}

        {didStudy && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: recapStats.length === 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
            gap: '10px', marginBottom: '22px',
          }}>
            {recapStats.map(st => (
              <div key={st.label} style={{
                padding: '16px 10px', borderRadius: '14px',
                background: st.color + '0D', border: '1px solid ' + st.color + '22',
              }}>
                <div style={{ fontSize: '26px', fontWeight: 760, color: st.color, lineHeight: 1 }}>
                  <CountUp value={st.value} suffix={st.suffix || ''} />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600 }}>{st.label}</div>
              </div>
            ))}
          </div>
        )}

        {didStudy && forecast && (forecast.reviews > 0 || forecast.newAvail > 0) && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            marginBottom: '24px', padding: '12px 16px', borderRadius: '14px',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            fontSize: '13px', color: 'var(--text-muted)', flexWrap: 'wrap',
          }}>
            <Sunrise size={16} strokeWidth={1.9} color="#D97706" />
            <span>
              Tomorrow:&nbsp;
              <strong style={{ color: 'var(--text)', fontWeight: 650 }}>{forecast.reviews}</strong> review{forecast.reviews === 1 ? '' : 's'}
              {forecast.newAvail > 0 && (
                <> + <strong style={{ color: 'var(--text)', fontWeight: 650 }}>{forecast.newAvail}</strong> new</>
              )}
              &nbsp;waiting
            </span>
          </div>
        )}

        {nextStep && (
          <div style={{ marginBottom: '14px', textAlign: 'left' }}>
            <div style={{
              fontSize: '11px', fontWeight: 850, letterSpacing: '0.5px', textTransform: 'uppercase',
              color: accentHex, marginBottom: '8px', paddingLeft: '2px',
            }}>
              Recommended next
            </div>
            <button
              onClick={nextStep.onClick}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '14px',
                textAlign: 'left', cursor: 'pointer',
                background: accentHex, border: '1px solid ' + accentHex, borderRadius: '18px',
                padding: '16px 18px', color: '#fff',
                boxShadow: '0 10px 26px ' + accentHex + '33',
              }}
            >
              <div style={{ width: '44px', height: '44px', borderRadius: '14px', flexShrink: 0, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <nextStep.icon size={22} strokeWidth={2} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15.5px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextStep.label}</div>
                <div style={{ fontSize: '12.5px', opacity: 0.9, lineHeight: 1.4, marginTop: '2px' }}>{nextStep.sub}</div>
              </div>
              <ChevronRight size={22} color="#fff" style={{ flexShrink: 0, opacity: 0.9 }} />
            </button>
          </div>
        )}

        {didStudy && storyUnlock && (
          <StoryUnlockCard
            unlock={storyUnlock}
            accentHex={accentHex}
            langFont={langFont}
            firstRun={firstDone}
            onRead={onReadStory}
          />
        )}

        {mission && (
          <button onClick={onOpenMission} style={{
            width: '100%', marginBottom: '12px', textAlign: 'left', cursor: 'pointer',
            background: accentHex + '0D', border: '1px solid ' + accentHex + '2A', borderRadius: '18px',
            padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px',
          }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '14px', flexShrink: 0, background: accentHex + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircleMore size={22} strokeWidth={1.9} color={accentHex} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>Use today’s words</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.45, marginTop: '2px' }}>
                {mission.scenario.en} · ~{mission.estimatedTime} min
              </div>
            </div>
            <ChevronRight size={20} color={accentHex} />
          </button>
        )}

        <OfflineSaveButton track={track} accentHex={accentHex} />

        {nextStep ? (
          <button
            onClick={onBack}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              width: '100%', minHeight: '46px', borderRadius: '14px',
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)',
              fontSize: '14px', fontWeight: 700, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            }}
          >
            <ArrowLeft size={16} strokeWidth={2.1} color="var(--text-muted)" />
            Back home
          </button>
        ) : (
          <PrimaryButton onClick={onBack} icon={ArrowLeft}>
            Back home
          </PrimaryButton>
        )}
      </div>
    </div>
  )
}
