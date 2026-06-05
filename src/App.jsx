import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Auth from './Auth'
import Onboarding from './Onboarding'
import Study from './Study'
import Test from './Test'
import Stories from './Stories'
import { getTestStatus } from './testLogic'
import { getHomeCounts } from './homeCounts'
import Profile from './Profile'
import YouTube from './YouTube'
import LanguageSwitcher from './LanguageSwitcher'

// ── Feature card component ────────────────────────────────────────────────
function FeatureCard({ icon, title, subtitle, detail, detailColor, onClick, accent, locked, indicator }) {
  const [hovered, setHovered] = useState(false)
  const active = !locked && onClick

  return (
    <div
      onClick={active ? onClick : undefined}
      onMouseEnter={() => active && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        borderRadius: '18px',
        border: `1px solid ${hovered ? accent + '55' : '#E7E5E4'}`,
        boxShadow: hovered
          ? '0 8px 28px rgba(0,0,0,0.09)'
          : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 180ms ease',
        cursor: active ? 'pointer' : 'default',
        padding: '22px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        opacity: locked ? 0.55 : 1,
        minHeight: '140px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '10px',
          background: locked ? '#F4F4F5' : `${accent}12`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px',
        }}>
          {icon}
        </div>
        <span style={{ fontSize: '16px', color: locked ? '#D1D5DB' : accent }}>
          {indicator || (locked ? '🔒' : '→')}
        </span>
      </div>
      <div style={{ fontSize: '15px', fontWeight: 600, color: '#18181B' }}>{title}</div>
      <div style={{ fontSize: '12px', color: '#71717A' }}>{subtitle}</div>
      {detail && (
        <div style={{ fontSize: '12px', fontWeight: 500, color: detailColor || (locked ? '#A1A1AA' : accent), marginTop: '4px' }}>
          {detail}
        </div>
      )}
    </div>
  )
}

