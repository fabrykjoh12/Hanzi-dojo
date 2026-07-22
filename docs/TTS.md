# Text-to-speech

How Hanzi Dojo turns Chinese text into audio: the architecture, the operator
runbook, and the safeguards that stop a mistake from becoming an invoice.

**One sentence:** audio is generated **once**, server-side, by an explicitly
confirmed command; it is stored under a content-addressed path; the browser only
ever plays a stored file.

---

## 1. Why it is shaped this way

Hanzi Dojo is a static single-page app talking straight to Supabase. There is no
backend process, so there is nowhere for a paid API key to live at request time.
Every existing content pipeline in this repo is therefore a Node script run with
`node --env-file=.env.script …`, locally or in a GitHub Action. Speech generation
follows exactly that boundary:

```
operator (or Action)                     browser
──────────────────────                   ───────
tts-generate.mjs                         Study / readers
  ↓ reads .env.script (AZURE_SPEECH_KEY)     ↓
  ↓ plans, hashes, synthesizes               ↓ reads tts_audio (RLS: status='ready')
  ↓ uploads MP3 → Supabase Storage           ↓ plays the public URL
  ↓ writes tts_audio row                     ↓ never synthesizes anything
```

The key never leaves the first column. Nothing under `src/` reads the process
environment at all — configuration is passed **in** as an argument — and
`src/tts/serverOnly.test.js` fails the build if that ever stops being true.

---

## 2. Architecture

### Provider abstraction

```js
interface TTSProvider {
  synthesize(request: TTSRequest, opts?: { signal }): Promise<TTSResult>
}
```

A `TTSRequest` is built by `src/tts/request.js` and carries both the provider
payload and the hash inputs, so what we hash is provably what we send:

| field | meaning |
|---|---|
| `text` / `normalizedText` | canonical text (NFC, collapsed whitespace, no zero-width chars) |
| `locale`, `voice`, `speakingRate`, `contentType` | how it is spoken |
| `outputFormat` | `mp3-24khz-48kbit-mono` |
| `pronunciationOverrides` → `overrideVersion` | which pronunciation pins applied |
| `ssml` | the built markup, fully escaped |
| `characterCount`, `synthesisConfigVersion` | accounting and cache versioning |

`TTSResult` carries `audio` (`Uint8Array`), `contentType`, `provider`,
`providerVersion`, `requestCount`, `characterCount`, `byteLength`, `durationMs`.

### Modules

| file | role | runs where |
|---|---|---|
| `src/tts/constants.js` | variants, statuses, voices, limits, `SYNTHESIS_CONFIG_VERSION` | both |
| `src/tts/storagePath.js` | content-addressed object keys | both |
| `src/tts/errors.js` | typed errors, `retryable`, HTTP→error mapping | server |
| `src/tts/normalize.js` | canonical text, speaker-label stripping, length guards | server |
| `src/tts/ssml.js` | SSML building + escaping, pinyin → Azure SAPI phones | server |
| `src/tts/overrides.js` | pronunciation matching, override versioning, verification rules | server |
| `src/tts/request.js` | request validation and construction | server |
| `src/tts/contentHash.js` | **SERVER-ONLY** (`node:crypto`) — the cache key | server |
| `src/tts/config.js` | environment validation, redacted config summary | server |
| `src/tts/retry.js` / `concurrency.js` / `log.js` | backoff, bounded fan-out, redacting logger | server |
| `src/tts/providers/{azure,mock,index}.js` | `AzureTTSProvider`, `MockTTSProvider`, registry | server |
| `src/tts/records.js` | cache-hit / stale / dedupe decisions, row + job payloads | server |
| `src/tts/sources.js` | vocabulary + utterance rows → speakable units | server |
| `src/tts/utterances.js` | story content → scenes and utterances | server |
| `src/tts/storage.js` / `repository.js` | Supabase adapters (client injected) | server |
| `src/tts/runner.js` | plan → confirm → execute, with jobs | server |
| `src/ttsAudio.js` | browser lookup of stored clips | **browser** |
| `src/AudioButton.jsx` / `src/audioPlayback.js` | accessible player, one-voice-at-a-time | **browser** |

### Azure specifics

REST (`POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`)
rather than the Speech SDK: the pipeline is short-lived Node scripts, the SDK is
built for streaming scenarios we do not have, and the repo already calls a TTS
REST endpoint with plain `fetch`. **No new dependency was added.**

```xml
<speak version="1.0" xmlns="…" xmlns:mstts="…" xml:lang="zh-CN">
  <voice name="zh-CN-XiaoxiaoNeural">
    <prosody rate="-20%">我今天去银行。</prosody>
  </voice>
</speak>
```

