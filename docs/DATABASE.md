# Database notes

This app uses Supabase.

## Main idea

The app has shared vocabulary and user-specific progress.

Vocabulary words are stored once in the `vocabulary` table.

Each user's flashcard progress is stored separately in the `cards` table.

## Chinese system

Chinese uses:

- language = chinese
- system = hsk_3
- levels = 1 to 9

## Japanese system later

Japanese will use:

- language = japanese
- system = jlpt
- levels = 5 to 1

## Important tables

### profiles

This stores basic user settings.

Example things stored here:

- active language
- daily new cards
- streak
- streak freezes
- last studied date

Important: use `daily_new_cards`, not `daily_card_goal`.

### language_tracks

This stores the user's current level.

Example:

- user is studying Chinese
- system is HSK 3.0
- current level is 1

This replaces the old fields:

- chinese_level
- japanese_level

### vocabulary

This stores the master word list.

Every word has:

- language
- system
- level
- sort_order
- lesson_group
- category
- priority
- word
- reading
- reading_plain
- meaning
- example_sentence
- example_reading
- example_translation
- audio_path

For Chinese:

- word = 我
- reading = wǒ
- reading_plain = wo
- meaning = I, me
- example_sentence = 我是学生。
- example_reading = wǒ shì xuéshēng.
- example_translation = I am a student.

Important: use `reading`, not `pinyin`.

### cards

This stores each user's flashcard progress.

A card connects one user to one vocabulary word.

Card states:

- new
- learning
- review
- relearning

Important fields:

- state
- learning_step
- ease_factor
- interval_days
- due_at
- is_easy
- learned

Important: use `due_at`, not `next_review`.

Important: use `interval_days`, not `interval`.

### review_logs

This stores review history.

It will help with stats and future FSRS.

### daily_activity

This tracks daily studying and streaks.

### test_attempts

This stores test attempts.

Rules:

- 30 random words
- 3 attempts per day
- 100% required to pass

### test_answers

This stores each answer in a test.

If a user gets a word wrong, that word should lose `is_easy`.

### level_unlocks

This stores which levels the user has unlocked.

### stories

This stores stories by language, system, and level.

### story_vocab

This connects stories to vocabulary words.

Used for hover tooltips.

### youtube_recommendations

This stores curated YouTube videos for each level.

## Audio

Audio is stored in Supabase Storage bucket:

audio

The database stores only the file path.

Example:

chinese/hsk_3/level_1/001_wo.mp3

## HSK word order

Do not use A-Z order.

Use learning order:

1. Pronouns
2. Grammar words
3. Question words
4. Numbers
5. Basic verbs
6. Time words
7. People and family
8. Places and things
9. Food and drink
10. Adjectives

The most important ordering field is:

sort_order

## Old names to avoid

Old prototype code may still use old names.

Replace:

- daily_card_goal → daily_new_cards
- pinyin → reading
- interval → interval_days
- next_review → due_at
- chinese_level → language_tracks.current_level
- japanese_level → language_tracks.current_level

## Flashcard system

The flashcards should work like Anki:

New → Learning → Review

The home page should show:

New: X | Learning: Y | Due: Z

Buttons:

- Again = forgot, show again soon
- Hard = barely knew it, keep learning
- Good = knew it, move forward
- Easy = knew instantly, mark is_easy true

The level test should unlock only when every word in the current level has:

is_easy = true

## Future improvement

Upgrade the SRS system to FSRS later.
