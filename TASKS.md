# hanzi-dojo — oppgaver

Live: https://hanzi-dojo-jet.vercel.app/# · Repo: https://github.com/fabrykjoh12/Hanzi-dojo

_Vedlikeholdes i Fabipilot. Jobb gjennom de åpne punktene under._

## Høy prioritet
- [ ] Change the tts because now its not saying correct in the chinese version atleast
  - Code fix DONE (pinyin SSML phoneme pinning — src/pinyin.js + generate-audio.mjs).
  - Audio REGENERATED 2026-07-18 via regen-content Action: audio-hsk1 (level 1, ✓300/0)
    + audio-hsk2 (level 2, ✓198/0). Upload is upsert, so old MP3s were overwritten in
    place — no Storage deletion needed. Added an audio-hsk1 task to the workflow (level 1
    had none before).
  - REMAINING: spot-check polyphones on a real device (长, 行, 重, 觉, 银行) after a
    hard refresh (service worker caches audio). Once confirmed, move the roadmap
    "More accurate Chinese pronunciation" item to Shipped.

## Medium
- [ ] add better story reader, maybe a better way to read.

## Future tooling & integrations
_Research pass 2026-08-21 against Hanzi Dojo's current stack, Public APIs and Awesome MCP. These are intentionally parked here so they can be picked up when useful rather than added all at once._

### Claude / development tooling
- [ ] **Install Playwright MCP** — high value. Give Claude an interactive browser so it can execute real Hanzi Dojo user journeys (onboarding, flashcards, stories, dictionary, dark mode, responsive flows), reproduce UI bugs and retest after fixes. This complements the existing `@playwright/test` E2E suite rather than replacing it.
- [ ] **Install Chrome DevTools MCP** — high value. Use for console errors, network failures, performance traces, Core Web Vitals/Lighthouse and browser-level debugging. Pair with Playwright MCP: Playwright = what the user does; DevTools = why the browser/app is failing or slow.
- [ ] **Verify Context7 MCP is actually connected** — the repo already has a `documentation-lookup` skill that expects Context7, but the server itself should be checked in Claude (`/mcp`). If missing, install it so Claude can fetch current/version-specific docs for React, Vite, Capacitor, Supabase, etc.
- [ ] **Consider Vercel MCP later** — useful for deployment/build/log debugging from Claude. Lower priority than Playwright/DevTools/Context7.
- [ ] **Consider Figma MCP if Figma becomes part of the regular design workflow** — useful for reading components, variables and layouts and translating design ↔ code. Skip if Figma is not actively used.
- [ ] **Keep Scrapling available as an on-demand research tool** — useful for systematic competitor research, documentation/data collection and scraping public sources. Lower priority than the browser/dev MCPs for daily Hanzi Dojo development; do not make it an app dependency.
- [ ] **Do not install random MCPs just because they are in awesome-mcp** — treat Awesome MCP as discovery only. Add a server only when it fills a concrete capability gap.

### Product / learning experiments
- [ ] **Prototype Azure Pronunciation Assessment for Chinese speaking practice** — top product opportunity. Hanzi Dojo already uses Azure Speech, so test a Practice Lab flow where the learner reads a known word/sentence aloud and receives pronunciation/accuracy/fluency/completeness feedback, with weak words highlighted and retry playback. Validate quality specifically for `zh-CN` before committing to a full feature.
- [ ] **Evaluate PostHog (SDK + MCP) before wider public beta** — not for basic analytics (the app already has an internal funnel/retention dashboard), but for session replay, feature flags, experiments/A-B tests, error correlation and letting Claude query product behavior. Mask inputs/PII and avoid recording user-written chat/writing content.
- [ ] **Consider Sentry only if error debugging needs exceed PostHog + current tooling** — likely redundant at the moment; revisit after public usage grows.
- [ ] **Consider OCR/import later** — e.g. Google Vision or another proven Chinese OCR provider for a future “photo of Chinese text → Known Content Analyzer / dictionary / deck import” flow. Do not add now; Chinese handwriting quality and product value should be validated first.

### APIs / external data policy
- [ ] **Do not add a new Chinese dictionary API right now** — current data is stronger: CC-CEDICT (~120k entries), Tatoeba examples, HSK 3.0 vocabulary and Hanzi Writer/Make Me a Hanzi stroke data already cover the core needs.
- [ ] **Do not add translation/OCR/text APIs from Public APIs by default** — Public APIs is a discovery catalogue, not a quality seal. Only integrate a service after checking that it is current, HTTPS-secure, licensed appropriately, reliable and measurably better than the existing OpenAI/Gemini/language pipeline.
- [ ] **Keep Public APIs and Free-for-Dev as reference catalogues only** — use them when a concrete new need appears (monitoring, email, OCR, storage, etc.), not as permanent Claude context or app dependencies.

