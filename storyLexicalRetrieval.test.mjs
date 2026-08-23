import { describe, it, expect } from 'vitest'
import { retrieveCandidates, buildQuery, tokenize, stem, RETRIEVAL_VERSION } from './storyLexicalRetrieval.mjs'
import { buildLexicalScaffold } from './storyLexicalScaffold.mjs'
import { beatAnchorsPrompt, parseAnchors, titlePrompt, parseTitle, targetSketchPrompt, parseSketch } from './storyGenPrompts.mjs'
import { buildManifest } from './storyManifestPlanner.mjs'

// Real glosses, as the vocabulary dataset actually stores them.
const VOCAB = [
  ['晚上', 1, 'evening'], ['晚', 1, 'late'], ['天', 1, 'day'], ['时间', 1, 'time'],
  ['看', 1, 'to see, to look'], ['说', 1, 'to speak, to say'], ['书', 1, 'book'],
  ['下午', 1, 'afternoon'], ['朋友', 1, 'friend'], ['车', 1, 'vehicle, car'],
  ['一起', 2, 'together'], ['坏', 2, 'bad, broken'], ['走', 2, 'to walk'],
  ['帮助', 3, 'assistance; aid; to help; to assist'], ['关系', 3, 'relation; relationship'],
  ['担心', 3, 'anxious; worried'], ['自行车', 3, 'bicycle; bike'], ['邻居', 3, 'neighbor; next door'],
  ['黑', 5, 'black; dark'], ['亮', 4, 'bright; light'], ['修理', 4, 'to repair'],
  // the particles and pronouns any sketch needs
  ['我', 1, 'I, me'], ['你', 1, 'you'], ['可以', 2, 'can, may'], ['的', 1, 'of'], ['了', 1, 'particle'],
]
const vocabMap = Object.fromEntries(VOCAB.map(([word, level, meaning]) => [word, { word, level, meaning }]))
const manifest = () => buildManifest({ batchId: 'r', seq: 1, level: 3, targets: ['关系', '帮助'], defaults: { lines: [14, 38] } })

const beat = {
  id: 4, when: 'Saturday, 4:25 PM', where: 'The street corner',
  what: 'Xiao Ming needs help because it is getting dark. They look at the bike together.',
  because: 'he cannot fix it alone',
}

describe('retrieveCandidates — the reader\'s own words, ranked by the beat\'s English', () => {
  it('finds the words that answer the beat, best first, with the match explained', () => {
    const r = retrieveCandidates({ beat, manifest: manifest(), vocabMap })
    const words = r.candidates.map(c => c.word)
    expect(words).toContain('看')       // "look"
    expect(words).toContain('一起')     // "together"
    expect(r.candidates.find(c => c.word === '看').matched).toContain('look')
    expect(r.candidates[0].score).toBeGreaterThanOrEqual(r.candidates[r.candidates.length - 1].score)
    expect(r.version).toBe(RETRIEVAL_VERSION)
  })

  it('never suggests a word the reader cannot have — retrieval cannot widen the gate', () => {
    const dark = { ...beat, what: 'It is getting dark and the light is bad. They repair the bike.' }
    const r = retrieveCandidates({ beat: dark, manifest: manifest(), vocabMap })
    for (const c of r.candidates) expect(c.level).toBeLessThanOrEqual(3)
    expect(r.candidates.map(c => c.word)).not.toContain('黑')      // HSK 5, however well it matches
    expect(r.candidates.map(c => c.word)).not.toContain('亮')      // HSK 4
    expect(r.candidates.map(c => c.word)).not.toContain('修理')    // HSK 4
  })

  it('a rejected word joins the query through its own gloss, not through a lookup table', () => {
    const q = buildQuery({ beat, entries: [], avoidGlosses: ['black; dark'] })
    expect(q.tokens).toContain('black')
    // and the rejected word itself is never suggested back
    const r = retrieveCandidates({ beat, manifest: manifest(), vocabMap, avoid: ['黑'] })
    expect(r.candidates.map(c => c.word)).not.toContain('黑')
  })

  it('prefers the simpler word when two are equally relevant, and never pads to a quota', () => {
    const r = retrieveCandidates({ beat: { what: 'they talk about the day' }, manifest: manifest(), vocabMap })
    expect(r.candidates.every(c => c.score > 0)).toBe(true)         // nothing irrelevant is added
    const empty = retrieveCandidates({ beat: { what: 'zzzz qqqq' }, manifest: manifest(), vocabMap })
    expect(empty.candidates).toEqual([])                           // an honest empty answer
  })

  it('excludes the story\'s target words — they are already given to the writer', () => {
    const r = retrieveCandidates({ beat: { what: 'he asks for help and their relationship improves' }, manifest: manifest(), vocabMap })
    expect(r.candidates.map(c => c.word)).not.toContain('帮助')
    expect(r.candidates.map(c => c.word)).not.toContain('关系')
  })

  it('tokenize and stem stay simple and auditable', () => {
    expect(tokenize('He is looking, quickly!')).toEqual(['looking', 'quickly'])
    expect(stem('looking')).toBe('look')
    expect(stem('helps')).toBe('help')
    expect(stem('studies')).toBe('study')
    expect(stem('bus')).toBe('bus')
  })
})

