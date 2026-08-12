/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { X, Play, Trash2 } from 'lucide-react'
import { Button, IconButton, Row, Chip, Segmented } from './controls'
import { rowDivider } from './controlTokens'

// The half of a control that only a renderer can answer: what element comes out,
// what a screen reader is told, and what happens when you click the thing that
// should not be clickable.
//
// The variant matrix is NOT here — it is data, and controlTokens.test.js checks
// it in the node environment in 40ms. This file asks the questions that need a
// DOM: roles, names, focus, keys, and whether `disabled` actually disables.

afterEach(cleanup)

describe('Button — semantics', () => {
  it('is a real button that does not submit a form by accident', () => {
    // CLAUDE.md §6-6: native form submission reloads the SPA. A <button> with no
    // type attribute defaults to submit, which inside any <form> is a page
    // reload — so the default has to be explicit.
    render(<Button>Start</Button>)
    expect(screen.getByRole('button', { name: 'Start' }).getAttribute('type')).toBe('button')
  })

  it('can opt into being a submit button, because DojoHQ has a real form', () => {
    render(<Button type="submit">Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('submit')
  })

  it('calls its handler once per click', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('takes an accessible name of its own when the label is not enough', () => {
    render(<Button ariaLabel="Start reviewing 17 cards">Start</Button>)
    expect(screen.getByRole('button', { name: 'Start reviewing 17 cards' })).toBeTruthy()
  })

  it('hides its decorative icon from the accessibility tree', () => {
    // The icon repeats the label. Announcing it would read the action twice.
    const { container } = render(<Button icon={Play}>Play</Button>)
    expect(container.querySelector('svg').getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
  })
})

describe('Button — disabled', () => {
  it('sets the DOM disabled attribute, not just a grey style', () => {
    render(<Button disabled>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' }).disabled).toBe(true)
  })

  it('does not fire its handler', () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Go</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('is belt and braces: the handler is not even attached', () => {
    // `disabled` alone is enough in a browser, but a disabled button can still
    // be dispatched a click programmatically (and jsdom will deliver it). Both
    // guards means "disabled" is a fact about the control, not about the event.
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Go</Button>)
    screen.getByRole('button', { name: 'Go' }).click()
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Button — keepFocus, the aria-disabled case', () => {
  // Two screens already do this by hand and both explain why in a comment:
  // Test.jsx auto-advances, Speaking.jsx disables on press. A real `disabled` on
  // the focused element drops focus to <body> and strands a keyboard learner
  // mid-drill.
  it('stays focusable and says it is disabled', () => {
    render(<Button disabled keepFocus>Check</Button>)
    const el = screen.getByRole('button', { name: 'Check' })
    expect(el.disabled).toBe(false)
    expect(el.getAttribute('aria-disabled')).toBe('true')
    el.focus()
    expect(document.activeElement).toBe(el)
  })

  it('still refuses the click', () => {
    const onClick = vi.fn()
    render(<Button disabled keepFocus onClick={onClick}>Check</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('claims nothing when it is enabled', () => {
    render(<Button keepFocus>Check</Button>)
    const el = screen.getByRole('button', { name: 'Check' })
    expect(el.getAttribute('aria-disabled')).toBe(null)
    expect(el.disabled).toBe(false)
  })

  it('uses the real attribute when keepFocus is not asked for', () => {
    // The default has to stay the strong form — aria-disabled alone is a hint a
    // browser does not enforce.
    render(<Button disabled>Check</Button>)
    const el = screen.getByRole('button', { name: 'Check' })
    expect(el.disabled).toBe(true)
    expect(el.getAttribute('aria-disabled')).toBe(null)
  })
})

describe('Button — loading', () => {
  it('announces itself as busy', () => {
    render(<Button loading>Send</Button>)
    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('aria-busy')).toBe('true')
  })

  it('says nothing about busy when it is not', () => {
    render(<Button>Send</Button>)
    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('aria-busy')).toBe(null)
  })

  it('cannot be double-submitted', () => {
    // The bug this exists to prevent: two taps on "Send feedback" while the
    // first insert is in flight writes the row twice.
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Send</Button>)
    const btn = screen.getByRole('button', { name: 'Send' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
    expect(btn.disabled).toBe(true)
  })

  it('swaps the label when one is given, and keeps it when it is not', () => {
    render(<Button loading loadingLabel="Sending…">Send</Button>)
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeTruthy()
    cleanup()
    render(<Button loading>Send</Button>)
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  })

  it('shows no spinner — P14-1 is before the animation phase', () => {
    // Deliberate: `loading` is expressed by the disabled treatment plus
    // aria-busy plus the optional label swap, which is what the app's
    // hand-rolled buttons already do. A spinner arrives with the animations.
    const { container } = render(<Button loading loadingLabel="Sending…">Send</Button>)
    expect(container.querySelectorAll('svg').length).toBe(0)
  })
})

describe('IconButton', () => {
  it('has an accessible name, which is the whole reason it exists', () => {
    // The census found unlabelled icon-only buttons in the app — invisible to a
    // screen reader. Making the name a prop is the only thing that stops it
    // recurring.
    render(<IconButton label="Close" icon={X} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('declares 44x44 in its own style, not via padding', () => {
    // jsdom does not lay out, so the inline declaration IS the assertion here.
    // The rendered geometry is measured in Playwright (p14-controls.spec.js).
    render(<IconButton label="Close" icon={X} onClick={() => {}} />)
    const el = screen.getByRole('button', { name: 'Close' })
    expect(el.style.width).toBe('44px')
    expect(el.style.height).toBe('44px')
  })

  it('reports a toggle state only when it is a toggle', () => {
    const { rerender } = render(<IconButton label="Show English" icon={X} pressed={false} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Show English' }).getAttribute('aria-pressed')).toBe('false')
    rerender(<IconButton label="Show English" icon={X} pressed onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Show English' }).getAttribute('aria-pressed')).toBe('true')
    // A plain action must NOT claim to be a toggle — aria-pressed="false" on a
    // close button tells a screen reader it can be switched on.
    rerender(<IconButton label="Close" icon={X} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Close' }).getAttribute('aria-pressed')).toBe(null)
  })

  it('does not fire when disabled', () => {
    const onClick = vi.fn()
    render(<IconButton label="Close" icon={X} disabled onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('accepts a custom SVG child instead of a lucide component', () => {
    // NavIcons.jsx draws its own SVGs; they have to fit the same shell.
    render(
      <IconButton label="Cards" onClick={() => {}}>
        <svg data-testid="custom" width="20" height="20" />
      </IconButton>,
    )
    expect(screen.getByTestId('custom')).toBeTruthy()
  })

  it('keeps the glyph size independent of the target size', () => {
    // The point of the component: a 19px mark inside a 44px target.
    const { container } = render(<IconButton label="Close" icon={X} iconSize={16} onClick={() => {}} />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe('16')
    expect(screen.getByRole('button', { name: 'Close' }).style.width).toBe('44px')
  })
})

describe('Row', () => {
  it('is a button when it does something', () => {
    render(<Row title="Daily new cards" onClick={() => {}} />)
    expect(screen.getByRole('button', { name: /Daily new cards/ })).toBeTruthy()
  })

  it('is not a button when it does not', () => {
    // A static row that reported itself as a button would put a dead tab stop
    // in every list.
    render(<Row title="Version 1.4.0" />)
    expect(screen.queryByRole('button')).toBe(null)
    expect(screen.getByText('Version 1.4.0')).toBeTruthy()
  })

  it('is keyboard-reachable by construction — no div-onClick', () => {
    // The gap this closes: the census found tappable rows built as
    // `<div onClick>` with no role and no tabIndex, which a keyboard cannot
    // reach at all. A real <button> needs no tabIndex and no key handler.
    const onClick = vi.fn()
    render(<Row title="Weak words" onClick={onClick} />)
    const el = screen.getByRole('button', { name: /Weak words/ })
    expect(el.tagName).toBe('BUTTON')
    fireEvent.keyDown(el, { key: 'Enter' })
    // jsdom does not synthesise the click a browser gives a focused button on
    // Enter, so assert the thing that MAKES that work: it is a button, and a
    // click reaches the handler.
    fireEvent.click(el)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders leading, supporting and trailing content in that order', () => {
    render(
      <Row
        title="Reset progress"
        supporting="Back to level 1"
        leading={<span data-testid="lead">L</span>}
        trailing={<span data-testid="trail">T</span>}
        onClick={() => {}}
      />,
    )
    const text = screen.getByRole('button').textContent
    expect(text.indexOf('L')).toBeLessThan(text.indexOf('Reset progress'))
    expect(text.indexOf('Reset progress')).toBeLessThan(text.indexOf('Back to level 1'))
    expect(text.indexOf('Back to level 1')).toBeLessThan(text.indexOf('T'))
  })

  it('omits the supporting line entirely when there is none', () => {
    // Not an empty span holding a 2px margin open.
    const { container } = render(<Row title="Only a title" />)
    expect(container.querySelectorAll('span > span').length).toBe(1)
  })

  it('draws the divider above every row but the first', () => {
    const items = ['One', 'Two', 'Three']
    render(<div>{items.map((t, i) => <Row key={t} title={t} divider={rowDivider(i)} onClick={() => {}} />)}</div>)
    const rows = screen.getAllByRole('button')
    // Read the style ATTRIBUTE, not the CSSOM longhands: a shorthand containing
    // var() is opaque to jsdom's CSS parser, so it is stored verbatim and the
    // longhands come back empty. The attribute text is the thing React wrote.
    const style = (el) => el.getAttribute('style')
    expect(style(rows[0])).not.toContain('--divider')
    expect(style(rows[0])).toContain('border-style: none')
    expect(style(rows[1])).toContain('border-top: 1px solid var(--divider)')
    expect(style(rows[2])).toContain('border-top: 1px solid var(--divider)')
  })

  it('wears no line at all when it is not in a list', () => {
    render(<Row title="One" onClick={() => {}} />)
    const style = screen.getByRole('button').getAttribute('style')
    expect(style).not.toContain('--divider')
    // And never the token that draws nothing.
    expect(style).not.toContain('--hairline')
  })

  it('does not fire when disabled', () => {
    const onClick = vi.fn()
    render(<Row title="Locked" disabled onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /Locked/ }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Chip', () => {
  it('is a span when passive, because a label is not a control', () => {
    const { container } = render(<Chip>HSK 2</Chip>)
    expect(screen.queryByRole('button')).toBe(null)
    expect(container.firstChild.tagName).toBe('SPAN')
  })

  it('is a button when selectable, and reports its selection', () => {
    const { rerender } = render(<Chip onClick={() => {}}>Manhua</Chip>)
    expect(screen.getByRole('button', { name: 'Manhua' }).getAttribute('aria-pressed')).toBe('false')
    rerender(<Chip onClick={() => {}} selected>Manhua</Chip>)
    expect(screen.getByRole('button', { name: 'Manhua' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('fires once when tapped', () => {
    const onClick = vi.fn()
    render(<Chip onClick={onClick}>All</Chip>)
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire when disabled, and still says it is pressed if it was', () => {
    const onClick = vi.fn()
    render(<Chip onClick={onClick} selected disabled>HSK 4</Chip>)
    const el = screen.getByRole('button', { name: 'HSK 4' })
    fireEvent.click(el)
    expect(onClick).not.toHaveBeenCalled()
    expect(el.disabled).toBe(true)
    expect(el.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('Segmented — semantics', () => {
  const OPTIONS = [
    { value: 'paged', label: 'Paged' },
    { value: 'scroll', label: 'Scroll' },
    { value: 'chat', label: 'Chat' },
  ]

  function renderSeg(value = 'paged', onChange = () => {}, extra = {}) {
    return render(<Segmented label="Reading mode" options={OPTIONS} value={value} onChange={onChange} {...extra} />)
  }

  it('is a named radiogroup, not a row of unrelated toggles', () => {
    // What this replaces: runs of aria-pressed buttons. aria-pressed says "this
    // one is on" without saying "and the others are therefore off", so a screen
    // reader announces four independent switches instead of one choice.
    renderSeg()
    expect(screen.getByRole('radiogroup', { name: 'Reading mode' })).toBeTruthy()
    expect(screen.getAllByRole('radio').length).toBe(3)
  })

  it('marks exactly one option checked', () => {
    renderSeg('scroll')
    const checked = screen.getAllByRole('radio').filter(r => r.getAttribute('aria-checked') === 'true')
    expect(checked.length).toBe(1)
    expect(checked[0].textContent).toBe('Scroll')
  })

  it('is one tab stop for the whole group, and it is the selected option', () => {
    // Roving tabindex. Tabbing through a four-option control four times is the
    // thing this fixes.
    renderSeg('chat')
    const tabbable = screen.getAllByRole('radio').filter(r => r.tabIndex === 0)
    expect(tabbable.length).toBe(1)
    expect(tabbable[0].textContent).toBe('Chat')
  })

  it('reports the value on click, and not when the value is already selected', () => {
    const onChange = vi.fn()
    renderSeg('paged', onChange)
    fireEvent.click(screen.getByRole('radio', { name: 'Scroll' }))
    expect(onChange).toHaveBeenCalledWith('scroll')
    onChange.mockClear()
    fireEvent.click(screen.getByRole('radio', { name: 'Paged' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Segmented — keyboard', () => {
  const OPTIONS = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C' },
  ]

  function seg(value, onChange) {
    return render(<Segmented label="Pick" options={OPTIONS} value={value} onChange={onChange} />)
  }

  it('moves the selection with the arrow keys', () => {
    const onChange = vi.fn()
    seg('a', onChange)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('wraps around both ends', () => {
    const onChange = vi.fn()
    seg('c', onChange)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'C' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('a')
    onChange.mockClear()
    cleanup()
    seg('a', onChange)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('jumps to the ends on Home and End', () => {
    const onChange = vi.fn()
    seg('b', onChange)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'B' }), { key: 'Home' })
    expect(onChange).toHaveBeenCalledWith('a')
    onChange.mockClear()
    fireEvent.keyDown(screen.getByRole('radio', { name: 'B' }), { key: 'End' })
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('moves focus with the selection, so the arrows keep working', () => {
    const onChange = vi.fn()
    const { rerender } = seg('a', onChange)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'B' }))
    // And after the parent re-renders with the new value, the focused node is
    // still the same element — it is keyed by value, so React does not replace it.
    rerender(<Segmented label="Pick" options={OPTIONS} value="b" onChange={onChange} />)
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'B' }))
  })

  it('swallows nothing it does not handle', () => {
    // preventDefault on Tab would trap the user inside the control.
    const onChange = vi.fn()
    seg('a', onChange)
    const a = screen.getByRole('radio', { name: 'A' })
    for (const key of ['Tab', 'Enter', ' ', 'Escape', 'x']) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      a.dispatchEvent(e)
      expect(e.defaultPrevented, key).toBe(false)
    }
    expect(onChange).not.toHaveBeenCalled()
  })

  it('goes inert when disabled — no tab stop, no keys, no clicks', () => {
    const onChange = vi.fn()
    render(<Segmented label="Pick" options={OPTIONS} value="a" onChange={onChange} disabled />)
    const radios = screen.getAllByRole('radio')
    for (const r of radios) expect(r.tabIndex).toBe(-1)
    fireEvent.keyDown(radios[0], { key: 'ArrowRight' })
    fireEvent.click(radios[1])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('survives a one-option group without moving anywhere', () => {
    const onChange = vi.fn()
    render(<Segmented label="Only" options={[{ value: 'a', label: 'A' }]} value="a" onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowRight' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders nothing rather than throwing on an empty option list', () => {
    render(<Segmented label="Empty" options={[]} value={undefined} onChange={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: 'Empty' })).toBeTruthy()
    expect(screen.queryAllByRole('radio').length).toBe(0)
  })
})

describe('every control theme-switches', () => {
  // The claim: no control declares a colour that a theme flip cannot reach.
  // Read off the rendered inline styles, which is where a hardcoded hex would
  // actually land.
  it('names only CSS custom properties, transparent, or white-on-accent', () => {
    const { container } = render(
      <div>
        <Button variant="primary">P</Button>
        <Button variant="secondary">S</Button>
        <Button variant="ghost">G</Button>
        <Button variant="destructive" icon={Trash2}>D</Button>
        <Button disabled>X</Button>
        <IconButton label="Close" icon={X} onClick={() => {}} />
        <IconButton label="Play" icon={Play} variant="solid" onClick={() => {}} />
        <Row title="T" supporting="S" onClick={() => {}} />
        <Chip>C</Chip>
        <Chip onClick={() => {}} selected>Sel</Chip>
        <Segmented label="L" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} value="a" onChange={() => {}} />
      </div>,
    )
    // Stated as the thing that actually matters: a control may not carry a
    // LITERAL colour. Anything that is not a colour at all (`none`, `medium`,
    // a length) is irrelevant, and var(--x) is the whole point — so the check
    // hunts for hexes and rgb()s and allows only white, which is the one value
    // that must not theme (white-on-accent, dark in both modes).
    const literals = []
    let varCount = 0
    for (const el of container.querySelectorAll('*')) {
      const s = el.getAttribute('style') || ''
      varCount += (s.match(/var\(--/g) || []).length
      for (const m of s.matchAll(/#[0-9A-Fa-f]{3,8}\b|rgba?\([^)]*\)|\bhsla?\([^)]*\)/g)) {
        const v = m[0].toLowerCase()
        if (v === '#fff' || v === '#ffffff' || v === 'rgb(255, 255, 255)') continue
        literals.push(el.tagName.toLowerCase() + ' → ' + m[0])
      }
    }
    expect(varCount, 'the controls should be built from tokens').toBeGreaterThan(10)
    expect(literals, 'literal colours in a control: ' + literals.join(', ')).toEqual([])
  })
})

describe('the pressed treatment is the app\'s existing one', () => {
  it('is hd-press on every interactive control, and on no static one', () => {
    // index.css already owns `.hd-press:active` (a 1px/0.994 nudge), it is used
    // in 14 files, and prefers-reduced-motion neutralises it globally. P14-1 is
    // before the animation phase, so the controls ADOPT that class rather than
    // inventing a press of their own.
    const { container } = render(
      <div>
        <Button>B</Button>
        <IconButton label="I" icon={X} onClick={() => {}} />
        <Row title="R" onClick={() => {}} />
        <Chip onClick={() => {}}>C</Chip>
        <Row title="Static" />
        <Chip>Passive</Chip>
      </div>,
    )
    expect(container.querySelectorAll('.hd-press').length).toBe(4)
    for (const el of container.querySelectorAll('.hd-press')) {
      expect(el.tagName).toBe('BUTTON')
    }
  })
})