At rate `1.0` the `<prosody>` element is omitted entirely, keeping the common
case's markup — and therefore its hash — minimal.

### ⚠️ `<phoneme>` does not work on zh-CN

Microsoft documents a zh-CN SAPI phone set (tone-numbered pinyin, `yin2 hang2`),
and `src/pinyin.js` already produces exactly that shape. **The service rejects
it anyway.** Measured against a live Speech resource:

| request | result |
|---|---|
| `<phoneme alphabet="sapi">` on `zh-CN-XiaoxiaoNeural` | **400**, empty body |
| same on `YunxiNeural`, `XiaoyiNeural`, `XiaoxiaoMultilingualNeural` | **400** |
| same with `alphabet="ipa"` | **400** |
| `<phoneme alphabet="ipa">` on `en-US-JennyNeural`, same resource and key | **200** |
| `<sub>`, `<say-as>`, `<mstts:express-as>` on zh-CN | **200** |

So the element is unsupported for Mandarin — not misconfigured, and not a
credential or quota problem. Emitting it fails the entire request, which is far
worse than an imperfect reading, so `LOCALE_CAPABILITIES` in `constants.js`
records `{'zh-CN': {phoneme: false}}` and `ssml.js` skips the pin. When a pin is
skipped the reported override version is `none`, which keeps the content hash
honest: editing a pronunciation that *cannot* be expressed must not mark audio
stale and buy a re-render of an identical sound.

**This is a real capability gap versus the Google pipeline**, where
`<phoneme alphabet="pinyin">` works and ships today. Azure's supported route for
Mandarin is a **hosted custom lexicon**:

```xml
<lexicon uri="https://…/lexicon.xml"/>
```

an XML file of `<lexeme><grapheme>银行</grapheme><phoneme>yin2 hang2</phoneme></lexeme>`
entries served from a public URL — which the existing public `audio` bucket can
host. `tts_pronunciation_overrides` already holds exactly the data such a file
needs, so this is a generator plus one SSML line, not a redesign. Not built yet;
judge by ear first, since Azure's zh-CN voices do their own word-level analysis
and may read common polyphones (银行, 长城, 觉得) correctly unaided.

---

## 3. Environment variables

Server-side only, in the gitignored `.env.script` (and as GitHub Action secrets
if you automate it). **Never** prefix any of these with `VITE_` — that would bake
them into every visitor's browser bundle.

| variable | required | notes |
|---|---|---|
| `AZURE_SPEECH_KEY` | yes (to generate) | paid credential; read only by `tts-generate.mjs` |
| `AZURE_SPEECH_REGION` | yes (to generate) | lowercase alphanumeric, e.g. `westeurope` |
| `TTS_DEFAULT_PROVIDER` | no | `azure` (default) or `mock` |
| `TTS_DEFAULT_LOCALE` | no | `zh-CN` |
| `TTS_FLASHCARD_VOICE` | no | `zh-CN-XiaoxiaoNeural` |
| `TTS_STORY_VOICE` | no | `zh-CN-XiaoxiaoMultilingualNeural` |
| `TTS_MALE_VOICE` | no | `zh-CN-YunxiNeural` |
| `TTS_TIMEOUT_MS` / `TTS_MAX_RETRIES` / `TTS_CONCURRENCY` | no | 20000 / 3 / 3; concurrency hard-capped at 8 |
| `TTS_INTEGRATION` | no | must be `1` to allow the real-Azure check |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | yes | already used by every content script |

A misspelled voice or a malformed region fails at startup, before a single paid
request. Placeholders live in `.env.example`.

**Azure setup:** create a *Speech* resource in the Azure portal, copy KEY 1 and
the region (its short lowercase form). No other Azure configuration is needed —
neural voices and the SAPI phone set are available on the standard tier.

**The browser needs none of this.** No `VITE_` variable was added, and no
frontend deployment change is required for Vercel or GitHub Pages.

---

## 4. Database

Two migrations, **structure only** — neither generates audio or inserts rows.

`supabase/migrations/20260722140000_add_tts_audio.sql`

- **`tts_audio`** — one row per (`source_type`, `source_id`, `variant`, `locale`),
  which is the idempotency key. Holds the source and normalized text, every
  synthesis input (provider, voice, rate, override version, output format,
  `synthesis_config_version`), the `content_hash`, `status`, `storage_path`,
  `duration_ms`, `byte_length`, `character_count`, `request_count`, `error_code`
  / `error_message`, and `generated_at` / `approved_at` / `approved_by`.
  RLS: authenticated read of `status='ready'`; admins read everything; **no write
  policy at all**, so only the service key can write.
