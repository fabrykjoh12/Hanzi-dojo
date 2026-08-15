import { useEffect, useState } from 'react'
import { getDailyStoryCard } from './homeStory'
import { HOME_MOTION, homeDailyStage, homeProgressPct, homeQueueSummary } from './homePresentation'
import { PracticeGlyph, ProfileGlyph } from './HomeV2NavGlyphs'
import { languageTheme } from './languageTheme'
import { sessionEstimateLabel } from './sessionEstimate'
import { stripLeadingNumber } from './storyArcs'
import { useIsMobile } from './useIsMobile'
import { getLevelLabel } from './utils'

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"
const HANZI_FONT = "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif"
const EASE = 'cubic-bezier(0.2, 0, 0, 1)'

function LacquerLandscape() {
  const mask = 'linear-gradient(90deg, transparent 0%, transparent 36%, rgba(0,0,0,0.18) 47%, rgba(0,0,0,0.72) 63%, #000 78%)'
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(247,177,157,0.08) 0%, rgba(108,24,15,0.02) 55%, rgba(79,17,12,0.16) 100%)' }} />
      <img src="/home-v3-shanshui-generated.webp" alt="" style={{ position: 'absolute', width: '108%', maxWidth: 'none', height: 'auto', right: '-4%', bottom: '3%', opacity: 0.082, filter: 'blur(0.35px) saturate(0.68) contrast(0.96)', WebkitMaskImage: mask, maskImage: mask }} />
      <img src="/home-v3-shanshui-generated.webp" alt="" style={{ position: 'absolute', width: '122%', maxWidth: 'none', height: 'auto', right: '-10%', bottom: '-8%', opacity: 0.232, filter: 'saturate(0.86) contrast(1.08)', WebkitMaskImage: mask, maskImage: mask }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.026, mixBlendMode: 'soft-light', backgroundImage: 'radial-gradient(circle, rgba(255,236,220,0.8) 0.45px, transparent 0.7px)', backgroundSize: '3px 3px' }} />
    </div>
  )
}

