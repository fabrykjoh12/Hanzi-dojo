// Target-bundle selection (FAB-9, 2026-08-26).
//
// Four stored plans have now been through placement viability and every one
// failed on at least one of 男人, 女人, 关系 — for the same reason each time:
// the word had no communicative role in the story it was put in, so the only
// sentence available was a label on a character the reader already knows.
//
// That is not the writer failing, and not the planner failing. It is the
// manifest asking for five specific words at once and leaving the planner to
// invent a reason for each. So the choice of WHICH words a story must teach
// moves upstream of planning, and becomes a decision with its own evidence:
//
//   REQUIRED     a plausible natural role, and they cohere as ONE story
//   OPPORTUNITY  worth reinforcing if they fit; omitting them fails nothing
//   DEFERRED     no compatible narrative context right now — later, not never
//
// Two things this must not do. It must not blacklist a word: 男人 and 女人 are
// fine when they introduce or distinguish an unknown referent, and 关系 is fine
// when the relationship is what the story is about. And it must not chase
// density: a natural story teaching three words beats a contrived one teaching
// eight, because reinforcement is spread across a SEQUENCE of stories.
//
// Pure: prompt in, verdicts out, selection deterministic. The provider and the
// debt store are supplied by the harness.

import { renderSenses } from './storyWordSenses.mjs'

export const BUNDLE_VERSION = 'fab9-bundle@3'

export const BUNDLE = { REQUIRED: 'REQUIRED', OPPORTUNITY: 'OPPORTUNITY', DEFERRED: 'DEFERRED' }

// Provisional and configurable, like the assisted-vocabulary policy.
export const BUNDLE_POLICY = {
  version: 'fab9-bundle-policy@1',
  requiredMin: 2,
  requiredMax: 4,
  opportunityMax: 3,
  // A word deferred this many times outranks a fresher one as soon as a
  // compatible context appears, so difficult words are not quietly starved.
  deferralsBeforePriority: 2,
}

const text = (v) => String(v == null ? '' : v).trim()

// The judgement. Deliberately asks two different questions — one about each
// word alone, one about the set — because a bundle of individually storyable
// words can still be a bad bundle when each needs its own subplot.
export function bundlePrompt({ pool, levelName, meanings = {}, senses = null, policy = BUNDLE_POLICY }) {
  // Every sense the dataset has, the part of speech where it has one, the
  // row's example, and how the word is actually used in published stories.
  // Judging 被 on the first gloss alone deferred the passive marker every HSK 3
  // learner meets as though it were a quilt.
  const byWord = new Map((senses || []).map(e => [e.word, e]))
  const rows = pool.map(p => {
    const e = byWord.get(p.word)
    const head = e ? renderSenses(e) : '  ' + p.word + (meanings[p.word] ? ' (' + meanings[p.word] + ')' : '')
    return head + (p.timesDeferred ? '\n      [deferred ' + p.timesDeferred + '× already]' : '')
  }).join('\n')
  return 'You are choosing which words a single short ' + levelName + ' story should teach.\n\n'
    + 'CANDIDATE WORDS:\n' + rows + '\n\n'
    + 'Answer TWO questions.\n\n'
    + 'Judge each word by the sense and the ROLE it actually has for a learner at this level, not by whichever English gloss is listed first. '
    + 'A word that stands between a noun and a verb in real usage is grammatical machinery, however its noun sense reads.\n\n'
    + '1. For each word alone: could an everyday story at this level give it a real reason to be said — '
    + 'someone identifying an unknown person or thing, telling two possibilities apart, saying something that matters to what happens, '
    + 'or a relationship that is actually what the story is about?\n'
    + '   It has NO role when the only way to use it is to relabel a character the reader already knows by name, '
    + 'to describe someone for no reason, to state a category that is already obvious, or to write a sentence whose only purpose is to contain the word.\n\n'
    + '2. For the words that do have a role: which of them fit in ONE story together, without inventing a separate subplot for each?\n'
    + '   Choose ' + policy.requiredMin + '-' + policy.requiredMax + ' words that share one ordinary situation. '
    + 'A natural story teaching three words is better than a contrived one teaching eight — the rest will come back in a later story.\n\n'
    // Bundle-1 read three abstract glosses — if / need / think — and answered
    // "A friend asking for advice on a conditional life choice, such as whether
    // to accept a new job." That sentence became manifest.theme verbatim, and
    // all six plans it produced were job-offer deliberations that no HSK 3
    // vocabulary could carry. The words were never the problem: 如果/需要/认为
    // cost nothing. The situation cost 21 before a beat was planned, because
    // advice, conditional, choice and job are not sayable at this level.
    //
    // So the situation is asked for as something a reader could SEE, and its
    // own words are scored by the same lexical gate the story is (see
    // storyPremiseRisk.mjs). Grammar words describe how people talk about a
    // scene; they never require the scene itself to be abstract.
    + 'THE SITUATION MUST BE CONCRETE, and it must be sayable with the words a '
    + levelName + ' learner has.\n'
    + '   Write something a reader could SEE happening: an object, a place, a small everyday problem between two people. '
    + 'Rain and no umbrella. A broken bicycle. A lost key. A cat that will not come down.\n'
    + '   Grammatical and mental words (if, need, think, should, seem) are how people TALK about an ordinary scene — '
    + 'they do not make the scene itself abstract. Do not answer with a topic like advice, a choice, a decision, options, a plan, '
    + 'an opportunity or a situation: those are English summaries of a scene, not a scene, and none of them can be said at this level.\n'
    + '   Do NOT name an example to illustrate it — write the one situation you actually mean.\n'
    + '   Use ordinary concrete words. If you cannot say what physically happens, choose different words for the bundle.\n\n'
    + 'Output exactly this, and nothing else:\n'
    + '<word>: ROLE or NO_ROLE | <the role it would play, or why it has none> \n'
    + '(one line per candidate word, then)\n'
    + 'BUNDLE: <the words that belong in one story together, comma separated>\n'
    + 'SITUATION: <one concrete everyday scene, one sentence of ENGLISH, no example>'
}

