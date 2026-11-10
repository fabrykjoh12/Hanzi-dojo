# Content / reader / Chinese review (CNT-*)

The reviewer couldn't write this file, so this is the lead's transcription of its hand-back report. The lead checked CNT-01 against production.
Scripts and inputs: `harnesses/seg-audit.mjs`, `poly-audit.mjs`, `cov-audit.mjs`, `di-audit.mjs`, `spk.mjs`,
`dbh.txt` (DB hashes), `localh.txt` (repo hashes). The scripts import modules by absolute scratchpad path. Re-point
those paths at a checkout of 9a9f58f to re-run them.

## Coverage and sampling
- **Population:** 204 published Chinese stories in production.
- **Script audit, full:** 179 of them match repo files byte-for-byte by md5 (171 from `data/authored-stories.json`, 8 manhua). All 179 ran through the reader's own segmentation and matching code.
- **Manual read, not random:** the other 25 are older LLM-written L1/L2 paced stories. 10 production stories were read by hand, 7 of them from those 25 plus 3 manhua: 01c7b880 d13ca598 8a8f7af4 fb9c54a5 da80494e 02ee7d7d da413ec2 74df0224 3e7835ea 1fc8cc5c. This is a judgement sample, not a statistical one.
- **Ledger (246 files):**
  - 5 reviewed in full
  - 28 skimmed
  - 26 validated by script
  - 5 excluded as frozen tracks
  - 182 not opened (time budget), so they are **not reviewed**
- **Not run:**
  - The service-key validators (`check-content-integrity`, `check-vocabulary-integrity`, `check-published`).
  - Vitest (it would write a cache into the checkout).
  - Any device test.

## Clean (verified)
- **Translations:** 0 of 204 stories have different Chinese and English line counts, and none is missing a translation.
- **Narration:** 204 of 204 have ready Azure S0 audio for every utterance, with no text or index mismatches.
- **Re-reading:** `story_reads` has primary key (user_id, story_id) and the client upserts (`useStoryReaderCore.js:156`), so re-reading is idempotent.
- **Manhua:** every art file exists, bubble beats always increase, and every line is covered.
- **Authored-story check:** `check-authored-stories.mjs --language chinese` gives 171 pass, 0 fail.
- **Vocabulary:** no duplicate active words, and no empty readings or meanings.
- **Rights credits:** CC-CEDICT (BY-SA) and Tatoeba (BY) are credited with licence links and a change statement (`TrustPages.jsx:385-393, 498-503`). All 8,584 reachable audio clips are Azure S0.

## Findings
- **CNT-01 · High (public) / Medium (beta)** · H · production SQL. HSK 3–6 vocabulary still teaches proper-noun or wrong senses.
  - **Wrong senses:**
    - 孙子 "Sun Tzu"
    - 成功 "Chenggong town"
    - 和平 "Heping District"
    - 友好 "Youhao district"
    - 联想 "Lenovo"
    - 金子 "Kaneko"
    - 页 xié "head"
    - 脏 zàng "viscera"
    - 更 gēng
    - 底 de
    - 行 háng
    - 为 wéi
    - 差 chā
  - **Scale:** 32 everyday words still have capitalised proper-noun readings, and about 15 more have proper-noun-only meanings.
  - **Doc mismatch:** BACKLOG.md:448 marks this "APPLIED", but that fix covered readings only.
  - **Audio trap:** word audio is pinned to `vocabulary.reading` (`src/tts/sources.js:16-34`). Fix the readings before regenerating any audio.
  - **Lead re-check:** 页/xié/head, 孙子/Sun Tzu, 友好/Youhao district, 联想/Lenovo and 和平/Heping District all confirmed live.
- **CNT-02 · Medium** · H · automated, 179 stories. The reader shows each word's single stored reading, whatever the context.
  - **Instances:**
    - 地 in its "ground" sense is shown as "de" with the particle meaning about 40 times (e.g. 坐在地上).
    - 长 shows cháng where it should be zhǎng (长高, 长大) about 8 times.
    - 行 shows háng where it should be xíng (就行) about 4 times.
    - Also affected: 了 liǎo, 睡着 zháo, 得 děi, 都市 dū.
  - **Audio mismatch:** story audio has context fixes, so the pinyin on screen and the audio can disagree.
  - **Refs:** `storyReading.js:808-849`, `742-756`.
- **CNT-03 · Low–Medium** · M · sample. Older LLM stories have visible defects:
  - da413ec2 has a space between every word.
  - 1fc8cc5c ends mid-action with no final punctuation.
  - 3e7835ea: "小云说：" is parsed as a speaker named "小云说" (`storyReading.js:143-153`).
  - Needs native-speaker review.
- **CNT-04 · Medium (public)** · H · production SQL. 3,305 active HSK 3–6 words have no word audio.
  - Per level: L3 383, L4 631, L5 986, L6 1304.
  - BACKLOG.md:224 is ticked, but its own line 235 says about 3,323 are still silent.
- **CNT-05 · Low** · H. Story "% known" counts only course-list words; out-of-list words are left out of the denominator.
  - 140 of 179 stories contain such words, so a learner can see 100% while words are still unknown.
  - A relearning card counts toward unlocking but shows as "learning" in the %.
  - There is no METRICS.md entry, which breaks METRICS.md's own rule at lines 118-121.
- **CNT-06 · Low (latent)** · H. Readability is keyed by written form. Already documented in VOCAB-INGESTION §3; no live Chinese impact.
- **CNT-07 · Low** · M · suspected on device. When `speechSynthesis` is absent (likely Android WebView), the scroll reader stops reading aloud at silent "……" lines.
  - Affects 8 published stories, e.g. 2e5905de.
  - Refs: `StoryReaderImmersive.jsx:627, 653-660`. The paged reader handles this correctly (`useStoryReaderCore.js:220-235`).
- **CNT-08 · Low** · H. The tone-pair drill never appears at HSK 1–2.
  - Those readings have no spaces between syllables, and `pairTones` (`Tones.jsx:62`) splits on spaces.
  - Usable pool: L1 = 3 words, L2 = 0; the drill needs 4 (`Tones.jsx:224`).
- **CNT-09 · Low** · H. Erhua (一点儿 yìdiǎnr) never gets phoneme-pinned, because `pinyin.js:34-108` has no `r` syllable.
- **CNT-10 · Low** · M. Font licence texts are not shipped with the native app, though NOTICE.md and `webfonts.css:8-9` say they are.
  - `vite.config.js` never copies the OFL-*.txt files.
  - Mona Sans has no OFL file at all.
  - `/terms` mentions the attribution notice without linking it.
- **CNT-11 · Low** · H. Manhua art provenance is mostly unrecorded.
  - Only 1 of 117 manifest entries has a prompt and date.
  - `upstairs-hsk3-ep01` has no manifest.
  - `/terms` doesn't say that story text and translations are LLM-drafted.

Chinese editorial quality is **not certified**. CNT-01/02/03 need a qualified native-speaker review (HD-P9).
