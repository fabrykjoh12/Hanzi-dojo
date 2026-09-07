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
-- applied 2026-08-03) corrected `reading` on 54 rows the bulk import had got
-- wrong — four classes, of which a rare reading beating the everyday one is
-- only one; twelve are a proper-noun capital on an ordinary word, where the
-- pronunciation was never wrong at all. docs/BACKLOG.md records the apply:
-- "All 54 rows corrected in prod", with five spot-checked values. Worth noting
-- against that record rather than glossing it: 转 is one of the 54 and has no
-- row today, so a row that was corrected in August is gone in September, which
-- is the provenance question set out below and not this migration's to answer.
-- Nothing here depends on the number — the ten below were measured directly.
-- It did not touch
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
-- — and do not, for one reason and one only: NEITHER WORD IS IN `vocabulary`
-- TODAY. Queried by word on 2026-09-07, both return no row at all, in any
-- language or system, so the predicate below has nothing to match.
--
-- WHY they are absent is NOT established here, and two earlier drafts of this
-- paragraph got it wrong in opposite directions, which is why the claim is now
-- this narrow:
--
--   * "the corpus was reseeded since" — unsupported. docs/VOCAB-INGESTION.md
--     opens with "Nothing in this document has been implemented. No vocabulary
--     row has been added, changed or reseeded, and no source_id has been
--     backfilled." That rules out the reseed THAT DOCUMENT describes; it does
--     not establish that nothing else changed, and the next bullet shows
--     something did.
--   * "neither word was ever in vocabulary" — also false, at least for 转.
--     data/hsk3-vocab-snapshot.json carries ["转","zhuǎi"], and that file is a
--     PRODUCTION dump (docs/PM-BOARD.md: "read from production", 2026-07-24;
--     authored-stories.mjs selects from `vocabulary` where is_active). So the
--     row existed in July and does not exist now.
--
-- src/authoredStories.test.js records the shape of that change — the snapshot
-- holds "457 words from an OLDER HSK 3 draft, of which only 50 survive in the
-- current level" — and storyVocabAudit.test.mjs classifies 转 as an ingestion
-- loss today. Reconciling those two accounts is provenance work and is out of
-- scope here: this migration is predicate-scoped and references neither word.
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
-- WHAT THE COMPARISON IGNORES, EXACTLY. Space, apostrophe and case — no more
-- than that. (Both apostrophe glyphs are stripped, though only on the stored
-- side in practice: a `reading` containing U+2019 would fail the ASCII guard
-- below and be skipped before the comparison ran.) lenientPinyin ignores a wider set (numeric tones
-- 1-5, `v`/`ü`, and `.,!?;:'"()-_·`), and the difference is deliberate rather
-- than an oversight: folding `:` here would exclude 忽略 and 策略, which are
-- exactly the two rows this migration repairs for hygiene rather than grading.
-- So the predicate is: "differs by more than the three things that never change
-- an answer key" — which is why it fires on eight genuine mis-gradings, two
-- ASCII-transliteration leftovers, and none of the eleven spaced rows above.
-- The value written preserves the shape of `reading` itself — its spacing and
-- case, tones removed. That is a statement about `reading`, not about the row's
-- previous `reading_plain`: a repaired row takes the reading's convention. For
-- the ten below that is the convention they already had, and for the eleven
-- above the question never arises, because they are not touched.
--
-- THE TONE FOLD, AND WHAT IT REFUSES TO GUESS. The map covers the tone-marked
-- vowels this corpus uses. src/testLogic.js's normalizePinyin is broader by
-- construction — it decomposes to NFD and drops every combining mark, so it
-- also handles ê̄/ế/ê̌/ề and ń/ň/ǹ/ḿ, which `translate()` cannot (several are
-- multi-codepoint sequences). Rather than pretend the map is complete, the
-- statement REFUSES any row whose folded value still contains a non-ASCII
-- character of any kind: a mark the map does not know leaves the row alone
-- instead of writing a half-folded value into an answer key. `normalize(v.reading, nfc)` composes
-- first so a decomposed tone mark — a documented past cause of mis-grading,
-- docs/CHANGELOG.md — reaches the map as the precomposed character it expects.
--
-- WHAT ELSE IS IN SCOPE, since the ten were measured rather than enumerated:
-- `dict_add_to_deck` (20260719130000) inserts learner-created rows with
-- language/system copied from the caller's track and `level` null, so new
-- chinese/hsk_3 rows can appear between the measurement above and the apply.
-- Traced: `dict_entries.pinyin` is tone-marked and `pinyin_plain` is its
-- toneless lowercase form, so such a row folds to an equal value and the
-- predicate does not fire; where it could (a `lve`/`lüe` spelling), the value
-- written is lenientPinyin-equivalent to the one replaced. And a row with a
-- NULL `reading_plain` is FILLED IN rather than skipped — `coalesce(…, '')` is
-- distinct from any real fold. That is the one case where this writes a value
-- that was never there, and it is the right one: an absent answer key grades
-- every typed answer wrong.
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
   -- be NULL — supabase/schema.sql has `word text not null` and then `reading
   -- text` / `reading_plain text` with no such clause — so the guard is not
   -- theoretical. An EMPTY reading is the same defect wearing a different
   -- value: it folds to '', which is ASCII and distinct from any real key, so
   -- without a guard it would blank the answer key and make every typed answer
   -- for that row wrong. The next guard covers both, and more.
   and v.reading is not null
   -- The written key must contain at least one LETTER. That covers the empty
   -- reading, the whitespace-only one, and every value that folds away to
   -- something a grader cannot match — apostrophes and spaces, but also `·`,
   -- `-`, `.` and a bare numeric tone, all of which lenientPinyin strips too
   -- (src/testLogic.js). A previous version of this guard tested emptiness
   -- after removing space and apostrophe only, and called the class closed
   -- while every one of those four spellings walked through it. One letter
   -- surviving is the
   -- property that actually matters: without it, both graders reduce the key to
   -- '' and drop it with .filter(Boolean), and every typed answer for that row
   -- is wrong.
   and translate(
         normalize(v.reading, nfc),
         'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ',
         'aaaaeeeeiiiioooouuuuuuuuuAAAAEEEEIIIIOOOOUUUUUUUUU') ~ '[A-Za-z]'
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
