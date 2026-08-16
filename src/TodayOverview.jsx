import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { overviewProgressLabel, overviewSteps } from './todayModel'
import { ink } from './languageTheme'
import { stripLeadingNumber } from './storyArcs'

// The Today overview: a utility sheet, deliberately not a screen.
//
// Today itself only ever shows the ONE thing the learner is on. Everything a
// dashboard would have spread across the screen — the other two steps, the
// library, level progress, the account — lives here instead, one deliberate tap
// away from the date chip.
//
// It is a sheet rather than a destination because that is what it is worth: you
// open it to check something and it goes away. Giving it a tab would put a
// second "overview" in permanent competition with Today, which is the exact
// dashboard this product removed.
//
// Reached from the date chip in Today's header — a visible, labelled control.
// The prototype opened it with a pull-down from the top edge, which on iOS is
// the notification shade's gesture and, worse, is invisible: a learner who
// never guesses it never finds the library.

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"

function StepRow({ step, thumb, titleLang, titleFont, accentHex }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '13px', padding: '13px 0', borderTop: '1px solid color-mix(in srgb, var(--border) 72%, transparent)' }}>
      {thumb || (
        <span aria-hidden="true" style={{
          width: '9px', height: '9px', borderRadius: '50%', boxSizing: 'border-box',
          border: '1.5px solid ' + (step.current ? accentHex : 'var(--border)'),
          background: step.current ? accentHex : 'transparent',
        }} />
      )}
      <span style={{ minWidth: 0, textAlign: 'left' }}>
        <span lang={titleLang} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: titleFont || UI_FONT, fontSize: '15px', lineHeight: 1.25, fontWeight: 650 }}>{step.title}</span>
        {step.sub && <span style={{ display: 'block', marginTop: '2px', fontSize: '12px', lineHeight: 1.25, fontWeight: 520, color: 'var(--text-faint)' }}>{step.sub}</span>}
      </span>
      <span style={{ flexShrink: 0, fontSize: '11.5px', lineHeight: 1.2, fontWeight: 640, color: step.current ? ink(accentHex) : 'var(--text-faint)' }}>{step.status}</span>
    </div>
  )
}

function UtilityRow({ label, value, onClick }) {
  const inner = (
    <>
      <span style={{ fontSize: '14.5px', lineHeight: 1.2, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: '12.5px', lineHeight: 1.2, fontWeight: 500, color: 'var(--text-faint)' }}>{value}</span>
    </>
  )
  const style = {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
    padding: '13px 0', borderTop: '1px solid color-mix(in srgb, var(--border) 72%, transparent)',
    background: 'transparent', border: 0, color: 'var(--text)', fontFamily: UI_FONT,
    textAlign: 'left', cursor: onClick ? 'pointer' : 'default',
  }
  if (!onClick) return <div style={style}>{inner}</div>
  return <button type="button" onClick={onClick} className="hd-press" style={style}>{inner}</button>
}

export default function TodayOverview({
  stage, counts, daily, theme, levelLabel, storySub, onNavigate, onClose,
}) {
  const sheetRef = useRef(null)
  const steps = overviewSteps({ stage, counts, daily })
  const story = daily ? daily.story : null
  const progress = overviewProgressLabel({
    levelLabel,
    learned: counts.learnedCount || 0,
    totalWords: counts.totalWords || 0,
  })

  // Escape closes; focus moves into the sheet on open and returns to whatever
  // opened it on close, so a keyboard user is never dropped at the top of the
  // document after a look at the day.
  useEffect(() => {
    const opener = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    if (sheetRef.current) sheetRef.current.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [onClose])

  // Portalled to the document root on purpose. The sheet is modal — it has to
  // cover the compact dock — and `main` is a positioned, z-indexed box, so a
  // sheet rendered inside it is trapped in that stacking context and the dock
  // draws straight through it however high its own z-index goes.
  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close overview"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40, border: 0, padding: 0, cursor: 'default',
          background: 'rgba(10,9,8,0.32)', animation: 'hd-fade-in-soft 200ms ease-out both',
        }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Today overview"
        tabIndex={-1}
        className="hd-sheet-rise"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41, outline: 'none',
          maxWidth: '520px', margin: '0 auto',
          background: 'var(--surface)', borderRadius: '22px 22px 0 0',
          borderTop: '1px solid var(--border)',
          boxShadow: '0 -24px 60px -18px rgba(10,9,8,0.35)',
          padding: '10px 24px calc(30px + env(safe-area-inset-bottom, 0px))',
          color: 'var(--text)', fontFamily: UI_FONT,
        }}
      >
        <span aria-hidden="true" style={{ display: 'block', width: '34px', height: '4px', margin: '0 auto 14px', borderRadius: '999px', background: 'var(--border)' }} />
        <h2 style={{ margin: 0, fontSize: '19px', lineHeight: 1.2, fontWeight: 720, letterSpacing: '-0.01em' }}>Today</h2>

        <div style={{ marginTop: '8px' }}>
          {steps.map(step => (
            <StepRow
              key={step.key}
              step={step.key === 'story' && story
                ? { ...step, title: stripLeadingNumber(story.title), sub: storySub || step.sub }
                : step}
              titleLang={step.key === 'story' && story ? theme.langTag : undefined}
              titleFont={step.key === 'story' && story ? theme.font + ', sans-serif' : undefined}
              thumb={step.key === 'story' && story && story.cover_url
                ? <img src={story.cover_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' }} />
                : null}
              accentHex={theme.accentHex}
            />
          ))}
        </div>

        <div style={{ marginTop: '14px' }}>
          <UtilityRow label="Library" value="Browse all stories" onClick={() => { onClose(); onNavigate('stories') }} />
          {progress && <UtilityRow label="Progress" value={progress} />}
          <UtilityRow label="Profile & settings" value="›" onClick={() => { onClose(); onNavigate('profile') }} />
        </div>
      </div>
    </>,
    document.body,
  )
}
