# Vocabulary ingestion — the `forms[0]` incident, and the architecture that replaces it

**Status: diagnosis and design only.** Nothing in this document has been
implemented. No vocabulary row has been added, changed or reseeded, and no
`source_id` has been backfilled. The measurement and prevention layer shipped
first, deliberately, so that a reseed can be verified rather than trusted.

---

## 1. What happened

`src/hskBuild.js` turns one upstream dataset entry into one seed row:

```js
const form = (entry?.forms || [])[0]
const reading = (form?.transcriptions?.pinyin || '').trim()
const meaning = cleanHskMeaning(form?.meanings)   // first TWO senses
if (!word || !reading || !meaning) return null
if (isDegenerateMeaning(meaning)) return null      // surname / "variant of" / "see"
```

The upstream stores **one form per reading/sense group**. `forms[0]` is
therefore an arbitrary choice among a word's pronunciations, and
`cleanHskMeaning`'s `slice(0, 2)` is an arbitrary choice among its senses.

Worse: when `forms[0]` happens to be a surname or a *"variant of"*
cross-reference, `isDegenerateMeaning` rejects it and **the word is dropped from
the curriculum entirely** — even though a later form carries the ordinary
meaning a learner needs.

### Measured blast radius

Measured against the real upstream file (`complete.json`, 11,470 entries,
12,623 forms), not estimated:

| | count |
|---|---|
| entries with more than one form | 879 (7.7%) — 671 single-character |
| entries with more than one **distinct pinyin** | **377** — 287 single-character |
| forms discarded by `forms[0]` | 1,153 |
| meanings discarded by `slice(0, 2)` | **14,300 of 33,708 (42%)** |
| shipped rows teaching one reading of a polyphone, suppressing the rest | **149** |
| words dropped entirely by a degenerate `forms[0]` | **336 upstream, 190 inside the built bands** |

All 4,494 committed rows match `forms[0]` of their entry exactly on both reading
and gloss, so this is the build's output and nothing was hand-edited afterwards.

### The casualties are not obscure

| word | band | `forms[0]` | what the learner lost |
|---|---|---|---|
| 船 | **3** | *"variant of 船"* | boat — dropped |
| 纸 | **3** | *"variant of 纸"* | paper — dropped |
| 怕 | **3** | *"surname Pa"* | to fear — dropped |
| 关 | **3** | *"surname Guan"* | to close — dropped |
| 白 | 5 | *"surname Bai"* | white — dropped |
| 火 | 4 | *"surname Huo"* | fire — dropped |
| 岛 | 6 | *"variant of 岛"* | island — dropped |
| 行 | 3 | háng *"row; line"* | xíng "to walk; to go" — suppressed |
| 卡 | 3 | kǎ *"to stop; to block"* | *"(loanword) card"* — truncated at sense index 3 |

卡 is a **sense-truncation**, not a reading mismatch: its reading and gloss come
from the same form, and `slice(0, 2)` threw away "card". 行 is a genuine
`forms[0]` loss: the whole xíng form is discarded.

### Why it went unnoticed

`src/hskBuild.test.js` hard-codes a **one-element** `forms` array in its fixture
factory. Every test feeds an entry where `forms[0]` is the only form, so nothing
pins which form is chosen and a fix that selected a different one would not
break a single assertion.

---

## 2. The three inventories

These were being conflated. They are different numbers and must reconcile
before any reseed:

| | count | what it is |
|---|---|---|
| **A — learner-facing DB rows** | **4,995** | Chinese, `is_active`, level 1–6. What the app loads. |
| **B — intended upstream curriculum** | **5,181** | HSK 3.0 bands 1–6 in the upstream word list. |
| C — intended **and** present | 4,989 | |
| **D — missing curriculum rows** | **192** | B − C. Words the course lists that no row carries. |
| E — present but not intended | 6 | 你好, 没事, 哪个, 这个, 那个, 一下 — hand-curated HSK 1 phrases absent from the HSK 3.0 list. |

`B = C + D` and `A = C + E`, both exactly. **4,995 is the current DB inventory,
not the curriculum denominator** — the upstream proves it is short by 192 rows.

Missing rows per band: **3 → 32, 4 → 43, 5 → 54, 6 → 63**. Bands 1–2 are
complete because they came from a different source.

Also outside all three: **3 orphan rows with `level IS NULL`** (僮, 白, and 操
glossed *"variant of 肏"* — a vulgar character). `prefetchLevel` filters
`.eq('level', level)`, so no app query loads them. They are dead data.

---

## 3. Why "use `forms[1]`" is not the fix

It would swap one arbitrary choice for another. A word may have three forms
(还 has Huán / hái / huán); the useful one is not at a fixed index; and for a
genuinely polyphonic word there is no single right answer, because **both**
readings are real vocabulary a learner meets.

The design has to answer four separate questions.

### 3.1 Degenerate leading forms — pick a form, don't take one

Rank the forms and choose the best, instead of indexing:

