# 🍎 Apple sign-in setup — hand this to whoever has portal access

**Purpose:** everything Apple needs so "Continue with Apple" works in Hanzi
Dojo. The app code is written, shipped and tested.

**This is now much shorter than it was.** Apple sign-in is done the NATIVE way,
which removes the Services ID, the client secret, and the twice-yearly
rotation that would otherwise break sign-in silently. See Step 2.

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

## Step 2 — Supabase (the only other step)

**Decided 2026-08-07: Apple sign-in is NATIVE-ONLY.** The app uses Apple's own
sign-in sheet and sends Supabase the identity token Apple signs. That choice
deletes most of this setup:

- ❌ **No Services ID needed** — that identifier only exists for *web* sign-in.
- ❌ **No client secret, and no 6-month rotation.** The web OAuth route needs a
  JWT signed with the `.p8` that Apple expires every 6 months; when it lapses,
  sign-in breaks with no other symptom. Native verification uses Apple's public
  keys instead, so there is nothing to renew, ever.
- ❌ **No `.p8` in Supabase at all.** Keep the key safe anyway — it is needed if
  web sign-in is ever added — but nothing here consumes it.
- ✅ Apple only requires Sign in with Apple **in the app** (guideline 4.8), and
  the website keeps Google + email, which Apple does not object to.

**In Supabase → Authentication → Providers → Apple:**

1. **Enable** the provider.
2. **Client IDs**: `com.hanzidojo.app` — the **bundle ID**. A native identity
   token's audience is the bundle ID, so this is the value that must be listed.
   (Leaving `com.hanzidojo.signin` there as well is harmless.)
3. **Secret Key (for OAuth)**: **leave empty.** It is only read by the web flow.
4. **Save.**

**Then Authentication → URL Configuration → Redirect URLs**, add:
```
https://hanzi-dojo.com/**
http://localhost:5173/**
com.hanzidojo.app://auth-callback
```
*(the third is for Google sign-in inside the app, which does still use a
browser round-trip — Apple no longer needs it)*

## Step 3 — One click in Xcode (whoever builds the iOS app)

The native sheet needs the entitlement, which only Xcode can add:

1. Open `ios/App/App.xcworkspace`.
2. Select the **App** target → **Signing & Capabilities**.
3. **+ Capability** → **Sign in with Apple**.

Without this the app compiles and the button fails at the moment it is tapped.

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
