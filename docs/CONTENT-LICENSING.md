# 🧾 Content licensing — the generator record

Hanzi Dojo's illustrations, speech audio and some story text were **generated**
rather than licensed from a rights holder. That is a different question from the
third-party components in [`NOTICE.md`](../NOTICE.md), and it needs its own
record: which tool made what, under whose terms, and whether those terms permit
commercial use.

This file is the record. It is deliberately honest about what is **not yet
established** — a question marked open here is open, not assumed fine.

Evidence behind every row: [`CONTENT-PROVENANCE-AUDIT.md`](CONTENT-PROVENANCE-AUDIT.md).

> ✅ settled · 🟠 terms believed fine, evidence not archived · 🔴 unresolved, blocks a commercial release

---

## The generators

| Generator | Used for | Commercial use | Ownership of output | Evidence to archive | Status |
|---|---|---|---|---|---|
| **Higgsfield** (model `nano_banana_pro`) | 127 manhua panels (`public/stories/**`), 267 story covers, `bg-russian` | **Permitted.** Higgsfield's published terms state it does not claim ownership of Inputs or Outputs, does not restrict commercial use, and that rights in Outputs may be transferred or sublicensed | Creator retains | **A dated PDF of the Terms of Use as they stood on the generation dates**, plus the account/plan the work was generated under | 🟠 |
| **Microsoft Azure Neural TTS** (`zh-CN-Xiaoxiao*`, `zh-CN-Yunxi`, casting pools) | ~10,522 audio clips — words, examples, story lines | **Paid tiers only.** Microsoft grants commercial usage rights for prebuilt neural voices to paid-tier customers; the free F0 tier is not licensed for commercial use | n/a | **A screenshot of the Speech resource's pricing tier**, showing S0 rather than F0 | 🔴 |
| **Google Cloud TTS** (`cmn-CN-Chirp3-HD-*`, `cmn-CN-Wavenet-A`) | Legacy clips still served (`docs/TTS.md:245`) | Standard Google Cloud terms | n/a | Terms citation for the generation period | 🟠 |
| **Google Gemini** (`gemini-2.5-flash-lite`, `gemini-2.5-flash`) | Story text, primary generator (`llmProviders.mjs:63-84`) | Standard terms assign output rights to the customer | Customer | Terms citation | 🟠 |
| **Groq** (`llama-3.3-70b-versatile`) | Story text, failover | Standard terms | Customer | Terms citation | 🟠 |
| **Anthropic** (`claude-sonnet-5`) | Story text, premium tier (`llm.mjs:73-107`) | Standard terms | Customer | Terms citation | 🟠 |

---

## The blocking question

🔴 **The Azure Speech resource tier is not knowable from this repository.**
`.env.example` records only `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`; the
tier is an Azure portal setting.

- If the resource is **S0 (paid)** — the expected answer — this row closes with a
  screenshot and nothing needs regenerating.
- If it is **F0 (free)** — every one of the ~10,522 shipped clips was produced
  without commercial rights and must be regenerated on a paid resource before
  release.

Nobody should guess this. **Owner action.**

---

## Per-image provenance

The manifests in `data/manhua/*.art.json` record where each panel came from, and
**as of 2026-08-15 they also record the prompt and the generation date** — see
"Manifest format" below.

**Records created before that date are incomplete, and are left that way.**
Backfilling a prompt after the fact would be inventing evidence, which is worse
than having none. What genuinely exists for the earlier work:

- The originality constraints are version-controlled and were in force the whole
  time — `docs/STORY-BIBLE.md:275-283` (a verbatim-locked CRITICAL CONSTRAINTS
  block including *"no resemblance to any existing franchise or artist"*) and
  `:290-291` (*"Never name a franchise, a studio or an artist in a prompt"*).
- Enforcement is documented: `docs/STORY-BIBLE.md:273-274` records 14 of one
  episode's 19 panels being regenerated for breaching those constraints.
- A grep of ~25 franchise, studio and brand names across `src/`, `data/` and
  `public/` returns **zero hits in story content**.

That is a reasonable good-faith record for work already done. It is not
per-image evidence, and this file does not pretend otherwise.

**Known gaps in the older records** (from the provenance audit):

- The 16 panels in `public/stories/upstairs/hsk3/ep01` have **no manifest at all**.
- `inkbound/hsk1/ep01` (12 panels), `train/hsk2/ep01` (17 panels) and 2 of the 5
  `data/manhua/bible/` character sheets name no model.
- The 267 story covers in `data/story-covers.json` carry a source URL only — no
  model, no prompt.

## Manifest format

`.art.json` files describe a generated image set. Each asset supports four keys:

```jsonc
{
  "dir": "public/stories/<series>/<level>/<episode>",
  "assets": [
    {
      "file": "panel-01.webp",
      "url": "https://…",               // where the generator returned it
      "prompt": "…the full prompt, including the CRITICAL CONSTRAINTS block…",
      "generated": "2026-08-15"          // ISO date, YYYY-MM-DD
    }
  ]
}
```

`prompt` and `generated` are **required for new entries** and validated by
`node fetch-manhua-art.mjs --check`. Older entries without them are reported as
a warning, never an error — the gap is real and is not going to be papered over.

---

## Open questions

1. **Azure tier — S0 or F0.** 🔴 Blocking. Owner.
2. **Higgsfield terms as at the generation dates.** The site is unreachable from
   the build sandbox; the owner should archive a dated PDF rather than relying on
   whatever the page says later.
3. **`nano_banana_pro` is Google's image model accessed through Higgsfield.**
   Whether Google's model terms add anything beyond Higgsfield's grant is not
   determinable from either source.
4. **Higgsfield grants rights but does not indemnify** against a third-party
   infringement claim. That is precisely why the prompt archive matters going
   forward.
5. **Which of the 176 stories in `data/authored-stories.json` are human-written
   versus assistant-drafted** is not recorded per story. Relevant only if a
   jurisdiction's rules on AI-assisted text bear on the ownership claim.
6. **The icon master's origin** — tracked in the provenance audit, not here,
   because it is a licensing question rather than a generation one.
