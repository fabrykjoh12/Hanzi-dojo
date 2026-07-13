import { useEffect } from 'react'

// Desktop keyboard flow for the study screen, lifted out of Study.jsx verbatim.
// Space/Enter reveals, 1–4 grades (Again/Hard/Good/Easy), Enter takes the
// suggested/Good grade, R replays audio, U undoes the last grade. Behavior is
// unchanged, including the intentional every-render rebind (no dependency
// array) so the handler always closes over current state.

// Typing contexts own the keyboard entirely — never hijack keys while an
// input / textarea / select or a contentEditable element is focused.
export function isEditableTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el.isContentEditable)
}

// A focused button/link keeps its native Space/Enter activation, so the
// reveal/grade Enter shortcuts must NOT also fire for it. The non-activating
// shortcuts (1–4, R, U) still work, so a mouse+keyboard mixed flow isn't broken
// by focus resting on the last-clicked button.
export function isActivatableTarget(el) {
  const tag = el && el.tagName
  return tag === 'BUTTON' || tag === 'A'
}

export function useStudyKeyboardShortcuts({
  loading, done, queue, flipped, suggestedGrade, undoRef,
  setFlipped, handleGrade, playAudio, undoLast,
}) {
  // Rebinds each render so the handler always sees current state (no deps
  // array) — preserved exactly from the original Study.jsx effect.
  useEffect(() => {
    const onKey = (e) => {
      if (loading || done || queue.length === 0) return
      const el = e.target
      // Typing contexts own the keyboard entirely.
      if (isEditableTarget(el)) return
      const onActivatable = isActivatableTarget(el)
      if ((e.key === 'u' || e.key === 'U') && undoRef.current) {
        e.preventDefault()
        undoLast()
        return
      }
      if (!flipped) {
        if (!onActivatable && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault()
          setFlipped(true)
        }
        return
      }
      if (e.key >= '1' && e.key <= '4') {
        e.preventDefault()
        handleGrade(Number(e.key) - 1)
      } else if (!onActivatable && e.key === 'Enter') {
        e.preventDefault()
        handleGrade(suggestedGrade != null ? suggestedGrade : 2)
      } else if (e.key === 'r' || e.key === 'R') {
        playAudio()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
}
