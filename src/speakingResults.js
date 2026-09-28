// Retrying a prompt replaces its result; it is never a second scored item.
export function recordSpeakingResult(results, promptId, correct) {
  return { ...results, [promptId]: Boolean(correct) }
}
export function correctSpeakingCount(results) {
  return Object.values(results).filter(Boolean).length
}
