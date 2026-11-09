// What to say when adding a dictionary word does not work.
//
// dict_add_to_deck can refuse for three different reasons and they are three
// different things to tell a learner (20260907010000). Keeping the mapping here,
// pure and tested, rather than as a ternary at each call site, is what stopped
// them drifting: the daily limit reached two of the three screens before the
// third, and for a while the SHARED brake — which refuses a learner who has
// added nothing at all that day — rendered as "that's enough new words for
// today", a false statement about their own behaviour on a product whose rule
// is that copy is observational (CLAUDE.md §1).
//
// PostgREST passes a raise's SQLSTATE through as `error.code`, and the PT class
// is the one it honours as an HTTP status, so PT429 really is a 429 and PT503
// really is a 503. The server's message text is deliberately NOT used: it is
// there for the logs, and UI copy does not live in a migration.

export const DICT_ADD_LIMIT_CODE = 'PT429'   // your own daily limit
export const DICT_ADD_BUSY_CODE = 'PT503'    // the shared daily brake
export const DICT_ADD_RETRY_CODE = 'PT409'   // a lost insert race; retry now

export function isDictAddLimit(error) {
  return Boolean(error && error.code === DICT_ADD_LIMIT_CODE)
}

// dictAddToast(error, accent) → the toast payload for a failed add.
//
// Always returns one: a caller that fell into a catch has something to say, and
// an unrecognised failure still deserves better than silence. `kind` follows
// the house rule — a limit is information, a failure is a warning — so a
// refusal never arrives wearing the achievement medal.
export function dictAddToast(error, accent = null) {
  const code = error && error.code

  if (code === DICT_ADD_LIMIT_CODE) {
    return {
      kind: 'info',
      title: 'That’s enough new words for today',
      body: 'Try again tomorrow — nothing was lost.',
      accent,
    }
  }

  if (code === DICT_ADD_BUSY_CODE) {
    // Not the learner's limit, and it must not read like one.
    return {
      kind: 'info',
      title: 'The dictionary is busy right now',
      body: 'This isn’t about your words — try again a bit later.',
      accent,
    }
  }

  if (code === DICT_ADD_RETRY_CODE) {
    // Two people added the same brand-new word at the same instant. Retrying
    // works, immediately, so say that rather than "couldn't save".
    return {
      kind: 'info',
      title: 'That didn’t quite save',
      body: 'Tap it again — it should go through this time.',
      accent,
    }
  }

  return { kind: 'warn', title: 'Couldn’t save that word', accent }
}
