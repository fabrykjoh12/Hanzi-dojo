-- Persist each user's light/dark theme preference.
alter table profiles add column if not exists theme text default 'light';
