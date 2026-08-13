import { useState } from 'react'
import { X, Play, Trash2, ChevronRight, Headphones, Mic, PenLine } from 'lucide-react'
import { Button, IconButton, Row, Chip, Segmented } from './controls'
import { rowDivider } from './controlTokens'
import { TYPE } from './typeScale'

// Every variant and state of the five P14-1 controls, on one screen.
//
// It lives behind /dev (email-gated, unlinked from any nav, never shown to a
// learner) for two reasons:
//
//   1. jsdom does not lay anything out, so a unit test can assert that a control
//      DECLARES 44px but never that it MEASURES 44px. This page is the surface
//      the Playwright spec measures — real boxes, both themes, three widths.
//   2. A control system that can only be seen by reading source will drift. This
//      is where the next phase checks a change against every state at once,
//      including on a real phone.
//
// Deliberately dumb: local state, no data, no network. Delete it the day the app
// is fully migrated and the screens themselves are the gallery.

const READING_MODES = [
  { value: 'paged', label: 'Paged' },
  { value: 'scroll', label: 'Scroll' },
  { value: 'chat', label: 'Chat' },
]

const DRILLS = [
  { key: 'listen', label: 'Listening', supporting: 'Hear a word and pick it out', icon: Headphones },
  { key: 'speak', label: 'Speaking', supporting: null, icon: Mic },
  { key: 'write', label: 'Writing', supporting: 'Draw it from memory', icon: PenLine },
]

function Group({ title, children, stack }) {
  return (
    <div data-gallery-group={title} style={{ marginBottom: '22px' }}>
      <div style={{ ...TYPE.eyebrow, color: 'var(--text-faint)', marginBottom: '10px' }}>
        {title}
      </div>
      <div style={{
        display: 'flex', flexDirection: stack ? 'column' : 'row',
        flexWrap: stack ? 'nowrap' : 'wrap',
        alignItems: stack ? 'stretch' : 'center', gap: stack ? '0' : '10px',
      }}>
        {children}
      </div>
    </div>
  )
}

export default function ControlsGallery() {
  const [mode, setMode] = useState('paged')
  const [filter, setFilter] = useState('all')
  const [taps, setTaps] = useState(0)

  return (
    <div data-controls-gallery="" style={{ paddingBottom: '8px' }}>
      <Group title="Button · variants">
        <Button variant="primary" onClick={() => setTaps(t => t + 1)}>Primary</Button>
        <Button variant="secondary" onClick={() => setTaps(t => t + 1)}>Secondary</Button>
        <Button variant="ghost" onClick={() => setTaps(t => t + 1)}>Ghost</Button>
        <Button variant="destructive" icon={Trash2} onClick={() => setTaps(t => t + 1)}>Destructive</Button>
        {/* P14-5D: `primary`'s role and token, made of material. Here so the
            difference is visible side by side with the flat fill — press it and
            the object compresses and drops its shadow. */}
        <Button variant="lacquer" onClick={() => setTaps(t => t + 1)}>Lacquer</Button>
      </Group>

      <Group title="Button · sizes and icons">
        <Button size="md" icon={Play}>Medium</Button>
        <Button size="lg" icon={Play}>Large</Button>
      </Group>

      <Group title="Button · disabled and loading">
        <Button disabled>Disabled</Button>
        <Button variant="secondary" disabled>Disabled</Button>
        <Button variant="ghost" disabled>Disabled</Button>
        <Button variant="destructive" disabled>Disabled</Button>
        <Button loading loadingLabel="Sending…">Send</Button>
        {/* aria-disabled rather than the real attribute, for a control that must
            not throw keyboard focus to <body> while a drill is in progress —
            Test.jsx and Speaking.jsx both need this. */}
        <Button disabled keepFocus>Focusable-disabled</Button>
      </Group>

      <Group title="Button · full width">
        <div style={{ width: '100%' }}>
          <Button full size="lg" icon={Play}>Start reviewing</Button>
        </div>
      </Group>

      <Group title="IconButton">
        <IconButton label="Close" icon={X} onClick={() => setTaps(t => t + 1)} />
        <IconButton label="Play" icon={Play} variant="solid" onClick={() => setTaps(t => t + 1)} />
        <IconButton label="Play round" icon={Play} variant="solid" round onClick={() => setTaps(t => t + 1)} />
        <IconButton label="Delete" icon={Trash2} tone="var(--danger)" onClick={() => setTaps(t => t + 1)} />
        <IconButton label="Disabled" icon={X} disabled onClick={() => setTaps(t => t + 1)} />
        <IconButton label="Toggle off" icon={Play} pressed={false} onClick={() => setTaps(t => t + 1)} />
        <IconButton label="Toggle on" icon={Play} pressed onClick={() => setTaps(t => t + 1)} />
      </Group>

      <Group title="Row" stack>
        {DRILLS.map((d, i) => (
          <Row
            key={d.key}
            title={d.label}
            supporting={d.supporting}
            leading={<d.icon size={19} strokeWidth={1.85} color="var(--text-secondary)" aria-hidden="true" />}
            trailing={<ChevronRight size={18} strokeWidth={2} color="var(--text-faint)" aria-hidden="true" />}
            divider={rowDivider(i)}
            onClick={() => setTaps(t => t + 1)}
          />
        ))}
      </Group>

      <Group title="Row · static and disabled" stack>
        <Row title="Build" supporting="Not tappable — no onClick, so not a button" />
        <Row title="Level test" supporting="Locked until 40 more words" disabled divider onClick={() => setTaps(t => t + 1)} />
      </Group>

      <Group title="Chip">
        <Chip>HSK 2</Chip>
        <Chip>12 min</Chip>
        <Chip onClick={() => setFilter('all')} selected={filter === 'all'}>All</Chip>
        <Chip onClick={() => setFilter('hsk2')} selected={filter === 'hsk2'}>HSK 2</Chip>
        <Chip onClick={() => setFilter('manhua')} selected={filter === 'manhua'}>Manhua</Chip>
        <Chip onClick={() => {}} disabled>Locked</Chip>
      </Group>

      <Group title="Segmented" stack>
        <Segmented label="Reading mode" options={READING_MODES} value={mode} onChange={setMode} />
        <div style={{ height: '10px' }} />
        <Segmented label="Disabled group" options={READING_MODES.slice(0, 2)} value="paged" onChange={() => {}} disabled />
      </Group>

      <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
        {taps} taps · reading mode <b>{mode}</b> · filter <b>{filter}</b>
      </div>
    </div>
  )
}
