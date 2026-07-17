import { useEffect, useState } from 'react'
import StoryReaderImmersive from './StoryReaderImmersive'
import PacedReader from './PacedReader'
import ChatReader from './ChatReader'
import { resolvePresentation } from './readerMode'
import { prefsGet } from './offline'

const PREFS_KEY = 'reader:prefs'

// Chooses the presentation for a story and renders it. All modes receive the
// same props; 'paced' renders the new beat-by-beat PacedReader, everything
// else falls back to the classic scroll reader.
export default function StoryReader(props) {
  const [modePref, setModePref] = useState('paced')
  useEffect(() => {
    let live = true
    prefsGet(PREFS_KEY).then(p => { if (live && p && typeof p.mode === 'string') setModePref(p.mode) })
    return () => { live = false }
  }, [])

  const mode = resolvePresentation(props.story, modePref)
  if (mode === 'chat') return <ChatReader {...props} />
  if (mode === 'paced') return <PacedReader {...props} />
  return <StoryReaderImmersive {...props} />
}
