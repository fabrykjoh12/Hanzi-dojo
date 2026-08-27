// Lexical scaffold generation (FAB-9 A3, 2026-08-23).
//
// blueprint-resume-1 is the reason this stage exists. Given a structurally
// perfect plan and four named lexical violations, the planner reproduced the
// story exactly — problem, cast, six beats, chronology, causal chain, target
// placement, all preserved — and then wrote 重 (HSK 4) into the title and into
// a fresh sketch, and kept 深. Both words had just been named to it. One call
// cannot hold a story and a vocabulary at the same time.
//
// So the shape is finished and LOCKED before any Chinese exists, and the
// Chinese is asked for in the smallest pieces the pipeline can use:
//
//   title              → validate → one retry
//   per beat:
//     each target      → one sentence each → validate → one retry
//     the beat's words → validate → one retry
//
// Nothing is generated for beat N+1 until beat N's scaffold is valid, and no
// failure is ever repaired by relaxing a rule: a target that cannot be written
// twice is TARGET_SCAFFOLD_FAILED, a beat whose words cannot be written twice
// is BEAT_LEXICAL_SCAFFOLD_FAILED, and the story stops.
//
// The lexical stage may not touch the story. It writes exactly three kinds of
// thing — the Chinese title, each beat's anchors, each target's usage sketch —
// and applyScaffold rebuilds the plan from the ORIGINAL shape, so a lexical
// call that tries to move a beat or rename a character simply has no way to.
//
// Pure: providers injected, no network/fs/clock.

import { checkAnchor, checkUsageSketch, hasLatin } from './storyBlueprint.mjs'
import { analyzeStory } from './storyCorpusCalibration.mjs'
import { retrieveCandidates, stem } from './storyLexicalRetrieval.mjs'
import { classifySketch, repairBrief, checkRepairDrift } from './storySketchRepair.mjs'
import { glossSenses } from './storyLexicalRisk.mjs'

export const SCAFFOLD_VERSION = 'fab9-scaffold@6'

// A beat's toolkit needs three usable words and has never needed more than
// six. a3-final-2 threw away 后来、门口、女人、拿、不用 — five valid words — because
// 很重 was in the same list, and the retry came back with single characters.
// The bound has not moved; what changed is that the set is now judged word by
// word, and the invalid ones are simply dropped.
export const ANCHOR_BOUNDS = { min: 3, max: 6 }

// min 1, not 2. The published corpus already ships one-character titles — 岛
// ("island") and 疼 ("pain") — so the Reader and the card UI plainly render
// them, and no product or design document states a minimum. The 2 was an
// accidental validator assumption, and it cost the writer bakeoff an otherwise
// valid story titled 伞 ("umbrella"). Whether a one-character title is a GOOD
// title is a story-quality question for the judge, not a format rule.
export const TITLE_BOUNDS = { min: 1, max: 12 }

// The title is Chinese the reader has to read, so it obeys the story's own
// vocabulary rules — the same check validateBlueprint applies to a finished
// plan, available on its own so the title can be fixed before anything else
// is generated.
export function checkTitle(title, { manifest, vocabMap }) {
  const t = String(title == null ? '' : title).trim()
  const problems = []
  if (!t) return { ok: false, problems: ['no title'] }
  if (hasLatin(t)) problems.push('contains Latin text')
  const a = analyzeStory({ title: '', level: manifest.level, content: t }, vocabMap)
  const targets = new Set(manifest.targets.map(x => x.word))
  const above = [...a.counts.keys()].filter(w => !targets.has(w) && vocabMap[w] && vocabMap[w].level > manifest.level)
  // Length is the length of the TITLE. analyzeStory skips name tokens, because
  // a name is not vocabulary a learner has to know — but that makes cjkChars
  // the wrong number to measure a title by: writer-bake-4 rejected 李明和小红
  // with "1 characters", counting only 和. The bound is about how long the
  // title is, and it says so.
  const titleChars = [...t].filter(ch => /[\u4e00-\u9fff]/.test(ch)).length
  if (titleChars < TITLE_BOUNDS.min || titleChars > TITLE_BOUNDS.max) problems.push(titleChars + ' characters (need ' + TITLE_BOUNDS.min + '-' + TITLE_BOUNDS.max + ')')
  if (a.unknownRuns.length) problems.push('non-vocabulary text: ' + a.unknownRuns.join('、'))
  if (above.length) problems.push('above-level vocabulary: ' + above.map(w => w + ' (HSK ' + vocabMap[w].level + ')').join('、'))
  return { ok: problems.length === 0, problems }
}

