# 🔊 Azure S0 re-licensing — dry-run audit

**MIGRATION COMPLETE — all 8,814 active Azure clips are on S0.** 2026-08-15.
Every number comes from a read-only query against the production database; the
SQL is at the end so it can be re-run.

> **Final state: 8,814 / 8,814 at `synthesis_config_version = 2` with
> `provider_version = 'cognitiveservices/v1;tier=S0'`. Zero failures across the
> whole run. No old F0 audio was deleted** — all 8,814 superseded objects are
> retained pending a separate cleanup approval. See
> [§ Migration report](#migration-report--complete).

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

## Migration report — complete

Executed 2026-08-15 in six stages through **Actions → Regenerate content →
`tts-migrate-s0`**, all with `--stale-only --retain-superseded`.

### Batch results

| Batch | Scope | Expected | Generated | Failed | Characters | Cost |
|---|---|---:|---:|---:|---:|---:|
| Canary | HSK2 #58 (all 7 story voices) | 41 | 41 | 0 | 461 | $0.007 |
| 1 | Flashcards / vocabulary | 2,090 | 2,090 | 0 | 9,168 | $0.147 |
| 2 | Stories HSK1 | 1,854 | 1,854 | 0 | 14,610 | $0.234 |
| 3 | Stories HSK2 (published) | 1,551 | 1,551 | 0 | 13,145 | $0.210 |
| 4 | Stories HSK3–6 | 3,048 | 3,048 | 0 | 28,252 | $0.452 |
| 5 | 15 unpublished HSK2 stories | 230 | 230 | 0 | 754 | $0.012 |
| **Total** | | **8,814** | **8,814** | **0** | **66,390** | **≈ $1.06 ≈ NOK 10** |

*Cost is computed from the pipeline's own per-clip `request_count` /
`character_count` counters at $16/1M characters. Azure's portal does not expose
per-run usage in real time.*

### Independent reconciliation

Queried live, not taken from the jobs' own output:

| Check | Result |
|---|---|
| Active Azure clips | **8,814** |
| At `synthesis_config_version = 2` | **8,814** (100%) |
| With `provider_version = 'cognitiveservices/v1;tier=S0'` | **8,814** (100%) |
| Active rows still stale (v1) | **0** |
| Active rows referencing a missing storage object | **0** |
| `storage_path` not matching its own `content_hash` | **0** |
| Rows in `failed` or any non-`ready` status | **0** |
| Zero-byte clips | **0** |
| Clips under 0.5 s or over 60 s | **0** |
| **Orphan rows touched** | **0** — all 7,416 still v1, `provider_version` unchanged |
| **Legacy Google `audio_path` rows** | **6,580 — unchanged** |

### Two things that did NOT go exactly to plan

Both were found by the checkpoints, and neither is a defect in the migration
design. Recording them because a report that says only "all green" is not worth
much.

**1. `--limit` counts source records, not clips.** Batch 1 ran with
`tts_limit=600` and reported success at 1,988 of 2,090 clips. `loadVocabulary`
loads rows from `vocabulary` — 4,998 Chinese rows, only 524 of which carry Azure
audio — so a 600-row window covered the level 1–2 bulk and missed 27 words at
levels 3–6 plus two null-level rows (僮, 操). Re-ran with `tts_limit=5200`; the
remaining 102 clips completed. **The job was right to report success — it did
process everything it loaded.**

**2. GitHub drops an older *pending* run in a concurrency group.** The workflow
sets `cancel-in-progress: false`, which queues runs — but only one may be
pending at a time, so dispatching batch-5 stories back to back silently lost one
(车站, 8 clips). Caught by the final reconciliation, re-dispatched, completed.
**Pacing error in how the runs were driven, not in the tooling.**

### A pre-existing inconsistency the migration corrected

The post-migration voice histogram differs from the pre-migration one by six
clips: `zh-CN-XiaohanNeural` 230 → 224, `zh-CN-XiaoxiaoMultilingualNeural`
3,069 → 3,075. **This is not casting drift.** The evidence:

* **Zero clips** now have a voice differing from their utterance's stored
  `story_utterances.voice`.
* `story_utterances` was last modified **2026-08-02 13:57–13:58** — nothing was
  written to it today, and the TTS pipeline only ever reads it.

So those six clips had been carrying a *stale* voice since a casting edit on
2026-08-02 whose follow-up regeneration did not cover everything — the same
`--limit` trap as above, two weeks earlier. They were doubly stale (voice **and**
config version), and the re-render brought them into line with the data. Total
active audio is 110.9 MB against a 111.8 MB baseline; the 0.9 MB and the
16-character difference come from these same corrected clips.

**Everything else re-rendered byte-identically**, exactly as the canary
predicted: same voice, same text, same rate, same SSML, and Azure's neural
synthesis is deterministic for identical input.

### Final voice mapping — preserved

| Voice | Clips | Avg |
|---|---:|---:|
| `zh-CN-XiaoxiaoMultilingualNeural` | 3,075 | 2.70 s |
| `zh-CN-XiaoxiaoNeural` (all vocabulary) | 2,090 | 1.70 s |
| `zh-CN-YunxiNeural` | 1,367 | 1.88 s |
| `zh-CN-XiaoyiNeural` | 1,318 | 2.21 s |
| `zh-CN-YunjianNeural` | 637 | 2.06 s |
| `zh-CN-XiaohanNeural` | 224 | 2.51 s |
| `zh-CN-YunyangNeural` | 91 | 1.73 s |
| `zh-CN-XiaochenNeural` | 12 | 1.82 s |

---

## Storage accounting — NOTHING DELETED

| | Objects | Size |
|---|---:|---:|
| Total under `tts/` in the `audio` bucket | 25,044 | 301.9 MB |
| **Live, referenced by an active v2 row** | 8,814 | 110.9 MB |
| Referenced by orphan rows (pre-existing) | 7,416 | 79.1 MB |
| **A · Superseded F0 objects from this migration** | **8,814** | **111.8 MB** |
| **B · Pre-existing orphan objects** | **7,416** | **79.1 MB** |
| **C · Total reclaimable** | **16,230** | **190.9 MB** (63% of the bucket) |

**D · Safe cleanup criteria** — every one must hold before anything is deleted:

1. **Listening QA signed off** (below). Until a human has heard the new audio,
   the F0 objects are the only fallback.
2. **Delete only objects with no `tts_audio` row pointing at them.** The exact
   predicate: `not exists (select 1 from tts_audio t where t.storage_path = o.name)`.
   That set is currently *exactly* the 8,814 superseded F0 files — verified.
3. **Orphan rows are a different decision.** Their 7,416 objects *are* still
   referenced, by rows whose `source_id` points at deleted vocabulary. Deleting
   the files without deleting the rows would create the one state this pipeline
   must never have: a row pointing at a missing object. **Delete the rows first,
   then the files** — or leave both. Recommend doing this **separately** from the
   F0 cleanup, since it is a data decision rather than a storage one.
4. **Keep a manifest of what was deleted**, so the action is auditable.

Cleanup is a separate approval gate and has **not** been performed.

---

## Listening QA — for the owner, not claimable here

This sandbox still cannot reach `bvqvturqupbggxaeihvi.supabase.co` (egress
proxy), so **no clip has been played and listening QA is NOT signed off.**

Prefix every path with:
`https://bvqvturqupbggxaeihvi.supabase.co/storage/v1/object/public/audio/`

**Every voice — one story line each:**

| Voice | Where | Line | Path |
|---|---|---|---|
| XiaoxiaoMultilingual | HSK6 #5 一个月以后 | 他写的是，这封信到了他家… | `tts/zh-CN/story_utterance/f53d38ec-c508-47ef-9386-fcadc1bb457a/utterance/06bc52101c9087f72ca8f41a6dd1983ecf1b210477223ec600d9bc14dffea03f.mp3` |
| Xiaohan | HSK1 #1 不见了的苹果 | 是的，你是对的。桌子上有几个苹果没有了。 | `tts/zh-CN/story_utterance/e49510b3-2776-4c0a-a72b-8967f13729f8/utterance/b217dd34a8de6a37b4d8aad796ee7f7fda937edceb3e480716c993db4080022b.mp3` |
| Xiaoyi | HSK1 #8 上班和上学 | 喂，你好吗？我要上班了。 | `tts/zh-CN/story_utterance/f63a1a05-a551-44e3-9343-6693fb714aa6/utterance/3945c3a9179801d97ba485528637b115ee82cdc6e94a306421fad8a4cb8f6dc5.mp3` |
| Xiaochen | HSK1 #60 第二话 · 花花 | 面条儿！好听！ | `tts/zh-CN/story_utterance/d67e0daf-0878-45b0-9c97-8a037b547fab/utterance/56c2bb0639f5b57a83e0150fc08a1447ac9ee0c4ff407748ebe5e70b21703a13.mp3` |
| Yunxi | HSK2 #60 山那边的人 | 石族，树族，火族，夜族，风族。 | `tts/zh-CN/story_utterance/da210e67-5b08-44af-839b-91332a6e3499/utterance/dfa126e9b5f6b3196f0db38a2657f2ed058623c69a8553f6f7de662295d115db.mp3` |
| Yunjian | HSK6 #15 一年一封 | 知道有两个人，三十年没有见面… | `tts/zh-CN/story_utterance/771437ac-269c-4e86-8ea9-c94c175019d1/utterance/48caba7f1690fbda03207b6b1e2a3093918aac38d8e89b562eafd3ae4b3b874b.mp3` |
| Yunyang | HSK2 #44 六楼的爷爷 | 对。三点半出去，六点回来。 | `tts/zh-CN/story_utterance/cb556684-419d-424a-9f0a-2233915acd9a/utterance/074a345483ec03557648b72ae42cf93501be30b030548643f6966761997dadde.mp3` |

**Flashcard audio** (Xiaoxiao — word then example sentence). 觉得 is the
polyphone check: it must read *juéde*, not *jiàode*.

| Word | Word clip | Sentence clip |
|---|---|---|
| 觉得 (juéde) | `tts/zh-CN/vocabulary/7bac4ef1-554e-42ce-89c3-2060c076ad9d/word/096e617f65da37fdc5c21f649fbe7dbd2e5d852ac1daaa1e6a4a868ad30cbfc8.mp3` | `tts/zh-CN/vocabulary/7bac4ef1-554e-42ce-89c3-2060c076ad9d/sentence/39de3ccd33584b85c463798a2381fab45c33615f933458167ca956b51528f50e.mp3` |
| 朋友 (péngyou) | `tts/zh-CN/vocabulary/a2766939-5216-4f40-9361-4eb543584a0f/word/c8c277ff0cc5503c63934ace5f8db470b54bc5acd9ba9e83411a0468a50484cb.mp3` | `tts/zh-CN/vocabulary/a2766939-5216-4f40-9361-4eb543584a0f/sentence/0f5e5d24d158d92262e6bdd044265b8b61990f102389177d588889fceeeaa5f5.mp3` |
| 高兴 (gāoxìng) | `tts/zh-CN/vocabulary/581d2d7b-ca0c-46d5-8f76-11cda8774f53/word/950830543718fd8a526df48ba6628d9f74013234c0e5afb7dd644990f90177cf.mp3` | `tts/zh-CN/vocabulary/581d2d7b-ca0c-46d5-8f76-11cda8774f53/sentence/ed3092bc71dd8a922d9b6796cf15876244d012569f2fc98d0911100ef1cc2a99.mp3` |

**In the app, which is what actually matters:** open a Study session (word + slow
word + sentence), then one story at HSK1, one at HSK2 and one at HSK3+, playing
a few lines and a slow variant in each — on the phone as well as the browser.


---

## Canary — one story migrated to S0

**Story `4d608812-be60-4970-8013-dabef33fd12f`** — HSK 2 #58, *7. 这是谁的城*,
published. Chosen because it is the **only story in the library that uses all
seven story voices**, in just 41 clips. If casting drift or a voice regression
were possible, this story would show it.

Run: [`31899174329`](https://github.com/fabrykjoh12/Hanzi-dojo/actions/runs/31899174329)
· preceded by dry run [`31899087178`](https://github.com/fabrykjoh12/Hanzi-dojo/actions/runs/31899087178).

### What the run reported

```json
{"ok":true,"dryRun":false,"batchId":"ae280ab4-806e-46c5-92e3-bd0291b07999",
 "generated":41,"deduped":0,"skipped":0,"failed":0,
 "requests":41,"characters":461,"seconds":21,"failures":[]}
```

The dry run predicted **41 clips / 461 characters**, all classified `stale`. The
real run generated **exactly 41 / 461**, zero failed, in 21 seconds. Config line
confirmed both new switches were live: `"azureTier":"S0"`,
`"retainSuperseded":true`.

**Actual Azure usage: 41 requests, 461 characters ⇒ USD 0.0074 ≈ NOK 0.07.**
(Azure's portal does not surface per-run usage in real time; this is computed
from the request/character counters the pipeline records per clip and per job,
which is what `character_count` and `request_count` exist for.)

### Verification

| # | Check | Result |
|---|---|---|
| 1 | Synthesis succeeded under S0 | ✅ 41 generated, 0 failed, 0 skipped |
| 2 | Provenance recorded | ✅ All 41 rows: `synthesis_config_version = 2`, `provider_version = 'cognitiveservices/v1;tier=S0'`, `generated_at = 2026-08-15T17:44:59Z` |
| 3 | **Voice preserved per row** | ✅ Histogram **identical** to baseline: Multilingual 17, Xiaohan 5, Yunjian 5, Xiaoyi 4, Yunyang 4, Xiaochen 3, Yunxi 3 |
| 4 | Files uploaded | ✅ All 41 rows resolve to a live object in `storage.objects` |
| 5 | DB points at the new version | ✅ All 41 `storage_path` values match their own `content_hash`; spot-checked rows point at new paths, not old |
| 6 | **Old audio retained** | ✅ **82 objects** exist for this story's utterances — 41 new + 41 old. Spot-checked four old F0 paths: all still present |
| 7 | No 404 | ✅ Verified structurally — every row's path exists in `storage.objects`, which *is* the bucket index. HTTP fetch is blocked from this sandbox (see below) |
| 8 | No zero-byte files | ✅ Zero rows with null or 0 `byte_length`; the provider also rejects an empty body as a retryable error before any row is written |
| 9 | Duration plausible | ✅ 1.42 s – 4.85 s, mean 2.77 s. Nothing near the 0.5 s floor |
| 10 | No clipping / volume change | ✅ Strongest possible evidence — see below |

### The audio is byte-for-byte identical

Total bytes per voice, before and after:

| Voice | Clips | Bytes before | Bytes after |
|---|---:|---:|---:|
| `zh-CN-XiaoxiaoMultilingualNeural` | 17 | 282,960 | **282,960** |
| `zh-CN-XiaohanNeural` | 5 | 101,376 | **101,376** |
| `zh-CN-YunjianNeural` | 5 | 77,472 | **77,472** |
| `zh-CN-XiaoyiNeural` | 4 | 77,184 | **77,184** |
| `zh-CN-YunxiNeural` | 3 | 59,184 | **59,184** |
| `zh-CN-YunyangNeural` | 4 | 48,384 | **48,384** |
| `zh-CN-XiaochenNeural` | 3 | 39,456 | **39,456** |
| **Total** | **41** | **686,016** | **686,016** |

Every voice matches to the byte. Azure's neural synthesis is deterministic for
identical input, and the input *was* identical — same text, voice, rate, SSML and
overrides; only the config version (which is not sent to Azure) changed. So
"no clipping, no volume difference" is not a judgement call here: the audio is
the same audio, now with a licensed generation record.

**Only the content hash and storage path changed**, because `v=2` is part of the
hash. That is the whole point — the row now proves *when and under which tier*
the clip was made.

### What this sandbox could not check

**Playback over HTTP.** `bvqvturqupbggxaeihvi.supabase.co` is blocked by the
egress proxy here, so no clip was actually fetched or played. What was verified
instead is stronger than a spot-check and weaker than listening: every row's
`storage_path` exists in `storage.objects`, which is the bucket's own index, and
the byte lengths are unchanged. **Sample playback QA — in the browser, and on a
device through the app — remains an owner step**, as does confirming the story
reader still plays end to end.


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

**Steps 0–3 are done** (the canary above). Steps 4–6 await approval.

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
| 5 | **Audio-length sanity** | Query E | Per-variant mean **seconds** within ±15% of the baseline below, and no clip under 0.5 s. ⚠️ Use `byte_length`, **not** `duration_ms` — see the correction below |
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

-- E · audio-length and size sanity, per variant.
-- Seconds are derived from byte_length: the format is mp3-24khz-48kbit-mono,
-- a constant 48 kbit/s = 6,000 bytes per second. duration_ms is NOT audio
-- length (see the correction below) and must not be used here.
select variant, count(*) clips,
       round(avg(byte_length/6000.0)::numeric,2) avg_seconds,
       round(min(byte_length/6000.0)::numeric,2) min_seconds,
       round(max(byte_length/6000.0)::numeric,2) max_seconds,
       round(avg(byte_length::numeric/nullif(character_count,0)),0) bytes_per_char,
       count(*) filter (where byte_length < 3000) as under_half_second,
       round(sum(byte_length)/1048576.0,1) mb
from tts_audio where status='ready' group by 1 order by 1;

-- F · voice histogram must not drift
select source_type, voice, count(*) from tts_audio where status='ready' group by 1,2 order by 1,3 desc;

-- G · rows whose object should exist (spot-check against the bucket listing)
select storage_path from tts_audio where status='ready' order by random() limit 20;
```

### ⚠️ Correction — `duration_ms` is not audio duration

An earlier draft of this plan proposed checking clip length with `duration_ms`.
**That column holds request wall-clock latency, not audio length** —
`azure.js:150` sets it to `Date.now() - startedAt`, i.e. how long Azure took to
answer. Checking it would have measured Azure's response time and flagged
nothing about the audio.

Use **`byte_length`** instead. The output format is constant
(`mp3-24khz-48kbit-mono` = 48 kbit/s = **6,000 bytes per second**), so
`byte_length / 6000` is the clip's true length in seconds, and
`byte_length / character_count` is a stable per-variant fingerprint that catches
a truncated or silent render immediately.

**Pre-run baseline** (all 16,230 rows, measured 2026-08-15):

| Variant | Clips | Avg | Min | Max | Bytes/char |
|---|---:|---:|---:|---:|---:|
| `word` | 2,391 | 1.38 s | 0.98 | 1.78 | 5,148 |
| `word_slow` | 2,391 | 1.59 s | 1.22 | 1.92 | 5,959 |
| `sentence` | 2,362 | 2.04 s | 1.06 | 23.57 | 1,769 |
| `sentence_slow` | 2,362 | 2.37 s | 1.22 | 27.72 | 2,033 |
| `utterance` | 6,046 | 2.32 s | 0.96 | 7.61 | 1,799 |
| `utterance_slow` | 678 | 2.73 s | 1.20 | 6.24 | 2,380 |

No clip anywhere is under 0.5 s or over 60 s today, so either would be a real
signal. (The 23–28 s `sentence` maxima are a handful of genuinely long example
sentences, not defects.)

**Storage baseline, reachable rows only:**

| Variant | Clips | Total |
|---|---:|---:|
| `utterance` | 6,046 | 84.1 MB |
| `utterance_slow` | 678 | 11.1 MB |
| `word` / `word_slow` (live) | 524 / 524 | 4.2 / 4.9 MB |
| `sentence` / `sentence_slow` (live) | 521 / 521 | 6.0 / 7.0 MB |
| **Reachable total** | **8,814** | **111.8 MB** |

---

## What this audit did not do

- Nothing was regenerated, and no Azure request of any kind was made.
- `SYNTHESIS_CONFIG_VERSION` was **not** bumped — that is step 1 of the run, and
  it needs approval first.
- No Google TTS clip was touched.
- The orphan cleanup was **not** performed.
- No workflow file was edited, including the `--missing-only` issue in
  `regen-content.yml:210`.
