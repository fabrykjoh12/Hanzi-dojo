import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

// Client side of the opt-in daily review reminder (product review item #16).
// Two delivery paths share one push_subscriptions table (see
// supabase/migrations/20260803120000_add_native_push_tokens.sql, NOT YET
// APPLIED as of this writing):
//   - web: registers a Web Push endpoint with the browser's PushManager.
//   - native (Capacitor): registers for FCM (Android) / APNs (iOS) via
//     @capacitor/push-notifications and stores the device token instead.
// The actual sending happens server-side on a schedule
// (send-review-reminders.mjs via a GitHub Action), not here.

export function pushSupported() {
  if (Capacitor.isNativePlatform()) return true
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

// Registers for FCM/APNs and resolves with the device token. register()
// itself resolves immediately; the token arrives asynchronously via the
// 'registration' event, so this wraps both in one promise the same shape
// as the web subscribe() call below.
function registerNativePush() {
  return new Promise((resolve, reject) => {
    const registrationListener = PushNotifications.addListener('registration', (token) => {
      registrationListener.remove()
      errorListener.remove()
      resolve(token.value)
    })
    const errorListener = PushNotifications.addListener('registrationError', (err) => {
      registrationListener.remove()
      errorListener.remove()
      reject(new Error(err?.error || 'Native push registration failed'))
    })
    PushNotifications.register()
  })
}

async function enableNativeReminders(session, hourUtc) {
  let permStatus = await PushNotifications.checkPermissions()
  if (permStatus.receive !== 'granted') permStatus = await PushNotifications.requestPermissions()
  if (permStatus.receive !== 'granted') return { ok: false, error: 'permission-denied' }

  let deviceToken
  try {
    deviceToken = await registerNativePush()
  } catch (err) {
    return { ok: false, error: err.message }
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: session.user.id,
    platform: Capacitor.getPlatform(),
    device_token: deviceToken,
  }, { onConflict: 'device_token' })
  if (error) return { ok: false, error: error.message }

  await supabase.from('profiles').update({
    reminder_enabled: true,
    reminder_hour_utc: hourUtc,
  }).eq('id', session.user.id)

  return { ok: true }
}

// Requests notification permission, subscribes via the SW's PushManager, and
// upserts the subscription + chosen hour. Returns { ok, error }.
export async function enableReminders(session, hourUtc) {
  if (Capacitor.isNativePlatform()) return enableNativeReminders(session, hourUtc)

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
    platform: 'web',
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

// Turns reminders off: removes this device's subscription row(s) and, best
// effort, unsubscribes the browser too (so a stale endpoint doesn't linger).
// Native has no synchronous way to re-read "this device's" token outside the
// registration flow, so it clears every row this account has for the
// current platform instead — in practice one device per platform per
// account, so this is equivalent.
export async function disableReminders(session) {
  await supabase.from('profiles').update({ reminder_enabled: false }).eq('id', session.user.id)

  if (Capacitor.isNativePlatform()) {
    await supabase.from('push_subscriptions').delete()
      .eq('user_id', session.user.id)
      .eq('platform', Capacitor.getPlatform())
    return
  }

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