export function parseBundleJudgment(out, words = []) {
  const wanted = new Set(words)
  const roles = []
  let bundle = null
  let situation = ''
  for (const raw of String(out || '').split('\n')) {
    const line = raw.trim().replace(/^[-*•\d.\s]+/, '')
    if (!line) continue
    const ci = line.indexOf(':') >= 0 ? line.indexOf(':') : line.indexOf('：')
    if (ci <= 0) continue
    const head = line.slice(0, ci).replace(/[*_`\s]/g, '').trim()
    const body = line.slice(ci + 1).trim()
    if (/^bundle$/i.test(head)) {
      bundle = body.split(/[,、，]/).map(w => w.replace(/[*_`\s]/g, '').trim()).filter(w => wanted.has(w))
      continue
    }
    if (/^situation$/i.test(head)) { situation = body; continue }
    if (!wanted.has(head) || roles.some(r => r.word === head)) continue
    const verdictText = body.split('|')[0] || ''
    if (!/\b(role|no_role|none)\b/i.test(verdictText)) continue
    roles.push({
      word: head,
      hasRole: !/\b(no_role|none)\b/i.test(verdictText),
      reason: body.split('|').slice(1).join('|').trim(),
    })
  }
  return roles.length ? { roles, bundle, situation } : null
}

// How badly a word wants to be in a story, before any judgement about whether
// it can be. Deferral debt dominates: a word put off twice outranks a fresher
// one the moment a context exists for it.
export function reinforcementPriority(entry, policy = BUNDLE_POLICY) {
  const deferred = Number(entry && entry.timesDeferred) || 0
  const weakness = Number(entry && entry.weakness) || 0    // FSRS, when the app supplies it
  const pending = Number(entry && entry.pendingExposures) || 0
  return (deferred >= policy.deferralsBeforePriority ? 1000 : 0) + deferred * 100 + weakness * 10 + pending
}

