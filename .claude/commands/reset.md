Reset my progress for a language back to level 1 so I can test the fresh-start experience.

Ask me which language to reset if I haven't specified. Default to Chinese.

Give me this SQL, with placeholders filled in. Remind me to replace YOUR_USER_ID.

update language_tracks set current_level = 1 where user_id = 'YOUR_USER_ID' and language = '{{LANGUAGE}}' and system = '{{SYSTEM}}';
delete from level_unlocks where user_id = 'YOUR_USER_ID' and language = '{{LANGUAGE}}' and system = '{{SYSTEM}}';
delete from cards where user_id = 'YOUR_USER_ID' and vocab_id in (select id from vocabulary where language = '{{LANGUAGE}}' and system = '{{SYSTEM}}');

WARNING: The last line deletes all study progress for the language. Confirm with me before showing the full script that I actually want to delete cards, not just reset the level.

LANGUAGE / SYSTEM mapping:
- Chinese → language='chinese', system='hsk_3'
- Japanese → language='japanese', system='jlpt'
