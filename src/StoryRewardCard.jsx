import { useState } from 'react'
import { Lock } from 'lucide-react'
import MistyArt from './MistyArt'
import { storyEyebrow } from './homeModel'
import { stripLeadingNumber } from './storyArcs'
import { getLevelLabel } from './utils'

// The Story Reward card — tonight's actual daily story as a cinematic wide
// card. Cover art leads when the story has it; otherwise the card falls back
// to the misty night artwork, so a missing cover is a mood, not a hole.
//
// The card is a BUTTON only while reading is the current step ('ready').
// Locked and completed states are display-only, which is what keeps Home to
// exactly one primary action; the state badge says why.

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"
const LIGHT_INK = '#FFFBF4'

const CARD_FRAME = {
  position: 'relative', width: '100%', height: 'clamp(180px, 26vh, 240px)',
  padding: 0, borderRadius: '22px', overflow: 'hidden',
  border: '1px solid var(--border)', boxShadow: 'var(--shadow-2)',
  background: '#232936', color: LIGHT_INK, fontFamily: UI_FONT, textAlign: 'left',
  display: 'block',
}

function RewardArt({ story, artFailed, onArtFail }) {
  const hasCover = Boolean(story && story.cover_url) && !artFailed
  return (
    <>
      {hasCover
        ? <img src={story.cover_url} alt="" onError={onArtFail} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 42%' }} />
        : <MistyArt variant="reward" />}
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(12, 14, 19, 0) 34%, rgba(12, 14, 19, 0.42) 66%, rgba(12, 14, 19, 0.82) 100%)' }} />
    </>
  )
}

function RewardText({ story, eyebrow, badge, theme, rightInset = '18px' }) {
  const title = story ? stripLeadingNumber(story.title) : ''
  return (
    <span style={{ position: 'absolute', left: '18px', right: rightInset, bottom: '16px' }}>
      {eyebrow && (
        <span style={{ display: 'block', fontSize: '10.5px', lineHeight: 1, fontWeight: 720, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'rgba(255, 251, 244, 0.78)' }}>{eyebrow}</span>
      )}
      <span lang={theme.langTag} style={{ display: 'block', marginTop: '7px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: theme.font + ', sans-serif', fontSize: '24px', lineHeight: 1.15, fontWeight: 650, color: LIGHT_INK }}>{title}</span>
      {badge && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '11px', padding: '8px 13px', borderRadius: '999px', background: 'rgba(20, 24, 32, 0.5)', border: '1px solid rgba(255, 251, 244, 0.22)', fontSize: '11.5px', lineHeight: 1, fontWeight: 680, color: 'rgba(255, 251, 244, 0.88)' }}>
          {badge.locked && <Lock size={12} strokeWidth={2.4} aria-hidden="true" />}
          {badge.text}
        </span>
      )}
    </span>
  )
}

export default function StoryRewardCard({ reward, daily, theme, language, track, onOpen }) {
  const [artFailed, setArtFailed] = useState(false)

  if (reward.kind === 'skeleton') {
    return <div aria-busy="true" className="hd-skeleton" data-tour="home-then-read" style={CARD_FRAME} />
  }

  const story = daily && daily.story
  const title = story ? stripLeadingNumber(story.title) : ''
  const eyebrow = story
    ? storyEyebrow({ levelLabel: getLevelLabel(language, track.system, story.level), knownPct: daily.knownPct })
    : ''
  const art = <RewardArt story={story} artFailed={artFailed} onArtFail={() => setArtFailed(true)} />

  if (reward.kind === 'ready') {
    return (
      <button
        type="button"
        aria-label={'Open ' + title}
        data-tour="home-then-read"
        onClick={onOpen}
        className="hd-press-deep"
        style={{ ...CARD_FRAME, cursor: 'pointer' }}
      >
        {art}
        <RewardText story={story} eyebrow={eyebrow} theme={theme} rightInset="128px" />
        <span style={{ position: 'absolute', right: '18px', bottom: '16px', padding: '10px 16px', borderRadius: '999px', background: 'rgba(255, 251, 244, 0.94)', color: theme.accentHex, fontSize: '12.5px', lineHeight: 1, fontWeight: 750 }}>
          Start reading
        </span>
      </button>
    )
  }

  // Locked or completed: state, not an action.
  return (
    <div data-tour="home-then-read" style={CARD_FRAME}>
      {art}
      <RewardText
        story={story}
        eyebrow={eyebrow}
        theme={theme}
        badge={{ text: reward.badge, locked: reward.kind === 'locked' }}
      />
    </div>
  )
}
