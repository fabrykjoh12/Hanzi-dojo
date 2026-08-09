import { useState, useEffect } from 'react'
import { isNativeApp } from './nativeShell'

// Single source of truth for the mobile shell. Below this width the left
// sidebar (Sidebar.jsx) is replaced by a bottom navigation bar (MobileNav.jsx).
export const MOBILE_BREAKPOINT = 768

// Whether to render the app shell (bottom bar) rather than the website shell
// (left sidebar).
//
// The width test alone was wrong in the app, in two ways that both shipped:
//   - An iPad build rendered the desktop *website* — sidebar, hover states,
//     44px-wide nav rows — because an iPad is 768pt across.
//   - An iPhone turned landscape crossed the same threshold mid-session, so
//     rotating swapped the bottom bar for a sidebar and dropped the top
//     safe-area inset with it (App.jsx pads on `isMobile`), putting content
//     under the notch.
//
// Inside the native shell there is no website to fall back to: whatever the
// viewport says, this is the app, and the app shell is the only correct answer.
// (iOS is portrait-locked as of this phase, so the landscape case is Android
// tablets and iPad — both of which want the app shell too.)
export function shellIsMobile({ width, native, breakpoint = MOBILE_BREAKPOINT } = {}) {
  if (native) return true
  return Number(width) < breakpoint
}

function currentShellIsMobile() {
  if (typeof window === 'undefined') return false
  return shellIsMobile({ width: window.innerWidth, native: isNativeApp() })
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(currentShellIsMobile)

  useEffect(() => {
    function onResize() { setIsMobile(currentShellIsMobile()) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return isMobile
}
