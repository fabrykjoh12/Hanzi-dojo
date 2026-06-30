-- Global account XP plus per-user study preferences.
--
-- total_xp        : lifetime experience earned from flashcard reviews (and, later,
--                   other study modes). Drives the account level on Home/Profile.
-- recall_mode     : 'flip'  = reveal-then-self-grade (default)
--                   'typed' = type the reading before revealing (active recall)
-- audio_autoplay  : play card audio automatically on flip (default true)
-- furigana_default: show furigana over kanji by default for Japanese (default true)
alter table profiles add column if not exists total_xp int not null default 0;
alter table profiles add column if not exists recall_mode text not null default 'flip';
alter table profiles add column if not exists audio_autoplay boolean not null default true;
alter table profiles add column if not exists furigana_default boolean not null default true;