function FlashcardObject() {
  return (
    <div role="img" aria-label="Flashcard showing 你好, nǐ hǎo" style={{ position: 'relative', width: '116px', height: '122px', alignSelf: 'start', justifySelf: 'end' }}>
      <div aria-hidden="true" style={{ position: 'absolute', left: '17px', right: '-2px', bottom: '-1px', height: '24px', background: 'radial-gradient(ellipse at center, rgba(70,14,10,0.28) 0%, rgba(70,14,10,0) 72%)', filter: 'blur(2px)', transform: 'rotate(2deg)' }} />
      <div aria-hidden="true" style={{ position: 'absolute', width: '87px', height: '106px', right: 0, top: '13px', background: 'linear-gradient(145deg, #EADDBF 0%, #DCC9A4 100%)', borderRadius: '9px', transform: 'rotate(7.5deg)', boxShadow: '0 7px 11px -5px rgba(54,12,8,0.52), inset 1px 0 rgba(255,255,255,0.42)' }} />
      <div style={{ position: 'absolute', width: '92px', height: '110px', right: '15px', top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(150deg, #FFFAEE 0%, #F5E9D3 100%)', borderRadius: '9px', boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 0 0 1px rgba(102,67,43,0.14), 0 12px 17px -8px rgba(55,12,8,0.58)', transform: 'rotate(-2.25deg)', color: '#261C18' }}>
        <span lang="zh-Hans" style={{ fontFamily: HANZI_FONT, fontSize: '31px', lineHeight: 1.05, fontWeight: 550 }}>你好</span>
        <span style={{ marginTop: '7px', fontSize: '11.5px', lineHeight: 1, color: '#776C64', fontWeight: 600 }}>nǐ hǎo</span>
      </div>
    </div>
  )
}

function CardsHero({ counts, accent, onNavigate, stage }) {
  const [pressed, setPressed] = useState(false)
  const queue = homeQueueSummary(counts)
  const cardsActive = stage === 'cards'
  const actionLabel = cardsActive ? 'Start cards' : 'Cards complete'
  const countLabel = queue.failed ? '—' : queue.clear ? '✓' : queue.totalReady
  const stateLabel = queue.failed ? 'queue unavailable' : queue.clear ? 'cards complete' : 'cards ready'
  const detail = queue.failed ? 'Start a session to retry' : queue.clear ? 'Nothing due right now' : queue.reviewCount + ' reviews · ' + queue.newCount + ' new'

  return (
    <section aria-label="Cards" className="hd-home-stage" style={{ height: cardsActive ? '234px' : '226px', marginTop: '12px', position: 'relative', overflow: 'hidden', borderRadius: '14px', color: '#FFF9F0', background: 'radial-gradient(circle at 94% 94%, rgba(68,11,9,0.34) 0%, rgba(83,15,11,0.1) 35%, transparent 59%), linear-gradient(150deg, ' + accent + ' 0%, #92261A 62%, #701A13 100%)', boxShadow: '0 12px 25px -20px rgba(76,17,12,0.9), inset 0 1px 0 rgba(255,235,220,0.15)', transition: 'height ' + HOME_MOTION.stage + 'ms ' + EASE }}>
      <LacquerLandscape />
      <div style={{ position: 'relative', height: '162px', padding: '16px 17px 0' }}>
        <p style={{ margin: 0, fontSize: '17px', lineHeight: 1, fontWeight: 770, letterSpacing: '-0.01em' }}>Cards</p>
        <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 116px', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '62px', lineHeight: 0.88, fontWeight: 850, letterSpacing: '-0.045em', fontVariantNumeric: 'tabular-nums' }}>{countLabel}</div>
            <div style={{ marginTop: '8px', fontSize: '18px', lineHeight: 1, fontWeight: 760, letterSpacing: '-0.015em' }}>{stateLabel}</div>
            <div style={{ marginTop: '9px', color: 'rgba(255,245,235,0.75)', fontSize: '12px', lineHeight: 1, fontWeight: 580 }}>{detail}</div>
          </div>
          <FlashcardObject />
        </div>
      </div>
      <button type="button" disabled={!cardsActive} onClick={() => onNavigate('study')} onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerCancel={() => setPressed(false)} onPointerLeave={() => setPressed(false)} style={{
        position: 'absolute', left: '16px', right: '16px', bottom: '10px', height: '49px', padding: '0 18px', border: 0, borderRadius: '10px',
        background: 'linear-gradient(180deg, #F8ECCE 0%, #F2DFBB 100%)', color: '#7C2518', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: UI_FONT, fontSize: '16px', lineHeight: 1, fontWeight: 790, cursor: cardsActive ? 'pointer' : 'default', transform: pressed ? 'translateY(1px)' : 'none', opacity: cardsActive ? 1 : 0.82,
        boxShadow: pressed ? '0 0.5px 0 rgba(65,16,11,0.15), inset 0 1px 0 rgba(255,255,255,0.45)' : '0 2px 0 rgba(65,16,11,0.2), 0 4px 9px -7px rgba(50,12,8,0.8), inset 0 1px 0 rgba(255,255,255,0.58)',
        transition: 'transform ' + (pressed ? HOME_MOTION.pressDown : HOME_MOTION.pressReturn) + 'ms ' + EASE + ', box-shadow ' + (pressed ? HOME_MOTION.pressDown : HOME_MOTION.pressReturn) + 'ms ' + EASE,
      }}>
        <span>{actionLabel}</span><span aria-hidden="true" style={{ fontSize: '21px', fontWeight: 620 }}>→</span>
      </button>
    </section>
  )
}

function StoryStep({ daily, stage, onNavigate }) {
  const story = daily?.story
  const ready = stage === 'story' && Boolean(story)
  const status = stage === 'cards' ? 'Finish cards to unlock' : daily === undefined ? 'Finding today’s story' : stage === 'story' ? 'Ready to read' : stage === 'caught-up' ? 'Caught up' : 'Story complete'
  const title = story ? stripLeadingNumber(story.title) : daily === undefined ? 'Loading today’s story…' : 'Open the story shelf'
  return (
    <section aria-label="Next story" style={{ marginTop: '17px' }}>
      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1, fontWeight: 770, letterSpacing: '-0.01em' }}>2 · Story</p>
      <div style={{ marginTop: '6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px' }}>
        <h2 lang={story ? 'zh-Hans' : undefined} style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: story ? HANZI_FONT : UI_FONT, fontSize: story ? '22px' : '17px', lineHeight: 1.1, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</h2>
        <span style={{ color: ready ? 'var(--chinese-accent)' : 'var(--text-muted)', fontSize: '11.5px', lineHeight: 1.2, fontWeight: ready ? 700 : 520, textAlign: 'right', flexShrink: 0 }}>{status}</span>
      </div>
      {story?.cover_url && (
        <button type="button" disabled={!ready} onClick={() => onNavigate('stories', { storyId: story.id })} aria-label={'Open ' + title} style={{ position: 'relative', display: 'block', width: '100%', marginTop: '8px', padding: 0, border: 0, borderRadius: '13px', overflow: 'hidden', background: 'var(--surface-2)', cursor: ready ? 'pointer' : 'default' }}>
          <img src={story.cover_url} alt="" style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', objectPosition: '50% 54%', filter: ready ? 'saturate(1.04)' : 'saturate(0.94)' }} />
          {ready && <span style={{ position: 'absolute', right: '11px', bottom: '11px', height: '40px', padding: '0 14px', borderRadius: '9px', background: 'rgba(255,248,236,0.94)', color: '#752417', display: 'grid', placeItems: 'center', fontFamily: UI_FONT, fontSize: '13px', fontWeight: 760, boxShadow: '0 4px 10px -6px rgba(25,17,14,0.72)' }}>Start story&nbsp;&nbsp;→</span>}
        </button>
      )}
      {daily === undefined && <div aria-busy="true" style={{ width: '100%', aspectRatio: '16 / 9', marginTop: '8px', borderRadius: '13px', background: 'var(--surface-2)' }} />}
    </section>
  )
}

export function HomeView({ profile, track, counts, daily, onNavigate }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const learned = counts.learnedCount || 0
  const totalWords = counts.totalWords || 0
  const level = getLevelLabel(profile.active_language, track.system, track.current_level)
  const estimate = sessionEstimateLabel(counts)
  const stage = homeDailyStage({ counts, daily })
  const headerStatus = stage === 'cards' ? (estimate || 'Cards first') : stage === 'story' ? 'Story ready' : stage === 'practice' ? 'Practice ready' : stage === 'complete' ? 'Complete' : 'Caught up'
  const practiceStatus = stage === 'practice' ? 'Ready to practice' : stage === 'complete' ? 'Complete for today' : stage === 'caught-up' ? 'Nothing due' : 'After your story'
  return (
    <div className="hd-home-settle" data-home-stage={stage} style={{ width: '100%', maxWidth: '430px', margin: '0 auto', padding: isMobile ? '18px 20px 26px' : '36px 20px 48px', color: 'var(--text)', fontFamily: UI_FONT, WebkitFontSmoothing: 'antialiased' }}>
      <header style={{ height: '52px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div><h1 style={{ margin: 0, fontSize: '22px', lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.025em' }}>Today’s training</h1><p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1, fontWeight: 600 }}>{headerStatus}</p></div>
        <button type="button" aria-label="Open profile" onClick={() => onNavigate('profile')} className="hd-press" style={{ width: '44px', height: '44px', marginTop: '-4px', padding: 0, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-1)', cursor: 'pointer', '--primary-bright': 'var(--text-faint)', '--primary-fill': 'var(--text-muted)', '--primary-pressed': 'var(--text-muted)' }}><ProfileGlyph size={22} active={false} color="currentColor" /></button>
      </header>
      <CardsHero counts={counts} accent={theme.accentHex} onNavigate={onNavigate} stage={stage} />
      <StoryStep daily={daily} stage={stage} onNavigate={onNavigate} />
      <button type="button" disabled={stage !== 'practice'} onClick={() => onNavigate('practice')} aria-label="Grammar review" style={{ width: '100%', minHeight: '76px', marginTop: '13px', padding: 0, border: 0, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontFamily: UI_FONT, display: 'grid', gridTemplateColumns: '1fr auto 36px', alignItems: 'center', gap: '12px', textAlign: 'left', cursor: stage === 'practice' ? 'pointer' : 'default' }}>
        <div><p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1, fontWeight: 760 }}>3 · Practice</p><p style={{ margin: '5px 0 0', fontSize: '15px', lineHeight: 1, fontWeight: 710 }}>Grammar review</p></div>
        <span style={{ color: stage === 'practice' ? theme.accentHex : 'var(--text-muted)', fontSize: '11.5px', lineHeight: 1.2, fontWeight: stage === 'practice' ? 700 : 520 }}>{practiceStatus}</span>
        <span aria-hidden="true" style={{ color: stage === 'practice' ? theme.accentHex : 'var(--text-muted)', display: 'grid', placeItems: 'center', '--primary-bright': stage === 'practice' ? '#E66A52' : 'var(--text-faint)', '--primary-fill': stage === 'practice' ? theme.accentHex : 'var(--text-muted)', '--primary-pressed': stage === 'practice' ? '#8F2D1D' : 'var(--text-muted)' }}><PracticeGlyph size={28} active={stage === 'practice'} color="currentColor" /></span>
      </button>
      <section aria-label={level + ' progress'} style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><strong style={{ fontSize: '12.5px', lineHeight: 1, fontWeight: 800 }}>{level}</strong><span style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1, fontWeight: 540, fontVariantNumeric: 'tabular-nums' }}>{learned} / {totalWords} words</span></div>
        <div role="progressbar" aria-label={level + ' progress'} aria-valuenow={learned} aria-valuemin="0" aria-valuemax={totalWords} style={{ height: '3px', marginTop: '8px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}><div style={{ width: homeProgressPct(learned, totalWords) + '%', height: '100%', background: theme.accentHex, borderRadius: 'inherit', transition: 'width 400ms ' + EASE }} /></div>
      </section>
    </div>
  )
}

export default function Home({ profile, track, counts, session, onNavigate }) {
  const [daily, setDaily] = useState(undefined)
  const userId = session?.user?.id
  const learned = counts.learnedCount || 0
  useEffect(() => {
    let alive = true
    if (!userId) return undefined
    getDailyStoryCard(userId, track, learned).then(result => { if (alive) setDaily(result) }).catch(() => { if (alive) setDaily(null) })
    return () => { alive = false }
  }, [userId, track, learned])
  return <HomeView profile={profile} track={track} counts={counts} daily={daily} onNavigate={onNavigate} />
}
