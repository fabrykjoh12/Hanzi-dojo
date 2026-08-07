// Delete-account flow logic (PRE-RELEASE-CHECKLIST §0b). Both stores require
// self-serve, in-app account deletion; the destructive call itself is the
// `delete_my_account` RPC. This module holds the decisions around it so they
// are testable: the typed confirmation gate, and the device cleanup that runs
// after the server says yes.

import { clearDownloads, outboxClear } from './offline'

// The word the learner must type before the delete button arms. Deliberately a
// word, not a checkbox — deletion is total (account + every card, review and
// story read) and irreversible, which is one notch above the reset panel's
// two-tap confirm.
export const DELETE_CONFIRM_WORD = 'delete'

export function confirmWordOk(input) {
  return typeof input === 'string' && input.trim().toLowerCase() === DELETE_CONFIRM_WORD
}

// The delete button is live only once the flow is armed AND the word matches.
export function canConfirmDeletion(armed, input) {
  return Boolean(armed) && confirmWordOk(input)
}

// After the RPC succeeds the account is gone server-side; what remains is this
// device's copy. Clear cached snapshots + audio AND the write outbox — queued
// grades for a deleted account would fail on every replay forever. Best-effort:
// storage may be blocked (§6.5), and a leftover cache on a dead session is
// harmless next to a failed deletion UX.
export function forgetDeviceData() {
  return Promise.all([clearDownloads(), outboxClear()]).catch(() => null)
}
