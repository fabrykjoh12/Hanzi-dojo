import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Auth from './Auth'
import Onboarding from './Onboarding'
import Study from './Study'
import Writing from './Writing'
import Test from './Test'
import Stories from './Stories'
import { getHomeCounts } from './homeCounts'
import Profile from './Profile'
import YouTube from './YouTube'
import LanguageSwitcher from './LanguageSwitcher'
import { getLevelLabel, getSystemLabel } from './utils'
import InfoTip from './InfoTip'
import { Layers, GraduationCap, PenLine, BookOpen, Play, Flame, Lock } from 'lucide-react'

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
        }}>
          {icon}
        </div>
        <span style={{ fontSize: '16px', color: locked ? '#D1D5DB' : accent, display: 'inline-flex', alignItems: 'center' }}>
          {indicator || (locked ? <Lock size={15} strokeWidth={2} /> : '→')}
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
  const [counts, setCounts] = useState({ newCount: 0, learnCount: 0, dueCount: 0, easyCount: 0, totalWords: 0, learnedCount: 0, masteredCount: 0, masteredPct: 0 })
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

    const finalProf = prof
    const finalTrack = tr

    if (finalTrack) {
      const c = await getHomeCounts(userId, finalTrack, finalProf.daily_new_cards)
      setCounts(c)
    }

    setProfile(finalProf)
    setTrack(finalTrack)
    setLoading(false)
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

  const accentHex = profile.active_language === 'japanese' ? '#2E3A6E' : '#B83A24'
  const langChars = profile.active_language === 'japanese' ? '日本語' : '中文'
const systemLabel = getSystemLabel(track.system)
const levelSuffix = getLevelLabel(profile.active_language, track.system, track.current_level)
  const totalDue = counts.newCount + counts.learnCount + counts.dueCount
  const masteryPct = counts.totalWords > 0
    ? Math.min(100, Math.round((counts.masteredCount / counts.totalWords) * 100))
    : 0
  const storiesUnlocked = counts.learnedCount >= 20

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

  if (view === 'writing') {
    return (
      <Writing
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
      onBack={() => { setView('home'); loadProfile(session.user.id) }}
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
              <Flame size={15} strokeWidth={2} color="#D97706" />
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
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 600, color: '#18181B' }}>
                Mastery
                <InfoTip accentHex={accentHex} text="A word is mastered once the app predicts you'll still recall it about three weeks from now. It can't be rushed — mastery comes from reviewing correctly over time, across multiple days." />
              </span>
              <span style={{ fontSize: '13px', color: '#71717A' }}>
                <span style={{ fontWeight: 600, color: '#18181B' }}>{counts.masteredCount}</span>
                /{counts.totalWords} · {masteryPct}%
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
            icon={<Layers size={22} strokeWidth={1.75} color={accentHex} />}
            title="Flashcards"
            subtitle="Continue your session"
            detail={totalDue > 0 ? `New ${counts.newCount} · Learn ${counts.learnCount} · Due ${counts.dueCount}` : 'Nothing due right now'}
            detailColor={totalDue > 0 ? accentHex : '#71717A'}
            onClick={() => setView('study')}
            accent={accentHex}
          />
          <FeatureCard
            icon={<GraduationCap size={22} strokeWidth={1.75} color={accentHex} />}
            title="Test"
            subtitle="Prove your level to advance"
            detail={`${counts.masteredCount}/${counts.totalWords} Mastered`}
            detailColor={accentHex}
            onClick={() => setView('test')}
            accent={accentHex}
          />
          <FeatureCard
            icon={<PenLine size={22} strokeWidth={1.75} color={accentHex} />}
            title="Writing"
            subtitle="Type from memory"
            detail={profile.active_language === 'japanese' ? 'Word or kana recall' : 'Characters or pinyin'}
            detailColor={accentHex}
            onClick={() => setView('writing')}
            accent={accentHex}
          />
          <FeatureCard
            icon={<BookOpen size={22} strokeWidth={1.75} color={storiesUnlocked ? accentHex : '#A1A1AA'} />}
            title="Stories"
            subtitle={storiesUnlocked ? 'Read in Chinese' : 'Unlock at 20 learned words'}
            detail={storiesUnlocked ? 'Available' : `${counts.learnedCount}/20 learned`}
            detailColor={storiesUnlocked ? accentHex : '#71717A'}
            onClick={() => setView('stories')}
            accent={accentHex}
            locked={!storiesUnlocked}
            indicator={storiesUnlocked ? '→' : <Lock size={15} strokeWidth={2} />}
          />
          <FeatureCard
  icon={<Play size={22} strokeWidth={1.75} color={accentHex} />}
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
