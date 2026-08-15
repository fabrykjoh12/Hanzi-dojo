# 🔊 Azure S0 re-licensing — dry-run audit

**Nothing was regenerated. No audio was overwritten. No paid request was made.**
2026-08-15. Every number below comes from a read-only query against the
production database; the SQL is at the end so it can be re-run before and after.

The Speech resource has been moved **F0 → S0**, which is what makes commercial
use of prebuilt neural voices licensed. The audio already in the bucket was
synthesised under F0, so it needs re-rendering under the paid tier.

Manifest: [`data/tts-relicense-manifest.json`](../data/tts-relicense-manifest.json).

---

## The short answer

| | |
|---|---|
| **Azure clips currently served** | **8,814** |
| **Characters to re-synthesise** | **66,390** |
| **Estimated cost** | **≈ USD 1.06 ≈ NOK 10** (NOK 12 with a 20% margin) |
| **Credit available** | NOK 1,931 (≈ USD 204), expiring 2026-08-21 |
| **Sufficient?** | **Yes — by roughly 190×.** Cost is ~0.5% of the credit |
| Legacy Google clips | 6,058 vocabulary rows — **excluded, as instructed** |

The bill is not the interesting part of this audit. Two other things are.

---

## Finding 1 — 46% of the Azure audio is already unreachable

`tts_audio` holds **16,230** ready rows, every one of them Azure. But only
**8,814** are reachable by the app:

| Bucket | Clips | Characters | Storage |
|---|---:|---:|---:|
| Story utterances (live) | 6,724 | 57,222 | — |
| Vocabulary (live rows) | 2,090 | 9,168 | — |
| **In scope — total** | **8,814** | **66,390** | **111.8 MB** |
| **Vocabulary (orphaned)** | **7,416** | 34,414 | **79.1 MB** |
| Grand total | 16,230 | 100,804 | 190.9 MB |

**Why.** On **2026-07-28** a bulk re-import created **4,495** new Chinese
vocabulary rows with new UUIDs. Azure clips generated 2026-07-22 → 08-07 against
the *old* ids were left pointing at rows that no longer exist: **1,867 of 2,391
vocabulary source ids (78%) are orphans**, four clips each.

Two consequences, both good:

- **They cost nothing to skip.** `tts-generate.mjs` enumerates from live source
  rows (`src/tts/sources.js`), so an orphan cannot be selected by any flag. The
  scope of a re-render is *automatically* the served set.
- **79.1 MB of the 190.9 MB audio bucket is dead weight.** Worth deleting after
  QA — separately, and not as part of this run.

> This also corrects the "~10,522 clips" figure carried in `CHANGELOG.md:89` and
> repeated through the release audit. The real numbers are 16,230 rows, 8,814
> reachable.

## Finding 2 — the legacy Google situation is bigger than it looked

Excluded from this run, as instructed. Recorded so the gap is not mistaken for
an omission later:

| Language | Vocabulary rows whose ONLY audio is legacy Google |
|---|---:|
| Chinese (HSK 3.0) | **4,473** |
| Japanese (JLPT) | 1,438 |
| Russian | 147 |
| **Total** | **6,058** |

So **4,473 active Chinese words have no Azure audio at all.** Voicing them is
*new content generation*, not re-licensing, and it is a separate decision. For
scale: it would be roughly 78,700 characters ≈ USD 1.26 ≈ NOK 12 — also trivial
against the credit.

---

## Voice mapping — preserved automatically

Voice assignment is **data, not a constant**, so a re-render cannot drift:
story utterances carry their own `story_utterances.voice`, and vocabulary uses
`DEFAULT_VOICES.flashcard`. No casting decision is re-made.

| Voice | Clips | Used for |
|---|---:|---|
| `zh-CN-XiaoxiaoNeural` | 2,090 | All vocabulary (word, sentence, both slow) |
| `zh-CN-XiaoxiaoMultilingualNeural` | 3,069 | Story narrator |
| `zh-CN-YunxiNeural` | 1,367 | Story, male lead |
| `zh-CN-XiaoyiNeural` | 1,318 | Story, female |
| `zh-CN-YunjianNeural` | 637 | Story, male |
| `zh-CN-XiaohanNeural` | 230 | Story, female |
| `zh-CN-YunyangNeural` | 91 | Story, male |
| `zh-CN-XiaochenNeural` | 12 | Story, female |

Speaking rates: 1.00 (10,799), 0.85 (3,040 — slow story lines), 0.80 (2,391 —
slow flashcards). Output format `mp3-24khz-48kbit-mono` throughout.

**Every voice is prebuilt neural.** No HD voice (`…:DragonHDLatestNeural`) and no
custom neural voice is used anywhere, so every character bills at the standard
rate and no premium tier applies.

---

## Cost