- **`tts_pronunciation_overrides`** — `matched_text`, `pinyin`, `context`,
  `provider_representation`, `locale`, `verification`, `reviewer_note`.
- **`tts_jobs`** — durable work items with `attempts`, `max_attempts`,
  `request_count`, `character_count`, claim fields, plus a **partial unique index**
  on (`source_type`,`source_id`,`variant`,`locale`) `where status in ('pending','processing')`
  so the same clip can never be queued twice.
- **`tts_claim_jobs(...)`** — security-definer, `FOR UPDATE SKIP LOCKED`, revoked
  from `anon` and `authenticated`. Also reclaims jobs left `processing` by a
  killed run.

`supabase/migrations/20260722150000_add_story_utterances.sql`

- **`story_utterances`** — `story_id`, `scene_index`, `utterance_index`,
  `speaker_id`, `hanzi`, `pinyin`, `translation`, `voice`, `speaking_rate`,
  `delivery_style`, `pause_before_ms`, `pause_after_ms`. Unique on
  (`story_id`,`utterance_index`).

`stories.content`, `stories.has_audio` and `vocabulary.audio_path` are
**untouched**. Until rows exist, every screen plays exactly what it plays today.

### Storage

Existing public `audio` bucket. Path:

```
tts/{locale}/{sourceType}/{sourceId}/{variant}/{contentHash}.mp3
tts/zh-CN/vocabulary/2b1f…/word_slow/9ac3….mp3
```

Content-addressed, so re-uploading identical audio is a no-op rather than a
duplicate, and regenerating writes a **new** object — a deploy can never catch a
learner mid-play with a half-replaced file. Superseded files are deleted only
*after* the row points at the new one.

The bucket is public (as it already is for vocabulary audio): a clip is
level-appropriate learning content, not user data. If signed URLs are ever
needed, `src/ttsAudio.js` is the only place that turns a path into a URL.

---

## 5. Caching, staleness and cost

The content hash is the whole strategy. It covers **every** input that can change
the audio:

```
v=1
provider=azure
locale=zh-CN
voice=zh-CN-XiaoxiaoNeural
contentType=word
rate=0.80
format=mp3-24khz-48kbit-mono
overrides=银行=yínháng
text=银行
```

- hash matches a `ready` row → **cache hit**, no request, no cost.
- hash differs → **stale**; the old clip keeps playing until regenerated.
- no row / no hash (legacy Google audio) → **stale**, so a backfill needs no data
  migration.
- `rejected` → left alone unless `--include-rejected`.

**Invalidate deliberately** by bumping `SYNTHESIS_CONFIG_VERSION` in
`src/tts/constants.js`: it marks everything stale and eligible, and deletes
nothing.

Cost safeguards, in order of how often they save you:

1. dry run is the default — `--confirm` is required for any paid request;
2. `--limit` defaults to **20 source records**, hard maximum 200 without `--override-max`;
3. cache hits are never re-synthesized;
4. concurrency is capped at 8;
5. auth failures are never retried;
6. `request_count` / `character_count` are recorded per clip and per job, so a
   paid run is auditable after the fact.

---

## 6. Operator runbook

### First-time setup

```bash
# 1. Apply both migrations (Supabase SQL editor, or the GitHub integration on merge).
# 2. Put the Azure values in .env.script (gitignored). See .env.example.
# 3. Load the pronunciation overrides.
node --env-file=.env.script tts-overrides.mjs              # preview
node --env-file=.env.script tts-overrides.mjs --apply
```

### Flashcards

```bash
# See what a run would do. Spends nothing.
npm run tts:dry-run -- --level 1

# Generate at most 20 vocabulary rows (up to 80 clips).
npm run tts:generate -- --limit 20 --confirm

# Only words with no audio at all.
npm run tts:generate -- --flashcards --missing-only --limit 20 --confirm

# Only clips whose text or pronunciation changed.
npm run tts:generate -- --stale-only --limit 20 --confirm

# A specific word, all four variants.
npm run tts:generate -- --id 2b1f0f5e-… --confirm

# Rehearse the whole pipeline for free.
npm run tts:generate -- --provider mock --limit 20 --confirm
```

### Stories

```bash
# 1. Split stories into utterances (no audio, no cost).
node --env-file=.env.script story-utterances.mjs --language chinese          # preview
node --env-file=.env.script story-utterances.mjs --language chinese --apply

# 2. Narrate one story.
npm run tts:generate -- --story-id 7c3d…  --confirm

# 3. One line that came out wrong: fix the text, re-sync, regenerate just it.
npm run tts:generate -- --stories --id <utterance-uuid> --confirm
```