### Already present — avoid duplicate work
- [x] **Supabase MCP** — already configured in Claude with table/project/docs/logs/SQL/migration tools and approval gates for more dangerous operations.
- [x] **Higgsfield MCP** — already configured for image generation workflows.
- [x] **Core Chinese data stack** — CC-CEDICT, Tatoeba, HSK 3.0 vocabulary and Hanzi Writer/stroke data already exist in the project.
- [x] **Existing speech stack** — Azure Speech/TTS, Google TTS and LLM providers already exist; new speech work should extend this rather than adding providers without a clear benefit.

## Lav
- [ ] rework the youtube tab, maybe come with some idea

## Ferdig
- [x] figure out how new words and due words arrive (00:00 new cards arrived but due cards did not): reviews now use Anki-style day-based availability — every review scheduled for today is available from the local-midnight rollover, matching new cards, instead of trickling in at the exact clock time they were last reviewed (src/srs.js isCardDue + homeCounts/Study). Follow-up: send-review-reminders.mjs still counts due at exact-now if we want the push count to match.
- [x] Fix this bug: You cant scroll down in the conversation after your reviews (chat overlay was 100vh/inset:0 = large viewport, so its bottom sat behind the mobile browser toolbar; now sized to 100dvh visible viewport — please confirm on your phone)
- [x] Be more direct on what to do after your reviews (recap always ends with a direct "Recommended next" action — falls back to "Read a story" instead of a dead-end Back home)
- [x] make it easier to join the discord, or easier to see the discord (persistent "Join our Discord" card on Home)
- [x] make a light mode version for the chinese stories, because now its dark even without dark mode
- [x] you cant replay the tts on the flashcards
- [x] Names in the stories become weird because it translates wrong and is not clickable names should be clickable and say its a name and the pinyin of the name when you click it
- [x] Make it so when you have text to speech in the stories it will highlight the word its reading
- [x] Speed adjuster for the tts
- [x] Make it so the start theme is light and not dark
- [x] Make it so you can see your stats in your profile so you can see what days you studied and not so you have to try to have all days filled out
- [x] Make it ready for public use
- [x] add Russian
- [x] Japanese example sentences are terrible
- [x] add grammar guides and make it so we can learn how grammar works in each language
- [x] You dont lose your streak
- [x] add spanish
- [x] add hsk2
- [x] add n5 part 2
- [x] reworking the japanese reader screen
- [x] remove the - in the hanzi logo name
- [x] Make the first story unlocked from day one
- [x] Correct screen in typing practice is weird in dark mode
- [x] Be more acceptable for answers in typing exercises
- [x] You should be able to see through learned words  in a list
- [x] Fluency score is weird an shows wrong numbers i think it shows for combined each language
- [x] Add some rewards for leveling up
- [x] Make it harder to level up
- [x] In chinese 1. What is Xiao Hua's name? is a question, that is so stupid
- [x] Make a better sentence builder with more commonly used sentences and normal sentences
- [x] make the name in the same font as the logo
- [x] use higgsfield to make better background graphic for the russian page
- [x] make the grammar guide much better, discuss with me how this can be better, and also dont include furigana on the bottom of the kana but only on the top of kanji
- [x] the replay button doesnt work on flashcards when you want to play the sound again
- [x] make the first story longer, and start having more words to each story, dont be too strict that you only have the words you have learned, but focus more on making good stories
- [x] hai is incorect because its hai. that is not good, we need to be less strict in the writing practice
- [x] how does the due cards work, when does the cards come back, and we need a better system for when new cards come back again
- [x] Make kana practice like the app kana
- [x] Fix this bug: Sound doesnt work on flashcards
Expected: The sound shouldve worked
- [x] Replayvbuttom covers the furigana
- [x] When you unlock the tier level in the language you dont loose the previous level(s). For example advancing from H2->H3 still gives you cards from H1 and H2, but now you also get H3
- [x] Make a tutorial for the begining, showing where to press and what the different menus mean
- [x] When you start the app all the country suggestions should be the same size
- [x] After selecting the language you want too practice make you choose between «beginner, intermediate and professional» and give you a test too prove your levels
- [x] When you press cards waiting it makes it so you go to the same page as when you press review & unlock
- [x] Reccomend what to do next after a review
- [x] Highlight words you dont know in the stories
- [x] Improve russian stories, when i highlight words it sometimes just highlights an alphabet and nor the whole word and it also has alot of the A word beyond this level’s list — tap the speaker to hear it, or open the sentence translation below.
- [x] Content for Chinese is coming soon. Please pick another language for now. this shows up when doing onboarding
- [x] https://fabrykjoh12.github.io/Hanzi-dojo/# shows up when loging in, but i want it to be hanzi-dojo.com
