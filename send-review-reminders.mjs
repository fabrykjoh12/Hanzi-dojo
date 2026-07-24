import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
// Extension required: Node ESM (unlike Vite) does not resolve extensionless
// specifiers.
import { shouldNotifyAt, intendedLocalHour } from './src/reminderSchedule.js'

// Opt-in daily review reminder (product review item #16). Run hourly by a
// GitHub Action: finds every profile for whom it is now their chosen reminder
// hour *on their own clock*, counts their due reviews, and sends a Web Push
// notification to each of their subscribed devices. No Supabase Edge
// Function — this repo has no Supabase CLI/functions setup, and a plain
// Node script on a cron is simpler to operate and verify from here.
//
// The per-user "is it their hour?" decision lives in the pure, unit-tested
// `src/reminderSchedule.js`: it reads the wall clock in `profiles.timezone`
// (falling back to the old plain-UTC-hour comparison when a profile has no
// zone stored, so nobody is dropped), and refuses to fire twice inside the
// same local hour — which also covers the hour that repeats on a fall-back
// DST day. `profiles.reminder_last_sent_at` is that memory.

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
  const now = new Date()

  // The hour filter can't be pushed into the query any more — which hour is
  // "now" depends on each profile's zone — so fetch the (small) opted-in set
  // and decide per profile.
  let { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, active_language, reminder_hour_utc, timezone, reminder_last_sent_at')
    .eq('reminder_enabled', true)

  // Degrade safely while 20260724160000_add_profile_timezone.sql is unapplied.
  // This job runs on a schedule (.github/workflows/send-reminders.yml), so it can
  // fire against production before the owner has run the migration; selecting
  // columns that don't exist yet would abort the run and silently stop ALL
  // reminders. Falling back to the previous fixed-UTC-hour behaviour keeps
  // reminders flowing (with the old ~1h DST drift) until the migration lands.
  // Same "work without the migration" pattern the rest of the repo uses.
  if (profilesError) {
    const missingColumns = /column .* does not exist|timezone|reminder_last_sent_at/i.test(profilesError.message)
    if (!missingColumns) { console.error('Fetch profiles error:', profilesError.message); process.exit(1) }
    console.warn('[reminders] timezone columns missing — falling back to fixed-UTC-hour scheduling. Apply 20260724160000_add_profile_timezone.sql to enable per-timezone sending. Cause:', profilesError.message)
    const legacy = await supabase
      .from('profiles')
      .select('id, active_language, reminder_hour_utc')
      .eq('reminder_enabled', true)
      .eq('reminder_hour_utc', now.getUTCHours())
    if (legacy.error) { console.error('Fetch profiles error:', legacy.error.message); process.exit(1) }
    profiles = (legacy.data || []).map(p => ({ ...p, timezone: null, reminder_last_sent_at: null, __legacy: true }))
  }

  const due = (profiles || []).filter(p => {
    // The legacy path already filtered on the UTC hour in the query.
    if (p.__legacy) return true
    const targetLocalHour = intendedLocalHour(p.reminder_hour_utc, p.timezone, now)
    if (targetLocalHour === null) return false
    return shouldNotifyAt(now, p.timezone, targetLocalHour, p.reminder_last_sent_at)
  })

  console.log(`${now.toISOString()}: ${due.length} of ${(profiles || []).length} opted-in profile(s) are at their local reminder hour.`)

  let sent = 0, skippedNoDue = 0, pruned = 0, failed = 0

  for (const profile of due) {
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
      .lte('due_at', now.toISOString())

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

    let deliveredToThisProfile = 0

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent += 1
        deliveredToThisProfile += 1
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

    // Remember the send so a re-run inside the same local hour is a no-op.
    // Only stamped when something actually reached a device — a run where
    // every push failed should be allowed to try again.
    // Nothing to stamp on the legacy fallback — the column doesn't exist there,
    // and the UTC-hour query already gives that path its once-per-hour bound.
    if (deliveredToThisProfile > 0 && !profile.__legacy) {
      const { error: stampError } = await supabase
        .from('profiles')
        .update({ reminder_last_sent_at: now.toISOString() })
        .eq('id', profile.id)
      if (stampError) console.log(`  ! could not record last-sent for ${profile.id}: ${stampError.message}`)
    }
  }

  console.log(`--- Done --- sent ${sent}, no reviews due ${skippedNoDue}, pruned stale ${pruned}, failed ${failed}`)
}

main().catch(err => { console.error(err); process.exit(1) })
