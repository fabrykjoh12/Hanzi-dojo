import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

// Opt-in daily review reminder (product review item #16). Run hourly by a
// GitHub Action: finds every profile whose chosen reminder hour (UTC) matches
// the current hour, counts their due reviews, and sends a Web Push
// notification to each of their subscribed devices. No Supabase Edge
// Function — this repo has no Supabase CLI/functions setup, and a plain
// Node script on a cron is simpler to operate and verify from here.

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@example.com'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY')
  process.exit(1)
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  const currentUtcHour = new Date().getUTCHours()

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, active_language')
    .eq('reminder_enabled', true)
    .eq('reminder_hour_utc', currentUtcHour)
  if (profilesError) { console.error('Fetch profiles error:', profilesError.message); process.exit(1) }

  console.log(`Hour ${currentUtcHour} UTC: ${(profiles || []).length} profile(s) due for a reminder check.`)

  let sent = 0, skippedNoDue = 0, pruned = 0, failed = 0

  for (const profile of profiles || []) {
    const { data: track } = await supabase
      .from('language_tracks')
      .select('language, system')
      .eq('user_id', profile.id)
      .eq('language', profile.active_language)
      .eq('is_active', true)
      .single()
    if (!track) continue

    // Every due review across the active track (any level) — the same
    // "reviews waiting" idea used elsewhere in the app, just not scoped to
    // a single level here since a reminder should reflect the whole deck.
    const { data: cards } = await supabase
      .from('cards')
      .select('due_at, state, vocabulary!inner(language, system)')
      .eq('user_id', profile.id)
      .eq('vocabulary.language', track.language)
      .eq('vocabulary.system', track.system)
      .in('state', ['review', 'learning', 'relearning'])
      .lte('due_at', new Date().toISOString())

    const dueCount = (cards || []).length
    if (dueCount === 0) { skippedNoDue += 1; continue }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', profile.id)
    if (!subs || subs.length === 0) continue

    const payload = JSON.stringify({
      title: dueCount + ' review' + (dueCount === 1 ? '' : 's') + ' waiting',
      body: 'Your Hanzi Dojo deck has cards ready — a few minutes keeps your streak alive.',
      url: '/study',
    })

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent += 1
      } catch (err) {
        // 404/410 = the subscription is gone (browser data cleared, uninstalled,
        // permission revoked) — prune it so future runs don't keep retrying it.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          pruned += 1
        } else {
          failed += 1
          console.log(`  ✗ push failed for subscription ${sub.id}: ${err.message}`)
        }
      }
    }
  }

  console.log(`--- Done --- sent ${sent}, no reviews due ${skippedNoDue}, pruned stale ${pruned}, failed ${failed}`)
}

main().catch(err => { console.error(err); process.exit(1) })
