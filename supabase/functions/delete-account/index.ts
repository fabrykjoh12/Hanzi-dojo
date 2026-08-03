// Account deletion — Apple App Store Review Guideline 5.1.1(v) and Google
// Play's Account Deletion policy both require user-initiated, in-app account
// deletion (a "message us on Discord" flow, which is what src/TrustPages.jsx
// used to say, does not satisfy either). This function is the only thing in
// the app allowed to remove a `profiles` row or an auth user — see
// src/DeleteAccount.jsx for the confirmation UI that calls it.
//
// Runs with the service role (bypasses RLS) because deleting the auth user
// itself is an admin-only operation. Everything it's allowed to touch is
// scoped to auth.uid() taken from the caller's own JWT — never a
// client-supplied id — so a caller can only ever delete their own account.
//
// Deploy: `supabase functions deploy delete-account`. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected automatically by the Supabase
// platform for every edge function — nothing to add to .env / secrets for
// this one.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Tables that hold rows keyed on a learner's own user id. Deleted explicitly,
// in this order, rather than relying solely on each table's own FK cascade
// behavior — some of these tables predate this repo's migrations folder, so
// their ON DELETE behavior isn't something a code review can verify here.
// test_answers is listed before test_attempts because it references
// test_attempts.id; every other order among the rest doesn't matter, since
// none of them reference each other. Deliberately NOT included:
//   - analytics_events: ON DELETE SET NULL by design (migration
//     20260713120000) — anonymized product analytics, not deleted.
//   - vocabulary, stories, story_vocab, story_questions,
//     youtube_recommendations, reference_dictionary, tts_audio,
//     story_utterances: shared content, not user-owned.
//   - dojo_items/dojo_comments/dojo_attachments: the admin-only /hq board.
//     Out of scope for a learner account deletion; if an admin ever deletes
//     their own account, rows they created there are left with a dangling
//     created_by/author_id rather than guessed at here.
const USER_OWNED_TABLES = [
  'test_answers',
  'test_attempts',
  'review_logs',
  'level_unlocks',
  'daily_activity',
  'writing_stats',
  'story_reads',
  'grammar_reviews',
  'push_subscriptions',
  'feedback',
  'cards',
  'language_tracks',
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'Server misconfigured' }, 500)
  }

  // Identify the caller from their own JWT — never from anything in the
  // request body. This is what makes "delete MY account" safe to expose.
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace('Bearer ', '')
  if (!jwt) return json({ error: 'Missing Authorization header' }, 401)

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await callerClient.auth.getUser(jwt)
  if (userError || !userData?.user) return json({ error: 'Not authenticated' }, 401)
  const user = userData.user

  // Defense in depth: the Settings confirmation UI already makes the user
  // type their email before calling this, but the function re-checks it
  // server-side so a forged/replayed request can't skip the confirmation.
  let body: { confirmation?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }
  const confirmation = (body.confirmation || '').trim().toLowerCase()
  const expected = (user.email || '').trim().toLowerCase()
  if (!expected || confirmation !== expected) {
    return json({ error: 'Confirmation did not match your account email' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  for (const table of USER_OWNED_TABLES) {
    const { error } = await admin.from(table).delete().eq('user_id', user.id)
    if (error) return json({ error: 'Failed clearing ' + table + ': ' + error.message }, 500)
  }

  const { error: profileError } = await admin.from('profiles').delete().eq('id', user.id)
  if (profileError) return json({ error: 'Failed clearing profile: ' + profileError.message }, 500)

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id)
  if (authDeleteError) return json({ error: 'Failed deleting auth user: ' + authDeleteError.message }, 500)

  return json({ success: true })
})
