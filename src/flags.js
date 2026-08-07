// Lightweight, code-level feature flags. Flip a value to false to disable a
// feature fast without touching its call sites.
export const FLAGS = {
  // The pre-signup "read a Chinese sentence" wow moment (SentenceTaste between
  // the reason step and signup). Default on.
  WOW_ONBOARDING: true,

  // "Continue with Apple" on the sign-in screen.
  //
  // OFF until the Apple provider is enabled in Supabase (Authentication →
  // Providers → Apple, using the Services ID / Team ID / Key ID / .p8 from
  // the Apple Developer portal). The client code is complete and shipped —
  // but a button that answers "Unsupported provider" is worse than no
  // button, and merging to main deploys to real learners immediately.
  //
  // FLIP TO true the moment that provider is saved: no code change is
  // needed, and it is required on iOS before submission (App Store
  // guideline 4.8, because we offer Google).
  APPLE_SIGN_IN: false,
}
