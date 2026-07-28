import { useEffect, useState } from 'react'
import { prefsGet } from './offline'
import { READER_PREFS_KEY, DEFAULT_READING_FONT, readingFontFromPrefs, readingFontStack } from './readingFonts'

// Read-only access to the learner's chosen reading font, for screens that follow
// the setting but don't offer it — the flashcard, above all. The choice is made
// in the readers' settings panels and stored in the shared reader prefs object;
// this just hands a screen the resulting CSS font-family without threading the
// pref down through the whole app.
//
// Degrades exactly like every other prefs read: if IndexedDB is unavailable the
// promise resolves null and the screen simply stays on the language's own font.
export function useReadingFont(language) {
  const [value, setValue] = useState(DEFAULT_READING_FONT)
  useEffect(() => {
    let live = true
    prefsGet(READER_PREFS_KEY).then((saved) => {
      if (live) setValue(readingFontFromPrefs(saved, language))
    })
    return () => { live = false }
  }, [language])
  return { readingFont: value, fontFamily: readingFontStack(language, value) }
}
