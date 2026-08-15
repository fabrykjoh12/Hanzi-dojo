import { describe, it, expect } from 'vitest'
import {
  FLASHCARD, STORY, encounterVocabIds, isRightReply, replyNote, ENCOUNTER_DONE,
} from './firstEncounter'

describe('the flashcard', () => {
  it('teaches 你好 and breaks it into its two characters', () => {
    expect(FLASHCARD.hanzi).toBe('你好')
    expect(FLASHCARD.breakdown.map(b => b.hanzi).join('')).toBe(FLASHCARD.hanzi)
    for (const b of FLASHCARD.breakdown) expect(b.gloss).toBeTruthy()
  })
})

describe('the story', () => {
  it('is three beats: arrive, greet, reply', () => {
    expect(STORY.panels.map(p => p.id)).toEqual(['arrive', 'greet', 'reply'])
  })

  it('greets with the exact word the flashcard just taught', () => {
    // The whole design is the flashcard paying off inside the story — if the
    // greeting drifts to 您好 or 你好吗 the connection breaks silently.
    const greet = STORY.panels.find(p => p.id === 'greet')
    expect(greet.line).toContain(FLASHCARD.hanzi)
    expect(greet.vocabId).toBe(FLASHCARD.vocabId)
  })

  it('has exactly one right reply, and it is the taught word', () => {
    const right = STORY.replies.filter(isRightReply)
    expect(right).toHaveLength(1)
    expect(right[0].hanzi).toBe(FLASHCARD.hanzi)
  })

  it('explains every wrong reply gently, stating what the word DOES mean', () => {
    for (const r of STORY.replies.filter(r => !isRightReply(r))) {
      const note = replyNote(r)
      expect(note).toContain(r.hanzi)
      expect(note).toContain(r.meaning)
      expect(note).toContain('Try another')
    }
    expect(replyNote(STORY.replies.find(isRightReply))).toBe(null)
  })

  it('gives every reply real audio — listen-before-you-choose works on all three', () => {
    for (const r of STORY.replies) {
      expect(r.vocabId).toMatch(/^[0-9a-f-]{36}$/)
      expect(r.pinyin).toBeTruthy()
    }
    expect(encounterVocabIds()).toHaveLength(3)   // 你好 shared, deduped
  })

  it('resolves in Mei’s own voice with the taught word', () => {
    expect(STORY.resolution.line).toContain(FLASHCARD.hanzi)
  })
})

describe('completion copy', () => {
  it('claims discovery, never mastery', () => {
    const all = ENCOUNTER_DONE.title + ENCOUNTER_DONE.discovered + ENCOUNTER_DONE.line
    expect(ENCOUNTER_DONE.discovered).toContain('你好')
    expect(all.toLowerCase()).not.toContain('master')
    expect(all.toLowerCase()).not.toContain('fluent')
  })
})
