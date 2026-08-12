import { useState } from 'react'
import { GRADE_STYLES } from './gradePalette'
import { GRADES } from './grades'

// The four grades, as a component.
//
// Lifted out of Study.jsx unchanged — same markup, same palette, same sizing
// from studyLayout — so that anything else which needs to SHOW the grade row
// (the onboarding tutorial) shows the real one rather than a lookalike. A
// lookalike is how a learner ends up relearning the control they were taught.
//
// Presentation only: it renders four buttons and reports which one was pressed.
// Scheduling, persistence and what an interval says are Study's, and arrive as
// `labels` (from srs.previewLabels) and `onGrade`.

function GradeButton({
  grade, gradeKey, label, interval, bg, border, text, onClick, suggested,
  // Sizing comes from studyLayout.js so a short phone can fit all four grades
  // on screen without ever dropping below a comfortable tap target.
  minHeight = 76, labelSize = 14, intervalSize = 11,
}) {
  const [hovered, setHovered] = useState(false)
  // Hover/suggested strengthens by swapping in the button's own border tone —
  // one step darker than its resting bg, given directly by the palette rather
  // than derived, so no new shades are invented.
  const activeBg = hovered || suggested ? border : bg
  return (
    <button
      // Both: the number the scheduler wants, and the key anything outside the
      // scheduler should store or replay (grades.js). Study uses the first and
      // ignores the second; the tutorial does the opposite.
      onClick={() => onClick(grade, gradeKey)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: minHeight >= 68 ? '6px' : '3px',
        minHeight: minHeight + 'px', padding: minHeight >= 68 ? '12px 8px' : '8px 4px',
        // 16, deliberately NOT normalized. P14-2 snapped it to `card` (18) and
        // flashcard-contract.spec.js caught it: the grade row's geometry is
        // pinned by contract, and Study is the one screen the phase was told to
        // especially protect. Note also that shape.js's own comment claims these
        // buttons are `control` (12) — they never were. Study's own phase gets to
        // pick between 12 and 16; a sweep does not.
        borderRadius: '16px',
        border: (suggested ? '2px solid ' : '1.5px solid ') + border,
        background: activeBg,
        color: text, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? 'var(--shadow-1)' : 'none',
      }}
    >
      <span style={{ fontSize: labelSize + 'px', fontWeight: 700 }}>
        {label}
      </span>
      {/* The schedule preview, or — in the onboarding tutorial's first row —
          what the grade MEANS. Omitted rather than left blank when there is
          neither: nothing is being scheduled there, and an empty line under
          four buttons reads as a rendering fault. */}
      {interval ? (
        <span style={{ fontSize: intervalSize + 'px', fontWeight: 600, color: 'var(--text-muted)' }}>
          {interval}
        </span>
      ) : null}
    </button>
  )
}

// One row of four on every width. The 2x2 mobile grid was half of why grading
// once fell below the fold — two rows of 76px buttons plus their gap is most of
// a phone's card area. studyLayout shrinks the buttons instead, never past 44px.
export default function GradeRow({ labels, onGrade, suggested, layout }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      gap: layout.gradeGap + 'px',
    }}>
      {GRADES.map(item => (
        <GradeButton
          key={item.grade}
          grade={item.grade}
          gradeKey={item.key}
          label={item.label}
          interval={labels[item.grade]}
          bg={GRADE_STYLES[item.grade].bg}
          border={GRADE_STYLES[item.grade].border}
          text={GRADE_STYLES[item.grade].text}
          onClick={onGrade}
          suggested={suggested === item.grade}
          minHeight={layout.gradeMinHeight}
          labelSize={layout.gradeLabelSize}
          intervalSize={layout.gradeIntervalSize}
        />
      ))}
    </div>
  )
}