// The selection itself is deterministic given the judgement: the model says
// what has a role and what coheres, and code decides who gets in.
export function selectBundle(judgement, { pool, policy = BUNDLE_POLICY } = {}) {
  const p = { ...BUNDLE_POLICY, ...(policy || {}) }
  const byWord = new Map((pool || []).map(e => [e.word, e]))
  const roles = new Map(((judgement && judgement.roles) || []).map(r => [r.word, r]))
  const proposed = new Set((judgement && judgement.bundle) || [])

  const rows = (pool || []).map(e => {
    const r = roles.get(e.word)
    return {
      word: e.word,
      hasRole: Boolean(r && r.hasRole),
      reason: r ? r.reason : 'no verdict was returned for this word',
      judged: Boolean(r),
      priority: reinforcementPriority(e, p),
      timesDeferred: Number(e.timesDeferred) || 0,
    }
  })

  // A word with no role — or no verdict at all — waits for a story it belongs
  // in. That is deferral, not rejection.
  const storyable = rows.filter(r => r.hasRole)
  const deferred = rows.filter(r => !r.hasRole)

  // The model's compatible set, ordered by how badly each word needs the slot;
  // anything it left out but judged storyable is an opportunity.
  const inBundle = storyable.filter(r => proposed.has(r.word)).sort((a, b) => b.priority - a.priority)
  const rest = storyable.filter(r => !proposed.has(r.word)).sort((a, b) => b.priority - a.priority)

  const required = inBundle.slice(0, p.requiredMax)
  // A judgement that never stated a BUNDLE is not a judgement. bundle-concrete-1
  // was truncated after the per-word verdicts, and topping up from nothing
  // produced a confident-looking selection of 被 (the known content defect) and
  // 中 — words the model was never asked whether they cohere. Question 2 is the
  // whole point of this stage; without an answer to it there is no selection.
  const stated = Boolean(judgement && judgement.bundle)
  // Only top up from words the model did NOT put in one story if the bundle is
  // too small to be worth writing — and say so, because that is a compromise.
  const toppedUp = []
  while (stated && required.length < p.requiredMin && rest.length) {
    const next = rest.shift()
    toppedUp.push(next.word)
    required.push(next)
  }
  // No stated bundle means no opportunity either: an opportunity is a word the
  // model judged storyable AND left out of a bundle it actually proposed.
  const opportunity = stated ? [...inBundle.slice(p.requiredMax), ...rest].slice(0, p.opportunityMax) : []
  const opportunityWords = new Set(opportunity.map(r => r.word))

  const disposition = rows.map(r => ({
    ...r,
    bundle: required.some(x => x.word === r.word)
      ? BUNDLE.REQUIRED
      : (opportunityWords.has(r.word) ? BUNDLE.OPPORTUNITY : BUNDLE.DEFERRED),
  }))

  return {
    version: BUNDLE_VERSION,
    policy: p,
    situation: (judgement && judgement.situation) || '',
    required: required.map(r => r.word),
    opportunity: opportunity.map(r => r.word),
    deferred: disposition.filter(d => d.bundle === BUNDLE.DEFERRED).map(d => d.word),
    toppedUp,
    stated,
    enough: stated && required.length >= p.requiredMin,
    incomplete: stated ? null : 'the judgement never stated a BUNDLE — nothing was selected',
    rows: disposition,
  }
}

// ── Reinforcement debt ──────────────────────────────────────────────────────
// Deferral is a promise to come back, and a promise nobody records is a word
// quietly dropped. The store is a plain map so the harness can persist it as
// JSON; `weakness` is left for the app side, which is the only place that
// knows a learner's FSRS state.
export function applyDeferral(debt, selection, { at = null } = {}) {
  const next = { ...(debt || {}) }
  for (const row of selection.rows) {
    const prev = next[row.word] || { timesDeferred: 0, lastDeferredAt: null, lastSelectedAt: null, lastContextualExposure: null }
    if (row.bundle === BUNDLE.DEFERRED) {
      next[row.word] = { ...prev, timesDeferred: (prev.timesDeferred || 0) + 1, lastDeferredAt: at }
    } else {
      next[row.word] = {
        ...prev,
        timesDeferred: 0,
        lastSelectedAt: at,
        lastContextualExposure: row.bundle === BUNDLE.REQUIRED ? at : prev.lastContextualExposure,
      }
    }
  }
  return next
}

// The pool the judgement sees, carrying whatever reinforcement signal exists.
export function buildPool(words, debt = {}, { signals = {} } = {}) {
  return (words || []).map(w => {
    const word = typeof w === 'string' ? w : text(w.word)
    const d = debt[word] || {}
    const s = signals[word] || {}
    return {
      word,
      timesDeferred: Number(d.timesDeferred) || 0,
      lastDeferredAt: d.lastDeferredAt || null,
      lastContextualExposure: d.lastContextualExposure || null,
      weakness: Number(s.weakness) || 0,
      pendingExposures: Number((typeof w === 'object' && w.pending) || s.pendingExposures) || 0,
    }
  })
}
