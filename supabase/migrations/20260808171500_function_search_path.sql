-- Pin search_path on the three trigger functions the security linter flags.
-- A SECURITY DEFINER-adjacent function with a mutable search_path can be
-- redirected by a caller who controls their own search_path; pinning it to
-- public closes that door. Behaviour is unchanged — these only stamp
-- updated_at columns. Idempotent: ALTER FUNCTION SET is a plain overwrite.

alter function public.set_updated_at() set search_path = public;
alter function public.tts_touch_updated_at() set search_path = public;
alter function public.dojo_touch_updated_at() set search_path = public;
