Unlock all vocabulary for the current testing level so I can preview the full unlocked state (stories, test, mastery).

Ask me which language and level to unlock if I haven't specified. Default to Chinese HSK Level 1.

Then give me this SQL to run in Supabase, with the placeholders filled in based on my answer. Remind me to replace YOUR_USER_ID with my actual user ID from Supabase Authentication → Users.

insert into cards (user_id, vocab_id, state, is_easy, learned, ease_factor, interval_days, due_at, learning_step)
select 'YOUR_USER_ID', v.id, 'review', true, true, 2.5, 30, now() + interval '30 days', 0
from vocabulary v
where v.language = '{{LANGUAGE}}' and v.system = '{{SYSTEM}}' and v.level = {{LEVEL}} and v.is_active = true
on conflict (user_id, vocab_id) do update set is_easy = true, state = 'review', learned = true, due_at = now() + interval '30 days';

IMPORTANT: Do NOT insert a level_unlock here. Inserting one triggers auto-advance to the next level, which is not what I want when testing the current level. Only add the level_unlocks insert if I specifically ask to also unlock the test.

LANGUAGE / SYSTEM mapping:
- Chinese → language='chinese', system='hsk_3'
- Japanese → language='japanese', system='jlpt'
