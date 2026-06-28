import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getLevelLabel, getSystemLabel } from './utils'
import { useIsMobile } from './useIsMobile'

function getVideoId(url) {
  if (!url) return null
  if (url.includes('youtu.be/')) {
    return url.split('youtu.be/')[1].split('?')[0].split('#')[0]
  }
  if (url.includes('v=')) {
    return url.split('v=')[1].split('&')[0].split('#')[0]
  }
  return null
}

function VideoCard({ video, accentHex }) {
  const [hovered, setHovered] = useState(false)
  const videoId = getVideoId(video.video_url)
  const thumbnail = videoId
    ? 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg'
    : null

  return (
    <a
      href={video.video_url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        onMouseEnter={function() { setHovered(true) }}
        onMouseLeave={function() { setHovered(false) }}
        style={{
          background: 'var(--surface)',
          borderRadius: '16px',
          border: '1px solid ' + (hovered ? accentHex + '55' : 'var(--border)'),
          boxShadow: hovered ? '0 8px 28px rgba(0,0,0,0.09)' : '0 1px 4px rgba(0,0,0,0.04)',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 180ms ease',
          overflow: 'hidden',
          cursor: 'pointer',
        }}
      >
        <div style={{ position: 'relative', paddingTop: '56.25%', background: 'var(--surface-2)' }}>
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={video.title}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
            }}>
              ▶
            </div>
          )}
        </div>

        <div style={{ padding: '14px 16px 16px' }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text)',
            lineHeight: 1.45,
            marginBottom: '5px',
          }}>
            {video.title}
          </div>
          {video.channel_name && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {video.channel_name}
            </div>
          )}
          {video.notes && (
            <div style={{
              fontSize: '12px',
              color: accentHex,
              marginTop: '6px',
              fontWeight: 500,
            }}>
              {video.notes}
            </div>
          )}
        </div>
      </div>
    </a>
  )
}

export default function YouTube({ profile, track, onBack }) {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const isMobile = useIsMobile()

  const accentHex = profile.active_language === 'japanese' ? '#2E3A6E' : '#B83A24'
  const systemLabel = getSystemLabel(track.system)
  const levelLabel = getLevelLabel(profile.active_language, track.system, track.current_level)

  useEffect(function() {
    async function loadVideos() {
      const result = await supabase
        .from('youtube_recommendations')
        .select('*')
        .eq('language', track.language)
        .eq('system', track.system)
        .eq('level', track.current_level)
        .eq('is_published', true)
        .order('sort_order', { ascending: true })

      setVideos(result.data || [])
      setLoading(false)
    }
    loadVideos()
  }, [track.language, track.system, track.current_level])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ fontSize: '32px', color: accentHex }}>
          学
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: isMobile ? '24px 16px 48px' : '40px 24px 60px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '14px',
            padding: 0,
            marginBottom: '24px',
          }}
        >
          Back
        </button>

        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            YouTube
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            {'Curated videos for ' + systemLabel + ' · ' + levelLabel}
          </p>
        </div>

        {videos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>▶</div>
            <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
              No videos yet
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              Videos for this level are coming soon.
            </div>
          </div>
        )}

        {videos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
            {videos.map(function(video) {
              return (
                <VideoCard
                  key={video.id}
                  video={video}
                  accentHex={accentHex}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
