Unlock all vocabulary for the current testing level so I can preview the full unlocked state (stories, test, mastery).

Ask me which language and level to unlock if I haven't specified. Default to Chinese HSK Level 1.

Then give me this SQL to run in Supabase, with the placeholders filled in based on my answer. Remind me to replace YOUR_USER_ID with my actual user ID from Supabase Authentication → Users.

insert into cards (user_id, vocab_id, state, is_easy, learned, stability, difficulty, reps, interval_days, scheduled_days, elapsed_days, learning_step, last_review, due_at)
select 'YOUR_USER_ID', v.id, 'review', false, true, 30, 4.2, 9, 30, 30, 30, 0, now(), now() + interval '30 days'
from vocabulary v
where v.language = '{{LANGUAGE}}' and v.system = '{{SYSTEM}}' and v.level = {{LEVEL}} and v.is_active = true
on conflict (user_id, vocab_id) do update set state = 'review', learned = true, stability = 30, due_at = now() + interval '30 days';

(Mastery is gated on FSRS `stability >= 21`, so stability 30 is what unlocks the
level test — NOT `is_easy`, which only the SRS grading flow may set true (§7.3),
and NOT `ease_factor`, a dead column nothing may write (§10). This mirrors
`creativeCardRow` in `src/creativeMode.js`; prefer the /dashboard Creative-mode
sandbox over raw SQL when it's available.)

IMPORTANT: Do NOT insert a level_unlock here. Inserting one triggers auto-advance to the next level, which is not what I want when testing the current level. Only add the level_unlocks insert if I specifically ask to also unlock the test.

LANGUAGE / SYSTEM mapping:
- Chinese → language='chinese', system='hsk_3'
- Japanese → language='japanese', system='jlpt'
