import { supabase } from './supabase'

// Client side of the opt-in daily review reminder (product review item #16).
// Subscribing registers a Web Push endpoint with the browser and stores it in
// push_subscriptions; the actual sending happens server-side on a schedule
// (send-review-reminders.mjs via a GitHub Action), not here.

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window
}

// Web Push wants the VAPID public key as a raw Uint8Array, not the
// base64url string it's normally shared as.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

// Requests notification permission, subscribes via the SW's PushManager, and
// upserts the subscription + chosen hour. Returns { ok, error }.
export async function enableReminders(session, hourUtc) {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!pushSupported() || !vapidKey) return { ok: false, error: 'not-supported' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, error: 'permission-denied' }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })
  }

  const json = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: session.user.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  }, { onConflict: 'endpoint' })
  if (error) return { ok: false, error: error.message }

  await supabase.from('profiles').update({
    reminder_enabled: true,
    reminder_hour_utc: hourUtc,
  }).eq('id', session.user.id)

  return { ok: true }
}

// Changes just the scheduled hour for an already-enabled reminder — no new
// permission prompt or subscription needed.
export async function setReminderHour(session, hourUtc) {
  await supabase.from('profiles').update({ reminder_hour_utc: hourUtc }).eq('id', session.user.id)
}

// Turns reminders off: removes this device's subscription row and, best
// effort, unsubscribes the browser too (so a stale endpoint doesn't linger).
export async function disableReminders(session) {
  await supabase.from('profiles').update({ reminder_enabled: false }).eq('id', session.user.id)

  if (!pushSupported()) return
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
      await subscription.unsubscribe()
    }
  } catch { /* best effort — the profile flag is the source of truth */ }
}
