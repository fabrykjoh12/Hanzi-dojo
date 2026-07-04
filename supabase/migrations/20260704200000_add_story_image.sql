-- Per-story cover art (product request: illustrated covers so the library feels
-- alive and each story's subject is clear at a glance). Stores the storage path
-- within the public `audio` bucket, e.g. 'stories/<id>/cover.webp'; the frontend
-- turns it into a public URL with getAudioUrl(). Nullable — stories without a
-- cover fall back to the icon/plain layout.
alter table public.stories add column if not exists image_path text;

-- Refresh PostgREST's schema cache so the new column is queryable.
notify pgrst, 'reload schema';
