# 🍎 Apple sign-in setup — hand this to whoever has portal access

**Purpose:** everything Apple needs so "Continue with Apple" works in Hanzi
Dojo. The app code is already written, shipped and tested — it is switched
**off** behind a flag until the four values at the bottom of this page exist.

**Who can do this:** anyone with access to the Hanzi Dojo Apple Developer
account (Account Holder or Admin). It is all web forms — no Mac, no Xcode, no
code.

**Time:** ~20 minutes.

**The one value everything hangs off:**

```
Bundle ID:  com.hanzidojo.app
Callback:   https://bvqvturqupbggxaeihvi.supabase.co/auth/v1/callback
```

That callback is Supabase's, and it is deliberate — see
`docs/BACKLOG.md` (the auth-domain decision). Do not substitute a
hanzi-dojo.com URL; sign-in will break.

---

## Step 1 — App ID  *(reported done 2026-08-07 — verify only)*

Direct link: <https://developer.apple.com/account/resources/identifiers/list>

1. Find the row `Hanzi Dojo` / `com.hanzidojo.app` and click the **name**.
2. In the **Capabilities** checkbox list, confirm both are ticked:
   - **Sign in with Apple**
   - **Associated Domains** *(not needed today; it is for opening
     hanzi-dojo.com links directly in the app later. Ticking it now saves a
     second trip.)*
3. **Save** if you changed anything.

> If the row does not exist: **⊕ → App IDs → App**, Description `Hanzi Dojo`,
> Bundle ID **Explicit** = `com.hanzidojo.app`, tick the two capabilities,
> Continue → Register. (Description accepts letters, numbers and spaces only.)

## Step 2 — Services ID

This is the identifier Apple associates with *web* sign-in. Supabase needs it.
It must **not** be the same string as the bundle ID.

Direct link: <https://developer.apple.com/account/resources/identifiers/list/serviceId>

1. Click the blue **⊕** next to "Identifiers".
2. Choose **Services IDs** → **Continue**.
3. Fill in:
   - Description: `Hanzi Dojo Web`
   - Identifier: `com.hanzidojo.signin`
4. **Continue** → **Register**.
5. Now **click the row you just created** (registering it is not enough — it
   has to be configured).
6. Tick **Sign in with Apple**, then click **Configure** beside it.
7. In the dialog:
   - **Primary App ID**: `Hanzi Dojo (com.hanzidojo.app)`
   - **Domains and Subdomains**: `bvqvturqupbggxaeihvi.supabase.co`
     *(no `https://`, no trailing slash — just the host)*
   - **Return URLs**: `https://bvqvturqupbggxaeihvi.supabase.co/auth/v1/callback`
     *(this one DOES include `https://`)*
8. **Next** / **Done** → **Continue** → **Save**.

⚠️ Two things that trip people up here:
- Apple sometimes shows a "Verify" step for the domain. Supabase's domain is
  already publicly reachable, so it verifies immediately; if it complains,
  re-check for a stray space or `https://` in the *Domains* box.
- If **Save** looks like it did nothing, scroll up — the error appears at the
  top of the dialog.

## Step 3 — Key (.p8)

Direct link: <https://developer.apple.com/account/resources/authkeys/list>

1. Click the blue **⊕** next to "Keys".
2. **Key Name**: `Hanzi Dojo Sign in with Apple`
3. Tick **Sign in with Apple** → click **Configure** → **Primary App ID**:
   `Hanzi Dojo (com.hanzidojo.app)` → **Save**.
4. **Continue** → **Register**.
5. **Download** the `.p8` file.

🔴 **The download happens once.** Apple will never show that file again. Save
it somewhere safe (a password manager is ideal). If it is lost, the key must
be revoked and the whole step redone.

6. On that same screen, note the **Key ID** (10 characters, e.g. `A1B2C3D4E5`).

## Step 4 — Team ID

Direct link: <https://developer.apple.com/account> → scroll to **Membership
details**. The **Team ID** is 10 characters, e.g. `9XYZ8ABC7D`.

---

## What to send back

Four things — three are safe to paste in chat, one is not:

| Value | Example | Where it came from |
|-------|---------|--------------------|
| Services ID | `com.hanzidojo.signin` | Step 2 |
| Team ID | `9XYZ8ABC7D` | Step 4 |
| Key ID | `A1B2C3D4E5` | Step 3 |
| The `.p8` file | `AuthKey_A1B2C3D4E5.p8` | Step 3 |

🔴 **The `.p8` is a private key — do not paste it into a chat, an email or a
ticket.** Whoever holds it can issue Apple sign-ins for this app. It goes
straight into the Supabase dashboard by the person who downloaded it, or is
passed through a password manager.

## Step 5 — Supabase (whoever has dashboard access)

1. **Authentication → Providers → Apple** → toggle **Enable**.
   - **Services ID** (sometimes labelled Client ID): `com.hanzidojo.signin`
   - **Team ID**, **Key ID**: as above
   - **Secret Key (for OAuth)**: ⚠️ this is **not** the `.p8` itself. Apple
     wants a short-lived ES256 JWT signed *with* that key. Generate it on your
     own machine — never in a web "JWT generator", which would be handing over
     the signing key:
     If the key lives in a password manager, copy it there and pipe it in —
     it then never touches the disk at all:
     ```
     # macOS
     pbpaste | node tools/apple-client-secret.mjs --p8 - \
       --team-id <TEAM ID> --key-id <KEY ID> --services-id com.hanzidojo.signin

     # Windows (PowerShell)
     Get-Clipboard | node tools/apple-client-secret.mjs --p8 - `
       --team-id <TEAM ID> --key-id <KEY ID> --services-id com.hanzidojo.signin
     ```
     Or, from a saved file:
     ```
     node tools/apple-client-secret.mjs --p8 ~/Desktop/AuthKey.p8 \
       --team-id <TEAM ID> --key-id <KEY ID> --services-id com.hanzidojo.signin
     ```
     Paste the printed token into the box.
   - **Save**.

🔴 **This secret expires after 6 months** (Apple's maximum — the Supabase
dashboard warns about it too). When it lapses, web sign-in stops working with
no other symptom. Set a calendar reminder for ~5 months out, keep the `.p8`,
and regenerate by running the same command again.
2. **Authentication → URL Configuration**:
   - **Site URL**: `https://hanzi-dojo.com`
   - **Redirect URLs** — all three:
     ```
     https://hanzi-dojo.com/**
     http://localhost:5173/**
     com.hanzidojo.app://auth-callback
     ```
     *(the third is how the phone app gets back from Apple — without it,
     sign-in in the app succeeds and then lands nowhere)*
   - **Save**.

## Step 6 — Turn it on

Tell Claude/the maintainer it is done. A one-line flag flip
(`FLAGS.APPLE_SIGN_IN` in `src/flags.js`) puts the button live, and Apple
sign-in can then be tested **on the website** — no iOS build required. That
web test is the proof the whole chain is correct.

---

## Why the button is hidden until then

Supabase answers `Unsupported provider` for a provider that isn't configured.
Shipping a visible button that errors is worse than shipping none, and
`main` deploys to real learners on merge — so the flag stays off until the
provider is saved.

## Where this is required

App Store Review guideline **4.8**: an app offering a third-party login (we
offer Google) must also offer Sign in with Apple. Submitting without it is an
automatic rejection, so this is a launch blocker, not a nice-to-have.
