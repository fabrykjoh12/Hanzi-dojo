# Fixing the Google sign-in branding

**Symptom:** The Google consent screen says *"Sign in to `bvqvturqupbggxaeihvi.supabase.co`"*
(and *"Google will share … with `bvqvturqupbggxaeihvi.supabase.co`"*) instead of
**Hanzi Dojo**.

**Why:** That string is Supabase's default auth host — your project ref
(`Claude.md` §3). Google shows the host of the OAuth **redirect URI**, and by
default that URI lives on `<project-ref>.supabase.co`. Nothing in this repo
controls it — the app just calls `supabase.auth.signInWithOAuth({ provider: 'google' })`
(`src/Auth.jsx`). Fixing it is entirely dashboard configuration, in two levers.
Do **B** for the biggest visible win; **A** cleans up the app name + logo.

---

## A. Set the app name, logo, and support info (Google Cloud Console)

1. Google Cloud Console → the project that owns your OAuth client →
   **APIs & Services → OAuth consent screen**.
2. Set:
   - **App name:** `Hanzi Dojo`
   - **User support email:** your address
   - **App logo:** the ensō logo (`src/assets/Hanzi-logo.png`) — uploading a logo
     also triggers Google's branding to show the name prominently.
   - **App domain / Authorized domains:** your production domain (see B) and
     `supabase.co` if you keep the default host.
   - **Developer contact information:** your email.
3. **Publishing status:** move the app from **Testing** to **In production**
   (*Publish app*). A Testing-status app is limited to allow-listed test users and
   shows scarier "unverified" wording. Only the sensitive/restricted scopes need
   Google verification — the basic `email`/`profile` scopes used here do not, so
   publishing is quick.

That makes the consent screen read *"…to continue to Hanzi Dojo"* and show your
logo — but the host line still shows `…supabase.co` until you also do B.

## B. Move auth onto your own domain (removes the `supabase.co` host)

The host Google prints is the redirect URI's domain. To make it your domain:

1. **Supabase → Project Settings → Custom Domains.** Add e.g.
   `auth.hanzidojo.com` (custom domains are a paid add-on). Follow the CNAME /
   verification steps until it's live. Your auth endpoints then answer on
   `https://auth.hanzidojo.com/auth/v1/*`.
2. **Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0
   Client ID.** Update:
   - **Authorized JavaScript origins:** add `https://hanzidojo.com`
     (and any GitHub Pages / Vercel origin you serve from).
   - **Authorized redirect URIs:** replace
     `https://bvqvturqupbggxaeihvi.supabase.co/auth/v1/callback`
     with `https://auth.hanzidojo.com/auth/v1/callback`.
3. **Supabase → Authentication → URL Configuration.** Confirm the **Site URL**
   and **Redirect URLs** include your production origin(s). (The app already
   passes `redirectTo = window.location.origin + BASE_URL`, `src/Auth.jsx`, so it
   returns to whatever host the user is on — just make sure that host is
   allow-listed here.)

After B, the consent screen reads *"Sign in to hanzidojo.com"* (or your chosen
subdomain) with the Hanzi Dojo name and logo from A.

---

### Notes
- No code change ships for this — it's Google Cloud + Supabase dashboard config.
- If you're using Supabase's **shared** Google credentials (no client ID/secret
  entered under Authentication → Providers → Google), you cannot brand the
  consent screen at all. Create your **own** OAuth client in Google Cloud and
  paste its Client ID + Secret into Supabase first; then A and B apply.
- Changes to the consent screen can take a few minutes to propagate; test in an
  incognito window.
