import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { isMastered } from './mastery'
import InfoTip from './InfoTip'

export default function Profile({ session, profile, track, onBack, onUpdate }) {
  const [stats, setStats] = useState({ learned: 0, totalCards: 0, masteredCount: 0, totalWords: 0 })
  const [editingGoal, setEditingGoal] = useState(false)
  const [newGoal, setNewGoal] = useState(profile.daily_new_cards)
  const [saving, setSaving] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [loading, setLoading] = useState(true)

  const accentHex = profile.active_language === 'japanese' ? '#2E3A6E' : '#B83A24'
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)
  const langChars = profile.active_language === 'japanese' ? '日本語' : '中文'

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
    <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
      {/* Header */}
      <div style={{
        maxWidth: '680px', margin: '0 auto',
        padding: '40px 24px 0',
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: '#71717A', cursor: 'pointer', fontSize: '14px', marginBottom: '32px', padding: 0 }}
        >
          ← Back
        </button>

        {/* Avatar + identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: `${accentHex}15`,
            border: `2px solid ${accentHex}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', fontFamily: "'Noto Sans SC'", color: accentHex, fontWeight: 700,
          }}>
            {langChars[0]}
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#18181B' }}>
              {profile.display_name || session.user.email}
            </div>
            <div style={{ fontSize: '13px', color: '#71717A', marginTop: '3px' }}>
              {systemLabel} · {levelLabel}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
          <StatCard
            label="Current streak"
            value={profile.streak || 0}
            unit="days"
            icon="🔥"
            color="#D97706"
            bg="#FFFBEB"
          />
          <StatCard
            label="Streak freezes"
            value={profile.streak_freezes || 0}
            unit="available"
            icon="🛡️"
            color="#3E63DD"
            bg="#EEF2FF"
          />
          <StatCard
            label="Words in review"
            value={loading ? '–' : stats.learned}
            unit={`of ${stats.totalWords}`}
            icon="📚"
            color={accentHex}
            bg={`${accentHex}10`}
          />
          <StatCard
            label="Words mastered"
            value={loading ? '–' : stats.masteredCount}
            unit={`${masteryPct}% mastered`}
            icon="✦"
            color="#2F9E6D"
            bg="#ECFDF5"
          />
        </div>

        {/* Mastery progress */}
        {!loading && (
          <div style={{
            background: '#fff', borderRadius: '18px',
            border: '1px solid #E7E5E4',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            padding: '22px 24px', marginBottom: '14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px', fontWeight: 600, color: '#18181B' }}>
                Level mastery
                <InfoTip accentHex={accentHex} text="A word is mastered once the app predicts you'll still recall it about three weeks from now. It can't be rushed — mastery comes from reviewing correctly over time, across multiple days." />
              </span>
              <span style={{ fontSize: '13px', color: '#71717A' }}>{stats.masteredCount}/{stats.totalWords} mastered</span>
            </div>
            <div style={{ height: '8px', background: '#E7E5E4', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '4px',
                background: `linear-gradient(90deg, ${accentHex}, ${accentHex}aa)`,
                width: `${masteryPct}%`, transition: 'width .7s ease',
              }} />
            </div>
            <div style={{ fontSize: '12px', color: '#71717A', marginTop: '8px' }}>
              {stats.masteredCount}/{stats.totalWords} words mastered · test unlocks at 90%
            </div>
          </div>
        )}

        {/* Daily goal setting */}
        <div style={{
          background: '#fff', borderRadius: '18px',
          border: '1px solid #E7E5E4',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          padding: '22px 24px', marginBottom: '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editingGoal ? '16px' : 0 }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#18181B' }}>Daily new cards</div>
              {!editingGoal && (
                <div style={{ fontSize: '13px', color: '#71717A', marginTop: '2px' }}>
                  {profile.daily_new_cards} new cards per day
                </div>
              )}
            </div>
            {!editingGoal ? (
              <button
                onClick={() => { setEditingGoal(true); setNewGoal(profile.daily_new_cards) }}
                style={{
                  padding: '7px 14px', borderRadius: '8px',
                  border: '1px solid #E7E5E4', background: '#fff',
                  cursor: 'pointer', fontSize: '13px', color: '#71717A',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                Change
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setEditingGoal(false)}
                  style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #E7E5E4', background: '#fff', cursor: 'pointer', fontSize: '13px', color: '#71717A', fontFamily: 'Inter, sans-serif' }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveGoal}
                  disabled={saving}
                  style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: accentHex, color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'Inter, sans-serif', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {editingGoal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { val: 5, label: 'Casual', desc: '5 cards / day' },
                { val: 10, label: 'Regular', desc: '10 cards / day' },
                { val: 15, label: 'Intensive', desc: '15 cards / day' },
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setNewGoal(opt.val)}
                  style={{
                    padding: '12px 16px', borderRadius: '12px', textAlign: 'left',
                    border: `1.5px solid ${newGoal === opt.val ? accentHex : '#E7E5E4'}`,
                    background: newGoal === opt.val ? `${accentHex}08` : '#fff',
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '14px', color: newGoal === opt.val ? accentHex : '#18181B' }}>
                    {opt.label}
                  </span>
                  <span style={{ fontSize: '13px', color: '#71717A' }}>{opt.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Last studied */}
        {profile.last_studied_on && (
          <div style={{
            background: '#fff', borderRadius: '18px',
            border: '1px solid #E7E5E4',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            padding: '18px 24px', marginBottom: '14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '14px', color: '#71717A' }}>Last studied</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#18181B' }}>
              {new Date(profile.last_studied_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        )}

        {/* Reset progress */}
        <div style={{
          background: '#fff', borderRadius: '18px',
          border: '1px solid #FECACA',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          padding: '22px 24px', marginBottom: '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#18181B' }}>Reset progress</div>
              <div style={{ fontSize: '13px', color: '#71717A', marginTop: '2px', lineHeight: 1.4 }}>
                Clears flashcards, tests, unlocks, and streak for this language.
              </div>
            </div>
            <button
              onClick={resetProgress}
              disabled={resetting}
              style={{
                padding: '8px 14px', borderRadius: '8px',
                border: '1px solid #FCA5A5',
                background: confirmingReset ? '#DC2626' : '#FEF2F2',
                color: confirmingReset ? '#fff' : '#DC2626',
                cursor: resetting ? 'default' : 'pointer',
                fontSize: '13px', fontWeight: 600,
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'nowrap',
                opacity: resetting ? 0.65 : 1,
              }}
            >
              {resetting ? 'Resetting...' : confirmingReset ? 'Confirm reset' : 'Reset'}
            </button>
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
              Cancel
            </button>
          )}

          {resetError && (
            <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '10px', lineHeight: 1.4 }}>
              {resetError}
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            width: '100%', padding: '14px', borderRadius: '14px',
            border: '1px solid #FCA5A5', background: '#FEF2F2',
            color: '#DC2626', cursor: 'pointer', fontSize: '14px',
            fontWeight: 600, fontFamily: 'Inter, sans-serif',
            marginTop: '8px',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function StatCard({ label, value, unit, icon, color, bg }) {
  return (
    <div style={{
      background: '#fff', borderRadius: '16px',
      border: '1px solid #E7E5E4',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      padding: '20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px',
        }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: '28px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#71717A', marginTop: '4px' }}>{unit}</div>
      <div style={{ fontSize: '12px', color: '#A1A1AA', marginTop: '6px' }}>{label}</div>
    </div>
  )
}
