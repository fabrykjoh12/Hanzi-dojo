import { describe, expect, it } from 'vitest'
import {
  greetingName, practiceSubLabel, previewWordSize, primaryAction,
  readableLabel, storyRowStatus,
} from './homeModel'

describe('greetingName', () => {
  it('takes the first word of the display name', () => {
    expect(greetingName('Fabian')).toBe('Fabian')
    expect(greetingName('  Fabian J  ')).toBe('Fabian')
  })

  it('returns null when there is no usable name', () => {
    expect(greetingName('')).toBeNull()
    expect(greetingName(null)).toBeNull()
    expect(greetingName(undefined)).toBeNull()
    expect(greetingName('   ')).toBeNull()
  })

  it('never greets someone by their email address', () => {
    expect(greetingName('fabrykjoh12@gmail.com')).toBeNull()
  })
})

describe('primaryAction', () => {
  it('is the way into a waiting session, with the real contents', () => {
    const action = primaryAction({ counts: { dueCount: 11, learnCount: 1, newCount: 4 }, estimate: '~6 min' })
    expect(action.kind).toBe('cards')
    expect(action.title).toBe('Continue learning')
    expect(action.sub).toBe('12 reviews · 4 new · ~6 min')
    expect(action.cta).toBe('Start')
  })

  it('pluralises a single review correctly and survives a missing estimate', () => {
    const action = primaryAction({ counts: { dueCount: 1, learnCount: 0, newCount: 0 } })
    expect(action.sub).toBe('1 review · 0 new')
  })

  it('goes quiet when nothing is due — and stops offering a start', () => {
    const action = primaryAction({ counts: { dueCount: 0, learnCount: 0, newCount: 0 } })
    expect(action.kind).toBe('clear')
    expect(action.title).toBe('All caught up')
    expect(action.sub).toBe('Nothing due right now')
    expect(action.cta).toBeNull()
  })

  it('is honest when the queue could not load — never "all caught up"', () => {
    const action = primaryAction({ counts: { dueCount: 0, learnCount: 0, newCount: 0, failed: true } })
    expect(action.kind).toBe('cards')
    expect(action.sub).toBe('Queue unavailable — starting will retry')
  })
})

describe('previewWordSize', () => {
  it('steps down with character count so the preview stays one quiet line', () => {
    expect(previewWordSize('花')).toBe(40)
    expect(previewWordSize('你好')).toBe(40)
    expect(previewWordSize('一点儿')).toBe(32)
    expect(previewWordSize('没关系吗')).toBe(26)
    expect(previewWordSize('不好意思了')).toBe(21)
  })
})

describe('readableLabel', () => {
  it('prints the readability promise only when the number is real', () => {
    expect(readableLabel(87)).toBe('87% readable')
    expect(readableLabel(0)).toBe('')
    expect(readableLabel(null)).toBe('')
    expect(readableLabel(undefined)).toBe('')
  })
})

describe('storyRowStatus', () => {
  const daily = { story: { id: 's1' }, completedToday: false }

  it('sequences the story after cards without pretending it is locked', () => {
    expect(storyRowStatus({ stage: 'cards', daily })).toBe('Today’s story · after your cards')
  })

  it('is ready once cards are clear', () => {
    expect(storyRowStatus({ stage: 'story', daily })).toBe('Ready to read')
  })

  it('marks a story finished today', () => {
    expect(storyRowStatus({ stage: 'practice', daily: { ...daily, completedToday: true } })).toBe('Read today')
    expect(storyRowStatus({ stage: 'complete', daily: { ...daily, completedToday: true } })).toBe('Read today')
  })

  it('says it is still looking while the pick loads', () => {
    expect(storyRowStatus({ stage: 'story', daily: undefined })).toBe('Finding today’s story')
  })
})

describe('practiceSubLabel', () => {
  it('prints only when something is genuinely due, with the right plural', () => {
    expect(practiceSubLabel(0)).toBeNull()
    expect(practiceSubLabel(1)).toBe('1 grammar pattern due')
    expect(practiceSubLabel(3)).toBe('3 grammar patterns due')
  })
})
