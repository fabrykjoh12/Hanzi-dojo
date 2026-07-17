import { useEffect, useState } from 'react'
import StoryReaderImmersive from './StoryReaderImmersive'
import { resolvePresentation } from './readerMode'
import { prefsGet } from './offline'

const PREFS_KEY = 'reader:prefs'

// Chooses the presentation for a story and renders it. All modes receive the
// same props; today classic + paced both render the classic reader, so this
// task is a pure indirection with no visible change. PacedReader lands next.
export default function StoryReader(props) {
  const [modePref, setModePref] = useState('paced')
  useEffect(() => {
    let live = true
    prefsGet(PREFS_KEY).then(p => { if (live && p && typeof p.mode === 'string') setModePref(p.mode) })
    return () => { live = false }
  }, [])

  const mode = resolvePresentation(props.story, modePref)
  // 'paced' will switch to <PacedReader> in the next task.
  if (mode === 'classic' || mode === 'paced') return <StoryReaderImmersive {...props} />
  return <StoryReaderImmersive {...props} />
}