**USD 16.00 per 1M characters**, Azure AI Speech Standard **S0**, prebuilt
neural voices — [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/) ·
[Microsoft Q&A on S0 character billing](https://learn.microsoft.com/en-us/answers/questions/1654938/text-to-speech-s0-standard-tier-0-5-million-charac).
(F0's 0.5M free characters/month do not carry over to S0; on S0 you pay from the
first character.)

| Scope | Characters | USD | NOK @ 9.45 |
|---|---:|---:|---:|
| **In scope — served clips** | 66,390 | **$1.06** | **≈ 10** |
| With a 20% retry/SSML margin | ~80,000 | $1.28 | ≈ 12 |
| Everything, orphans included (not recommended) | 100,804 | $1.61 | ≈ 15 |
| *Optional later:* the 4,473 Google-only Chinese words | ~78,700 | $1.26 | ≈ 12 |
| *All of the above together* | ~180,000 | $2.88 | ≈ 27 |

**NOK 1,931 ≈ USD 204** at 9.45 NOK/USD
([rate, 2026-08-15](https://wise.com/us/currency-converter/usd-to-nok-rate/history)).

**Comfortably sufficient — the run costs about 0.5% of the credit.** Even the
worst-case interpretation (regenerate everything, then voice all the Google-only
Chinese words, then do it twice more after mistakes) stays under NOK 60. The
credit expiring on **21 August** is not a constraint on this work; it is only a
reason not to leave it a month.

Two honesty notes on the estimate:

- `character_count` is the **normalised text** length. Azure bills text, not SSML
  markup, so the figures should be close — the 20% margin covers the difference
  plus any retries.
- **Worth ten minutes before spending anything:** ask Microsoft support whether
  moving to S0 licenses audio already generated under F0. If it does, this whole
  run is unnecessary. Given the cost, regenerating anyway is the safe default —
  but the question is cheap to ask.

---

## Proposed workflow

The mechanism already exists and is the one the system was designed for. **No new
script, no schema change.**

### Why a version bump, not `--missing-only`

`--missing-only` skips anything already generated; `--stale-only` regenerates
clips whose *inputs* changed. Nothing is stale today, because nothing about the
text or voice changed — only the billing tier, which is not a hash input. The
documented lever is `SYNTHESIS_CONFIG_VERSION` in `src/tts/constants.js`
(currently `1`). Bumping it to `2` puts `v=2` in every content hash, so every
clip becomes stale and eligible — and **it deletes nothing**.

Crucially, **a stale clip keeps playing.** The row stays `ready` with its
existing `storage_path` until it is regenerated, so there is no window where a
learner hits silence. That is what makes a staged rollout safe.

### The steps

```bash
# 0. Snapshot first — this is the rollback anchor. Read-only, seconds.
#    In the Supabase SQL editor:
create table tts_audio_backup_20260815 as select * from tts_audio;

# 1. Bump SYNTHESIS_CONFIG_VERSION 1 → 2 in src/tts/constants.js, with a
#    comment saying why (F0 → S0 re-licensing). Commit. This is the ONLY code
#    change the whole operation needs.

# 2. Prove the plan before spending. Dry run is the default; this bills nothing.
npm run tts:dry-run -- --flashcards --stale-only --limit 600 --override-max
npm run tts:dry-run -- --stories    --stale-only --limit 600 --override-max
#    Expect: 524 flashcard source records → 2,090 clips
#            6,046 utterances           → 6,724 clips

# 3. One story, for real. The taste test.
npm run tts:generate -- --stories --story-id <hsk1-story-uuid> --confirm
#    Listen to it. Same voices? Same pacing? Then continue.

# 4. Flashcards — 524 words, one batch.
npm run tts:generate -- --flashcards --stale-only --limit 600 --override-max --confirm

# 5. Stories — level by level, verifying between each.
#    (Levels 1-6; level 2 also contains 15 unpublished stories, 230 clips.)
npm run tts:generate -- --stories --stale-only --limit 600 --override-max --confirm

# 6. Re-run the audit SQL below and compare against the manifest.
```

Or through **Actions → Regenerate content → `tts-flashcards`**, which surfaces
`tts_limit` / `tts_confirm` and holds the Azure key this sandbox does not.
⚠️ **That task hardcodes `--missing-only`** (`regen-content.yml:210`), so it
would generate nothing after a version bump. Running the re-render through the
Action needs a small workflow edit to pass `--stale-only` instead — worth doing,
since the Action is where the secret lives.

### Recording the tier for provenance

`tts_audio` has no tier column, but it has a nullable free-text
**`provider_version`**, currently `cognitiveservices/v1` on all 16,230 rows —
and `provider_version` is **not** a content-hash input, so changing it is safe.
Setting it to `cognitiveservices/v1;tier=S0` on the new rows makes the licensed
generation self-evidencing at row level, and `generated_at` already stamps the
date. Combined with the S0 screenshot in `docs/CONTENT-LICENSING.md`, that closes
the provenance question properly rather than by assertion.

*(One line in `buildAudioRecord`. Proposed, not implemented.)*

---

## Verification plan

Run after each batch, not just at the end.

| # | Check | Method | Pass condition |
|---|---|---|---|
| 1 | **Clip count unchanged** | Audit SQL, query A | Exactly 16,230 ready rows; 8,814 reachable. A *drop* means a source row went missing mid-run |
| 2 | **No missing audio** | Query B | Zero rows with `status='ready'` and a null/empty `storage_path`; zero `failed` rows left unretried |
| 3 | **Everything actually regenerated** | Query C | Zero reachable rows still at `synthesis_config_version = 1` |
| 4 | **No duplicates** | Query D | The unique key (`source_type`,`source_id`,`variant`,`locale`) still has no collisions; `content_hash` distinct-count matches row count within the expected re-use |
| 5 | **Duration sanity** | Query E | Per-variant mean duration within ±15% of the pre-run mean, and **no clip under 300 ms or over 60 s**. A silent or truncated render shows up here and nowhere else |
| 6 | **Byte-length sanity** | Query E | Total MB within ±15% of 111.8 MB |
| 7 | **Voice preserved** | Query F | The voice histogram matches the table above **exactly** — any drift means casting was re-decided |
| 8 | **DB ↔ bucket consistency** | Query G + storage list | Every `storage_path` resolves to a real object; no row points at a deleted file |
| 9 | **Sample playback QA** | By ear | 10 flashcards (incl. a polyphone — 银行, 长城, 觉得) and 3 full stories across levels 1/3/6. Listen for wrong readings, clipped starts, changed speaker identity |
| 10 | **In the app** | Study + a story reader on a real device | Audio plays, slow variants play, no console 404s |

### Rollback

Be clear about what rollback means here, because the obvious assumption is wrong.

`runner.js:125` calls `removeSuperseded` **after** the row is repointed, so the
old MP3 is deleted. There is no flag to keep it. So:

- **You cannot roll back to the old audio, and you would not want to** — the old
  audio is the F0 audio, which is the thing being fixed.
- **Rollback = re-run.** At ~USD 1 and well under an hour, regenerating is
  cheaper than any recovery scheme, and the `tts_audio_backup_20260815` snapshot
  tells you exactly what changed.
- **The real protection is ordering**: one story first (step 3), listen, then
  batch. A version bump alone changes nothing a learner can hear.
- If a batch fails midway, the run is resumable — `tts_jobs` reclaims work left
  `processing` after 30 minutes, and `npm run tts:retry-failed` handles the rest.

---

## Reproducing the audit

```sql
-- A · totals and reachability (the headline numbers)
select
  case when t.source_type='story_utterance' then 'story_utterance'
       when exists (select 1 from vocabulary v where v.id=t.source_id) then 'vocabulary (live)'
       else 'vocabulary (ORPHAN)' end as bucket,
  t.variant, count(*) clips, sum(t.character_count) chars,
  round(sum(t.byte_length)/1048576.0,1) mb
from tts_audio t where t.status='ready' group by 1,2 order by 1,2;

-- B · nothing broken
select status, count(*) filter (where storage_path is null or storage_path='') as no_path,
       count(*) as rows from tts_audio group by 1;

-- C · everything reachable was actually re-rendered (expect 0 after the run)
select count(*) from tts_audio t
where t.status='ready' and t.synthesis_config_version = 1
  and (t.source_type='story_utterance' or exists (select 1 from vocabulary v where v.id=t.source_id));

-- D · no duplicates on the idempotency key
select source_type, source_id, variant, locale, count(*)
from tts_audio group by 1,2,3,4 having count(*) > 1;

-- E · duration and size sanity, per variant
select variant, count(*) clips,
       round(avg(duration_ms)) avg_ms, min(duration_ms) min_ms, max(duration_ms) max_ms,
       count(*) filter (where duration_ms < 300 or duration_ms > 60000) as suspicious,
       round(sum(byte_length)/1048576.0,1) mb
from tts_audio where status='ready' group by 1 order by 1;

-- F · voice histogram must not drift
select source_type, voice, count(*) from tts_audio where status='ready' group by 1,2 order by 1,3 desc;

-- G · rows whose object should exist (spot-check against the bucket listing)
select storage_path from tts_audio where status='ready' order by random() limit 20;
```

**Pre-run baseline, for comparison after the run:**

| Variant | Clips | Avg duration | Total |
|---|---:|---|---:|
| `utterance` | 6,046 | — | 84.1 MB |
| `utterance_slow` | 678 | — | 11.1 MB |
| `word` / `word_slow` (live) | 524 / 524 | — | 4.2 / 4.9 MB |
| `sentence` / `sentence_slow` (live) | 521 / 521 | — | 6.0 / 7.0 MB |
| **Reachable total** | **8,814** | | **111.8 MB** |

---

## What this audit did not do

- Nothing was regenerated, and no Azure request of any kind was made.
- `SYNTHESIS_CONFIG_VERSION` was **not** bumped — that is step 1 of the run, and
  it needs approval first.
- No Google TTS clip was touched.
- The orphan cleanup was **not** performed.
- No workflow file was edited, including the `--missing-only` issue in
  `regen-content.yml:210`.
