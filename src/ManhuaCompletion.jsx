import { wordStatus } from './storyReading'
import { ink } from './languageTheme'
import { PAPER, CARD_RADIUS, TYPE, TAP_TARGET } from './manhuaTokens'
import { ArrowLeft, ArrowRight, Lock, Sparkles, Zap } from 'lucide-react'
import ComprehensionCheck from './ComprehensionCheck'
import { scoreComprehension } from './comprehension'

// The end of an episode.
//
// It is a panel in the strip, not a modal slab dropped over the artwork. The
// other readers finish with a full-screen overlay, which is right for a drill
// and wrong here: an episode ends on a beat, and covering the last panel with a
// congratulations card throws that beat away. So this scrolls into view as the
// closing plate — the reader's seal stamped on the page, the words the learner
// met, and the hook for what comes next.
//
// No score, no XP, no streak: those were removed from this app on purpose
// (CLAUDE.md §1). The "reward" is the seal and the sentence that says the story
// isn't over.

// A carved cinnabar seal, the mark a reader leaves on a page they've finished.
function Seal({ accentHex, glyph, fontFamily }) {
  return (
    <div aria-hidden style={{
      width: '56px', height: '56px', flexShrink: 0,
      borderRadius: '10px',
      background: accentHex,
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily, fontSize: '30px', fontWeight: 700, lineHeight: 1,
      boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.28), ' + PAPER.shadowLift,
      // Very slightly off-square, the way a hand-pressed stamp lands.
      transform: 'rotate(-1.5deg)',
    }}>
      {glyph}
    </div>
  )
}

function WordChip({ vocab, userCards, accentHex, fontFamily, onSelectWord }) {
  const status = wordStatus(vocab.id, userCards)
  // Tapping a chip opens the same lookup popover the story does, anchored to
  // the chip — so "what was that word again?" is answered here too, by the one
  // component that answers it everywhere else.
  return (
    <button
      onClick={(e) => onSelectWord(vocab, status, 'done:' + vocab.id, e.currentTarget)}
      aria-label={vocab.word + (vocab.reading ? ' ' + vocab.reading : '')}
      className="hd-press"
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: '6px',
        minHeight: '34px', padding: '5px 11px',
        borderRadius: '999px',
        border: '1px solid ' + PAPER.hairline,
        background: PAPER.card, cursor: 'pointer',
      }}
    >
      <span style={{ fontFamily, fontSize: '15.5px', fontWeight: 600, color: PAPER.ink }}>{vocab.word}</span>
      {vocab.reading && <span style={{ fontSize: '11.5px', color: PAPER.muted }}>{vocab.reading}</span>}
      <span aria-hidden style={{
        width: '6px', height: '6px', borderRadius: '999px', alignSelf: 'center',
        background: status === 'not_started' ? accentHex : PAPER.gold,
      }} />
      <span style={{
        position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
        overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
      }}>
        {status === 'not_started' ? 'new word' : 'already in your deck'}
      </span>
    </button>
  )
}

