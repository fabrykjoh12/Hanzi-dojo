import { cleanMeaning } from './cleanMeaning'
import { X, Volume2, Bookmark } from 'lucide-react'

const ghost = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }

// Bottom-sheet word lookup shared by the paced + chat readers. `selected` is
// { word, vocab, status } | null.
export default function WordLookupSheet({ selected, theme, accent, userCards, onAddToDeck, onSpeak, onClose }) {
  if (!selected) return null
  return (
    <div onClick={onClose} className="app-overlay-viewport" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.14)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '560px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px 20px 0 0', padding: '16px 18px 26px', boxShadow: '0 -10px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'var(--border)', margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '28px', fontWeight: 800, color: accent, fontFamily: theme.font }}>{selected.word}</span>
            <span style={{ fontSize: '16px', color: '#B45309', fontWeight: 600 }}>{selected.vocab.reading}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            <button onClick={() => onAddToDeck(selected.vocab)} aria-label="Add to deck" style={ghost}>
              <Bookmark size={20} color={userCards[selected.vocab.id] ? accent : 'var(--text-muted)'} fill={userCards[selected.vocab.id] ? accent : 'none'} />
            </button>
            <button onClick={() => onSpeak(selected.word)} aria-label="Play audio" style={ghost}>
              <Volume2 size={20} color="var(--text-muted)" />
            </button>
            <button onClick={onClose} aria-label="Close" style={ghost}>
              <X size={20} color="var(--text-muted)" />
            </button>
          </div>
        </div>
        <div style={{ fontSize: '15px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>{cleanMeaning(selected.vocab.meaning)}</div>
      </div>
    </div>
  )
}
