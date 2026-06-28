import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { isMastered } from './mastery'
import { useIsMobile } from './useIsMobile'
import InfoTip from './InfoTip'
import {
  ArrowLeft, Flame, Layers, LogOut, RotateCcw, Save,
  Shield, Sparkles, Target, User,
} from 'lucide-react'

function getLanguageDetails(profile) {
  const isJapanese = profile.active_language === 'japanese'
  return {
    accentHex: isJapanese ? '#2E3A6E' : '#B83A24',
    fontFamily: isJapanese ? "'Noto Sans JP'" : "'Noto Sans SC'",
    nativeName: isJapanese ? '日本語' : '中文',
  }
}

function Shell({ children, accentHex, fontFamily }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ maxWidth: '820px', margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '38px 32px 72px', position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}

function IconButton({ icon: Icon, label, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        height: '40px', padding: '0 14px', borderRadius: '12px',
        border: '1px solid #E7E5E4',
        background: hovered ? '#F7F7F5' : '#FFFFFF',
        color: '#52525B',
        fontSize: '13px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        transition: 'background 160ms ease, transform 160ms ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <Icon size={17} strokeWidth={1.85} color="#71717A" />
      {label}
    </button>
  )
}

export default function Profile({ session, profile, track, onBack, onUpdate }) {
  const [stats, setStats] = useState({ learned: 0, totalCards: 0, masteredCount: 0, totalWords: 0 })
  const [editingGoal, setEditingGoal] = useState(false)
  const [newGoal, setNewGoal] = useState(profile.daily_new_cards)
  const [saving, setSaving] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [loading, setLoading] = useState(true)

  const { accentHex, fontFamily, nativeName } = getLanguageDetails(profile)
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  async function loadStats() {
    const { data: vocab } = await supabase
      .from('vocabulary')
      .select('id')
      .eq('language', track.language)
      .eq('system', track.system)
      .eq('level', track.current_level)
      .eq('is_active', true)

    const { data: cards } = await supabase
      .from('cards')
      .select('vocab_id, learned, stability')
      .eq('user_id', session.user.id)

    const vocabIds = new Set((vocab || []).map(v => v.id))
    const levelCards = (cards || []).filter(c => vocabIds.has(c.vocab_id))

    setStats({
      learned: levelCards.filter(c => c.learned).length,
      totalCards: levelCards.length,
      masteredCount: levelCards.filter(c => isMastered(c)).length,
      totalWords: vocabIds.size,
    })

    setLoading(false)
  }

  const saveGoal = async () => {
    if (newGoal === profile.daily_new_cards) { setEditingGoal(false); return }
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ daily_new_cards: newGoal })
      .eq('id', session.user.id)
    if (!error && onUpdate) onUpdate({ daily_new_cards: newGoal })
    setSaving(false)
    setEditingGoal(false)
  }

  useEffect(() => {
    const timer = setTimeout(loadStats, 0)
    return () => clearTimeout(timer)
  }, [])

  const resetProgress = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true)
      setResetError('')
      return
    }

    setResetting(true)
    setResetError('')

    const { error } = await supabase.rpc('reset_current_language_progress', {
      p_language: track.language,
      p_system: track.system,
    })

    if (error) {
      setResetError(error.message)
      setResetting(false)
      return
    }

    if (onUpdate) {
      onUpdate({ streak: 0, streak_freezes: 1, last_studied_on: null })
    }

    await loadStats()
    setResetting(false)
    setConfirmingReset(false)
  }

  const masteryPct = stats.totalWords > 0
    ? Math.round((stats.masteredCount / stats.totalWords) * 100)
    : 0

  return (
    <Shell accentHex={accentHex} fontFamily={fontFamily}>
      <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />

      <div style={{ margin: '30px 0 28px', display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '24px',
          background: accentHex + '10',
          border: '1px solid ' + accentHex + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accentHex,
          fontFamily,
          fontSize: '30px',
          fontWeight: 850,
          flexShrink: 0,
        }}>
          {nativeName[0]}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accentHex, fontSize: '13px', fontWeight: 800, marginBottom: '7px' }}>
            <User size={16} strokeWidth={1.8} color={accentHex} />
            Profile
          </div>
          <h1 style={{ margin: 0, fontSize: '34px', lineHeight: 1.1, fontWeight: 850, color: '#18181B' }}>
            {profile.display_name || session.user.email}
          </h1>
          <div style={{ fontSize: '14px', color: '#71717A', marginTop: '8px', fontWeight: 600 }}>
            {systemLabel} · {levelLabel}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '18px' }}>
        <StatCard label="Current streak" value={profile.streak || 0} unit="days" icon={Flame} color="#D97706" bg="#FFFBEB" />
        <StatCard label="Streak freezes" value={profile.streak_freezes || 0} unit="available" icon={Shield} color="#3E63DD" bg="#EEF2FF" />
        <StatCard label="Words learned" value={loading ? '-' : stats.learned} unit={'of ' + stats.totalWords} icon={Layers} color={accentHex} bg={accentHex + '10'} />
        <StatCard label="Words mastered" value={loading ? '-' : stats.masteredCount} unit={masteryPct + '%'} icon={Sparkles} color="#2F9E6D" bg="#ECFDF5" />
      </div>

      {!loading && (
        <Panel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 800, color: '#18181B' }}>
              Level mastery
              <InfoTip accentHex={accentHex} text="A word is mastered once the app predicts you'll still recall it about three weeks from now. It can't be rushed - mastery comes from reviewing correctly over time, across multiple days." />
            </span>
            <span style={{ fontSize: '13px', color: '#71717A', fontWeight: 650 }}>{stats.masteredCount}/{stats.totalWords} mastered</span>
          </div>
          <div style={{ height: '8px', background: '#E7E5E4', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, ' + accentHex + ', ' + accentHex + 'AA)',
              width: masteryPct + '%',
              transition: 'width 700ms ease',
            }} />
          </div>
          <div style={{ fontSize: '12px', color: '#71717A', marginTop: '9px' }}>
            Test unlocks at 90% mastery.
          </div>
        </Panel>
      )}

      <Panel>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', marginBottom: editingGoal ? '16px' : 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 800, color: '#18181B' }}>
              <Target size={17} strokeWidth={1.85} color={accentHex} />
              Daily new cards
            </div>
            {!editingGoal && (
              <div style={{ fontSize: '13px', color: '#71717A', marginTop: '4px' }}>
                {profile.daily_new_cards} new cards per day
              </div>
            )}
          </div>
          {!editingGoal ? (
            <SmallButton onClick={() => { setEditingGoal(true); setNewGoal(profile.daily_new_cards) }}>
              Change
            </SmallButton>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <SmallButton onClick={() => setEditingGoal(false)}>Cancel</SmallButton>
              <SmallButton onClick={saveGoal} accentHex={accentHex} filled disabled={saving} icon={Save}>
                {saving ? 'Saving' : 'Save'}
              </SmallButton>
            </div>
          )}
        </div>

        {editingGoal && (
          <div style={{ display: 'grid', gap: '9px' }}>
            {[
              { val: 5, label: 'Casual', desc: '5 cards / day' },
              { val: 10, label: 'Regular', desc: '10 cards / day' },
              { val: 15, label: 'Intensive', desc: '15 cards / day' },
            ].map(opt => (
              <button
                key={opt.val}
                onClick={() => setNewGoal(opt.val)}
                style={{
                  padding: '14px 16px', borderRadius: '14px', textAlign: 'left',
                  border: '1.5px solid ' + (newGoal === opt.val ? accentHex : '#E7E5E4'),
                  background: newGoal === opt.val ? accentHex + '08' : '#FFFFFF',
                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                <span style={{ fontWeight: 750, fontSize: '14px', color: newGoal === opt.val ? accentHex : '#18181B' }}>
                  {opt.label}
                </span>
                <span style={{ fontSize: '13px', color: '#71717A' }}>{opt.desc}</span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {profile.last_studied_on && (
        <Panel compact>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: '#71717A' }}>Last studied</span>
            <span style={{ fontSize: '14px', fontWeight: 750, color: '#18181B' }}>
              {new Date(profile.last_studied_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </Panel>
      )}

      <Panel danger>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#18181B' }}>Reset progress</div>
            <div style={{ fontSize: '13px', color: '#71717A', marginTop: '4px', lineHeight: 1.45 }}>
              Clears flashcards, tests, unlocks, and streak for this language.
            </div>
          </div>
          <SmallButton onClick={resetProgress} danger filled={confirmingReset} disabled={resetting} icon={RotateCcw}>
            {resetting ? 'Resetting' : confirmingReset ? 'Confirm reset' : 'Reset'}
          </SmallButton>
        </div>

        {confirmingReset && !resetting && (
          <button
            onClick={() => { setConfirmingReset(false); setResetError('') }}
            style={{
              marginTop: '12px', background: 'none', border: 'none',
              padding: 0, color: '#71717A', cursor: 'pointer',
              fontSize: '13px', fontFamily: 'Inter, sans-serif',
            }}
          >
            Cancel reset
          </button>
        )}

        {resetError && (
          <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '10px', lineHeight: 1.4 }}>
            {resetError}
          </div>
        )}
      </Panel>

      <button
        onClick={() => supabase.auth.signOut()}
        style={{
          width: '100%',
          minHeight: '52px',
          borderRadius: '16px',
          border: '1px solid #FCA5A5',
          background: '#FEF2F2',
          color: '#DC2626',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 750,
          fontFamily: 'Inter, sans-serif',
          marginTop: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        <LogOut size={18} strokeWidth={1.9} color="#DC2626" />
        Sign out
      </button>
    </Shell>
  )
}

function Panel({ children, compact, danger }) {
  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: '20px',
      border: '1px solid ' + (danger ? '#FECACA' : '#E7E5E4'),
      boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
      padding: compact ? '18px 22px' : '22px 24px',
      marginBottom: '14px',
    }}>
      {children}
    </div>
  )
}

function StatCard({ label, value, unit, icon: Icon, color, bg }) {
  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: '18px',
      border: '1px solid #E7E5E4',
      boxShadow: '0 8px 26px rgba(24,24,27,0.05)',
      padding: '18px',
    }}>
      <div style={{
        width: '38px', height: '38px', borderRadius: '13px',
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '14px',
      }}>
        <Icon size={19} strokeWidth={1.85} color={color} />
      </div>
      <div style={{ fontSize: '29px', fontWeight: 850, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#71717A', marginTop: '5px', fontWeight: 650 }}>{unit}</div>
      <div style={{ fontSize: '12px', color: '#A1A1AA', marginTop: '7px' }}>{label}</div>
    </div>
  )
}

function SmallButton({ children, onClick, accentHex, filled, danger, disabled, icon: Icon }) {
  const color = danger ? '#DC2626' : (accentHex || '#71717A')
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: '36px',
        padding: '0 14px',
        borderRadius: '10px',
        border: '1px solid ' + (danger ? '#FCA5A5' : filled ? color : '#E7E5E4'),
        background: filled ? color : (danger ? '#FEF2F2' : '#FFFFFF'),
        color: filled ? '#FFFFFF' : color,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '13px',
        fontWeight: 750,
        fontFamily: 'Inter, sans-serif',
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.65 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '7px',
      }}
    >
      {Icon && <Icon size={15} strokeWidth={2} color={filled ? '#FFFFFF' : color} />}
      {children}
    </button>
  )
}