- **Reject** a form whose senses are only a surname, a *"variant of X"* or a
  *"see X"* cross-reference — `isDegenerateMeaning` already recognises these,
  it is simply applied too late (after the form has been chosen).
- **Prefer** the form with the most non-degenerate senses; break ties by upstream
  order, which is the dataset's own frequency-ish ordering.
- **Drop the word only when every form is degenerate**, and emit it to a
  `skipped.json` alongside the build so the loss is visible rather than silent.

This alone recovers the 190 lost words, and it cannot regress: a word with one
usable form behaves exactly as today.

### 3.2 Genuinely polyphonic words — one card, both readings

377 entries have more than one distinct pinyin. Three options were considered:

| option | verdict |
|---|---|
| one row per (word, reading) | **rejected for now** — see §3.4; it breaks counting |
| pick the highest-frequency reading, discard the rest | rejected — this is today's bug with better arithmetic |
| **one row, primary reading, alternates preserved in a column** | **proposed** |

Add `readings jsonb` to `vocabulary`: `[{pinyin, meanings[], primary: bool}]`.
`reading` and `meaning` keep their current single-value contract, so every
existing consumer is untouched; the card UI can reveal alternates later without
another migration, and the story matcher gains a place to look when a plan needs
the second reading. **No row count changes**, so nothing that counts rows moves.

### 3.3 Multiple meanings — stop truncating at two

`slice(0, 2)` discards 42% of upstream senses. The curriculum gloss should stay
short (it is a flashcard), but the *data* should not be lossy: keep the short
gloss in `meaning` for display, and the full sense list in the same `readings`
column. This is what would have kept 卡's *"card"*, and it is what the matcher's
`glossCoverage()` needs to stop reporting narrow-gloss defects like 不见 and 被.

### 3.4 Counting, if multiple rows per word are ever introduced

**This is the constraint that decides §3.2, and it must be settled before any
schema change, not after.** Three layers collapse by written form and one does
not, so a second row for one word breaks them in *opposite* directions:

| layer | keyed by | effect of a duplicate |
|---|---|---|
| `vocabMap` (6+ construction sites) | `word`, last-write-wins | one row silently wins |
| `buildVocabMatcher.exact` | normalized form, first-wins | rows `vocabMap` kept apart still collapse |
| `calculateStoryReadability.statuses` | `word` — commented *"distinct by word"* | "% known" **under**-counts |
| `learnedByLevel` (`src/storyTiers.js`) | **card rows**, by `vocab_id` | the story-unlock gate **over**-counts |

So a duplicated word would simultaneously make a story look less readable and
unlock sooner. Japanese already has 29 such groups (日 has three rows, two
readings) and is presumably mis-counted today; Chinese has zero, which is why
nobody has seen it.

If per-reading rows are ever wanted, all four layers must move together in one
change, with `learnedByLevel` counting **distinct written forms** rather than
card rows. Until then, §3.2's single-row design is the safe one.

---

## 4. The reseed plan, in order

Each step is verifiable before the next begins.

1. **Fix `hskEntryToRow`** (§3.1) plus tests with genuinely multi-form fixtures —
   the current fixture factory cannot express one. No DB access.
2. **Rebuild the artifacts** and diff `data/hsk{3,4,5,6}.json`. The diff is the
   review: it should add ~190 words and change ~149 readings, and every change
   should be explicable from the upstream entry.
3. **Reconcile again.** D must fall from 192 to near zero. If it does not, stop —
   the build is still lossy somewhere else.
4. **Migration: `readings jsonb`** (§3.2/§3.3), nullable, no backfill. Additive
   and reversible.
5. **Reseed the missing rows only** — insert, never update, never delete, per
   CLAUDE.md §7. `sort_order` continues from each level's current maximum so no
   existing row moves, and no `is_easy` or `ease_factor` is touched.
6. **Populate `source_id`.** The registry already exists: `content_sources`,
   with `name / source_type / license_note / source_url`, referenced by
   `vocabulary.source_id` (`supabase/schema.sql:112`). It holds one orphaned
   placeholder row and nothing points at it. Add one row per real source —
   `drkameleon/complete-hsk-vocabulary` (MIT, with the commit) and a
   `legacy_unknown` row for the 497 HSK 1–2 entries whose origin is not
   recoverable — then set `source_id` per row by the word → artifact join, which
   is deterministic for 4,494 rows.
7. **Re-run the content-integrity check.** The 284 `CURRICULUM_ROW_MISSING`
   occurrences across 90 stories should resolve *without any story being
   edited*, and the baseline should shrink on its own. That is the proof the
   reseed worked, and it is why the baseline shipped first.
8. Only then reconsider the remaining 368 occurrences, which are genuine
   story-content debt.

### Not in scope for the reseed

- The 3 orphan `level IS NULL` rows, including the vulgar 操. Deactivating them
  is a separate, deliberate decision.
- `20260724170000_harden_policies_and_vocab_index.sql` declares
  `vocabulary_dict_word_uniq` and **is not applied in production** — the race it
  guards is still open. Applying it is its own change.
- Rewriting any published story.