// Rebuild the plan from the ORIGINAL shape plus the three lexical fields.
// Anything else a lexical call returned is discarded by construction.
// The words the plan has already frozen: the cast, and the vocabulary the
// story exists to teach. Nothing downstream may take one of these apart.
export function frozenTokens({ blueprint = null, manifest = null } = {}) {
  const out = new Set()
  for (const name of (blueprint && blueprint.cast) || []) if (String(name || '').trim()) out.add(String(name).trim())
  for (const name of (manifest && manifest.speakers) || []) if (String(name || '').trim()) out.add(String(name).trim())
  for (const t of (manifest && manifest.targets) || []) if (t && t.word) out.add(String(t.word).trim())
  return [...out]
}

// 李明 → 李 + 明, 女人 → 女 + 人. a3-final-2's retry answered a rejected anchor
// list by breaking the cast name and a target word into their characters,
// which is not a replacement for either — it is the same semantic item,
// dismantled. A proposed anchor that is a strict piece of a frozen token is
// therefore not a word choice at all, whatever the character means alone.
export function fragmentOf(word, frozen = []) {
  const w = String(word == null ? '' : word).trim()
  if (!w) return null
  for (const token of frozen) {
    if (w !== token && token.length > w.length && token.includes(w)) return token
  }
  return null
}

// Glosses that name a human being. This is a lexical-semantic category read
// off the canonical dataset, not a list of forbidden words: any entry whose
// gloss says it is a person counts, in any language track.
const PERSON_GLOSS = /\b(person|people|man|men|woman|women|boy|girl|child|children|kid|baby|father|dad|daddy|mother|mom|mum|parent|parents|brother|sister|son|daughter|grandfather|grandmother|grandpa|grandma|uncle|aunt|cousin|husband|wife|friend|neighbour|neighbor|teacher|student|classmate|pupil|doctor|nurse|driver|worker|boss|colleague|guest|customer|waiter|waitress|shopkeeper|clerk|stranger|owner|manager|nanny|maid)\b/i

// The planner's cast is closed, and a sketch is downstream of the plan: it may
// use the people the plan has, and it may not hire anyone. a3-final-2's
// 李明的爸爸是大男人 passed every vocabulary rule and quietly gave 李明 a father
// the story does not have. The target word itself is always allowed — that is
// the word being taught — and so are pronouns, which refer to whoever is
// already there.
const PRONOUNS = new Set(['我', '你', '您', '他', '她', '它', '我们', '你们', '他们', '她们', '大家', '自己'])

// An INDEFINITE reference is not a character. 别人 is glossed "other people;
// others; other person", which reads as a person to the check above and is
// nobody at all: 我需要别人的帮助 is what someone says when they need help, and
// a3-H-1 lost a plan to it. A3.2 has known this since its own FUNCTIONAL list —
// "someone" and "somebody" are grammar, not cast.
const INDEFINITE_GLOSS = /\b(other people|others|other person|someone|somebody|anyone|anybody|everyone|everybody|no one|nobody|people in general|else)\b/i

// A word names a person when a person IS one of its senses — not when a person
// happens to be mentioned inside one. 把 is HSK 3 "to hold; to grasp; to hold a
// baby in position for defecation; ...", and testing the whole gloss made the
// measure word in 一把伞 ("an umbrella") an uninvited character: writer-bake-2
// lost a realization to it. Same invariant the lexical bridges use — evidence
// stands on a sense, not on a token inside one.
const PERSON_SENSE_WORDS = 3
function denotesPerson(meaning) {
  for (const sense of glossSenses(meaning)) {
    if (INDEFINITE_GLOSS.test(sense.text)) continue
    // A short sense IS the person: "friend", "classmate", "fellow student",
    // "young lady". A long one only mentions one.
    if (sense.tokens.length > PERSON_SENSE_WORDS) continue
    if (PERSON_GLOSS.test(sense.text)) return true
  }
  return false
}