// ── Main app ──────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [track, setTrack] = useState(null)
  const [counts, setCounts] = useState({ newCount: 0, learnCount: 0, dueCount: 0, easyCount: 0, totalWords: 0 })
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('home')

  const loadProfile = async (userId) => {
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!prof) { setLoading(false); return }

    const { data: tr } = await supabase
      .from('language_tracks')
      .select('*')
      .eq('user_id', userId)
      .eq('language', prof.active_language)
      .eq('is_active', true)
      .single()

    const { prof: finalProf, track: finalTrack } = await checkAndAdvance(prof, tr)

    if (finalTrack) {
      const c = await getHomeCounts(userId, finalTrack, finalProf.daily_new_cards)
      setCounts(c)
    }

    setProfile(finalProf)
    setTrack(finalTrack)
    setLoading(false)
  }

  const checkAndAdvance = async (prof, tr) => {
    if (!tr) return { prof, track: tr }

    const { data: unlock } = await supabase
      .from('level_unlocks')
      .select('*')
      .eq('user_id', prof.id)
      .eq('language', tr.language)
      .eq('system', tr.system)
      .eq('level', tr.current_level)
      .maybeSingle()

    if (!unlock) return { prof, track: tr }

    const status = await getTestStatus(prof.id, tr)
    if (!status.allEasy) return { prof, track: tr }

    let nextLevel = tr.current_level
    if (tr.language === 'chinese' && tr.current_level < 9) nextLevel = tr.current_level + 1
    if (tr.language === 'japanese' && tr.current_level > 1) nextLevel = tr.current_level - 1
    if (nextLevel === tr.current_level) return { prof, track: tr }

    const { data: newTrack } = await supabase
      .from('language_tracks')
      .update({ current_level: nextLevel })
      .eq('id', tr.id)
      .select()
      .single()

    return { prof, track: newTrack || { ...tr, current_level: nextLevel } }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setTrack(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF8' }}>
        <div style={{ fontSize: '32px', color: 'var(--chinese-accent)', fontFamily: "'Noto Sans SC'" }}>学</div>
      </div>
    )
  }

  if (!session) return <Auth />

  if (!profile || !track) {
    return <Onboarding session={session} onComplete={() => loadProfile(session.user.id)} />
  }

  const accent = profile.active_language === 'japanese' ? 'var(--japanese-accent)' : 'var(--chinese-accent)'
  const accentHex = profile.active_language === 'japanese' ? '#2E3A6E' : '#B83A24'
  const langChars = profile.active_language === 'japanese' ? '日本語' : '中文'
  const systemLabel = track.system === 'hsk_3' ? 'HSK 3.0' : 'JLPT'
  const levelSuffix = profile.active_language === 'japanese' ? `N${track.current_level}` : `Level ${track.current_level}`
  const totalDue = counts.newCount + counts.learnCount + counts.dueCount
  const masteryPct = counts.totalWords > 0
    ? Math.min(100, Math.round((counts.easyCount / counts.totalWords) * 100))
    : 0
  const storiesUnlocked = counts.easyCount >= 20

  // ── Views ────────────────────────────────────────────────────────────────
  if (view === 'study') {
    return (
      <Study
        session={session}
        profile={profile}
        track={track}
        onBack={() => { setView('home'); loadProfile(session.user.id) }}
        onStreakUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      />
    )
  }

  if (view === 'test') {
    return (
      <Test
        session={session}
        profile={profile}
        track={track}
        onBack={() => { setView('home'); loadProfile(session.user.id) }}
      />
    )
  }

  if (view === 'stories') {
    return (
      <Stories
        session={session}
        profile={profile}
        track={track}
        onBack={() => setView('home')}
      />
    )
  }
  if (view === 'profile') {
  return (
    <Profile
      session={session}
      profile={profile}
      track={track}
      onBack={() => setView('home')}
      onUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
    />
  )
}
if (view === 'languages') {
  return (
    <LanguageSwitcher
      session={session}
      profile={profile}
      onSwitch={() => { setView('home'); loadProfile(session.user.id) }}
      onBack={() => setView('home')}
    />
  )
}
if (view === 'youtube') {
  return (
    <YouTube
      profile={profile}
      track={track}
      onBack={() => setView('home')}
    />
  )
}

  // ── Home ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', position: 'relative', overflow: 'hidden' }}>

      {/* Faint background character */}
      <div style={{
        position: 'fixed', right: '-30px', top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '420px', lineHeight: 1,
        color: accentHex, opacity: 0.035,
        fontFamily: "'Noto Sans SC'", fontWeight: 700,
        pointerEvents: 'none', userSelect: 'none', zIndex: 0,
      }}>
        学
      </div>

      {/* Page content */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '52px 24px 60px', position: 'relative', zIndex: 1 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
          <div>
            <div style={{
              fontSize: '52px', fontWeight: 700, color: accentHex, lineHeight: 1,
              fontFamily: profile.active_language === 'japanese' ? "'Noto Sans JP'" : "'Noto Sans SC'",
            }}>
              {langChars}
            </div>
            <div style={{ fontSize: '14px', color: '#71717A', marginTop: '8px', letterSpacing: '0.2px' }}>
  {systemLabel} · {levelSuffix}
</div>
<button
  onClick={() => setView('languages')}
  style={{
    background: 'none', border: 'none', padding: 0,
    fontSize: '12px', color: accentHex, cursor: 'pointer',
    marginTop: '6px', fontFamily: 'Inter, sans-serif',
    fontWeight: 500, textDecoration: 'underline',
    textUnderlineOffset: '3px',
  }}
>
  Switch language
</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Streak pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '8px 14px', borderRadius: '20px',
              background: '#FEF3C7', border: '1px solid #FDE68A',
            }}>
              <span style={{ fontSize: '16px' }}>🔥</span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#D97706' }}>
                {profile.streak || 0}
              </span>
            </div>
            <button
  onClick={() => setView('profile')}
  style={{
    padding: '8px 16px', borderRadius: '10px',
    border: '1px solid #E7E5E4', background: '#fff',
    cursor: 'pointer', fontSize: '13px', color: '#71717A',
    fontFamily: 'Inter, sans-serif',
  }}
