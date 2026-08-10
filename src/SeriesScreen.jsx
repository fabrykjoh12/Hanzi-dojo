import { useEffect } from 'react'
import { useIsMobile } from './useIsMobile'
import { getLevelLabel } from './utils'
import SeriesDetail from './SeriesDetail'
import { useStoriesData } from './storiesDataContext'
import { getLanguageDetails, pageShell } from './storiesScreenShared'

// The series page, as a real pushed destination.
//
// It used to be `view === 'series'` inside Stories.jsx: a branch that returned
// a different screen from the same component, with its own `selectedArc` state
// and its own Back closure pointing at `setView('browse')`. That is a router,
// and the app already had one — so this flow was the last place where the
// navigation model described what was happening without controlling it.
//
// Now it is pushed onto the Stories stack like any other detail screen: the
// tab bar stays, the shelf stays mounted and scrolled underneath, Back is the
// reducer's pop, and it gets the push/pop motion every other pushed screen gets
// (navMotion.js) instead of an internal pane swap.
//
// The unit is resolved from the key in the URL rather than handed down as an
// object, which is what makes a cold deep link to /stories/series/<key> land on
// exactly the same screen as a tap from the shelf.
export default function SeriesScreen({ seriesKey, onBack, onOpenChapter, onNavigate }) {
  const data = useStoriesData()
  const isMobile = useIsMobile()
  const { profile, track } = data
  const { accentHex, fontFamily } = getLanguageDetails(profile, track)

  // Same contract as the shelf: ask on every show, and the cache answers for
  // free unless something invalidated it.
  useEffect(() => { data.ensureLoaded() })

  const unit = data.sections
    .flatMap(s => s.units)
    .find(u => u.kind === 'series' && u.key === seriesKey) || null

  if (data.loading && !unit) {
    return (
      <div style={pageShell()}>
        <div role="status" aria-label="Loading series" style={{ maxWidth: '980px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px' }}>
          <div style={{ width: '190px', height: '30px', borderRadius: '8px', background: 'var(--surface-2)', margin: '4px 0 20px' }} />
          <div style={{ height: isMobile ? '220px' : '260px', borderRadius: '24px', background: 'var(--surface-2)' }} />
        </div>
      </div>
    )
  }

  // A series that does not exist (a stale link, a story pulled from
  // publication) pops back rather than rendering an empty page.
  if (!unit) {
    return (
      <div style={pageShell()}>
        <div style={{ maxWidth: '620px', margin: '0 auto', padding: '64px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '18px' }}>
            That series isn&apos;t available.
          </div>
          <button
            onClick={onBack}
            className="hd-press"
            style={{
              minHeight: '46px', padding: '0 20px', borderRadius: '14px',
              border: '1px solid var(--border)', background: 'none', cursor: 'pointer',
              color: 'var(--text)', fontSize: '14px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
            }}
          >
            Back to the library
          </button>
        </div>
      </div>
    )
  }

  const hasLockedChapters = unit.parts.length > 1
  const rewardMatch = data.rewardUnits.find(u => u.parts.some(p => unit.parts.some(ap => ap.id === p.id)))
  const rewardKey = rewardMatch ? rewardMatch.key : unit.key
  const first = unit.parts[0]

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: isMobile ? '860px' : '980px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
        <SeriesDetail
          unit={unit}
          readIds={data.readIds}
          unlockIds={data.unlockIds}
          accentHex={accentHex}
          fontFamily={fontFamily}
          levelLabel={getLevelLabel(track.language, track.system, first.level == null ? track.current_level : first.level)}
          isMobile={isMobile}
          vocabMap={data.vocabMap}
          userCards={data.userCards}
          recentVocabIds={data.recentVocabIds}
          language={track.language}
          isActiveSeries={data.activeUnit ? data.activeUnit.key === rewardKey : false}
          canMakeActive={hasLockedChapters && (!data.activeUnit || data.activeUnit.key !== rewardKey)}
          onMakeActive={() => data.setActiveSeries(rewardKey)}
          onOpenChapter={onOpenChapter}
          onStudy={onNavigate ? () => onNavigate('study') : null}
          onBack={onBack}
        />
      </div>
    </div>
  )
}
