// Lightweight, code-level feature flags. Flip a value to false to disable a
// feature fast without touching its call sites.
export const FLAGS = {
  // The pre-signup wow moment between the reason step and signup:
  // CharacterTaste, three taps that get someone to work out 火山 from 火 and
  // 山 by themselves. Off sends them straight to signup. Default on.
  WOW_ONBOARDING: true,

  // "Continue with Apple" — rendered ONLY inside the native app (Auth.jsx
  // gates on isNativeApp()), because it uses Apple's native sheet rather
  // than the web OAuth flow. That choice is what removes the client secret
  // Apple expires every six months; see nativeAuth.js.
  //
  // Safe to leave on: the web never renders this button, so a
  // misconfigured provider cannot reach a browser learner. It needs
  // Supabase → Providers → Apple enabled with the BUNDLE ID
  // (com.hanzidojo.app) in Client IDs — no secret required.
  APPLE_SIGN_IN: true,
}
