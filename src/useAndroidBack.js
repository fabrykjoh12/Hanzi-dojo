import { useEffect } from 'react'
import { androidBack } from './navStack'
import { setBackHandler } from './backHandler'
import { anySheetOpen, closeTopSheet } from './sheetStack'

// Android's hardware back key, answered from the navigation model.
//
// It used to be answered from the URL: `backAction(pathname, canGoBack)` in
// nativeShell.js walked the browser's history whenever there was any, which
// meant Back retraced a learner's entire browsing session — every tab tap
// included — instead of popping the screen they were looking at.
//
// Now it asks the reducer. `androidBack(state)` is the pure ladder from
// NAV-MODEL §5.2 and is already tested on its own; this hook is the wiring
// that makes the real button run it, and it deliberately performs each verdict
// through the SAME navigate/back calls the on-screen controls use, so there is
// no second way to move through the app.
//
// The web is untouched: nothing calls the registry outside the native bridge.
export function useAndroidBack(nav, { immersiveFlow, onExitFlow } = {}) {
  const { state, back, navigate } = nav
  useEffect(() => {
    return setBackHandler(() => {
      const verdict = androidBack(state, { sheetOpen: anySheetOpen(), immersiveFlow })
      if (verdict === 'close-sheet') { closeTopSheet(); return 'handled' }
      // The screen's own exit, so the hardware key and the on-screen control
      // are literally the same action rather than two paths that agree today.
      if (verdict === 'exit-flow') {
        if (onExitFlow) { onExitFlow(); return 'handled' }
        // A flow that claimed Back but gave us no way out would trap the
        // learner; falling through to the ordinary ladder is the safe answer.
        return 'handled'
      }
      if (verdict === 'dismiss' || verdict === 'pop') { back(); return 'handled' }
      if (verdict === 'home-tab') { navigate('home'); return 'handled' }
      // Only the Home tab's own root exits. Everything else has somewhere to go
      // first, which is the whole point of the ladder.
      return 'exit'
    })
  }, [state, back, navigate, immersiveFlow, onExitFlow])
}
