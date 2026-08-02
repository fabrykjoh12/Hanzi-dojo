const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function trapDialogFocus(event, container) {
  if (!event || event.key !== 'Tab' || !container) return false
  const items = Array.from(container.querySelectorAll(FOCUSABLE))
    .filter(el => !el.hidden && el.getAttribute('aria-hidden') !== 'true')
  if (items.length === 0) {
    event.preventDefault()
    container.focus()
    return true
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = container.ownerDocument.activeElement
  if (event.shiftKey && (active === first || active === container)) {
    event.preventDefault()
    last.focus()
    return true
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}
