-- Flashcard audio playback speed preference (1 / 0.75 / 0.5). Persisted so the
-- speed toggle on the study screen survives reloads instead of resetting to 1x.
alter table profiles add column if not exists audio_speed real not null default 1;
