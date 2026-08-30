// Content-integrity debt: a baseline that may shrink but never grow (FAB-9,
// 2026-08-27).
//
// 142 of 204 published stories contain at least one Mandarin token the Reader
// cannot resolve — 652 occurrences in all. That is real learner-facing debt and
// it cannot be fixed today, so requiring zero would only mean turning the check
// off. Instead the debt is written down, and the invariant is directional:
//
//   existing debt may DECREASE freely, and no new debt may appear.
//
// A story that is repaired passes without anyone touching the baseline; a story
// that gains a new untappable token fails, and so does a brand-new story with
// any at all. Updating the baseline is an explicit reviewed action
// (check-content-integrity.mjs --update-baseline), never something CI does for
// itself — a check that rewrites its own expectations checks nothing.
//
// Keyed by (story, lexical form). Deliberately NOT by line number: editing one
// line of a story would otherwise invalidate every entry below it and drown the
// signal in noise.
//
// Pure: no network, no fs, no clock. The corpus is passed in.

import { publishable, DEFECT } from './storyVocabAudit.mjs'

export const DEBT_VERSION = 'fab9-content-debt@1'

// The three inventories this work depends on. They are different things and
// were being conflated, so they are named once, here, and reconciled by
// reconcileInventory() below.
//
//   learnerFacingRows   what the DATABASE has and the app loads today
//                       (chinese, is_active, level 1-6). 4,995.
//   intendedCurriculum  what the UPSTREAM HSK 3.0 word list says the course
//                       contains at bands 1-6. 5,181.
//   missingCurriculumRows  intended minus present. 192 — words the course
//                       lists that no database row carries.
//
// 4,995 is NOT the curriculum denominator. It is the current DB inventory, and
// the upstream proves it is short by 192 rows.
export function reconcileInventory({ vocabMap = {}, curriculum = new Set() } = {}) {
  const present = new Set(Object.keys(vocabMap))
  const intended = curriculum
  const intendedAndPresent = [...intended].filter(w => present.has(w))
  const missing = [...intended].filter(w => !present.has(w)).sort()
  const extra = [...present].filter(w => !intended.has(w)).sort()
  return {
    learnerFacingRows: present.size,
    intendedCurriculum: intended.size,
    intendedAndPresent: intendedAndPresent.length,
    missingCurriculumRows: missing.length,
    presentButNotIntended: extra.length,
    missing,
    extra,
    // Both identities must hold, or one of the two inventories is being
    // miscounted and nothing downstream of it can be trusted.
    reconciles: intended.size === intendedAndPresent.length + missing.length
      && present.size === intendedAndPresent.length + extra.length,
  }
}

/** A stable key for one story's one offending form. */
export function debtKey(storyKey, form) {
  return String(storyKey) + ' ' + String(form)
}

/**
 * The debt inventory for a corpus, computed through the real Reader path.
 * `storyKey` is whatever stably identifies a story across edits — its id.
 */
export function collectDebt({ stories = [], vocabMap = {}, language = 'chinese', curriculum = null } = {}) {
  const entries = []
  const storyIds = []
  for (const story of stories) {
    const key = story.id != null ? String(story.id) : String(story.title || '')
    storyIds.push(key)
    const r = publishable(story, { vocabMap, language, curriculum })
    for (const o of r.offenders) {
      entries.push({
        story: key,
        title: story.title || null,
        level: story.level == null ? null : story.level,
        form: o.run,
        defect: o.defect,
        occurrences: o.occurrences,
      })
    }
  }
  entries.sort((a, b) => (a.story < b.story ? -1 : a.story > b.story ? 1 : (a.form < b.form ? -1 : 1)))
  return {
    version: DEBT_VERSION,
    stories: stories.length,
    storyIds,
    storiesWithDebt: new Set(entries.map(e => e.story)).size,
    forms: new Set(entries.map(e => e.form)).size,
    occurrences: entries.reduce((n, e) => n + e.occurrences, 0),
    entries,
  }
}

/**
 * Compare a fresh inventory against the accepted baseline.
 *
 *   added     — a (story, form) pair the baseline does not have. ALWAYS a
 *               failure: a new story with an unresolved token, or an edit that
 *               introduced one.
 *   worsened  — a known pair that now occurs MORE often. A failure.
 *   improved  — fewer occurrences. Fine, and needs no baseline edit.
 *   resolved  — gone entirely. Fine, and needs no baseline edit.
 *   stale     — in the baseline but the story no longer exists. Reported so the
 *               baseline can be pruned deliberately; never a failure.
 */
