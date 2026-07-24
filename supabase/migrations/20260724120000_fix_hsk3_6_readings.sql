-- Corrects 54 `reading` values in the HSK 3–6 Chinese vocabulary that shipped
-- with the ~1,870-word HSK 3–6 seeding.
--
-- WHY THESE ARE WRONG. HSK 1–2 was hand-curated: it applies tone sandhi
-- (一下 "yíxià", 不错 "búcuò"), uses the Hanyu Pinyin apostrophe (女儿 "nǚ'ér"),
-- and joins syllables ("xièxie"). HSK 3–6 was a bulk CC-CEDICT pass instead, so
-- it inherited three defects and dropped sandhi entirely. Audited by diffing
-- `vocabulary.reading` against the CC-CEDICT `dict_entries` already loaded in
-- this project: 1,864 of 1,871 HSK 3–6 readings matched *some* attested
-- CC-CEDICT reading, which is exactly how a polyphone error hides — the check
-- passes on any valid reading, not the intended one.
--
-- WHAT THIS DOES AND DOES NOT AFFECT. Chinese audio pins pronunciation via
-- `chinesePhonemeSsml(v.word, v.reading)` → `readingToPhonemes(reading)`. That
-- helper returns NULL for any reading containing a space, and the caller then
-- falls back to bare hanzi with no phoneme hint. HSK 3–6 readings are mostly
-- space-separated, so:
--   * single-character words (no space) DO pin — 厂 is genuinely spoken "hǎn"
--     instead of "chǎng" today, and the same for the other single chars below;
--   * multi-syllable words with spaces never pinned at all, so their audio is
--     the TTS engine's own guess (usually right). For those the bug is the
--     DISPLAYED pinyin, not the sound.
-- Every multi-syllable correction below is therefore written JOINED rather than
-- spaced. That fixes the display and, as a side effect, re-enables the phoneme
-- pin for those rows — matching how HSK 1–2 already reads.
--
-- ⚠️ The wider issue this uncovered is NOT fixed here: ~1,437 HSK 3–6 rows keep
-- space-separated readings, so pronunciation pinning is silently off for about
-- 79% of the band (HSK 3 pins 97/457; HSK 1–2 pin ~95%). Normalising all of
-- them is a separate, larger change — see docs/BACKLOG.md.
--
-- ⚠️⚠️ ORDER MATTERS: RUN THIS MIGRATION **BEFORE** `normalize-readings.mjs`.
-- That script joins a spaced reading by removing whitespace and nothing else, so
-- it would rewrite 一切 "yī qiè" → "yīqiè" — losing the tone sandhi this
-- migration applies ("yíqiè"). The damage would be silent in both directions:
-- "yīqiè" passes the script's phoneme validation happily, and afterwards this
-- migration's `where reading = 'yī qiè'` no longer matches, so all 17 sandhi
-- fixes below would quietly become no-ops. Applied in the right order there is
-- no conflict — every value this migration writes is already joined, so the
-- script sees those rows as "already joined" and skips them.
--
-- AFTER APPLYING, REGENERATE THE AUDIO:
--   Actions → "Regenerate vocabulary content" → task `audio-hsk3-6`.
-- Do NOT null `audio_path` to force this. `generate-audio.mjs` builds its work
-- list as `vocab.filter(v => v.audio_path)` and uploads with `upsert: true` —
-- rows WITH a path are the ones it regenerates. Clearing the path would exclude
-- these words from the regeneration entirely.
--
-- Not changed on purpose: genuine proper nouns (上帝, 圣诞节, 国会, 佛), and ~14
-- words where both readings are defensible in context (待 dāi/dài, 答 dā/dá,
-- 结 jiē/jié, 泡, 档, 扇, 尽, 切, 挨, 晕, 杆, 踏, 码头, 眼里) — those want a
-- native-speaker call, not a blind edit.
--
-- Idempotent: each row updates only while the reading still equals the known-bad
-- value, so a re-run is a no-op and a hand-fix is never clobbered. Verified
-- read-only against production — all 54 rows matched, and every replacement
-- yields a syllable-aligned phoneme string via readingToPhonemes().