### Recovering from failures

```bash
npm run tts:retry-failed -- --limit 20 --confirm
```

Failed clips keep a `failed` row with an `error_code`, and any previously good
audio keeps playing. A killed run leaves claimable jobs; the next run picks them
up after the stale-claim timeout (30 minutes). `Ctrl-C` cancels in flight rather
than aborting mid-upload.

### Reading the output

Every run prints the plan before acting: clips considered, how many are already
generated, what will be generated and why, and the estimated request and
character counts. `--json` adds one machine-readable summary line.

---

## 7. Pronunciation overrides

Mandarin polyphones are the main source of wrong-sounding TTS.

> **Current status on Azure zh-CN: overrides are collected and stored, but not
> applied**, because the service rejects `<phoneme>` for Mandarin (see §2). They
> take effect the moment the custom-lexicon path lands, or on any provider that
> supports pinning. Everything below describes data that is already correct and
> in place — it is the delivery mechanism that is missing.

Two sources feed the same table:

1. **Automatic, per word.** A flashcard's *word* clips carry
   `vocabulary.reading` — the curriculum's own authoritative pinyin. Recorded as
   `verification: 'inferred'`, never `verified`.
2. **The override table**, for sentences, stories and names.
   `data/tts-pronunciation-overrides.json` seeds ~24 high-value corrections
   (银行/行李, 长城/校长, 觉得/睡觉, 重要/重新, 音乐/快乐, 还是/还给, 教师/教书 …).

Matching is longest-first and non-overlapping, so 银行 consumes its own 行 and a
行 override cannot reach inside it. Overrides are word- and phrase-level by
design — an isolated ambiguous character has no correct reading.

**Verification states:** `unreviewed` → `inferred` → `needs_review` → `verified` /
`rejected`. `verified` and `rejected` can **only** be set by a human action;
`assertVerificationChange()` throws otherwise, and `tts-overrides.mjs` refuses to
bulk-load either. `rejected` overrides are never applied.

**Workflow for a wrong reading:**

```bash
# 1. Add or edit the entry in data/tts-pronunciation-overrides.json
# 2. Load it, and mark the affected clips stale (they keep playing meanwhile)
node --env-file=.env.script tts-overrides.mjs --apply --mark-stale
# 3. Regenerate just those
npm run tts:generate -- --stale-only --limit 20 --confirm
```

---

## 8. What the learner sees

**Flashcards** (`src/Study.jsx`): the existing *Replay* button now plays the
generated word clip (falling back to the legacy file); a turtle-icon button plays
a genuinely slower rendering (synthesized at 0.8×, not a dragged-out playback);
the example sentence gets its own small *Sentence* control, with a slow variant
where generated. Autoplay-on-flip behaviour and the 1× / 0.75× / 0.5× preference
are unchanged.

**Stories** (`src/useStoryReaderCore.js`, all four readers): narration resolves
per line — generated utterance clip, then the legacy per-line file, then browser
speech synthesis — so a partly-generated story never goes silent. The next line
is preloaded while the current one plays; `replayLine()` repeats one line;
leaving the reader cancels playback.

**Everywhere:** `claimPlayback()` guarantees one voice at a time. `AudioButton`
is a real `<button>` with an accessible name, an `aria-live` "Playing"
announcement, and a quiet labelled "not available yet" state instead of a button
that does nothing.

---

## 9. Testing

```bash
npm test          # everything, including the TTS suite. No network, no cost.
```

The suite covers the provider abstraction, Azure request construction (with an
injected `fetch`), SSML escaping and injection resistance, text normalization,
override matching and verification rules, content hashing, cache hits, stale
detection, deduplication, retries, timeouts, rate-limit handling, cancellation,
invalid configuration, job idempotency and status transitions, storage failures
and orphan prevention, the client audio lookup, and overlapping-playback
prevention. `src/tts/serverOnly.test.js` enforces the credential boundary.

**Every paid request is mocked.** The only real-Azure path is opt-in:

```bash
TTS_INTEGRATION=1 npm run tts:integration -- --confirm
```

It refuses to run without *both* the environment flag and `--confirm`, synthesizes
9 short samples, writes them to the gitignored `artifacts/tts-integration/`,
prints exact request and character counts, and touches no table and no bucket.

---

## 10. Deployment and rollback

**Deploy order:** apply the migrations → deploy the frontend → (optionally)
generate audio. Any order works, because every step degrades gracefully: the app
without the tables shows legacy audio, and the tables without audio show the
existing controls.

**No frontend environment change is required.**

**Rollback:**

