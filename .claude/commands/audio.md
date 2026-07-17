Regenerate TTS audio for a vocabulary level.

Ask me which language and level if I haven't specified.

Confirm these settings in generate-audio.mjs for the language:
- Chinese: voice cmn-CN-Chirp3-HD-Aoede, languageCode cmn-CN. TTS input is the
  hanzi (v.word) wrapped in an SSML <phoneme alphabet="pinyin"> tag whose
  pronunciation is derived from v.reading (see src/pinyin.js). This pins the
  exact reading so polyphonic characters (长, 行, 觉 …) aren't mis-read in
  isolation. If a reading can't be parsed, it falls back to plain hanzi text.
- Japanese: voice ja-JP-Neural2-B, languageCode ja-JP, TTS input = v.reading (hiragana — NEVER v.word, kanji gets mispronounced)

Make sure the vocabulary query targets the right language, system, and level:
- Chinese → language='chinese', system='hsk_3'
- Japanese → language='japanese', system='jlpt'

IMPORTANT: If I'm regenerating to FIX existing audio, the files already exist in Supabase Storage. Tell me to delete the relevant folder from Supabase Storage → audio bucket FIRST, otherwise the script may skip existing files.

Then give me the command: node --env-file=.env.script generate-audio.mjs

After it runs, remind me to spot-check a few audio files, especially previously
mispronounced words and polyphonic characters (e.g. 长, 行, 重, 觉, 银行).
