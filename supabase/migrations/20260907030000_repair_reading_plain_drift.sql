-- FAB-36 — ten `reading_plain` values left behind when `reading` was corrected.
--
-- NOT APPLIED. Committed first, per CLAUDE.md §8. Idempotent and
-- self-limiting: it updates only rows that disagree, so re-running it after it
-- has landed changes nothing.
--
-- WHY THIS IS NOT COSMETIC. `reading_plain` is an ANSWER KEY, not a display
-- field. src/testLogic.js's checkAnswer accepts it:
--
--     if (vocab.reading_plain && li === lenientPinyin(vocab.reading_plain)) return true
--
-- and the flashcard's typed mode does the same. The level test requires 100% to
-- pass and unlocks the next level, so a wrong value here does not merely
-- mis-score one card — it lets a learner through a progression gate on pinyin
-- that is wrong.
--
-- WHAT DRIFTED. 20260803 corrected `reading` on 54 rows where the bulk import
-- had selected a rare reading over the everyday one. It did not touch
-- `reading_plain`, so ten rows still carry the tone-stripped form of the
-- reading that was REJECTED. Measured live 2026-09-07, and these are the only
-- ten in 4,998 active rows:
--
--     厂  chǎng  han  → chang      广  guǎng  yan   → guang
--     追  zhuī   dui  → zhui       约  yuē    yao   → yue
--     合  hé     ge   → he         圈  quān   juan  → quan
--     胖  pàng   pan  → pang       藏  cáng   zang  → cang
--     忽略 hūlüè hulu:e → hulue    策略 cèlüè celu:e → celue
--
-- So typing "han" for 厂 is currently graded CORRECT.
--
-- EIGHT OF THE TEN ARE THAT DEFECT. The last two are not, and saying so matters
-- more than the tidier claim: 忽略 and 策略 carry `hulu:e` / `celu:e`, the ASCII
-- transliteration 20260803's header names as a defect it removes — and it
-- removed it from `reading` only. But lenientPinyin strips `:` along with the
-- rest of its punctuation, so those two accept exactly the same inputs before
-- and after this migration. Repairing them is consistency and a clean integrity
-- check, not a grading fix. A spec drives both cases through the real
-- checkAnswer so the distinction cannot quietly become untrue.
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
-- The comparison below therefore ignores exactly what lenientPinyin ignores,
-- and fires only where the SYLLABLES differ. The value written preserves the
-- shape of `reading` itself (its spacing and case, tones removed), so a row
-- keeps whichever convention it already had.
--
-- The tone fold is the same one src/testLogic.js's normalizePinyin performs —
-- combining diacritics dropped, ü/ǖǘǚǜ folded to u — because the answer key
-- and the answer checker have to agree about what "tone-stripped" means. A spec
-- holds the two together.
--
-- NOT INCLUDED, deliberately: the ~36 rows whose MEANING still describes the
-- discarded reading (胖 glossed "healthy; at ease", 成功 glossed as a town in
-- Taitung County). No transformation derives those — they need somebody who
-- reads Chinese to write the replacement gloss. They are enumerated on FAB-36.

update public.vocabulary v
   set reading_plain = translate(
         v.reading,
         'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ',
         'aaaaeeeeiiiioooouuuuuuuuuAAAAEEEEIIIIOOOOUUUUUUUUU')
 where v.language = 'chinese'
   and v.system = 'hsk_3'
   -- Ignoring space, case and apostrophe on BOTH sides: those three are what
   -- lenientPinyin already ignores, so a difference in them is not a defect.
   -- This is what makes the migration idempotent AND what keeps it off the
   -- eleven legitimately-spaced rows above. Applied today it touches exactly
   -- ten rows; applied again it touches none.
   and lower(regexp_replace(v.reading_plain, '[ ''’]', '', 'g'))
       is distinct from
       lower(regexp_replace(
         translate(
           v.reading,
           'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ',
           'aaaaeeeeiiiioooouuuuuuuuuAAAAEEEEIIIIOOOOUUUUUUUUU'),
         '[ ''’]', '', 'g'));

-- No `notify pgrst`: this changes rows, not schema.