describe('the anchor prompt carries the candidates as suggestions', () => {
  it('lists them with glosses and says they are not a closed list', () => {
    const r = retrieveCandidates({ beat, manifest: manifest(), vocabMap })
    const p = beatAnchorsPrompt({ manifest: manifest(), beat, candidates: r.candidates })
    expect(p).toContain('ALLOWED RELEVANT VOCABULARY')
    expect(p).toContain('看 — to see, to look')
    expect(p).toContain('suggestions, not a closed list')
    // without candidates the section simply is not there
    expect(beatAnchorsPrompt({ manifest: manifest(), beat })).not.toContain('ALLOWED RELEVANT VOCABULARY')
  })
})

describe('the scaffold uses retrieval, and records what it retrieved', () => {
  const shape = {
    cast: ['李明', '小红'],
    beats: [beat],
    targetPlan: [{ word: '帮助', beat: 4, speaker: '李明', refersTo: 'the bike', intent: 'offer to help' }],
  }
  const gen = (replies) => { const seen = []; return { name: 'W', seen, send: async ({ prompt, kind }) => { seen.push({ prompt, kind }); return replies.shift() } } }
  const J = (o) => JSON.stringify(o)
  const run = (writer, over = {}) => buildLexicalScaffold({
    blueprint: shape, manifest: manifest(), vocabMap, writer,
    buildTitlePrompt: titlePrompt, parseTitle,
    buildSketchPrompt: targetSketchPrompt, parseSketch,
    buildAnchorsPrompt: beatAnchorsPrompt, parseAnchors,
    ...over,
  })

  it('the candidate list reaches the model and is stored with the attempt', async () => {
    const writer = gen([J({ title: '坏了的车' }), J({ sentence: '我可以帮助你。' }), J({ anchors: ['看', '一起', '走'] })])
    const r = await run(writer)
    expect(r.ok).toBe(true)
    const anchorsCall = writer.seen.find(s => s.kind === 'anchors')
    expect(anchorsCall.prompt).toContain('ALLOWED RELEVANT VOCABULARY')
    const entry = r.log.find(l => l.piece === 'anchors')
    expect(entry.retrieval.candidates.length).toBeGreaterThan(0)
    expect(entry.retrieval.tokens).toContain('look')
  })

  it('a retry re-runs retrieval with the refused words folded in', async () => {
    const writer = gen([
      J({ title: '坏了的车' }),
      J({ sentence: '我可以帮助你。' }),
      J({ anchors: ['黑', '看', '一起'] }),        // 黑 is HSK 5
      J({ anchors: ['晚上', '看', '一起'] }),
    ])
    const r = await run(writer)
    expect(r.ok).toBe(true)
    const tries = r.log.filter(l => l.piece === 'anchors')
    expect(tries.length).toBe(2)
    expect(tries[0].problems.join(' ')).toContain('黑')
    // the retry's query carries 黑's own gloss, and 黑 is not suggested back
    expect(tries[1].retrieval.tokens).toContain('black')
    expect(tries[1].retrieval.candidates.map(c => c.word)).not.toContain('黑')
    expect(r.beats[0].anchors).toEqual(['晚上', '看', '一起'])
  })

  it('a resumed run keeps accepted pieces and retries only what failed', async () => {
    const writer = gen([J({ anchors: ['看', '一起', '走'] })])
    const r = await run(writer, {
      resume: { title: '坏了的车', beats: [{ beat: 4, anchors: [], sketches: [{ word: '帮助', usageSketch: '我可以帮助你。' }] }] },
    })
    expect(r.ok).toBe(true)
    expect(r.title).toBe('坏了的车')
    expect(writer.seen.map(s => s.kind)).toEqual(['anchors'])      // no title, no sketch call
    expect(r.log.filter(l => l.reused).length).toBe(2)             // title and the sketch
  })
})
