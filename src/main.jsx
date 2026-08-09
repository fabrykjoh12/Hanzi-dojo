import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// Bundled typefaces — must come before index.css so the @font-face rules are
// in the stylesheet ahead of anything that uses them.
import './fonts'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import NativeShellBridge from './NativeShellBridge.jsx'
import SplashIntro from './SplashIntro.jsx'
import { BUILD_SHA, BUILD_TIME } from './version'
import { installErrorMonitoring } from './errorMonitor'
import { isNativeApp } from './nativeShell'
import { hideNativeSplash } from './nativeSplash'

// Announce the running build so "which version is live?" is answerable from the
// console (also in Settings, and at /version.json).
console.info('Hanzi Dojo · build ' + BUILD_SHA + (BUILD_TIME ? ' · ' + BUILD_TIME : ''))

// Unhandled exceptions / rejections become capped, privacy-safe analytics
// events, so production failures are diagnosable (see errorMonitor.js).
installErrorMonitoring()

// Mark the document when we are inside the store app, so CSS can hold the two
// surfaces to different rules without a single JS branch in a screen.
//
// This is the styling half of the isNativeApp() contract in CLAUDE.md §1: the
// app suppresses the browser affordances that give a webview away — the iOS
// long-press callout, text selection on chrome, the rubber-band overscroll
// behind a fixed layout — while the web keeps every one of them, because on
// the web they are correct. Everything scoped to `:root[data-native]` in
// index.css is native-only by construction, which also makes the divergence
// greppable in one place.
if (isNativeApp()) document.documentElement.setAttribute('data-native', '')

// Backstop for the held launch image.
//
// `launchAutoHide: false` (capacitor.config.json) means the platform splash
// stays up until something calls hide(). SplashIntro.jsx does that two frames
// after it paints, which is the whole point — the handoff happens when the web
// overlay is already covering the same pixels. But SplashIntro can only run if
// React mounted, and "the splash never hides" is an app that is simply dead on
// launch: a frozen logo with no way past it.
//
// So the guarantee lives out here, before React, where a render failure cannot
// reach it. Long enough that the normal path always wins the race; short enough
// that a broken bundle still shows whatever the ErrorBoundary can draw.
const SPLASH_BACKSTOP_MS = 3500
if (isNativeApp()) {
  setTimeout(() => { hideNativeSplash() }, SPLASH_BACKSTOP_MS)
}

// react-router basename must match the host's base path (Pages serves under
// /Hanzi-dojo/, Vercel/dev under /). Strip the trailing slash for a subpath.
const rawBase = import.meta.env.BASE_URL
const basename = rawBase.length > 1 && rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <App />
        <NativeShellBridge />
        {/* Sibling of App, not a wrapper: it covers whatever App is doing
            (session fetch, profile fetch, first route) and removes itself on
            its own timer, so no screen has to know it exists. It renders
            nothing at all on the web. */}
        <SplashIntro />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

// Screens are code-split (see the lazy() imports in App.jsx), so navigating to
// one not yet fetched this session dynamically imports its chunk. After a
// deploy, an already-open tab is still running the OLD bundle, whose chunk
// files no longer exist at their old hashed URLs — that import 404s, which is
// exactly what used to surface as the ErrorBoundary's "Something went wrong"
// and require a manual reload on every single navigation to a fresh screen.
// Vite dispatches this event specifically for that failure; reloading once
// fetches the current bundle and just works. Guarded by a one-shot flag
// cleared on a successful `load`, so a reload that doesn't actually fix
// things (a real bug, not a stale deploy) can't loop forever.
const PRELOAD_ERROR_FLAG = 'hd:reloaded-for-preload-error'
window.addEventListener('load', () => {
  try { sessionStorage.removeItem(PRELOAD_ERROR_FLAG) } catch { /* noop */ }
})
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem(PRELOAD_ERROR_FLAG)) return
    sessionStorage.setItem(PRELOAD_ERROR_FLAG, '1')
  } catch { /* sessionStorage unavailable — reload once, best effort */ }
  window.location.reload()
})

// Register the offline service worker in production only (keeps dev/sandbox
// clean). Scope follows BASE_URL so it works on both the GitHub Pages subpath
// and the Vercel root. Failures are non-fatal.
//
// The worker skipWaiting()s on install, so a new deploy takes control while
// the page is still running the previous bundle. Surface that as a calm
// "refresh" pill instead of requiring users to know the hard-refresh ritual.
// (Vanilla DOM on purpose — this lives outside the React tree and must work
// even if the old bundle is in a broken state.)
function showUpdatePill() {
  if (document.getElementById('hd-update-pill')) return
  const btn = document.createElement('button')
  btn.id = 'hd-update-pill'
  btn.textContent = 'Update ready — tap to refresh'
  btn.setAttribute('style',
    'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99;' +
    'padding:10px 18px;border-radius:999px;border:1px solid var(--border, #E7E5E4);' +
    'background:var(--surface, #fff);color:var(--text, #18181B);' +
    'font:600 13px Inter,sans-serif;cursor:pointer;' +
    'box-shadow:0 12px 32px rgba(24,24,27,0.18);')
  btn.onclick = function () { window.location.reload() }
  document.body.appendChild(btn)
}

// Inside the Capacitor shell the assets are served from the app bundle, so the
// offline service worker is unnecessary — and its cache layer is one more place
// for staleness bugs. Native builds skip it (PRE-RELEASE-CHECKLIST §0a).
if (import.meta.env.PROD && !isNativeApp() && 'serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    // A controller existing now means a later controllerchange is an UPDATE
    // (on first install the controller goes null → worker; no prompt needed).
    const hadController = Boolean(navigator.serviceWorker.controller)
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController) showUpdatePill()
    })
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(function () { /* ignore */ })
  })
}