export function checkSketchCast(sketch, { word, beat = null, blueprint = null, manifest = null, vocabMap = {} } = {}) {
  const text = String(sketch == null ? '' : sketch).trim()
  if (!text) return { ok: false, problems: ['no sketch'] }
  const cast = new Set((blueprint && blueprint.cast) || [])
  // The people the FROZEN beat already has, read off its own English text.
  // 女人 is fair game in a beat about a woman and an invention in one without
  // her, and 邻居 belongs in a beat that is ABOUT being neighbours — a3-final-4
  // lost one on that, because the allowance was scoped to target words and
  // 邻居 is not a target. Presence in the plan is the test, not what kind of
  // word it is. Stems, because a beat says "neighbors" and a gloss says
  // "neighbor".
  const beatWords = new Set(
    (String((beat && beat.what) || '') + ' ' + String((beat && beat.because) || ''))
      .toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem))
  const inFrozenBeat = (w) => {
    const meaning = String((vocabMap[w] && vocabMap[w].meaning) || '').toLowerCase()
    return meaning.split(/[^a-z]+/).filter(t => t.length > 2).some(t => beatWords.has(stem(t)))
  }
  const analysis = analyzeStory({ title: '', level: (manifest && manifest.level) || 1, content: text }, vocabMap)
  const intruders = []
  for (const w of analysis.counts.keys()) {
    if (w === word || cast.has(w) || PRONOUNS.has(w)) continue
    if (inFrozenBeat(w)) continue
    const meaning = vocabMap[w] && vocabMap[w].meaning
    if (meaning && denotesPerson(meaning)) intruders.push(w)
  }
  if (intruders.length) {
    return {
      ok: false,
      intruders,
      problems: ['introduces ' + intruders.join('、') + ', who ' + (intruders.length > 1 ? 'are' : 'is')
        + ' not in this story. The people are: ' + [...cast].join('、')],
    }
  }
  return { ok: true, intruders: [], problems: [] }
}

export function applyScaffold(blueprint, scaffold) {
  const anchorsByBeat = new Map((scaffold.beats || []).map(b => [b.beat, b.anchors]))
  const sketchByWord = new Map()
  for (const b of (scaffold.beats || [])) for (const s of (b.sketches || [])) sketchByWord.set(s.word, s.usageSketch)
  return {
    ...blueprint,
    chineseTitle: scaffold.title,
    beats: blueprint.beats.map(b => ({ ...b, chineseLexicalAnchors: anchorsByBeat.get(b.id) || [] })),
    targetPlan: (blueprint.targetPlan || []).map(t => ({ ...t, usageSketch: sketchByWord.get(t.word) || '' })),
  }
}

// The shape is locked once structural validation passes. This is the proof,
// not a promise: every field the lexical stage is forbidden to touch is
// compared before and after.
const SHAPE_FIELDS = ['problem', 'incitingEvent', 'resolution', 'setting']
export function shapeChanges(before, after) {
  const changed = []
  for (const f of SHAPE_FIELDS) {
    if (String(before[f] || '') !== String(after[f] || '')) changed.push(f)
  }
  if (JSON.stringify(before.cast || []) !== JSON.stringify(after.cast || [])) changed.push('cast')
  if ((before.beats || []).length !== (after.beats || []).length) changed.push('beat count')
  // Leading semicolon: without it this line parses as a call on the result of
  // the push above, and every per-beat change goes unreported.
  ;(before.beats || []).forEach((b, i) => {
    const a = (after.beats || [])[i] || {}
    for (const f of ['id', 'when', 'where', 'what', 'because', 'arrivedHow']) {
      if (String(b[f] || '') !== String(a[f] || '')) changed.push('beat ' + b.id + '.' + f)
    }
    if (JSON.stringify(b.targets || []) !== JSON.stringify(a.targets || [])) changed.push('beat ' + b.id + '.targets')
  })
  const key = (p) => (p || []).map(t => t.word + '→' + t.beat).sort().join(',')
  if (key(before.targetPlan) !== key(after.targetPlan)) changed.push('target → beat assignment')
  return changed
}