| to undo | do |
|---|---|
| the UI | revert the frontend deploy; stored rows are simply unused |
| a bad batch | `update tts_audio set status='rejected' where …` (files keep existing) |
| a pronunciation | edit the override, `--mark-stale`, regenerate |
| the whole feature | `drop table public.tts_jobs, public.tts_audio, public.tts_pronunciation_overrides, public.story_utterances cascade;` plus `tts_claim_jobs` and `tts_touch_updated_at`. Nothing else depends on them; `vocabulary.audio_path` and `stories.has_audio` are untouched, so the app returns to today's behaviour exactly. |

---

## 11. Known limitations

- **Pronunciation pinning is inactive on Chinese** — the highest-priority gap.
  Azure rejects `<phoneme>` for zh-CN (§2), so the pinyin-guided readings that
  the Google pipeline delivers today are not reproduced here. The next step is a
  hosted custom lexicon. **Judged by ear and found acceptable**: Azure's own
  word-level analysis handles 觉得 / 睡觉 correctly, so the gap is cosmetic today.
  Revisit if a wrong reading is reported.
- **Throttling is easy to hit.** Concurrency 3 drew steady 429s on a standard
  resource, so the default is 2. Raise `TTS_CONCURRENCY` only if your tier allows.
- **Chinese only.** `SUPPORTED_LOCALES` is `['zh-CN']`. Japanese and Russian keep
  the existing Google pipeline. Adding a language means a locale, a voice list
  and a pronunciation strategy — the interfaces are already language-agnostic.
- **No admin review UI yet.** The schema supports approve / reject / needs-review
  and the admin RLS policies exist, but `/dashboard` has no audio panel. The CLI
  and SQL are the review surface today. Tracked in `ROADMAP.md`.
- **`duration_ms` is the synthesis round-trip, not the clip length.** Measuring
  real duration needs MP3 frame parsing; the column is ready for it.
- **Sentence-level overrides are position-blind.** They pin every occurrence of a
  span in a sentence, which is right for polyphones and wrong for a word that
  genuinely changes reading twice in one sentence. No such case is known in the
  current corpus.
- **No real-device audio pass yet** (iOS/Safari especially). The pipeline itself
  is verified against live Azure — see §13.
- **The backfill has not been run.** Existing levels still serve their legacy
  Google clips.

---

## 12. Story casting

Each utterance carries its own voice. `assignSpeakerVoices()` casts a story
deterministically, so re-syncing never re-voices a story a learner has heard:

1. the narrator keeps the story voice;
2. **no character ever shares the narrator's voice** — otherwise dialogue and
   narration are indistinguishable, which defeats the point;
3. a character of known gender is cast from that gender's pool
   (`VOICE_POOLS` in `constants.js`), via `CHARACTER_GENDER` in `utterances.js`
   — 妈妈/小红/小花 female, 李明/小明/大力 male, family roles included;
4. two characters never share a voice while an unused one remains.

Unlisted speakers (店员, 服务员, 路人) alternate across both pools, so a crowd of
anonymous roles does not all come out one gender. To fix a mis-cast character,
add them to `CHARACTER_GENDER` and re-run `story-utterances.mjs --apply`.

Verified on the real corpus: 45 stories, 550 utterances.

## 13. What has been verified against live Azure

| | |
|---|---|
| Flashcard clips generated | 96 (24 words × 4 variants) |
| Story clips generated | 26 across 2 stories |
| Failures after the `<phoneme>` fix | 0 |
| Casting on the real corpus | 45 stories, 550 utterances, 3 distinct voices in a 7-line story |
| Cache behaviour | a re-run reported the existing clips as cache hits and spent nothing |
| Idempotency | `tts-overrides.mjs --apply` twice → `24 new`, then `0 new / 24 updated` |
| Audio quality | judged good by ear, including 觉得 / 睡觉 |

Not yet verified: a real-device (iOS) listening pass, and the full backfill.

## 14. Adding another provider (MiniMax, ElevenLabs, …)

The integration point is deliberately small:

1. Write `src/tts/providers/minimax.js` exporting a class with
   `synthesize(request, { signal })` that returns a `TTSResult`. Map HTTP
   statuses onto the typed errors in `errors.js` so retry behaviour is inherited.
2. Register it in `src/tts/providers/index.js`.
3. Add its name to `PROVIDERS` in `src/tts/config.js`.
4. If it wants different markup, branch inside `ssml.js` (or give the provider its
   own builder) — `request.ssml` is the only field a provider consumes.

Nothing else changes. `provider` is already part of the content hash, so
switching providers marks existing audio stale and regenerable rather than
silently mixing voices. Running both in parallel per content type is a matter of
choosing a provider per unit in `sources.js`.