export function compareToBaseline(current, baseline) {
  const base = new Map((baseline && baseline.entries ? baseline.entries : [])
    .map(e => [debtKey(e.story, e.form), e]))
  const now = new Map((current && current.entries ? current.entries : [])
    .map(e => [debtKey(e.story, e.form), e]))
  const currentStoryIds = current && current.storyIds ? new Set(current.storyIds.map(String)) : null

  const added = []
  const worsened = []
  const improved = []
  for (const [k, e] of now) {
    const was = base.get(k)
    if (!was) { added.push(e); continue }
    if (e.occurrences > was.occurrences) worsened.push({ ...e, was: was.occurrences })
    else if (e.occurrences < was.occurrences) improved.push({ ...e, was: was.occurrences })
  }
  const resolved = []
  const stale = []
  for (const [k, e] of base) {
    if (now.has(k)) continue
    // A baseline entry for a story that no longer exists is stale, not
    // resolved. Different things, reported separately, neither a failure.
    if (currentStoryIds && !currentStoryIds.has(String(e.story))) stale.push(e)
    else resolved.push(e)
  }
  return {
    version: DEBT_VERSION,
    ok: added.length === 0 && worsened.length === 0,
    added,
    worsened,
    improved,
    resolved,
    stale,
    delta: {
      occurrences: (current ? current.occurrences : 0) - ((baseline && baseline.occurrences) || 0),
      forms: (current ? current.forms : 0) - ((baseline && baseline.forms) || 0),
    },
  }
}

/** A human-readable verdict for the console and the CI log. */
export function formatDebtComparison(cmp) {
  const lines = []
  if (cmp.ok) {
    lines.push('content integrity OK — no new untappable text')
  } else {
    lines.push('CONTENT INTEGRITY REGRESSION')
    for (const e of cmp.added) {
      lines.push('  NEW   ' + e.form + ' x' + e.occurrences + '  in "' + (e.title || e.story) + '"  [' + e.defect + ']')
    }
    for (const e of cmp.worsened) {
      lines.push('  MORE  ' + e.form + ' x' + e.occurrences + ' (was ' + e.was + ')  in "' + (e.title || e.story) + '"')
    }
    lines.push('')
    lines.push('Every learner-facing Mandarin token must resolve through the Reader own')
    lines.push('segmentation and vocabulary lookup, or be a recognised character name.')
    lines.push('If this debt is deliberate, update the baseline explicitly and say why.')
  }
  const progress = []
  if (cmp.improved.length) progress.push(cmp.improved.length + ' improved')
  if (cmp.resolved.length) progress.push(cmp.resolved.length + ' resolved')
  if (cmp.stale.length) progress.push(cmp.stale.length + ' stale (story gone)')
  if (progress.length) lines.push('  ' + progress.join(', '))
  return lines.join('\n')
}

// Where each class has to be repaired. MORPHEME_OF_COMPOUND is STORY-REWRITE
// and not a vocabulary decision on purpose: the course does not teach the
// standalone character, and the compound containing it is not evidence that it
// should. Adding a row to silence the check would be the synonym-bridge mistake
// with characters instead of glosses.
export const REPAIRABILITY = {
  [DEFECT.CURRICULUM_ROW_MISSING]: 'AUTO-SAFE',
  [DEFECT.SEGMENTATION]: 'AUTO-SAFE',
  [DEFECT.CANON_ENTITY]: 'AUTO-SAFE',
  [DEFECT.MORPHEME_OF_COMPOUND]: 'STORY-REWRITE',
  [DEFECT.OUT_OF_CURRICULUM]: 'STORY-REWRITE',
}

export function repairMatrix(inventory) {
  const by = new Map()
  for (const e of (inventory.entries || [])) {
    if (!by.has(e.defect)) by.set(e.defect, { defect: e.defect, forms: new Set(), occurrences: 0, stories: new Set() })
    const g = by.get(e.defect)
    g.forms.add(e.form)
    g.occurrences += e.occurrences
    g.stories.add(e.story)
  }
  return [...by.values()].map(g => ({
    defect: g.defect,
    repairability: REPAIRABILITY[g.defect] || 'SOURCE-DECISION',
    forms: g.forms.size,
    occurrences: g.occurrences,
    stories: g.stories.size,
  })).sort((a, b) => b.occurrences - a.occurrences)
}
