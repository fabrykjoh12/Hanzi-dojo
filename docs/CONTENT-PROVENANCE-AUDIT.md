# 📜 Content provenance audit

**Research only — 2026-08-15. Nothing was changed.** This is the evidence base for
release blocker #1 in [`PRE-RELEASE-READINESS-AUDIT.md`](PRE-RELEASE-READINESS-AUDIT.md).
Every claim carries a path or file:line. Where the repository cannot answer a
question, this document says **"cannot determine from repo"** — that phrase is the
single most important output here, and it appears 15 times.

> ✅ proven safe · 🟡 probably safe, evidence missing · 🟠 needs terms/provenance documented · 🔴 cannot ship until resolved

**Baseline fact that shapes everything below:** `git ls-files | grep -iE
"licen|notice|copying|attrib|third.?party|credits|copyright"` over all **1,179
tracked files returns zero matches.** There is no `LICENSE`, no `NOTICE`, no
attribution file, and `package.json` has no `license` key. Git history is
squashed — the initial commit added every pre-existing asset at once, so **git
provides no per-asset provenance** for anything predating 2026-07.

---

## Executive summary

| Status | Count | Items |
|---|---|---|
| 🔴 Cannot ship until resolved | **3** | Icon master lineage · the `© BRAND_NAME` artwork claim · Azure TTS commercial tier |
| 🟠 Needs terms/provenance documented | 7 | Higgsfield art terms · LLM story text · missing manifests · CC-CEDICT ShareAlike · HSK glosses · hanzi-writer-data · third-party brand marks |
| 🟡 Probably safe, evidence missing | 4 | Fonts · lucide · Tatoeba · unused stock scaffold files |
| ✅ Proven safe | 2 | CC-CEDICT/Tatoeba *are* attributed · HSK source dataset is MIT |

**The three that genuinely block:**

1. **Every shipped app icon derives from a file of unknown origin.** `src/assets/86055582-d1d3-4cb7-a460-6c907025fe15.png` — a UUID-named PNG with **no metadata whatsoever** (verified: no `tEXt`, `iTXt`, `zTXt`, `eXIf` chunks; 1254×1254, colortype 2). The repo describes it as "stock" five times but names no source, marketplace, licence, order number or author.
2. **The published Terms claim ownership that is not evidenced.** `src/TrustPages.jsx:196` states *"Stories, artwork, and app design are © {BRAND_NAME}"* — a public legal claim covering artwork whose rights are unrecorded, including artwork derived from (1).
3. **Azure grants commercial rights for prebuilt neural voices on paid tiers only.** If the Speech resource is free-tier (F0), the ~10,500 shipped audio clips are unlicensed for commercial use. Tier is an Azure portal setting — **cannot determine from repo**.

---

## 1 · The icon master — 🔴

| Question | Answer |
|---|---|
| Where it came from | **Cannot determine from repo.** No metadata chunks, UUID filename, added in the squashed initial commit |
| Commercial use permitted? | **Unknown** |
| Attribution required? | **Unknown** |
| Modification permitted? | **Unknown** — and it *has* been heavily modified |
| Output/ownership terms | **Unknown** |
| Provenance documented? | **No** |
| Prompt/source evidence? | **None** |
| Shipped publicly? | **The file itself is not bundled — but every shipped icon is a pixel-derivative of it** |

**Why this is load-bearing.** The approved V2 mark is a *cleaned raster of this file*,
not a redraw. `docs/P14-APP-ICON-V2-BRUSH.md:20-23`: *"V1–V3 are not redrawings.
They are image-processing passes over the actual production mark
(`src/assets/86055582-…png`, keyed exactly as the production generator keys it),
so the gesture is the original's own by construction."* V3 was the vector
reconstruction; **V2 — the approved one — is the cleaned raster.**

Everything downstream inherits the lineage:
`docs/icon-v2/brush/masters/mask-V2.png` → `tools/generate-app-icons.mjs` →
`public/icon-192.png`, `icon-512.png`, `maskable-512.png`, `monochrome-512.png`,
`apple-touch-icon.png`, `public/favicon.svg`, all 30 `android/.../mipmap-*`
files, all 3 `ios/.../AppIcon.appiconset` files, and `assets/icon-*.png`.

