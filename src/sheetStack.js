// The sheets and dialogs currently open, so the first rung of the Android back
// ladder (NAV-MODEL §5.2) has something to read.
//
// Back must close an open sheet before it navigates anything. Today it does
// not: the mobile "More" sheet is state inside MobileNav, invisible to the back
// handler, so pressing Back with it open navigated the screen UNDERNEATH while
// the sheet stayed on top of the result.
//
// A stack rather than a boolean, because sheets can legitimately overlap (a
// word lookup opened from inside another sheet) and Back should close them one
// at a time, innermost first.

const open = []

// Anything that needs to RENDER differently while a sheet is open, rather than
// just answer Back. The feedback control uses this to get out of the way: it is
// a fixed button, and a fixed button over a modal dialog is a defect however
// high or low its z-index happens to be.
//
// Deliberately not a second source of truth — it is a subscription to the one
// that already exists, so a sheet cannot be open for Back and closed for a
// listener.
const listeners = new Set()

function notify() {
  for (const fn of listeners) {
    try { fn(open.length > 0) } catch { /* a bad listener must not wedge a sheet */ }
  }
}

export function subscribeSheets(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

// `close` is called when Back reaches this sheet. Returns an unregister for the
// ordinary case where the sheet is dismissed some other way (backdrop, X, a
// navigation) — so the stack never holds a sheet that is already gone.
export function pushSheet(close) {
  if (typeof close !== 'function') return () => {}
  const entry = { close }
  open.push(entry)
  notify()
  return () => {
    const at = open.indexOf(entry)
    if (at !== -1) {
      open.splice(at, 1)
      notify()
    }
  }
}

export function anySheetOpen() {
  return open.length > 0
}

// Close the innermost one. Returns whether there was anything to close.
export function closeTopSheet() {
  const entry = open.pop()
  if (!entry) return false
  notify()
  try { entry.close() } catch { /* a sheet that cannot close must not wedge Back */ }
  return true
}

// Tests only.
export function resetSheets() {
  open.length = 0
  notify()
}
