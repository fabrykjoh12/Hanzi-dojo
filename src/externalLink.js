// Opening links that are NOT part of the app (Discord, YouTube, CC-CEDICT…),
// and the app's own public pages when we deliberately want them outside the
// app shell.
//
// Why this exists (PRE-RELEASE-CHECKLIST §0a): in a browser a plain
// target="_blank" anchor is fine. Inside the Capacitor WebView it is not —
// depending on the platform it either does nothing at all or, worse, replaces
// the running app with the foreign page and leaves the learner with no way
// back. Every external link goes through here instead.

import { isNativeApp } from './nativeShell'
import { BRAND_URL } from './brand'

// An absolute http(s) URL is something we hand to the system browser. Anything
// else (an in-app route like /privacy, a mailto:, a bare fragment) is not.
export function isExternalUrl(href) {
  if (typeof href !== 'string') return false
  return /^https?:\/\//i.test(href.trim())
}

// The public web address of one of our own pages, for the case where a native
// build wants the hosted copy (e.g. the Terms link during signup — reading it
// must not throw away the half-filled form).
export function publicPageUrl(path) {
  if (typeof path !== 'string' || !path) return BRAND_URL
  return BRAND_URL + (path.startsWith('/') ? path : '/' + path)
}

// Open a URL outside the app. In the native shell this is the in-app system
// browser (a sheet the learner can dismiss back into the app); on the web it
// is an ordinary new tab. Never throws — a failed open must not break a screen.
export function openExternal(url) {
  if (!isExternalUrl(url)) return Promise.resolve(false)
  if (isNativeApp()) {
    return import('@capacitor/browser')
      .then(({ Browser }) => Browser.open({ url }))
      .then(() => true)
      .catch(() => {
        try { window.open(url, '_blank', 'noopener,noreferrer') } catch { /* noop */ }
        return false
      })
  }
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch { /* popup blocked — the anchor's own href still applies */ }
  return Promise.resolve(true)
}

// Props for a link to one of our own public pages that must open OUTSIDE the
// current screen — the Terms/Privacy links during signup, where navigating
// in-app would discard a half-filled form. On the web the in-app route opens
// in a new tab; in the native shell (where target="_blank" does nothing) the
// hosted copy opens in the system browser.
export function legalLinkProps(path) {
  return {
    href: path,
    target: '_blank',
    rel: 'noopener noreferrer',
    onClick: (event) => {
      if (!isNativeApp()) return
      if (event && typeof event.preventDefault === 'function') event.preventDefault()
      openExternal(publicPageUrl(path))
    },
  }
}

// Props for an <a> that points somewhere outside the app. The href stays real
// (middle-click, copy-link and no-JS all keep working on the web); the click
// handler only takes over inside the native shell, where the default would
// misbehave.
export function externalLinkProps(href) {
  return {
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    onClick: (event) => {
      if (!isNativeApp()) return
      if (event && typeof event.preventDefault === 'function') event.preventDefault()
      openExternal(href)
    },
  }
}