**What the objective evidence supports.** The file is a flattened RGB composite
in which transparency was faked by a checkerboard pattern that the generator
chroma-keys out (`tools/generate-app-icons.mjs`, `tools/icon-v2-brush.mjs:42`).
A baked checkerboard plus a UUID filename plus zero metadata is *characteristic
of a watermark-free preview download from a stock-image marketplace* — but that
is an inference, not a sourced fact, and the "stock" wording in
`docs/P14-APP-ICON-V2-AUDIT.md:33,609` was this project's own earlier
characterisation rather than a record of purchase. **Treat the origin as
genuinely unknown in both directions.**

**Resolution needs one of:** the owner producing the acquisition record
(marketplace, licence tier, order ID, date); or confirmation it was
commissioned/self-made; or — if neither exists — regenerating the mark from a
provenance-clean source. Note the V3 polar reconstruction in
`docs/icon-v2/brush/masters/mark-V3.svg` is *also* derived from the same raster
(it measures that image's geometry), so it is **not** a clean-room escape hatch.

---

## 2 · Story cover artwork — 🟠

| | |
|---|---|
| Paths | `data/story-covers.json` — **267 remote CDN entries** (`d8j0ntlcm91z4.cloudfront.net/user_3F2f9…`); `public/story-covers/generated/` — 3 `.webp`; `data/covers/jlpt*/` — 8 orphaned PNGs, zero references |
| Produced by | Higgsfield MCP, interactively. `generate-story-images.mjs:5-19` states the script itself does **not** generate — it only `--apply`s a manifest |
| Model | **Cannot determine from repo** — the cover manifest has no `_comment`, no model field. (`nano_banana_pro` appears only in the *manhua* manifests) |
| Shipped? | **Yes** — served at runtime from the public Supabase `audio` bucket at `stories/<id>/cover.<ext>` (`src/StoryCover.jsx:21` → `src/utils.js:73-76`). The 3 local `.webp` are also statically served |
| Provenance evidence | Source CDN URL + natural key only. **No prompts, no model, no licence record** |

## 3 · Manhua panel artwork — 🟠

**127 `.webp` panels across 4 series, committed to `public/stories/**` and bundled
verbatim by Vite** (verified: `dist/client/stories` = 127 files). Committed
deliberately so the reader has no runtime storage dependency
(`fetch-manhua-art.mjs:9-17`).

| Series / episode | Panels | Manifest | Model named? |
|---|---|---|---|
| inkbound hsk1/ep01 | 12 | yes | **No `_style_comment`** |
| inkbound hsk2/ep02 | 19 | yes | `nano_banana_pro` at 2k |
| inkbound hsk3/ep03 | 18 | yes | `nano_banana_pro` at 2k |
| noodleshop hsk1/ep01 | 16 | yes | `nano_banana_pro` at 2k |
| noodleshop hsk1/ep02 | 14 | yes | `nano_banana_pro` at 2k |
| noodleshop hsk2/ep03 | 15 | yes | `nano_banana_pro` at 2k |
| train hsk2/ep01 | 17 | yes | Art direction only, **no model** |
| **upstairs hsk3/ep01** | **16** | **NONE** | **Nothing at all** |

> **New finding, not in the previous audit:** the 16 shipped `upstairs` panels
> have **no `.art.json` manifest whatsoever** — no source URL, no model, no
> art-direction note. `grep -rln "upstairs" data/manhua/*.art.json` returns
> nothing. Also unmanifested: `data/manhua/references/upstairs-hsk3-cast.webp`,
> and 2 of the 5 `data/manhua/bible/` character sheets (`bible-sheets.art.json`
> itself says they "were committed by hand before this manifest existed").

**Manifest key structure — complete, all 9 files:** `_comment`, `_style_comment`
(6 of 9), `dir`, `assets[]` where each asset has **exactly two keys: `file`,
`url`**. **Generation prompts are stored nowhere** — `grep -rn '"prompt"' data/`
returns zero. What exists is a *reusable template*, not per-image records:
`docs/STORY-BIBLE.md:275-283` (the verbatim-locked CRITICAL CONSTRAINTS block,
including *"no resemblance to any existing franchise or artist"*) and `:290-291`
(*"Never name a franchise, a studio or an artist in a prompt"*).

**The policy is excellent and enforced** — `docs/STORY-BIBLE.md:273-274` records
14 of episode 2's 19 panels being regenerated for breaching it. **What's missing
is per-image evidence that it was applied.**

### Higgsfield terms — the good news

Higgsfield's published terms are **favourable** and do not block:

> "Higgsfield does not claim ownership of any of your Inputs or Outputs, nor
> does it restrict your commercial use of Outputs… There is no separate
> commercial license to purchase: commercial use rights follow from the Terms of
> Use for all users… Your rights in Outputs you have generated and exported
> survive cancellation… and you may transfer or sublicense your rights in
> Outputs."

Source: [Higgsfield — Who owns my generations](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially) ·
[Terms of Use](https://higgsfield.ai/terms-of-use-agreement) ·
[Terms/Privacy update](https://higgsfield.ai/blog/terms-of-use-privacy-policy-update)
(new terms effective 2026-08-27). *Fetched via search summary — `higgsfield.ai`
is blocked by this sandbox's egress proxy, so **the owner should archive a PDF of
the terms as they stood on the generation dates**.*

**Two residual questions:** (a) `nano_banana_pro` is Google's Gemini image model
accessed *through* Higgsfield — whether Google's model terms impose anything
beyond Higgsfield's grant is **not determinable from either the repo or
Higgsfield's summary**; (b) Higgsfield's terms grant rights but **do not
indemnify** against a third-party infringement claim, which is exactly why the
missing prompt archive matters.

## 4 · Story text — 🟠

| Pipeline | Provider | Model |
|---|---|---|
| Standard generation (`llmProviders.mjs:63-84`) | Gemini, then Groq on failover | `gemini-2.5-flash-lite` / `llama-3.3-70b-versatile` |
| Premium (`llm.mjs:73-107`) | Anthropic | `claude-sonnet-5` (fallback `gemini-2.5-flash`) |
| **Human/assistant-authored** (`authored-stories.mjs:4-6`) | none | **176 stories in `data/authored-stories.json`** |

Story text lives in the Supabase `stories` table and is fetched at runtime; the
repo copies are seed inputs, not bundled. `generate-stories.mjs:4-6` is marked
**LEGACY** — not used for new content.

**Gap:** the authored pipeline is labelled *"Human/Claude-authored"* with **no
per-story marker**, so which of the 176 were typed by a person versus drafted by
an assistant **cannot be determined from repo**. This matters only if a
jurisdiction's copyright rules on AI-assisted text become relevant to the
ownership claim in §8 — flagged, not alarmist.

**Commercial-use terms for Gemini / Groq / Anthropic outputs: not recorded
anywhere.** All three providers' standard terms assign output rights to the
customer, but that needs citing, not assuming.

## 5 · TTS / audio — 🔴 (tier) / 🟠 (record)

| | |
|---|---|
| Current provider | **Microsoft Azure Neural TTS** — `src/tts/providers/azure.js:27-29` |
| Voices | `zh-CN-XiaoxiaoNeural`, `zh-CN-XiaoxiaoMultilingualNeural`, `zh-CN-YunxiNeural`, plus casting pools of 8 (`src/tts/constants.js`) |
| Legacy provider | **Google Cloud TTS** — rows still served (`docs/TTS.md:245`); `cmn-CN-Chirp3-HD-Aoede`, `cmn-CN-Wavenet-A` |
| Volume | ~**10,522 clips** (`docs/CHANGELOG.md:89`) |
| Shipped? | **Nothing in the bundle** — zero audio files in the repo; all streamed from the public Supabase `audio` bucket |

🔴 **The blocking question.** Microsoft grants commercial usage rights for
prebuilt neural voices **to paid-tier customers only**; the free F0 tier is not
licensed for commercial use. The tier is an Azure portal setting and **cannot be
determined from repo** — `.env.example` records only `AZURE_SPEECH_KEY` and
`AZURE_SPEECH_REGION`. **The owner must confirm the Speech resource is S0
(paid), not F0.** If it is F0, every shipped clip needs regenerating on a paid
resource. Same question applies to the legacy Google TTS rows still being served.

Sources: [Azure TTS transparency note](https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/transparency-note) ·
[TTS code of conduct](https://learn.microsoft.com/en-us/legal/cognitive-services/speech-service/text-to-speech/code-of-conduct)
(both `learn.microsoft.com` pages are egress-blocked here; findings via search
summaries — **owner should confirm against Microsoft Product Terms directly**).

## 6 · Fonts — 🟡

**Zero font binaries in the repo** (verified: no `.woff/.woff2/.ttf/.otf`
outside `node_modules`; no `@font-face` anywhere). Nothing is redistributed, so
no OFL redistribution obligation is triggered.

| Font | How | Licence |
|---|---|---|
| Noto Sans SC, Inter, Poppins | Google Fonts CDN, `index.html:24` | OFL 1.1 (**not stated in repo**) |
| Noto Sans JP | CDN, lazy (`src/fontLoader.js:13`) | OFL 1.1 (**not stated**) |
| Songti SC, SimSun, Kaiti SC, Hiragino Mincho, Georgia… | **system only** — `src/readingFonts.js:11-13` explicitly: *"NO WEB FONT IS LOADED by any of these stacks"* | n/a |

Risk is low; a NOTICE entry closes it. The live consideration is *privacy* not
licensing — every cold start sends the user's IP to Google (already disclosed at
`src/TrustPages.jsx:136`).

## 7 · Icons and UI graphics — 🟠

| Asset | Shipped? | Finding |
|---|---|---|
| `lucide-react` (66 import sites) | **Yes**, tree-shaken into JS | ISC upstream; **no licence text in repo** — ISC requires the notice be retained |
| **`public/icons.svg`** | **Yes** — in `dist/client/`, publicly fetchable | 🟠 Contains **Bluesky, X, GitHub and Discord brand marks** (trademarks, not just copyright). **Referenced by zero app code** — dead but deployed. Origin cannot be determined from repo |
| `src/assets/react.svg` | No (unbundled) | Stock Vite scaffold; React logo is a Meta trademark. Unused — safe to delete |
| `src/assets/logo.svg`, `hero.png` | No | Unreferenced; origin cannot be determined from repo |
| `public/favicon.svg` + 5 PNG icons | **Yes** | All derive from §1 — inherit its status |
| `android/.../drawable/ic_launcher_background.xml`, `drawable-v24/ic_launcher_foreground.xml` | In repo, inert | Android Studio template leftovers (teal grid, **stock green Android robot**). Already flagged for deletion in the icon audit |
| `src/assets/Hanzi-logo.png` | **Yes** — bundled, on 8 screens | 🟠 Origin **cannot be determined from repo**; `docs/BACKLOG.md:271-273` says it is "the same ensō" as the icon, i.e. likely the same lineage as §1 |
| `src/assets/bg-*.webp` (4) | **Yes** — bundled | 🟠 Only `bg-russian` is documented (Higgsfield, `TASKS.md:56`, `docs/CHANGELOG.md:412`, **no model named**). `bg-chinese`, `bg-japanese`, `bg-login` — origin **cannot be determined from repo**. The four `.png` originals (~4.5 MB) are unreferenced dead weight |

## 8 · Dictionary and linguistic data — ✅ / 🟠

| Dataset | Licence | Attributed? |
|---|---|---|
| **CC-CEDICT** (~120k entries, DB-resident) | CC BY-SA (3.0/4.0) | ✅ **Yes** — `src/TrustPages.jsx:198-199` (Terms) and `:306` (Methodology), plus `seed-dict.mjs:10` |
| **Tatoeba** (DB-resident) | CC BY 2.0 FR | ✅ **Yes** — `TrustPages.jsx:200-201` |
| **HSK 3.0 lists** (`data/hsk*.json`) | Source dataset **MIT** (`drkameleon/complete-hsk-vocabulary`) | 🟠 **Source not attributed to users**, and `src/hskBuild.js:11` concedes the glosses are *"CC-CEDICT-style dumps"* — the shipped flashcard meanings are visibly CC-CEDICT text (e.g. 把 → "to hold; to grasp; to hold a baby in position to help it urinate or defecate"). **The CC-CEDICT-derived nature of the flashcard glosses is not attributed** |
| **hanzi-writer-data** (CDN at runtime, `src/strokeData.js:19`) | Corpus derives from Make Me a Hanzi / **Arphic PL** | 🟠 **Not attributed anywhere.** Arphic PL has its own notice requirements |

🟠 **CC-CEDICT ShareAlike is a live obligation, not just attribution.** CC BY-SA
requires: appropriate credit **+ a link to the licence + indicating changes**,
and that adaptations be distributed under the same licence. The project *has*
adapted it (pinyin corrections, curated readings). Current attribution names the
licence but does not **link the licence deed** or **indicate changes**. The
share-alike obligation attaches to the *dictionary dataset as redistributed*, not
to the app's code — but it does need stating.
Source: [CC BY-SA 4.0 deed](https://creativecommons.org/licenses/by-sa/4.0/deed.en)

## 9 · The ownership claim — 🔴

`src/TrustPages.jsx:196-197`, live on `/terms` today:

> *"Stories, artwork, and app design are © {BRAND_NAME}. They are for your
> personal learning use, not for republication."*

This is a **public legal claim of copyright ownership over artwork**, asserted
with no underlying rights record for: the icon master (§1), `Hanzi-logo.png`,
three of four backgrounds, 267 story covers, 127 manhua panels, and the
third-party brand marks in `public/icons.svg`.

For AI-generated output the claim is also *legally delicate* independent of
provenance — several jurisdictions do not recognise copyright in
purely machine-generated images. **This should be reviewed by whoever signs off
the Terms**, and is the cheapest of the three blockers to de-risk: softening the
wording costs one copy edit.

---

## Recommended minimum structure to keep before launch

Four artifacts. Deliberately minimal — this is what makes the claims defensible,
not a compliance programme.

### 1. `LICENSE` (repo root)
States the code licence (or "all rights reserved" if the repo stays private-source).
One paragraph. Resolves the missing `package.json` `license` key too.

### 2. `NOTICE.md` (repo root) — third-party attributions
One table, one row per dependency-with-obligations:

| Component | Licence | Obligation | Where satisfied |
|---|---|---|---|
| CC-CEDICT | CC BY-SA 4.0 | Credit + **licence link** + **indicate changes** + ShareAlike on the dataset | `/terms`, `/methodology` |
| Tatoeba | CC BY 2.0 FR | Credit | `/terms` |
| complete-hsk-vocabulary | MIT | Retain notice | NOTICE |
| hanzi-writer + hanzi-writer-data | MIT / Arphic PL | Retain notice | NOTICE |
| lucide | ISC | Retain notice | NOTICE |
| Noto Sans SC/JP, Inter, Poppins | OFL 1.1 | Notice (CDN-linked, not redistributed) | NOTICE |

### 3. `docs/CONTENT-LICENSING.md` — the generator terms record
One row per generator, with the terms **as they stood when content was
generated**, plus an archived PDF/screenshot alongside:

| Generator | Used for | Commercial use | Ownership | Evidence to archive |
|---|---|---|---|---|
| Higgsfield (`nano_banana_pro`) | Covers, panels, `bg-russian` | Permitted, sublicensable | Creator retains | ToS PDF at generation date + account/plan |
| Azure Neural TTS | ~10.5k clips | **Paid tier only** | — | **Screenshot of the resource's pricing tier** |
| Google Cloud TTS | Legacy clips | Standard terms | — | Terms citation |
| Gemini / Groq / Anthropic | Story text | Standard terms | Customer | Terms citation |

### 4. Per-asset provenance going forward — the one process change

**Archive the prompt with the output.** Extend the existing `.art.json` manifest
with two keys, since the format already exists and is already committed:

```jsonc
"assets": [
  { "file": "panel-01.webp",
    "url":  "https://…",
    "prompt": "…the full prompt, including the CRITICAL CONSTRAINTS block…",
    "generated": "2026-08-01" }
]
```

That single change converts the originality *policy* into per-image *evidence*,
and is the difference between answering a rights query in prose and answering it
with a record. Backfill is impossible for the existing 127 panels — but the
constraint block in `docs/STORY-BIBLE.md` is version-controlled and its
enforcement history is documented, which is a reasonable good-faith record for
work already done.

---

## Every "cannot determine from repo", in one list

1. Origin of `src/assets/86055582-…png` — **every shipped icon derives from it**
2. Origin of `src/assets/Hanzi-logo.png` — bundled, on 8 screens
3. Origin of `bg-chinese`, `bg-japanese`, `bg-login` — bundled and shipped
4. Origin of `src/assets/hero.png`, `logo.svg`
5. Origin of `public/icons.svg` (contains four companies' brand marks), shipped
6. Origin of the 8 orphaned `data/covers/jlpt*/*.png`
7. Which model produced the **267 story covers**
8. How the 3 `public/story-covers/generated/*.webp` were made
9. How the **16 shipped `upstairs/hsk3/ep01` panels** were made — no manifest exists
10. Which model produced the 12 `inkbound/hsk1/ep01` panels and 2 `bible` sheets
11. Which model produced the 17 `train/hsk2/ep01` panels
12. The prompt for **any individual one of the 127 shipped panels**
13. Which of the 176 authored stories are human- vs assistant-written
14. **Azure Speech resource tier (F0 vs S0)** — decides TTS commercial licensing
15. Commercial-use terms for every generator — none recorded in-repo
