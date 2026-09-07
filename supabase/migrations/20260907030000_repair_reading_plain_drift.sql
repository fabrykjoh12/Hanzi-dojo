-- FAB-36 — ten `reading_plain` values left behind when `reading` was corrected.
--
-- NOT APPLIED. Committed first, per CLAUDE.md §8. Idempotent and
-- self-limiting: it updates only rows that disagree, so re-running it after it
-- has landed changes nothing.
--
-- WHY THIS IS NOT COSMETIC. `reading_plain` is an ANSWER KEY, not a display
-- field. Two screens grade a learner's typing against it:
--
--   * src/typedAnswer.js:88 — the flashcard's typed mode (src/Study.jsx),
--     which shows the learner a correct/wrong verdict on what they typed.
--   * src/writingMatch.js:109 — the Writing screen's answer check.
--
-- Both accept `[reading_plain, reading]`, so a wrong `reading_plain` tells a
-- learner that wrong pinyin is right, on the exact words they are practising.
--
-- BE PRECISE ABOUT THE BLAST RADIUS. An earlier version of this header said the
-- drift "lets a learner through a progression gate", because the level test
-- requires 100%. That is FALSE and worth recording so nobody repeats it: the
-- level test is four-option multiple choice over word and meaning
-- (src/Test.jsx's generateQuestions; grading is `option === q.correctAnswer`).
-- It never reads `reading_plain`, and src/testLogic.js's `checkAnswer` — the
-- function that does — has no caller in the app at all today. The defect is
-- real and it teaches wrong pronunciation; it does not unlock a level.
--
-- WHAT DRIFTED. 20260724120000_fix_hsk3_6_readings.sql (written 2026-07-24,
-- applied 2026-08-03) corrected `reading` on 54 rows where the bulk import had
-- selected a rare reading over the everyday one. It did not touch
-- `reading_plain`, so ten rows still carry the tone-stripped form of the
-- reading that was REJECTED. Measured live 2026-09-07 against the predicate
-- below — these are the only ten in the whole chinese/hsk_3 corpus, and all ten
-- are active:
--
--     厂  chǎng  han  → chang      广  guǎng  yan   → guang
--     追  zhuī   dui  → zhui       约  yuē    yao   → yue
--     合  hé     ge   → he         圈  quān   juan  → quan
--     胖  pàng   pan  → pang       藏  cáng   zang  → cang
--     忽略 hūlüè hulu:e → hulue    策略 cèlüè celu:e → celue
--
-- So typing "han" for 厂 is currently graded CORRECT in typed mode.
--
-- Why only ten of the 54: every other correction folds to the SAME plain form
-- (抢 qiāng/qiǎng, 作 zuō/zuò, 匹 pī/pǐ — tone-only changes, and the sandhi and
-- capitalisation cases), so its `reading_plain` was already right. Two of the
-- 54 look like they should qualify — 转 zhuǎi→zhuǎn and 战略 `zhàn lu:è`→zhànlüè
-- — and do not, because neither word exists in `vocabulary` any more: the
-- corpus was reseeded after that migration (docs/VOCAB-INGESTION.md). Checked
-- by word, not inferred.
--
-- EIGHT OF THE TEN ARE THAT DEFECT. The last two are not, and saying so matters
-- more than the tidier claim: 忽略 and 策略 carry `hulu:e` / `celu:e`, the ASCII
-- transliteration the 2026-07-24 migration names as a defect it removes — and
-- it removed it from `reading` only. But lenientPinyin strips `:` along with
-- the rest of its punctuation, so those two accept exactly the same inputs
-- before and after this migration. Repairing them is consistency and a clean
-- integrity check, not a grading fix. A spec drives both cases through the two
-- functions that actually grade, so the distinction cannot quietly become
-- untrue.
--
-- THE COLUMN HAS TWO CONVENTIONS, AND THAT IS WHY THE COMPARISON IS LOOSE.
--
-- A first draft of this migration recomputed `reading_plain` for every row
-- whose value did not match a canonical "lowercase, no spaces, no apostrophes"
-- form. It would have rewritten 21 rows, and ELEVEN of them are not broken:
--
--     下雨 "xia yu"    你好 "ni hao"    打电话 "da dianhua"
--     没关系 "mei guanxi"  不客气 "bu keqi"  做饭 "zuo fan"   — spaces kept
--     中国 "Zhongguo"  中文 "Zhongwen"  汉字 "Hanzi"  汉语 "Hanyu" — case kept
--     女儿 "nu'er"                                             — apostrophe kept
--
-- Those are the hand-curated HSK 1 rows; the bulk-imported ones carry the
-- squashed form. Both are correct answer keys, because lenientPinyin strips
-- spaces, case and apostrophes from BOTH sides before comparing — so
-- normalising them would have changed eleven rows that work, to no benefit, in
-- a migration whose whole justification is that ten rows do not.
--
-- WHAT THE COMPARISON IGNORES, EXACTLY. Space, apostrophe (both glyphs) and
-- case — no more than that. lenientPinyin ignores a wider set (numeric tones
-- 1-5, `v`/`ü`, and `.,!?;:'"()-_·`), and the difference is deliberate rather
-- than an oversight: folding `:` here would exclude 忽略 and 策略, which are
-- exactly the two rows this migration repairs for hygiene rather than grading.
-- So the predicate is: "differs by more than the three things that never change
-- an answer key" — which is why it fires on eight genuine mis-gradings, two
-- ASCII-transliteration leftovers, and none of the eleven spaced rows above.
-- The value written preserves the shape of `reading` itself (its spacing and
-- case, tones removed), so a row keeps whichever convention it already had.
--
-- THE TONE FOLD, AND WHAT IT REFUSES TO GUESS. The map covers the tone-marked
-- vowels this corpus uses. src/testLogic.js's normalizePinyin is broader by
-- construction — it decomposes to NFD and drops every combining mark, so it
-- also handles ê̄/ế/ê̌/ề and ń/ň/ǹ/ḿ, which `translate()` cannot (several are
-- multi-codepoint sequences). Rather than pretend the map is complete, the
-- statement REFUSES any row whose folded value still contains a non-ASCII
-- letter: a mark the map does not know leaves the row alone instead of writing
-- a half-folded value into an answer key. `normalize(v.reading, nfc)` composes
-- first so a decomposed tone mark — a documented past cause of mis-grading,
-- docs/CHANGELOG.md — reaches the map as the precomposed character it expects.
--
-- NOT INCLUDED, deliberately: the ~36 rows whose MEANING still describes the
-- discarded reading (胖 glossed "healthy; at ease", 成功 glossed as a town in
-- Taitung County). No transformation derives those — they need somebody who
-- reads Chinese to write the replacement gloss. They are enumerated on FAB-36.

update public.vocabulary v
   set reading_plain = translate(
         normalize(v.reading, nfc),
         'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ',
         'aaaaeeeeiiiioooouuuuuuuuuAAAAEEEEIIIIOOOOUUUUUUUUU')
 where v.language = 'chinese'
   and v.system = 'hsk_3'
   -- A NULL `reading` derives NULL, and `is distinct from` would happily write
   -- that over a perfectly good answer key. The schema allows both columns to
   -- be NULL, so the guard is not theoretical.
   and v.reading is not null
   -- Only write a value the map fully folded. See THE TONE FOLD above: a
   -- character outside the map survives into the result, and a half-folded
   -- answer key is worse than the drift being repaired.
   and translate(
         normalize(v.reading, nfc),
         'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ',
         'aaaaeeeeiiiioooouuuuuuuuuAAAAEEEEIIIIOOOOUUUUUUUUU') ~ '^[[:ascii:]]*$'
   -- Ignoring space, case and apostrophe on BOTH sides — the three that never
   -- change an answer key. This is what makes the migration idempotent AND what
   -- keeps it off the eleven legitimately-spaced rows above. Applied today it
   -- touches exactly ten rows; applied again it touches none.
   and lower(regexp_replace(coalesce(v.reading_plain, ''), '[ ''’]', '', 'g'))
       is distinct from
       lower(regexp_replace(
         translate(
           normalize(v.reading, nfc),
           'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ',
           'aaaaeeeeiiiioooouuuuuuuuuAAAAEEEEIIIIOOOOUUUUUUUUU'),
         '[ ''’]', '', 'g'));

-- No `notify pgrst`: this changes rows, not schema.
