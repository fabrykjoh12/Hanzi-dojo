# Targeted story generation

**Status: pipeline built, not yet run at scale.** Nothing here publishes,
stages, or writes to the database. It produces candidate **files** for review.

The serial generator (`generate-serial-stories.mjs`) writes a season of chapters
and inserts them, published or held, on the strength of a model scoring its own
prose. This pipeline answers a different question — *which words does the corpus
actually need, and did the story deliver them?* — and answers it in code.

```
coverage need → target manifest → prompt → candidate → deterministic validation
                                                   ↓ fail
                                        bounded repair / regenerate
                                                   ↓ pass
                                        accepted candidate FILE → human review
```

## The pieces

| File | What it is |
|---|---|
| `dump-story-corpus.mjs` | The only part that touches Supabase. Read-only: published stories + active vocabulary → a JSON file. |
| `storyTargetManifest.mjs` | FAB-9. Which words a story must carry, why, how often, and inside what boundary. Pure. |
| `storyCandidateValidation.mjs` | FAB-10. Deterministic diagnostics over a candidate. Pure. |
| `storyBatchState.mjs` | Resume, the bounded repair loop, the batch report. Pure. |
| `generate-targeted-stories.mjs` | The runner. Files in, files out, no database client. |

`.github/workflows/story-pilot.yml` and `llm-bench.yml` were already on `main`
and invoke this CLI; `storyPipelineContract.test.mjs` pins the flags from the
workflow files themselves, so renaming one fails locally instead of in CI with
the secrets attached.

## FAB-9 — the target manifest

One versioned JSON object per story, written before generation and carried
through validation unchanged (`fab9-story-target@1`).

```jsonc
{
  "schema": "fab9-story-target@1",
  "id": "hsk3-01-被中如果",
  "level": 3, "levelName": "HSK 3",
  "required": [
    { "word": "被", "cohort": "NEWLY_TAUGHT",
      "why": "newly taught at HSK 3, 0 available stories", "minOccurrences": 2 }
  ],
  "allowedVocabulary": { "maxLevel": 3, "size": 453, "source": "…dump.json" },
  "limits": {
    "lines": [20, 28], "maxLineChars": 34,
    "maxOutOfBandDistinct": 6, "maxOutOfBandOccurrences": 6,
    "maxOccurrencesPerTarget": 5, "maxTargetShare": 0.25
  },
  "format": { "speakers": ["李明", "小红", "小明", "妈妈"], "colon": "：" },
  "outputBudget": 2500
}
```

**Four cohorts**, each recording its own evidence in `why`:

| Cohort | Meaning |
|---|---|
| `NEWLY_TAUGHT` | Taught at the band being written for, with ≤1 story behind it. |
| `COVERAGE_GAP` | Taught, and **no** story the learner can read contains it. |
| `UNDER_COVERED` | 1–4 available-by-level stories reinforce it. |
| `REQUESTED` | A human named it. A request is its own reason. |

Exposure comes from `storyCoverage.buildCoverageReport`, which counts a word as
present only when the Reader's own engine resolves it — the same definition the
coverage audit uses.

**Selection is by need, then label.** Ordering by cohort first was wrong:
against the real corpus it put a word with four reinforcing stories ahead of one
with none, purely because of how each was labelled. Order is: an explicit
request, then fewest reinforcing stories, then cohort, then band, then
**frequency rank** — hundreds of words tie at zero exposure, and "most useful
words first" is the product's own rule. Selection is deterministic: a resumed
batch asks for exactly what it asked for the first time.

**A requested word that is missing or above the band is an error, not a silent
omission.** Generating a story for a word the learner can never tap is worse
than refusing.

**Presence is not the target.** `minOccurrences` (default 2) is the floor:
a word used once may be mentioned rather than used. `maxOccurrencesPerTarget`
(5) and `maxTargetShare` (25% of resolvable tokens) are the ceilings, because
optimising for presence is how you get `我受到了她的笑容`. Both directions are
enforced, and a manifest whose floor exceeds its ceiling is rejected at build
time rather than failing every candidate.

`outputBudget` is derived from the shape asked for. A fixed 6000 is what made
every draft fail on an 8000-tokens-per-minute tier: prompt plus budget exceeded
the window before the model wrote a character.

## FAB-10 — validation

`validateCandidate(candidate, { manifest, vocabMap, corpus })` returns

```jsonc
{ "accepted": false,
  "diagnostics": [
    { "code": "TARGET_MISSING", "word": "车", "insideOnly": ["汽车"],
      "detail": "required word 车 never resolves as its own token — it appears only inside 汽车",
      "repairable": true }
  ],
  "summary": { "lines": 22, "targets": [...], "outOfBandDistinct": 1, "untappableOccurrences": 0 } }
```

`accepted` is **derived** from the diagnostics; there is no branch that accepts
with one standing.

