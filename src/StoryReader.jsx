import { useEffect, useState } from 'react'
import StoryReaderImmersive from './StoryReaderImmersive'
import PacedReader from './PacedReader'
import ChatReader from './ChatReader'
import InteractiveChatReader from './InteractiveChatReader'
import SceneReader from './SceneReader'
import { resolvePresentation } from './readerMode'
import { prefsGet, prefsMerge } from './offline'

const PREFS_KEY = 'reader:prefs'

// Chooses the presentation for a story and renders it. All modes receive the
// same props; 'paced' renders the new beat-by-beat PacedReader, everything
// else falls back to the classic scroll reader.
//
// For a paced story the learner may switch between the paced and classic-scroll
// experiences: `modePref` owns that choice here, so picking it swaps the reader
// instantly (no round-trip to the library) and is remembered in prefs. Both
// readers get `readerMode` + `onPickReaderMode` so the toggle reads the same
// from either side — an equal choice, not a buried link.
export default function StoryReader(props) {
  const [modePref, setModePref] = useState('paced')
  useEffect(() => {
    let live = true
    prefsGet(PREFS_KEY).then(p => { if (live && p && typeof p.mode === 'string') setModePref(p.mode) })
    return () => { live = false }
  }, [])

  const chooseMode = (m) => { setModePref(m); prefsMerge(PREFS_KEY, { mode: m }) }
  const extra = { readerMode: modePref, onPickReaderMode: chooseMode }

  const mode = resolvePresentation(props.story, modePref)
  if (mode === 'scene') return <SceneReader {...props} />
  if (mode === 'chat' && props.story.interactions) return <InteractiveChatReader {...props} />
  if (mode === 'chat') return <ChatReader {...props} />
  if (mode === 'paced') return <PacedReader {...props} {...extra} />
  return <StoryReaderImmersive {...props} {...extra} />
}