// ── The sequential build ────────────────────────────────────────────────────
export async function buildLexicalScaffold({
  blueprint,
  manifest,
  vocabMap,
  meanings = {},
  pool = null,
  writer,
  buildTitlePrompt,
  parseTitle,
  buildSketchPrompt,
  parseSketch,
  buildAnchorsPrompt,
  parseAnchors,
  attempts = 2,               // one try plus one bounded retry, per piece
  maxTokens = 400,
  retrieve = retrieveCandidates,   // A3.1; injectable for specs
  resume = null,                   // { title, beats: [{beat, anchors, sketches}] }
} = {}) {
  const log = []
  const record = (entry) => { log.push(entry); return entry }
  const frozen = frozenTokens({ blueprint, manifest })

  // ── Title ────────────────────────────────────────────────────────────────
  // A resumed run keeps every piece a previous run already validated: the
  // point of resuming is to retry the ONE piece that failed, not to re-roll
  // work that passed.
  let title = (resume && resume.title) || null
  let feedback = null
  if (title) record({ piece: 'title', attempt: 0, output: title, ok: true, problems: [], reused: true })
  for (let a = 1; a <= attempts && !title; a += 1) {
    let out = null
    let error = null
    try {
      out = parseTitle(await writer.send({ kind: 'title', prompt: buildTitlePrompt({ manifest, blueprint, pool, feedback }), maxTokens }))
    } catch (err) { error = String((err && err.message) || err).slice(0, 160) }
    const check = out ? checkTitle(out, { manifest, vocabMap }) : { ok: false, problems: [error || 'no usable title in the response'] }
    record({ piece: 'title', attempt: a, output: out, ok: check.ok, problems: check.problems })
    if (check.ok) title = out
    else feedback = check.problems
  }
  if (!title) return { ok: false, code: 'TITLE_SCAFFOLD_FAILED', detail: 'no valid Chinese title in ' + attempts + ' attempts', log }

  // ── Beat by beat: targets first, then the beat's own words ───────────────
  const beats = []
  const done = new Map(((resume && resume.beats) || []).map(b => [b.beat, b]))
  for (const beat of blueprint.beats) {
    const entries = (blueprint.targetPlan || []).filter(t => Number(t.beat) === beat.id)
    const already = done.get(beat.id)
    if (already && already.anchors && already.anchors.length) {
      record({ piece: 'beat', beat: beat.id, attempt: 0, output: already.anchors, ok: true, problems: [], reused: true })
      beats.push(already)
      continue
    }
    const sketches = (already && already.sketches) || []
    for (const entry of entries) {
      if (sketches.some(s2 => s2.word === entry.word)) {
        record({ piece: 'sketch', beat: beat.id, word: entry.word, attempt: 0, output: sketches.find(s2 => s2.word === entry.word).usageSketch, ok: true, problems: [], reused: true })
        continue
      }
      let sketch = null
      let fb = null
      let brief = null            // set after a failed first attempt
      let firstAttempt = null
      for (let a = 1; a <= attempts && !sketch; a += 1) {
        let out = null
        let error = null
        try {
          out = parseSketch(await writer.send({
            kind: 'sketch',
            prompt: buildSketchPrompt({ manifest, word: entry.word, meaning: meanings[entry.word] || null, beat, entry, pool, feedback: fb, repair: brief }),
            maxTokens,
          }))
        } catch (err) { error = String((err && err.message) || err).slice(0, 160) }
        const lexical = out
          ? checkUsageSketch(out, { word: entry.word, manifest, vocabMap })
          : { ok: false, problems: [error || 'no usable sentence in the response'] }
        // The closed cast survives into the lexical stage: a sketch may use
        // the people the plan has and may not introduce another one.
        const castCheck = out && lexical.ok
          ? checkSketchCast(out, { word: entry.word, beat, blueprint, manifest, vocabMap })
          : { ok: true, problems: [] }
        // A repair is judged against the sentence it repairs, so a second
        // attempt cannot quietly become a different sentence.
        const drift = out && lexical.ok && castCheck.ok && brief
          ? checkRepairDrift(firstAttempt, out, { word: entry.word, manifest, vocabMap, brief })
          : { ok: true, problems: [] }
        const check = {
          ok: lexical.ok && castCheck.ok && drift.ok,
          problems: [...lexical.problems, ...castCheck.problems, ...drift.problems],
        }
        record({ piece: 'sketch', beat: beat.id, word: entry.word, attempt: a, output: out, ok: check.ok, problems: check.problems, repair: brief })
        if (check.ok) sketch = out
        else {
          fb = check.problems
          // Everything the next attempt needs to repair rather than rewrite:
          // its own sentence, the exact tokens that failed, the canonical
          // in-level words each one is a piece of, and which details are
          // decoration the beat can lose.
          if (out && !brief) {
            firstAttempt = out
            brief = repairBrief(classifySketch(out, {
              word: entry.word, blueprint, manifest, vocabMap, problems: check.problems,
              // A cast violation is not a lexical one, and without this the
              // retry got a brief with nothing in it and returned the same
              // sentence.
              intruders: castCheck.intruders || [],
              candidates: (retrieve({ manifest, vocabMap, beat, entries: [entry], avoid: [] }).candidates || []),
            }))
          }
        }
      }
      if (!sketch) {
        return {
          ok: false,
          code: 'TARGET_SCAFFOLD_FAILED',
          detail: entry.word + ' (beat ' + beat.id + ') could not be written in ' + attempts + ' attempts',
          failedAt: { beat: beat.id, word: entry.word },
          log,
        }
      }
      sketches.push({ word: entry.word, usageSketch: sketch })
    }

    let anchors = null
    let fb = null
    let rejectedWords = []
    for (let a = 1; a <= attempts && !anchors; a += 1) {
      // A3.1: rank the reader's own vocabulary against this beat's English
      // metadata. On a retry the rejected words join the query through their
      // glosses, so the search leans toward the slot that failed — without
      // anyone writing down what should replace what.
      const retrieved = retrieve({ manifest, vocabMap, beat, entries, avoid: rejectedWords, exclude: sketches.flatMap(s2 => []) })
      let out = null
      let error = null
      try {
        out = parseAnchors(await writer.send({
          kind: 'anchors',
          prompt: buildAnchorsPrompt({ manifest, beat, sketches, pool, candidates: retrieved.candidates, feedback: fb }),
          maxTokens,
        }))
      } catch (err) { error = String((err && err.message) || err).slice(0, 160) }
      // Word by word, not all or nothing: an invalid anchor is dropped and
      // the rest of the set stands, because the beat needs three usable words
      // and never needed this particular one.
      const problems = []
      const kept = []
      const dropped = []
      for (const w of (out || [])) {
        if (kept.includes(w)) continue
        const fragment = fragmentOf(w, frozen)
        const c = fragment
          ? { ok: false, reason: 'a piece of ' + fragment + ', not a word of its own' }
          : checkAnchor(w, { manifest, vocabMap, cast: blueprint.cast || [] })
        if (c.ok) kept.push(w)
        else dropped.push({ word: w, reason: c.reason })
      }
      const usable = kept.slice(0, ANCHOR_BOUNDS.max)
      if (!out) problems.push(error || 'no usable word list in the response')
      else if (usable.length < ANCHOR_BOUNDS.min) {
        problems.push('only ' + usable.length + ' usable word(s) — '
          + dropped.map(d => '"' + d.word + '": ' + d.reason).join('; '))
      }
      record({
        piece: 'anchors', beat: beat.id, attempt: a, output: out, kept: usable, dropped,
        ok: problems.length === 0, problems,
        retrieval: { query: retrieved.query.text, tokens: retrieved.query.tokens, candidates: retrieved.candidates },
      })
      if (!problems.length) anchors = usable
      else {
        fb = problems
        // The words the gate actually refused, for the next query.
        rejectedWords = [...new Set([...rejectedWords, ...dropped.map(d => d.word)])]
      }
    }
    if (!anchors) {
      return {
        ok: false,
        code: 'BEAT_LEXICAL_SCAFFOLD_FAILED',
        detail: 'beat ' + beat.id + ' has no writable vocabulary after ' + attempts + ' attempts',
        failedAt: { beat: beat.id },
        log,
      }
    }
    beats.push({ beat: beat.id, anchors, sketches })
  }

  return { ok: true, code: null, title, beats, log }
}