export default function ManhuaCompletion({
  label, title, words = [], userCards, accentHex, fontFamily,
  hook, reward = null, continues = null, continuesLevelLabel = null,
  questions = [], answers = {}, onAnswer,
  onBack, onPractice, practiceWords = [], onSelectWord,
  nextChapter = null, onNextChapter = null, onStudy = null,
}) {
  const newCount = words.filter(v => wordStatus(v.id, userCards) === 'not_started').length
  const comprehension = scoreComprehension(questions, answers)
  const rewardEarned = Boolean(reward && questions.length > 0 && comprehension.answered === questions.length)
  return (
    <section
      aria-label="Episode complete"
      className="hd-manhua-panel is-in"
      style={{
        background: PAPER.card,
        border: '1px solid ' + PAPER.hairline,
        borderRadius: CARD_RADIUS + 'px',
        boxShadow: PAPER.shadow,
        padding: '20px 18px 22px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <Seal accentHex={accentHex} glyph="读" fontFamily={fontFamily} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: TYPE.meta, fontWeight: 800, letterSpacing: '0.13em',
            textTransform: 'uppercase', color: PAPER.muted,
          }}>
            {label ? label + ' · complete' : 'Episode complete'}
          </div>
          <div style={{ fontFamily, fontSize: '20px', fontWeight: 700, color: PAPER.ink, marginTop: '3px', lineHeight: 1.25 }}>
            {title}
          </div>
        </div>
      </div>

      {words.length > 0 && (
        <div style={{ marginTop: '18px' }}>
          <div style={{
            fontSize: TYPE.meta, fontWeight: 800, letterSpacing: '0.13em',
            textTransform: 'uppercase', color: PAPER.muted, marginBottom: '9px',
          }}>
            {newCount > 0 ? words.length + ' words · ' + newCount + ' new' : words.length + ' words'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
            {words.map(v => (
              <WordChip key={v.id} vocab={v} userCards={userCards} accentHex={accentHex} fontFamily={fontFamily} onSelectWord={onSelectWord} />
            ))}
          </div>
        </div>
      )}

      {questions.length > 0 && (
        <div style={{ marginTop: '18px' }}>
          <ComprehensionCheck questions={questions} answers={answers} onAnswer={onAnswer} />
        </div>
      )}

      {rewardEarned && (
        <div
          role="status"
          aria-label={'Reward earned: ' + reward.label}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            marginTop: '18px', padding: '13px 14px',
            border: '1px solid ' + accentHex + '55', borderRadius: '14px',
            background: 'color-mix(in srgb, ' + accentHex + ' 7%, ' + PAPER.card + ')',
          }}
        >
          <Seal accentHex={accentHex} glyph={reward.glyph || '读'} fontFamily={fontFamily} />
          <div>
            <div style={{ fontSize: TYPE.meta, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: PAPER.muted }}>
              Reader seal earned
            </div>
            <div style={{ marginTop: '3px', fontFamily, fontSize: '19px', fontWeight: 750, color: PAPER.ink }}>
              {reward.label}
            </div>
          </div>
        </div>
      )}

      {(hook || continues) && (
        <div style={{ marginTop: '18px', paddingTop: '15px', borderTop: '1px solid ' + PAPER.soft }}>
          {hook && (
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: PAPER.ink2 }}>{hook}</p>
          )}

          {/* Where the story goes next, and — the part that actually helps —
              the level it is written at. A serial that climbs the ladder should
              say so on the plate the learner reaches at the end, rather than
              leaving them to hunt a shelf for an episode that is a level up.
              Suppressed when a concrete next chapter is on the plate below —
              two "next" lines about the same episode is noise. */}
          {continues && !nextChapter && (
            <p style={{
              margin: hook ? '10px 0 0' : 0,
              fontSize: TYPE.meta, fontWeight: 800,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: ink(accentHex),
            }}>
              {continues.label ? continues.label + ' · ' : ''}
              {continuesLevelLabel ? 'continues at ' + continuesLevelLabel : 'continues'}
            </p>
          )}
        </div>
      )}

      {/* The chapter loop's closing beat: the next episode, either openable
          right now or waiting behind today's flashcard session. */}
      {nextChapter && nextChapter.kind !== 'unlocked' && (
        <div style={{
          marginTop: '18px', padding: '13px 14px',
          border: '1px solid ' + PAPER.hairline, borderRadius: '14px', background: PAPER.card,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            fontSize: TYPE.meta, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: PAPER.muted,
          }}>
            <Lock size={13} strokeWidth={2.2} aria-hidden="true" />
            {nextChapter.kind === 'series-complete' ? 'Series complete' : 'Next'}
          </div>
          <div style={{ marginTop: '4px', fontFamily, fontSize: '17px', fontWeight: 750, color: PAPER.ink }}>
            {nextChapter.kind === 'series-complete'
              ? 'You read all ' + nextChapter.total + ' chapters.'
              : (nextChapter.nativeLabel ? nextChapter.nativeLabel + ' · ' : '') + nextChapter.title}
          </div>
          {nextChapter.kind === 'locked' && (
            <div style={{ marginTop: '3px', fontSize: '13px', color: PAPER.ink2, lineHeight: 1.55 }}>
              Complete your next flashcard session to continue.
            </div>
          )}
        </div>
      )}

      <CompletionButtons
        nextChapter={nextChapter} onNextChapter={onNextChapter} onStudy={onStudy}
        onBack={onBack} onPractice={onPractice} practiceWords={practiceWords} accentHex={accentHex}
      />
    </section>
  )
}

// The plate's action row. When the loop offers a forward action (read the
// unlocked next episode / review flashcards), it takes the accent and "Back to
// stories" steps back to a quiet secondary.
function CompletionButtons({ nextChapter, onNextChapter, onStudy, onBack, onPractice, practiceWords, accentHex }) {
  const forward = nextChapter && (
    (nextChapter.kind === 'unlocked' && onNextChapter) ||
    (nextChapter.kind === 'locked' && onStudy)
  )
  return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '18px' }}>
        {nextChapter && nextChapter.kind === 'unlocked' && onNextChapter ? (
          <button
            onClick={onNextChapter}
            className="hd-press"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              minHeight: TAP_TARGET + 'px', padding: '0 18px',
              borderRadius: '14px', border: 'none', cursor: 'pointer',
              background: accentHex, color: '#fff', fontSize: '15px', fontWeight: 700,
            }}
          >
            Read {nextChapter.nativeLabel || 'chapter ' + nextChapter.number}
            <ArrowRight size={17} strokeWidth={2.4} />
          </button>
        ) : nextChapter && nextChapter.kind === 'locked' && onStudy ? (
          <button
            onClick={onStudy}
            className="hd-press"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              minHeight: TAP_TARGET + 'px', padding: '0 18px',
              borderRadius: '14px', border: 'none', cursor: 'pointer',
              background: accentHex, color: '#fff', fontSize: '15px', fontWeight: 700,
            }}
          >
            <Zap size={17} strokeWidth={2.2} />
            Review flashcards
          </button>
        ) : null}
        <button
          onClick={onBack}
          className="hd-press"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            minHeight: TAP_TARGET + 'px', padding: '0 18px',
            borderRadius: '14px', cursor: 'pointer',
            border: forward ? '1px solid ' + PAPER.hairline : 'none',
            background: forward ? PAPER.card : accentHex,
            color: forward ? PAPER.ink : '#fff',
            fontSize: '15px', fontWeight: 700,
          }}
        >
          <ArrowLeft size={17} strokeWidth={2.4} />
          Back to stories
        </button>
        {onPractice && practiceWords.length >= 4 && (
          <button
            onClick={() => onPractice(practiceWords)}
            className="hd-press"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              minHeight: TAP_TARGET + 'px', padding: '0 18px',
              borderRadius: '14px', cursor: 'pointer',
              border: '1px solid ' + PAPER.hairline, background: PAPER.card,
              color: PAPER.ink, fontSize: '15px', fontWeight: 650,
            }}
          >
            <Sparkles size={17} strokeWidth={2} color={accentHex} />
            Practise the new words
          </button>
        )}
      </div>
  )
}
