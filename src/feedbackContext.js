// What the learner is looking at when they send feedback. Readers register the
// open story here on mount and clear it on unmount; the Feedback modal reads
// it at send time and attaches it to the report — so "the pinyin is wrong"
// arrives pinned to an exact story instead of needing a reply asking which.
// Module-level registry (not React state): Feedback and the readers live in
// different trees, and this changes only on mount/unmount. Pure, unit-tested.

let current = null

// setFeedbackStory({ id, title }) — call with null/undefined to clear.
export function setFeedbackStory(story) {
  current = story && story.id
    ? { story_id: String(story.id), story_title: String(story.title || '').slice(0, 80) }
    : null
}

// The context to attach to a feedback row right now (or null). A fresh object
// each call so callers can't mutate the registry.
export function feedbackStoryContext() {
  return current ? { ...current } : null
}

export function _resetFeedbackContextForTests() {
  current = null
}
