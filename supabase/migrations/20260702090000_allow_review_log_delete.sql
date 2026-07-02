-- The Study screen's "Undo last grade" removes the review_logs entry of the
-- undone grade so review history stays truthful. review_logs previously had
-- only select+insert policies, so that delete silently affected zero rows.
create policy "users can delete own review logs"
on public.review_logs
for delete to authenticated
using ((select auth.uid()) = user_id);