do $$
declare
  fixes constant text[][] := array[
    ----------------------------------------------------------------------
    -- 1. Single characters. These DO pin to the SSML phoneme, so a wrong
    --    reading here is heard, not just seen. An obscure or proper-noun
    --    reading won over the everyday one.
    ----------------------------------------------------------------------
    ['厂',     'hǎn',        'chǎng'],
    ['合',     'gě',         'hé'],
    ['约',     'yāo',        'yuē'],
    ['胖',     'pán',        'pàng'],
    ['转',     'zhuǎi',      'zhuǎn'],
    ['追',     'duī',        'zhuī'],
    ['圈',     'juān',       'quān'],
    ['广',     'yǎn',        'guǎng'],
    ['抢',     'qiāng',      'qiǎng'],
    ['作',     'zuō',        'zuò'],
    ['藏',     'Zàng',       'cáng'],
    ['匹',     'pī',         'pǐ'],
    ['保',     'Bǎo',        'bǎo'],
    ['台',     'Tái',        'tái'],
    ['土',     'Tǔ',         'tǔ'],
    ['朝',     'Cháo',       'cháo'],
    ['美',     'Měi',        'měi'],
    ['诗',     'Shī',        'shī'],
    ['非',     'Fēi',        'fēi'],
    ['神',     'Shén',       'shén'],
    ['青',     'Qīng',       'qīng'],
    ['井',     'Jǐng',       'jǐng'],
    ['清',     'Qīng',       'qīng'],
    ['塞',     'Sāi',        'sāi'],

    ----------------------------------------------------------------------
    -- 2. Multi-syllable. CC-CEDICT's ASCII "u:" for ü leaked in verbatim
    --    (the card literally reads "hū lu:è"), and a proper-noun capital
    --    landed on ordinary words. Written joined, which also restores the
    --    phoneme pin these rows never had.
    ----------------------------------------------------------------------
    ['忽略',   'hū lu:è',    'hūlüè'],
    ['战略',   'zhàn lu:è',  'zhànlüè'],
    ['策略',   'cè lu:è',    'cèlüè'],
    ['和平',   'Hé píng',    'hépíng'],
    ['成功',   'Chéng gōng', 'chénggōng'],
    ['时代',   'Shí dài',    'shídài'],
    ['现代',   'Xiàn dài',   'xiàndài'],
    ['美元',   'Měi yuán',   'měiyuán'],
    ['大众',   'Dà zhòng',   'dàzhòng'],
    ['网络',   'Wǎng luò',   'wǎngluò'],
    ['资源',   'Zī yuán',    'zīyuán'],
    ['通道',   'Tōng dào',   'tōngdào'],
    ['将军',   'Jiāng jūn',  'jiāngjūn'],

    ----------------------------------------------------------------------
    -- 3. Tone sandhi, which HSK 1–2 applies and the HSK 3–6 pass dropped.
    --    一 → yí before a 4th tone, yì before 1st/2nd/3rd;
    --    不 → bú before a 4th tone.
    --    Words already correct (不仅 bùjǐn, 不然, 不管, 不止, 不良, 不许,
    --    不足, 不得不, 一番) are deliberately absent.
    ----------------------------------------------------------------------
    ['一切',   'yī qiè',     'yíqiè'],
    ['一致',   'yī zhì',     'yízhì'],
    ['一下子', 'yī xià zi',  'yíxiàzi'],
    ['一句话', 'yī jù huà',  'yíjùhuà'],
    ['一向',   'yī xiàng',   'yíxiàng'],
    ['一旦',   'yī dàn',     'yídàn'],
    ['一路',   'yī lù',      'yílù'],
    ['一辈子', 'yī bèi zi',  'yíbèizi'],
    ['一同',   'yī tóng',    'yìtóng'],
    ['一时',   'yī shí',     'yìshí'],
    ['不必',   'bù bì',      'búbì'],
    ['不断',   'bù duàn',    'búduàn'],
    ['不在乎', 'bù zài hu',  'búzàihu'],
    ['不利',   'bù lì',      'búlì'],
    ['不幸',   'bù xìng',    'búxìng'],
    ['不再',   'bù zài',     'búzài'],
    ['不见',   'bù jiàn',    'bújiàn']
  ];
  f text[];
  changed int;
  total int := 0;
begin
  foreach f slice 1 in array fixes loop
    update public.vocabulary
       set reading = f[3]
     where language = 'chinese'
       and system   = 'hsk_3'
       and word     = f[1]
       and reading  = f[2];
    get diagnostics changed = row_count;
    total := total + changed;
  end loop;
  raise notice 'HSK 3-6 reading fixes applied: % row(s) of % candidates', total, array_length(fixes, 1);
end $$;
