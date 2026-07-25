Reset my progress for a language back to level 1 so I can test the fresh-start experience.

Ask me which language to reset if I haven't specified. Default to Chinese.

**Check first whether I actually need SQL.** The app now does this properly:
Profile → "Reset a language" clears flashcards, tests, story reads and unlocks
for one language and puts that track back to level 1, without touching my other
languages, my study history or my streak. If that's all I want, point me there
instead of handing me SQL.

Reach for SQL only when I want something the UI deliberately doesn't offer —
resetting a language for a *different* user id, or clearing history without
touching cards.

Give me this SQL, with placeholders filled in. Remind me to replace YOUR_USER_ID.

select public.reset_language_progress('{{LANGUAGE}}', '{{SYSTEM}}', false);

That runs as the signed-in user, so it only works from an authenticated client.
For an arbitrary account from the SQL editor, do it by hand:

update language_tracks set current_level = 1 where user_id = 'YOUR_USER_ID' and language = '{{LANGUAGE}}' and system = '{{SYSTEM}}';
delete from level_unlocks where user_id = 'YOUR_USER_ID' and language = '{{LANGUAGE}}' and system = '{{SYSTEM}}';
delete from cards where user_id = 'YOUR_USER_ID' and vocab_id in (select id from vocabulary where language = '{{LANGUAGE}}' and system = '{{SYSTEM}}');

WARNING: The last line deletes all study progress for the language. Confirm with me before showing the full script that I actually want to delete cards, not just reset the level.

LANGUAGE / SYSTEM mapping:
- Chinese → language='chinese', system='hsk_3'
- Japanese → language='japanese', system='jlpt'
