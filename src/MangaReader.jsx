import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStoryReaderCore } from './useStoryReaderCore'
import {
  buildEpisode, panelArtSrc, visibleBubbles, isGate, revealLimit,
  readBeats, episodeProgress, isEpisodeComplete, bubbleLayout, panelAtReadingLine,
} from './mangaLayout'
import { loadMangaProgress, saveMangaProgress, resumePanel } from './mangaProgress'
import { PAPER, COLUMN_MAX, GUTTER, mangaAccent, mangaFontStack } from './mangaTokens'
import { minDwellMs } from './readAlong'
import { getLevelLabel } from './utils'
import MangaHeader from './MangaHeader'
import MangaPanel from './MangaPanel'
import MangaBubble from './MangaBubble'
import MangaChoiceCard from './MangaChoiceCard'
import MangaCompletion from './MangaCompletion'
import WordLookupSheet from './WordLookupSheet'

// Hanzi Dojo Stories — the manga reader.
//
// A vertical strip of cinematic panels with the dialogue drawn over them as real
// interface: every hanzi is a button, the pinyin is the shared per-word
// scaffolding, the lookup is the same anchored popover the other readers use,
// and the audio is the same TTS. Nothing about the learning system is new here —
// what is new is that it is arranged so the artwork is what you notice first.
//
// Three things it does NOT do, each deliberately:
//   · It does not start on a launch screen. An episode opens on its first panel;
//     a "start reading" gate in front of a comic reads as a paywall.
//   · It does not use the core's beat cursor to advance. Progression is by
//     PANEL (a panel may hold two lines, or none), so `advanceBlocked` is held
//     on for the whole session and this component owns the keyboard.
//   · It does not treat scrolling as reading. The episode completes only when
//     the learner has answered every choice AND reached the closing plate —
//     see isEpisodeComplete.
export default function MangaReader(props) {
  const c = useStoryReaderCore(props)
  const { story, track, onBack, userCards, onPractice } = props

  const accent = mangaAccent(c.theme)
  const fontFamily = mangaFontStack(c.theme.font)

  const episode = useMemo(() => buildEpisode(story.panels, c.beats.length), [story.panels, c.beats.length])
  const { meta, cast, panels, total } = episode

  // "HSK 2" / "N4" / "A2" — never a hardcoded string. getLevelLabel is the one
  // place that knows what a level is called in each system (CLAUDE.md §4).
  const continuesLevelLabel = meta.continues && meta.continues.level
    ? getLevelLabel(track.language, track.system, meta.continues.level)
    : null

  const [choices, setChoices] = useState({})
  const [active, setActive] = useState(0)
  const [seenThrough, setSeenThrough] = useState(0)
  const [columnWidth, setColumnWidth] = useState(COLUMN_MAX)
  const [speakingBeat, setSpeakingBeat] = useState(-1)
  const [restored, setRestored] = useState(false)

  const columnRef = useRef(null)
  const panelRefs = useRef([])
  const speakTimer = useRef(null)
  const finishedRef = useRef(false)

  // The engine's own keyboard advance would move a beat cursor this reader does
  // not navigate by. Held off for the whole session; the arrow keys below move
  // panels instead.
  const { setAdvanceBlocked } = c
  useEffect(() => {
    setAdvanceBlocked(true)
    return () => setAdvanceBlocked(false)
  }, [setAdvanceBlocked])

  // ── Resume ───────────────────────────────────────────────────────────────
  // Position is local and durable (IndexedDB prefs, works signed-out);
  // completion still goes through story_reads like every other format.
  useEffect(() => {
    let live = true
    loadMangaProgress(story.id).then((saved) => {
      if (!live) return
      setChoices(saved.choices)
      const at = resumePanel(saved, panels)
      setActive(at)
      setSeenThrough(at)
      setRestored(true)
    })
    return () => { live = false }
    // Panels are derived from the story row, so keying on the story is right —
    // re-running when the memo identity changes would re-scroll mid-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id])

  // Scroll to where the learner left off, once, after the panels exist. This
  // runs for panel 0 too, and has to: the reader opens inside the app shell,
  // which keeps whatever scroll position the story shelf was left at — without
  // this, opening an episode drops you three panels in.
  const scrolledRef = useRef(false)
  useEffect(() => {
    if (!restored || scrolledRef.current) return
    scrolledRef.current = true
    const el = panelRefs.current[active]
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [restored, active])

  // ── The reading column's width ───────────────────────────────────────────
  // bubbleLayout needs real pixels to decide whether a line fits over the art,
  // so this is measured rather than assumed.
  useEffect(() => {
    const measure = () => {
      const el = columnRef.current
      if (el) setColumnWidth(el.clientWidth || COLUMN_MAX)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // ── Which panel am I looking at ──────────────────────────────────────────
  // Measured against the reading line (see panelAtReadingLine), on scroll,
  // throttled to one read per animation frame. A scroll listener rather than an
  // IntersectionObserver because the question is "what is under the reading
  // line", which needs the panels' live positions, not the moments they crossed
  // a threshold.
  const limit = revealLimit(panels, choices)
  useEffect(() => {
    let raf = 0
    const pick = () => {
      raf = 0
      const rects = panelRefs.current.map(el => (el ? el.getBoundingClientRect() : null))
      const next = panelAtReadingLine(rects, window.innerHeight)
      if (next < 0) return
      setActive(next)
      setSeenThrough(prev => (next > prev ? next : prev))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(pick) }
    pick()
    // Capture phase: the app shell scrolls a container, not the window.
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [limit, panels.length])

  // Persist position + branch as the learner moves. Debounced by the fact that
  // `active` only changes when a different panel takes over the viewport.
  useEffect(() => {
    if (!restored) return
    saveMangaProgress(story.id, { panel: active, choices })
  }, [restored, active, choices, story.id])

  // ── Completion ───────────────────────────────────────────────────────────
  const complete = isEpisodeComplete(panels, choices, seenThrough)
  const { finish } = c
  useEffect(() => {
    if (!complete || finishedRef.current) return
    finishedRef.current = true
    finish()
    saveMangaProgress(story.id, { completed: true })
  }, [complete, finish, story.id])

  // ── Audio ────────────────────────────────────────────────────────────────
  // The engine plays a line; the only thing missing is "which line is sounding",
  // which replayLine has no end event for. The dwell estimate the read-along
  // timeline already uses for the speech-synthesis fallback is the honest answer
  // — it clears the indicator at about the length of the line.
  const playLine = useCallback((beatIndex) => {
    const beat = c.beats[beatIndex]
    if (!beat) return
    c.replayLine(beatIndex)
    setSpeakingBeat(beatIndex)
    if (speakTimer.current) clearTimeout(speakTimer.current)
    speakTimer.current = setTimeout(() => setSpeakingBeat(-1), minDwellMs(beat.tokens, c.rate))
    // c is a fresh object each render; the two members used here are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.beats, c.rate])
  useEffect(() => () => { if (speakTimer.current) clearTimeout(speakTimer.current) }, [])

  // ── Word taps ────────────────────────────────────────────────────────────
  const { selectToken } = c
  const onSelectToken = useCallback((token, status, tokenId, beatIndex, anchorEl) => {
    selectToken(token, status, tokenId, beatIndex, anchorEl)
    saveMangaProgress(story.id, { tapped: [token.text] })
  }, [selectToken, story.id])

  // ── Choices ──────────────────────────────────────────────────────────────
  const pick = useCallback((panelId, index) => {
    setChoices((prev) => {
      // Already answered: a second tap (or a double-fire) must not rewrite a
      // line the learner has said.
      if (Number.isInteger(prev[panelId])) return prev
      return { ...prev, [panelId]: index }
    })
  }, [])

  // ── Keyboard ─────────────────────────────────────────────────────────────
  // Escape closes the lookup (the core's own Escape handler is behind its
  // `started` gate, which this reader never enters); the arrows page by panel.
  const { setSelected, selected } = c
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && selected) { setSelected(null); return }
      if (selected) return
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const next = e.key === 'ArrowDown' ? Math.min(limit, active + 1) : Math.max(0, active - 1)
      const el = panelRefs.current[next]
      if (!el) return
      e.preventDefault()
      el.scrollIntoView({ block: 'start', behavior: c.reduceMotion ? 'auto' : 'smooth' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, setSelected, active, limit, c.reduceMotion])

  // ── Render ───────────────────────────────────────────────────────────────
  const progress = episodeProgress(active, total)
  const title = meta.title || story.title
  const label = meta.label || (meta.series || null)

  // A printed speaker label is opt-in per character: `cast[name].display`. In a
  // panel the drawing already says who is talking, so the default is a bare
  // bubble — the label exists for a voice that is off-panel.
  const speakerLabel = (beatIndex) => {
    const beat = c.beats[beatIndex]
    if (!beat || !beat.speaker) return null
    const entry = cast[beat.speaker]
    return entry && entry.display ? entry.display : null
  }

  // The words this reading actually met, for the closing plate. Derived from the
  // branch that was read, so a learner who said 不是 doesn't get credited with
  // the line they never saw.
  const metWords = useMemo(() => {
    if (!complete) return []
    const out = []
    const seen = new Set()
    for (const beatIndex of readBeats(panels, choices, seenThrough)) {
      const beat = c.beats[beatIndex]
      if (!beat) continue
      for (const t of beat.tokens) {
        if (!t.vocab || seen.has(t.vocab.id)) continue
        seen.add(t.vocab.id)
        out.push(t.vocab)
      }
    }
    return out
  }, [complete, panels, choices, seenThrough, c.beats])

  const practiceWords = (c.readability.newWords || [])
    .filter(w => w.example_sentence && w.example_sentence.indexOf(w.word) !== -1)

  // `forceBelow` is for a bubble that has no artwork to sit on. Without it,
  // bubbleLayout can return mode 'overlay' — which is `position: absolute` — and
  // an absolutely-positioned box in an unpositioned wrapper does not stay put:
  // it climbs to the nearest positioned ancestor, which is the PREVIOUS panel's
  // art. That is how the learner's reply ended up floating over the opening
  // panel of the episode.
  const renderBubble = (panel, bubble, kind, forceBelow) => {
    const beat = c.beats[bubble.beat]
    if (!beat) return null
    const layout = forceBelow ? { mode: 'below' } : bubbleLayout(bubble, {
      columnWidth,
      ratio: panel.ratio,
      textLength: beat.text.length,
      withSpeaker: Boolean(speakerLabel(bubble.beat)) && bubble.kind !== 'narration',
      withEnglish: c.revealedEnglish.has(bubble.beat),
      withReadings: c.readingMode !== 'hidden',
    })
    return {
      layout,
      node: (
        <MangaBubble
          key={panel.id + ':' + bubble.beat}
          beat={beat}
          beatIndex={bubble.beat}
          kind={kind || bubble.kind}
          tail={layout.mode === 'overlay' ? bubble.tail : null}
          speaker={speakerLabel(bubble.beat)}
          voice={beat.speaker}
          accentHex={accent}
          fontFamily={fontFamily}
          readingMode={c.readingMode}
          userCards={userCards}
          language={track.language}
          selected={c.selected}
          onSelectToken={onSelectToken}
          onPlayLine={playLine}
          speaking={speakingBeat === bubble.beat}
          english={beat.english}
          revealed={c.revealedEnglish.has(bubble.beat)}
          onToggleEnglish={c.toggleEnglish}
          layout={layout}
          reduceMotion={c.reduceMotion}
        />
      ),
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: PAPER.page,
      color: PAPER.ink,
      // The paper grain: a single repeating micro-gradient, cheap and static.
      backgroundImage:
        'repeating-linear-gradient(0deg, rgba(23,20,17,0.014) 0px, rgba(23,20,17,0.014) 1px, transparent 1px, transparent 3px),'
        + 'repeating-linear-gradient(90deg, rgba(23,20,17,0.010) 0px, rgba(23,20,17,0.010) 1px, transparent 1px, transparent 4px)',
    }}>
      <MangaHeader
        label={label}
        title={title}
        current={progress.current}
        total={progress.total}
        pct={progress.pct}
        onBack={onBack}
        accentHex={accent}
        fontFamily={fontFamily}
      />

      <div
        ref={columnRef}
        style={{
          maxWidth: COLUMN_MAX + 'px', margin: '0 auto',
          // The bottom pad clears the mobile tab bar the app shell draws over
          // this screen, so the closing plate is never half-hidden behind it.
          padding: '12px 12px calc(88px + env(safe-area-inset-bottom, 0px))',
          // The gutter. On a comic page the white space between panels is part
          // of the drawing's grammar — it is what makes two pictures read as
          // consecutive moments rather than two cards in a list.
          display: 'flex', flexDirection: 'column', gap: GUTTER + 'px',
        }}
      >
        {panels.slice(0, limit + 1).map((panel, i) => {
          const gate = isGate(panel, choices)
          const picked = choices[panel.id]
          const bubbles = visibleBubbles(panel, choices).map(b => renderBubble(panel, b)).filter(Boolean)
          const overlays = bubbles.filter(b => b.layout.mode === 'overlay').map(b => b.node)
          const belows = bubbles.filter(b => b.layout.mode !== 'overlay').map(b => b.node)

          // The learner's own reply, once made, is a line of the story like any
          // other — same bubble, same tappable words, tinted so it reads as
          // theirs.
          // Indexed, not asserted: `picked` comes from durable storage, so an
          // episode that has since been re-cut can hand back an index its choice
          // no longer has. Reading `.beat` off the undefined that follows would
          // take the whole reader down over a stale preference.
          const chosen = panel.choice && Number.isInteger(picked)
            ? panel.choice.options[picked]
            : null
          // A choice panel carries no art, so the reply is always in flow.
          const replyBubble = chosen
            ? renderBubble(panel, {
              beat: chosen.beat,
              kind: 'reply', side: 'right', top: 8,
              width: 78, tail: null, when: null,
            }, 'reply', true)
            : null

          return (
            <div key={panel.id}>
              {(panel.art || panel.bubbles.length > 0) && (
                <MangaPanel
                  panelRef={(el) => { panelRefs.current[i] = el }}
                  panelIndex={i}
                  src={panelArtSrc(meta, panel)}
                  alt={panel.alt}
                  ratio={panel.ratio}
                  accent={panel.accent}
                  accentHex={accent}
                  priority={i < 2}
                  reduceMotion={c.reduceMotion}
                  style={{ scrollMarginTop: '76px' }}
                  below={belows.length ? <div style={{ display: 'flex', flexDirection: 'column' }}>{belows}</div> : null}
                >
                  {overlays}
                </MangaPanel>
              )}
              {/* A panel with no art and no bubbles is a pure choice panel; it
                  still needs an observed element, or the header's count skips it. */}
              {!panel.art && panel.bubbles.length === 0 && (
                <div
                  data-panel-index={i}
                  ref={(el) => { panelRefs.current[i] = el }}
                  style={{ scrollMarginTop: '76px', height: '1px' }}
                />
              )}

              {replyBubble && (
                <div style={{ position: 'relative', marginTop: '10px' }}>{replyBubble.node}</div>
              )}

              {panel.choice && (
                <div style={{ marginTop: '14px' }}>
                  <MangaChoiceCard
                    prompt={panel.choice.prompt}
                    options={panel.choice.options.map(o => ({
                      text: (c.beats[o.beat] || {}).text || '',
                      pinyin: pinyinFor(c.beats[o.beat]),
                    }))}
                    chosenIndex={Number.isInteger(picked) ? picked : null}
                    onPick={(index) => pick(panel.id, index)}
                    accentHex={accent}
                    fontFamily={fontFamily}
                    showPinyin={c.readingMode !== 'hidden'}
                  />
                </div>
              )}

              {gate && (
                <p aria-live="polite" style={{
                  margin: '10px 0 0', textAlign: 'center',
                  fontSize: '12.5px', color: PAPER.muted,
                }}>
                  Choose a reply to keep reading.
                </p>
              )}
            </div>
          )
        })}

        {complete && (
          <div style={{ marginTop: '4px' }}>
            <MangaCompletion
              label={label}
              title={title}
              words={metWords}
              userCards={userCards}
              accentHex={accent}
              fontFamily={fontFamily}
              hook={meta.hook}
              continues={meta.continues}
              continuesLevelLabel={continuesLevelLabel}
              onBack={onBack}
              onPractice={onPractice}
              practiceWords={practiceWords}
              onSelectWord={c.selectWord}
            />
          </div>
        )}
      </div>

      <WordLookupSheet
        selected={c.selected}
        anchor={c.selected ? c.selected.anchorEl : null}
        theme={c.theme}
        accent={accent}
        userCards={userCards}
        language={track.language}
        onAddToDeck={c.addToDeck}
        onSpeak={c.speakWord}
        onClose={() => c.setSelected(null)}
        onAddDictToDeck={c.addDictToDeck}
        dictSaved={c.dictSaved}
        dictSaving={c.dictSaving}
      />
    </div>
  )
}

// A whole-line reading for a choice option. The options are candidate lines the
// learner hasn't said yet, so they carry no per-word learning status and get one
// reading for the line rather than per-word ruby — the same call the reply-along
// reader makes for the same reason.
function pinyinFor(beat) {
  if (!beat) return ''
  return beat.tokens.filter(t => t.vocab && t.vocab.reading).map(t => t.vocab.reading).join(' ')
}
