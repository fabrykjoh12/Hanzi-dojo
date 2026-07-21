// Lightweight, code-level feature flags. Flip a value to false to disable a
// feature fast without touching its call sites.
export const FLAGS = {
  // The pre-signup "read a Chinese sentence" wow moment (SentenceTaste +
  // CharacterTaste between the reason step and signup). Default on.
  WOW_ONBOARDING: true,
}