| Code | Fails when | Repairable |
|---|---|---|
| `MALFORMED` | Not a story object, or no content | no |
| `BAND_MISMATCH` | Declares a band other than the manifest's | no |
| `DUPLICATE` | ≥50% trigram overlap with the corpus or an accepted sibling | no |
| `TARGET_MISSING` | The Reader never resolves a required word | yes |
| `TARGET_UNDER_USED` | Present, below `minOccurrences` | yes |
| `TARGET_STUFFED` | Above `maxOccurrencesPerTarget` | yes |
| `TARGET_DENSITY` | Required words exceed `maxTargetShare` of the text | yes |
| `UNTAPPABLE_TEXT` | `publishable()` finds text the Reader cannot resolve | yes |
| `OUT_OF_BAND_VOCAB` | Too many distinct/total words above the band | yes |
| `UNKNOWN_SPEAKER`, `LINE_COUNT`, `LINE_TOO_LONG`, `TITLE_INVALID` | Format | yes |

### One definition of "known word"

The validator has none of its own. Presence and resolvability come from
`calculateStoryReadability` and, through `storyVocabAudit.publishable`, from
`segmentLine` / `buildVocabMatcher` / `storyNamesFor` — the merged
content-integrity path. `storyValidation.mjs` already mirrors the Reader's
matcher in a second implementation, and a mirror is exactly where "validates"
and "renders correctly" drift apart. A spec fails if this module grows its own
matcher.

The visible consequence: a target inside a longer compound does **not** count.
If the text says 汽车 and the target is 车, the Reader renders one token and the
learner never meets 车. A substring search would have called that a pass; the
diagnostic instead names the word that swallowed it, because that is the
sentence the writer has to change.

Proper nouns follow the Reader too: a character introduced by a speaker label
costs nothing (`collectStoryNames` derives names from the story itself), a
canonical name in `CHARACTER_READINGS` works in narration, and an ordinary
unknown word is never excused as a name.

## The loop

```
draft → validate → ACCEPT | REPAIR | REGENERATE | GIVE_UP
```

- any non-repairable diagnostic → **REGENERATE** (a duplicate edited into a
  slightly different duplicate is still one)
- the same diagnostics as last time → **REGENERATE** (the repair is stuck)
- otherwise → **REPAIR**, with a brief that says what to change rather than
  quoting a code
- out of attempts (default 3) → **GIVE_UP**, recorded as rejected with its
  diagnostics. A failing candidate is never quietly accepted.

Transport failures are a separate, bounded backoff. A 429 is the provider
refusing, not the story being wrong; spending generation attempts on
infrastructure would confuse the two.

## Batches and resume

Each manifest owns one file, `data/story-candidates/<batch>/<manifest-id>.json`,
so a rerun overwrites rather than appends. An **accepted** candidate is never
regenerated: it is loaded and used as corpus for the duplicate check of
everything after it, which is also what stops a resumed batch from writing a
near-copy of what it already accepted. Attempt counts carry across a resume, so
restarting cannot reset the bound.

`batch-report.json` records accepted/rejected ids, total attempts, the failure
codes by frequency, and states plainly that nothing was published.

## Running it

```bash
# 1. read-only snapshot of production
node --env-file=.env.script dump-story-corpus.mjs --out reports/story-corpus-dump.json

# 2. manifests only — no model calls, no cost
node generate-targeted-stories.mjs --input reports/story-corpus-dump.json \
  --level 3 --count 3 --batch demo --dry-run

# 3. generate
node generate-targeted-stories.mjs --input reports/story-corpus-dump.json \
  --level 3 --count 4 --batch pilot-1 --provider premium

# a specific request
node generate-targeted-stories.mjs --input … --batch req-1 --words 被,如果,需要
```

In CI: **Actions → Targeted story pilot** does steps 1–3 with the real keys and
commits the candidate files back to the dispatching branch.

## Known limits

- **No candidate has been generated by a model yet.** The sandbox has no
  provider key, and `docs/BACKLOG.md` records the free-tier ceiling: Gemini
  credits depleted, no Anthropic billing, Groq capped at 8000 tokens/minute with
  70–80% of a batch's requests refused. That is a billing decision, not an
  engineering one, and a 429 is evidence about infrastructure, never about a
  model.
- **`maxOutOfBandDistinct` is not calibrated.** It comes from the tier's
  `maxMisses`, capped at 6. The earlier measured runs never got within 3× of a
  cap of 3. Either the cap or the generation approach has to move; deciding
  needs a real batch first.
- **The duplicate threshold (0.5 trigram Jaccard) is a starting value**, chosen
  to reject an obvious rewrite and pass unrelated stories. It has not been swept
  against the real 204-story corpus.
- **Staging does not exist.** Getting an accepted candidate into the database is
  deliberately a separate, human-run step that has not been written.
- **`judge-story-candidates.mjs` is still missing**, so `llm-bench.yml`'s bench
  mode remains non-functional. That is model-evaluation tooling and is out of
  scope here.
- **Offline dry runs see a smaller pool than production.** `data/hsk1.json` and
  `data/hsk2.json` are empty in the repo (those bands were seeded from another
  source), so an offline dump carries only HSK 3+. The live dump is the real
  input.
