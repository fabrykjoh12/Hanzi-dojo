import { useState } from 'react'
import { languageTheme } from './languageTheme'
import { grammarFor } from './grammarGuides'
import { useIsMobile } from './useIsMobile'
import { ArrowLeft, BookMarked, ChevronRight, GraduationCap } from 'lucide-react'

// Beginner grammar guide for the active language. Reference content the learner
// can open any time — accordion topics, each with plain-language points and
// concrete examples (target text + reading + English).

function exampleHasKanji(text) {
  const v = text || ''
  for (let i = 0; i < v.length; i += 1) {
    const c = v.charCodeAt(i)
    if (c >= 0x3400 && c <= 0x9FFF) return true
  }
  return false
}
export default function Grammar({ profile, track, onBack }) {
  const isMobile = useIsMobile()
  const theme = languageTheme(profile.active_language)
  const accentHex = theme.accentHex
  const font = theme.font
  const guide = grammarFor(profile.active_language)
  const [open, setOpen] = useState(0)   // index of the expanded topic (-1 = none)

  const pageShell = { minHeight: '100vh', position: 'relative', overflow: 'hidden' }

  if (!guide) {
    return (
      <div style={pageShell}>
        <div style={{ maxWidth: '780px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
          <Ghost onClick={onBack} />
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 20px' }}>
            A grammar guide for this language is coming soon.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={pageShell}>
      <div style={{ maxWidth: '780px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
        <Ghost onClick={onBack} />

        <div style={{ margin: '24px 0 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accentHex, fontSize: '13px', fontWeight: 800 }}>
            <GraduationCap size={17} strokeWidth={1.85} color={accentHex} /> Grammar guide
          </div>
          <h1 style={{ margin: '8px 0 10px', fontSize: isMobile ? '30px' : '36px', fontWeight: 850, color: 'var(--text)', lineHeight: 1.1 }}>
            How {guide.languageName} works
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            {guide.intro}
          </p>
        </div>

        <div style={{ display: 'grid', gap: '12px' }}>
          {guide.topics.map((topic, i) => {
            const expanded = open === i
            return (
              <div key={topic.id} style={{
                background: 'var(--surface)', border: '1px solid ' + (expanded ? accentHex + '44' : 'var(--border)'),
                borderRadius: '18px', overflow: 'hidden',
                boxShadow: expanded ? '0 12px 30px rgba(24,24,27,0.07)' : '0 2px 10px rgba(24,24,27,0.04)',
                transition: 'border-color 160ms ease, box-shadow 160ms ease',
              }}>
                <button
                  onClick={() => setOpen(expanded ? -1 : i)}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none',
                    padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px', fontFamily: 'Inter, sans-serif',
                  }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
                    background: accentHex + '12', border: '1px solid ' + accentHex + '22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <BookMarked size={19} strokeWidth={1.9} color={accentHex} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '16px', fontWeight: 750, color: 'var(--text)' }}>{topic.title}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.4 }}>{topic.blurb}</div>
                  </div>
                  <ChevronRight
                    size={20} strokeWidth={2} color="var(--text-faint)"
                    style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 180ms ease' }}
                  />
                </button>

                {expanded && (
                  <div style={{ padding: '2px 20px 20px', display: 'grid', gap: '14px' }}>
                    {topic.points.map((p, pi) => (
                      <div key={pi} style={{ paddingLeft: '54px' }}>
                        <div style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.6 }}>{p.text}</div>
                        {p.ex && (() => {
                          // Japanese reading behaves like furigana: shown ABOVE
                          // the sentence, and only when there's kanji to gloss —
                          // a kana-only example already IS its own reading.
                          const isJa = profile.active_language === 'japanese'
                          const kanji = exampleHasKanji(p.ex.target)
                          const readingAbove = isJa && kanji && p.ex.reading
                          const readingBelow = !isJa && p.ex.reading
                          return (
                            <div style={{
                              marginTop: '10px', padding: '12px 14px', borderRadius: '12px',
                              background: 'var(--surface-2)', border: '1px solid var(--border)',
                            }}>
                              {readingAbove && (
                                <div style={{ fontSize: '12px', color: accentHex, marginBottom: '2px', fontWeight: 600 }}>{p.ex.reading}</div>
                              )}
                              <div style={{ fontSize: '20px', fontFamily: font, color: 'var(--text)', lineHeight: 1.3 }}>{p.ex.target}</div>
                              {readingBelow && (
                                <div style={{ fontSize: '13px', color: accentHex, marginTop: '4px', fontWeight: 600 }}>{p.ex.reading}</div>
                              )}
                              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{p.ex.en}</div>
                            </div>
                          )
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Ghost({ onClick }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      minHeight: '40px', padding: '0 14px', borderRadius: '12px',
      border: '1px solid var(--border)', background: h ? 'var(--surface-2)' : 'var(--surface)',
      color: 'var(--text-muted)', fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
    }}>
      <ArrowLeft size={17} strokeWidth={1.85} color="var(--text-muted)" /> Home
    </button>
  )
}
