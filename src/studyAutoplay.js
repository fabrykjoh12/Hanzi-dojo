// When may a flashcard announce itself?
//
// Card-entry audio belongs to the CARD, not to the tab. That distinction had no
// code behind it until a device found the gap: leave an unfinished session, come
// back to Cards, and the word you had revealed before you left spoke out loud
// from behind the "Continue session" screen — a card that was not on screen,
// playing audio nobody had asked for.
//
// Two separate causes, and this module answers both.
//
// 1. **A hidden tab is not a paused component.** The Cards root is persistent
//    (React's <Activity>), so leaving the tab tears effects DOWN and returning
//    runs them again from the top. An effect written as "when `flipped`
//    changes" cannot tell a genuine flip from a re-attachment: `flipped` was
//    still true, so the effect fired as though the learner had just revealed
//    the card.
// 2. **Nothing asked whether the card was on screen.** The old condition was
//    `flipped && queue.length > 0` — both true behind the Continue screen,
//    which renders instead of the card.
//
// So: a reveal is identified by WHICH card was revealed, and the identity is
// remembered. Re-running the effect over the same reveal is not a new reveal.
// And nothing fires at all unless the card view is the thing being presented.
//
// Pure (CLAUDE.md §3) — Study/useStudyAudio own the state, this owns the rule.

// The identity of "this card, revealed". Null when there is nothing revealed —
// a face-down card is not an entry, and returning null is what lets the SAME
// card replay when it is flipped back (an undo, a re-flip) rather than being
// silenced forever by a token it already matched.
export function cardEntryToken(card, flipped) {
  if (!flipped || !card) return null
  const id = card.id != null ? card.id : (card.vocab && card.vocab.id)
  return id == null ? null : String(id)
}

// The decision, plus the token to remember for next time. Callers keep the
// token in a ref, which — like every other piece of component state under
// <Activity> — survives the tab being hidden. That survival is the point: it is
// what makes "the effects re-attached" distinguishable from "a card was
// revealed".
//
//   presenting  the CARD VIEW is what the Cards tab is currently showing —
//               not merely that the tab is mounted or visible.
//   enabled     the learner's audio_autoplay preference.
export function autoplayDecision({ presenting, enabled, card, flipped, lastToken }) {
  const token = cardEntryToken(card, flipped)

  // Not on screen: no card-entry effect may fire, and nothing is recorded
  // either. Recording here would mean the reveal was "used up" while hidden,
  // and a card that had never spoken would stay silent when it finally
  // appeared.
  if (!presenting) return { play: false, token: lastToken }

  // Nothing revealed. Clearing the token is deliberate — see cardEntryToken.
  if (token === null) return { play: false, token: null }

  // The same reveal we have already handled. This is the re-attachment case,
  // and it is also what stops a return-to-tab from re-announcing a word the
  // learner already heard. Replay is still one tap away.
  if (token === lastToken) return { play: false, token }

  // A genuine card entry. Remember it whether or not the preference lets it
  // speak, so turning autoplay on mid-card doesn't make a card already on
  // screen blurt.
  return { play: !!enabled, token }
}
