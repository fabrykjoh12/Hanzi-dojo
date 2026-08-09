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

// `close` is called when Back reaches this sheet. Returns an unregister for the
// ordinary case where the sheet is dismissed some other way (backdrop, X, a
// navigation) — so the stack never holds a sheet that is already gone.
export function pushSheet(close) {
  if (typeof close !== 'function') return () => {}
  const entry = { close }
  open.push(entry)
  return () => {
    const at = open.indexOf(entry)
    if (at !== -1) open.splice(at, 1)
  }
}

export function anySheetOpen() {
  return open.length > 0
}

// Close the innermost one. Returns whether there was anything to close.
export function closeTopSheet() {
  const entry = open.pop()
  if (!entry) return false
  try { entry.close() } catch { /* a sheet that cannot close must not wedge Back */ }
  return true
}

// Tests only.
export function resetSheets() {
  open.length = 0
}
