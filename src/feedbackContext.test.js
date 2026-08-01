import { describe, it, expect, beforeEach } from 'vitest'
import { setFeedbackStory, feedbackStoryContext, _resetFeedbackContextForTests } from './feedbackContext'

beforeEach(() => _resetFeedbackContextForTests())

describe('feedback story context', () => {
  it('is null until a reader registers a story', () => {
    expect(feedbackStoryContext()).toBe(null)
  })

  it('carries the open story id and a truncated title', () => {
    setFeedbackStory({ id: 'abc-123', title: 'x'.repeat(200) })
    const ctx = feedbackStoryContext()
    expect(ctx.story_id).toBe('abc-123')
    expect(ctx.story_title.length).toBe(80)
  })

  it('clears on unmount (null) and tolerates junk', () => {
    setFeedbackStory({ id: 's1', title: 'A story' })
    setFeedbackStory(null)
    expect(feedbackStoryContext()).toBe(null)
    setFeedbackStory({})
    expect(feedbackStoryContext()).toBe(null)
  })

  it('returns a copy, never the registry itself', () => {
    setFeedbackStory({ id: 's1', title: 'A story' })
    const a = feedbackStoryContext()
    a.story_id = 'tampered'
    expect(feedbackStoryContext().story_id).toBe('s1')
  })
})
