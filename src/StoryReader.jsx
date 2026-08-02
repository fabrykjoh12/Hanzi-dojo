import { lazy, Suspense, useEffect, useState } from 'react'
import { resolvePresentation } from './readerMode'
import { prefsGet, prefsMerge } from './offline'

const PREFS_KEY = 'reader:prefs'

const StoryReaderImmersive = lazy(() => import('./StoryReaderImmersive'))
const ManhuaReader = lazy(() => import('./ManhuaReader'))
const PacedReader = lazy(() => import('./PacedReader'))
const ChatReader = lazy(() => import('./ChatReader'))
const InteractiveChatReader = lazy(() => import('./InteractiveChatReader'))
const SceneReader = lazy(() => import('./SceneReader'))

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
  let reader
  if (mode === 'manhua') reader = <ManhuaReader {...props} />
  else if (mode === 'scene') reader = <SceneReader {...props} />
  else if (mode === 'chat' && props.story.interactions) reader = <InteractiveChatReader {...props} />
  else if (mode === 'chat') reader = <ChatReader {...props} />
  else if (mode === 'paced') reader = <PacedReader {...props} {...extra} />
  else reader = <StoryReaderImmersive {...props} {...extra} />

  return (
    <div lang={props.track?.language === 'chinese' ? 'zh-Hans' : undefined} style={{ display: 'contents' }}>
      <Suspense fallback={<div role="status" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>Opening story…</div>}>
        {reader}
      </Suspense>
    </div>
  )
}