>
  Profile
</button>
          </div>
        </div>

        {/* ── Today card ── */}
        <div style={{
          background: '#fff', borderRadius: '20px',
          border: '1px solid #E7E5E4',
          boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
          padding: '28px 32px', marginBottom: '20px',
        }}>
          {/* Card header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '17px', fontWeight: 700, color: '#18181B' }}>Today</span>
            <span style={{
              fontSize: '12px', color: totalDue > 0 ? accentHex : '#71717A',
              background: totalDue > 0 ? `${accentHex}10` : '#F4F4F5',
              padding: '4px 12px', borderRadius: '20px', fontWeight: 500,
            }}>
              {totalDue > 0 ? 'Cards waiting' : 'All caught up ✓'}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#71717A', marginBottom: '24px' }}>
            Your current study queue
          </div>

          {/* New / Learning / Due */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '28px' }}>
            {[
              { label: 'New', value: counts.newCount, color: '#3E63DD', bg: '#EEF2FF' },
              { label: 'Learning', value: counts.learnCount, color: '#D97706', bg: '#FFFBEB' },
              { label: 'Due', value: counts.dueCount, color: '#2F9E6D', bg: '#ECFDF5' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} style={{
                textAlign: 'center', padding: '16px 12px',
                background: bg, borderRadius: '14px',
              }}>
                <div style={{ fontSize: '34px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '12px', color: '#71717A', marginTop: '6px', fontWeight: 500 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Level mastery */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#18181B' }}>Level mastery</span>
              <span style={{ fontSize: '13px', color: '#71717A' }}>
                <span style={{ fontWeight: 600, color: '#18181B' }}>{counts.easyCount}</span>
                /{counts.totalWords} Easy · {masteryPct}%
              </span>
            </div>
            <div style={{ height: '7px', background: '#E7E5E4', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '4px',
                background: `linear-gradient(90deg, ${accentHex}, ${accentHex}bb)`,
                width: `${masteryPct}%`,
                transition: 'width .7s ease',
              }} />
            </div>
          </div>
        </div>

        {/* ── Feature cards grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <FeatureCard
            icon="📚"
            title="Flashcards"
            subtitle="Continue your session"
            detail={totalDue > 0 ? `New ${counts.newCount} · Learn ${counts.learnCount} · Due ${counts.dueCount}` : 'Nothing due right now'}
            detailColor={totalDue > 0 ? accentHex : '#71717A'}
            onClick={() => setView('study')}
            accent={accentHex}
          />
          <FeatureCard
            icon="✍️"
            title="Test"
            subtitle="Prove your level to advance"
            detail={`${counts.easyCount}/${counts.totalWords} Easy`}
            detailColor={accentHex}
            onClick={() => setView('test')}
            accent={accentHex}
          />
          <FeatureCard
            icon="📖"
            title="Stories"
            subtitle={storiesUnlocked ? 'Read in Chinese' : `Unlock at 20 Easy words`}
            detail={storiesUnlocked ? 'Available' : `${counts.easyCount}/20 Easy`}
            detailColor={storiesUnlocked ? accentHex : '#71717A'}
            onClick={() => setView('stories')}
            accent={accentHex}
            locked={!storiesUnlocked}
            indicator={storiesUnlocked ? '→' : '🔒'}
          />
          <FeatureCard
  icon="▶️"
  title="YouTube"
  subtitle="Curated beginner videos"
  detail="Watch & learn"
  detailColor={accentHex}
  onClick={() => setView('youtube')}
  accent={accentHex}
/>
        </div>
      </div>
    </div>
  )
}