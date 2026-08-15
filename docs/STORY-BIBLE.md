# Story Bible — the Chinese track

The human-readable half of the story system. The machine-readable half is
[`data/story-canon.chinese.json`](../data/story-canon.chinese.json) — the
checker reads that file, so **update the canon in the same change that adds a
season**. This document explains the universe, its rules, and how a season gets
made; the canon file records what has actually happened in it.

Related code, in the order a story meets it:

| File | Role |
|------|------|
| `storyLevels.mjs` | Character bibles + per-level tier targets (line ranges, coverage bars, miss budgets) |
| `storyValidation.mjs` | The coverage/speaker/length gate. Mirrors `src/storyReading.js`: passing means every word is tappable |
| `check-authored-stories.mjs` | Offline checker for `data/authored-stories.json` — no network, no API key |
| `generate-serial-stories.mjs` | The LLM pipeline (plan → draft → validate → revise → critique → translate) |
| `src/authoredStories.test.js` | Repo tests over the authored manifest (cast whitelist, line lengths, translation parallelism) |

---

## 1. The universe: 这条街

One contemporary neighborhood street, and everything within a bus ride of it.
School, small shops, the old residential building, the tall office building
that replaced a row of small houses thirty years ago. Every Chinese serial —
HSK 1 through 6 — happens here, to the same people, in roughly continuous
time. HSK 2–3 also carry a few authored folk tales (司马光, 田螺姑娘), which sit
outside the street continuity on purpose.

**Why one universe:** recurring people are the retention mechanism. The reader
comes back for 奶奶 and the cat, not for "graded reader, level 5". A new level
should feel like the same street seen with better eyes, not a new textbook.

### Tone rules

- **Mundane realism.** No magic, no villains, no violence. The biggest events
  so far: a flood, a missing cat, a letter thirty years late.
- **Stakes are emotional, not physical.** Danger is a promise that outlived its
  purpose, a shop that might not reopen, a question someone is afraid to ask.
- **Resolutions are warm but earned.** Someone must decide or admit something
  real before the warmth arrives. A problem never dissolves on its own.
- **Nobody is a device.** Every recurring character has something they want
  that has nothing to do with the protagonist.
- **Quiet observation over declaration.** The cup from home on the windowsill
  says what a paragraph of feelings would; prefer the cup.

### What never changes

- 大毛 does not die, talk, or become anyone's pet.
- Characters who died before the story (老王, 周淑兰) stay dead; they appear
  only in letters, photographs and memory.
- The street's geography (canon file) is fixed. New locations may be added;
  established ones may not move or contradict.
- The cast speaks only through names in `src/characterNames.js` or role labels
  in `CN_ROLE_SPEAKERS` (`src/authoredStories.test.js`) — that is what makes a
  name tappable instead of being chopped into dictionary words.

---

## 2. The physics: the vocabulary pool

The pool is not a constraint *on* the world — it **is** the world's physics.
A story at level N may use: every word from every level below, the current
level's list, the cast's names, and a small budget of "reach words"
(`maxMisses` in `storyLevels.mjs`) which surface in the reader as tappable new
words. Everything else is dead text the learner cannot ask about.

**Consequences:**

- **Probe the pool before planning a season.** Themes must be derived from
  what the level can express, not chosen and hoped for. `在动物园` sits under
  its coverage bar forever because HSK 2 cannot say lion, panda or ice cream —
  no revision fixes a premise the pool can't carry.
- What each band can newly express (rough, from the lists in `data/`):
  - **HSK 1–2** — daily routine, family, school, food, weather, simple
    feelings. Plots must be built from actions, not descriptions.
  - **HSK 3** — 照片, 地方, 发现, 声音, 安静, 以前: memory, discovery, and
    "then vs now" become possible. Folk tales work here.
  - **HSK 4** — 变化, 记得, 奇怪, 认识: mystery, history, and characters
    noticing each other. The street's past opens up.
  - **HSK 5** — work, decisions, 商量, 解决, 支持: adult stakes, family
    negotiation, things left unsaid.
  - **HSK 6** — 答应, 选择, 回忆, abstractions: promises, regret, restraint,
    and letters. Interior seasons work.
- **Reach words are chosen, not leaked.** A good reach word is concrete,
  guessable in context, and worth tapping (碗, 摔, 圈). Never spend the miss
  budget on grammar words or on a second synonym.

---

## 2b. The second strand: the sea

Everything above describes 这条街 — the contemporary street, 李明, the noodle
shop, the chair. There is one other continuity, and it exists to do something
the main strand cannot.

**The sea strand** is a single 18-chapter serial that runs **HSK 1 t3 → HSK 2 t3
→ HSK 3 t3**: 《第七个人》, 《阿水的水》, 《三年前》. A boy stows away on a ship,
is given the job of counting its water, and finds the number is wrong. The
answer is that three years ago the crew left a man on an island, and nobody
decided to — he offered, and six people did not say no.

The design rule is that **the plot may only know what the level can say.**

| Level | What it gains | What the story can therefore do |
|-------|---------------|---------------------------------|
| HSK 1 | numbers, days, `了`, no conjunctions beyond 和/也/还/都 | State the mystery and refuse to explain it. Every adult answers with silence, because the language has no 因为, no 但是, no 告诉. The whole hook is arithmetic — the one thing HSK 1 has in abundance. |
| HSK 2 | 因为, 但是, 所以, 虽然, 告诉, 让, 已经, 过, 着 | People give reasons. Most of them are wrong ones. Motive arrives; the past still cannot. |
| HSK 3 | 以前, 才, 又, 如果, 决定, 发现, 相信, 忘记, 一样, 把, 被 | Hold a past and judge it. "Nobody decided" / "they just didn't say no" / "that is the same thing" is not sayable before this level, and it is the whole point of the story. |

So a reader climbing three levels reads one continuous story that gets more
articulate exactly as they do. **Reach lexicon for all eighteen chapters: 船,
海, 岛.** Nothing else — everything a pirate story seems to need (金子, 山, 火,
刀, 黑) is absent from HSK 1–3 entirely, so the strand is built from the three
nouns it genuinely cannot do without, repeated until they stick.

Its cast (小七, 大风, 阿水, 老九, 阿力) is separate from 这条街 and **the two
strands do not cross over.** If a third strand is ever added, give it the same
test: it should exist because it can only be told this way.

---

## 2c. The third strand: 五族城

A 12-chapter secondary-world season at **HSK 2 t3**, self-contained — it does
not climb levels and does not cross over with 这条街 or the sea. A human named
阿山, who is mediocre at everything, founds a city on empty land and persuades
five non-human peoples to live in it.

**The world rule: each people's gift and each people's problem are the same
fact.** Nothing here is a "strength and a weakness" — it is one property,
described twice.

- **石族** live three hundred years and build things that outlast everyone, so
  they are also too slow to be any use in a crisis.
- **风族** sicken if they stay anywhere past three months, so they are free and
  are never trusted.
- **树族** must root themselves in one place and can never go more than thirty
  li from it again, so they are utterly loyal and utterly trapped.
- **夜族** cannot be in sunlight, so they guard the city every night of its life
  and are seen by almost nobody.
- **火族** are dead by forty, so they are brave, and reckless for the same reason.

阿山's gift is having no gift: he can take nothing, he is not time, and nobody
is afraid of him, which is why all five will talk to him and will not talk to
each other (ch8 is where this is said out loud). Ch7 gives all five a true and
incompatible claim to owning the city; ch10 builds the defence out of every
people's *weakness* rather than their strength; ch12 solves the Wind folk by
rotation — twenty always present, never the same twenty.

**This season is authored at a declared lower bar.** The world cannot be said in
85% HSK 2, so its entries carry `world: true`, `min_coverage: 0.80` and
`max_reach: 22`, which `check-authored-stories.mjs` honours and always reports.
It lands 86–92% in practice. The reach lexicon is small and relentlessly
repeated — 族, 城, 石, 火, 夜, 风, 井, 种, 死 — because a fantasy world at HSK 2
can afford about a dozen new nouns, not a glossary. Use `world: true` only for a
season that genuinely cannot exist at the tier bar, and say why in the canon.

---

## 3. The cast

Full sheets live in the canon file; speech style and never-dos also live in
`BIBLE_CHINESE` (`storyLevels.mjs`) where the generator reads them. The short
version:

- **李明** — curious, impulsive, always hungry. Pulls threads.
- **小红** — sees clearly, says the uncomfortable true thing, then softens it.
  Her signature move: a sheet of paper and a pen, letting people answer
  themselves.
- **小明** — easygoing, deflects, shows up anyway.
- **妈妈 / 爸爸** — steady from a distance / quiet until asked directly.
- **奶奶** (86) — the street's memory. Keeps promises too long and knows it.
- **姑娘** — the noodle shop. Continuity of craft ("别的可以变，面不能变").
- **阿姨** — the person nobody sees, who does the costly kind thing.
- **大毛** — the white cat. Appears where things happen.

**Adding a character:** give them a want, a speech style, and a never-list;
add them to the canon file; if they are a named person, add the name to
`CHARACTER_READINGS` (so taps work), or use a role label already in
`CN_ROLE_SPEAKERS` (奶奶, 阿姨, 姑娘, 店员, 女儿, 管理员 …). Pronouns are
never speaker labels — `她：` renders as a character called "she".

---

## 4. How a season is made

1. **Probe the pool** for the level (what can it newly express?).
2. **Pick a premise shape** from `SEASON_SEEDS` — then check the canon's
   season ledger and rotate the *emotional register* too, so consecutive
   seasons don't land the same beat (mystery → domestic → elegiac …).
3. **Plan 5 chapters**: a want or question in ch. 1, developing hooks, a
   resolution that costs something. Serials can't have gaps — a held opener
   strands the reader mid-story.
4. **Draft** inside the tier targets (`storyLevels.mjs`): line range, coverage
   bar, miss budget, dialogue format `NAME：text`.
5. **Validate offline**: `node check-authored-stories.mjs --file <season.json>
   --verbose`. It enforces coverage, speaker rules, the narration-colon trap,
   translation parallelism, duplicate titles — and tells you your reach words.
6. **Append to `data/authored-stories.json`**, update the **canon file**
   (new facts, threads opened/closed, season ledger row), run the full test
   suite, ship, then dispatch Actions → `regen-content` → `authored-insert`.
7. **Definition of done** — a season isn't finished at insert. It still needs:
   cover art (`story-images-apply`), narration (blocked on Azure secrets),
   comprehension questions (`comprehension`). Track the gap in BACKLOG until
   the pipeline runs them by default.

### Authoring traps the tooling now catches (leave them to it)

- A full-width colon in narration (`上面写着：…`, `他写的是：…`) parses as a
  speaker tag — hides text from coverage, renders as a fake character. Use a
  comma. The checker rejects labels ending in 说/写/着/问/道/喊/答/是/的.
- Emoji are ignored by coverage (scene stories lead lines with them).
- A season's cast is level-wide: a character introduced in chapter 3 is known
  in chapter 2's validation.
- Canon characters' names never count as out-of-pool at any level.

---

## 5. What this system deliberately is not

- **No streaks, XP, achievements, events, premium tiers.** The product removed
  its reward loop on purpose; the retention bet is the cliffhanger and the
  cast. If a chapter needs a badge to make someone read the next one, the
  chapter failed.
- **No editor UIs.** Git-backed JSON + the checker + the dashboard is the CMS.
  Every internal tool is a second product to maintain.
- **No scene-level blueprints.** Chapters are 25–45 lines; the chapter outline
  is the right grain.
- **No interactive branching** until a design exists where every branch still
  validates and stays line-aligned with its translation and narration.

---

## 6. Hanzi Dojo: The Inkbound — the manhua season

A second universe, and the only one that is drawn. It is deliberately **not**
这条街: the street serials are contemporary and domestic, and this one is a
lantern-lit dojo in the mountains, because a manhua episode has to earn its
artwork and a kitchen table does not.

Told in the second person. The learner IS the new student — shown from behind
or out of frame, gender-neutral, dark training clothes, a scroll on their back —
so there is nobody to identify with except yourself.

### Cast

| Name | Reading | Who |
|------|---------|-----|
| 小雨 | Xiǎo Yǔ | Apprentice at the dojo, about thirteen. Chin-length black hair, a cinnabar-red ribbon at one side, an ink brush pushed through her hair. Delighted by new people; asks the direct question first and the polite one never. She is the reason an episode has dialogue at all. |
| 林老师 | Lín lǎoshī | The calligraphy master. Introduced in one line and one doorway. Reveal nothing about him yet — his restraint is the season's slow thread. |
| 小白 | Xiǎo Bái | A tiny floating white ink spirit, one black brushstroke across its forehead, a thread of ink-smoke for a tail. Watches. Follows you inside at the end of episode 1. **Silent through episodes 1 and 2, and speaks for the first time in episode 3** — that silence was the setup and the first line is the payoff, so do not spend it twice and do not write it chatty from here on. When it does talk it is short, plain and unhurried, and it explains the world rather than itself. |

⚠️ The ink spirit is **白** in canon and **小白** on the page. The reader's name
matcher (`matchName`) only takes candidates of two characters or more, so a
one-character name is unreachable — it would be read as the ordinary word 白
("white") and lose its Name popup. 小白 is what you would call him anyway.
Every name here must also exist in `src/characterNames.js`, same rule as 这条街.

### Art direction (locked — use this verbatim)

> Monochrome greyscale manhua illustration, deep rich blacks and luminous pale
> highlights, high contrast, highly detailed polished digital ink rendering with
> clean crisp lineart, soft grey ink-wash and screentone gradients, traditional
> sumi-e ink splash accents, soft bokeh depth of field with drifting light
> particles, cinematic night lighting with glowing lanterns, modern anime
> character rendering with large glossy detailed eyes and sharp glossy hair, no
> colour except a restrained cinnabar-red accent, premium serialized
> graphic-novel quality, no text, no letters, no signage, no captions, no speech
> bubbles, no logo, no watermark, no resemblance to any existing franchise or
> artist.

**And every prompt ends with this block — it is not optional** (added after 14 of
episode 2's 19 panels had to be regenerated for breaking it):

> CRITICAL CONSTRAINTS: there must be NO writing anywhere in the image — no
> Chinese or Japanese characters, no letters, no digits, no invented or fake
> glyphs, no calligraphy, no red seal or stamp, no crest or emblem carrying
> symbols, no signage. Every lantern, banner, scroll and page is completely
> BLANK. Draw NO panel border, NO frame, NO keyline, NO white margin, NO gutter,
> NO inset panel-within-a-panel and NO empty speech balloon or caption box — the
> illustration must BLEED to all four edges. No logo, no watermark, no
> resemblance to any existing franchise or artist.

Rules that go with it:

- **Attach the character sheet** in `data/manhua/bible/` as a reference image to
  every generation featuring that character. That is what keeps 小雨 the same
  person across episodes.
- **Never name a franchise, a studio or an artist in a prompt.** Describe the
  picture, not somebody else's work.
- **Record the prompt with the image.** Every new entry in a `.art.json`
  manifest (and every story cover in `data/story-covers.json`) carries the full
  prompt it was generated from — CRITICAL CONSTRAINTS block included — plus a
  `generated` date:

  ```jsonc
  { "file": "panel-01.webp", "url": "https://…",
    "prompt": "…the full prompt, verbatim…", "generated": "2026-08-15" }
  ```

  `fetch-manhua-art.mjs` refuses to download an asset that has neither, and
  `generate-story-images.mjs` refuses a story's first cover on the same rule.
  This turns the constraints above from a policy into per-image evidence that
  the policy was applied — the difference between answering a rights query in
  prose and answering it with a record. Artwork committed before 2026-08-15 has
  no prompt on file; `node fetch-manhua-art.mjs --check` reports the gap, and it
  stays a gap. **Never invent a prompt for an image already shipped.** Full
  reasoning in [`CONTENT-LICENSING.md`](CONTENT-LICENSING.md).
- **"No text" is not a style note, it is the format.** Every Chinese word is
  rendered by the app so it can be tapped, scaffolded, played and translated.
  Ask explicitly for blank lanterns and blank banners — they are what the model
  reaches for otherwise. The two shapes it reaches for hardest, both of which
  shipped in episode 2's first pass: **a page of practice covered in invented
  hanzi** (asking for "rows of brushstrokes on a page" is read as "writing" —
  describe widely-spaced single marks instead) and **a red seal stamp**, which is
  fake characters in miniature and turns up on lanterns, scrolls, robes and
  notebook covers unless you forbid it by name.
- **Never ask for a mark that could be read.** A panel whose subject is a
  brushstroke must say the mark is a plain single tapering sweep that could not
  be mistaken for a letter, a digit or a character. Episode 2's "一次，两次，十次"
  panel came back the first time as the same glyph-like squiggle three times,
  which a learner would try to read.
- **The art must be full-bleed — the app draws the comic, not the model.** The
  reader supplies the keyline, the gutter and the balloons. A generated panel
  border, white margin, inset panel or empty caption box doubles up inside the
  reader's own frame, and a bubble positioned at `top: 6` lands on the margin
  instead of the picture. Say "no frame, bleed to all four edges" every time.
- **Compose for the bubble — but never ask for an EMPTY area.** Each panel is
  generated with a quiet region where its dialogue will sit, and the panel's
  `alt` describes it. A bubble must never cover a face.

  ⚠️ Say *quiet*, never *empty*. "The top quarter of the frame is empty negative
  space" is read literally: the model draws nothing there, and nothing is a
  **letterbox bar**. That one phrase produced flat bars on eighteen panels of
  the 第三话 + noodle-shop batch, pale cream ones in the colour series and black
  ones in the ink series, and no amount of "full bleed, no frame" in the
  constraints block overrode it — the composition line and the constraints line
  were asking for opposite things. The wording that works names what fills the
  space:

  > COMPOSITION: the cat sits low and to the right. Keep the upper-left third
  > free of faces and important detail — but it must still be FULLY PAINTED
  > with continuing background (rain, shadow, drifting steam), never a flat
  > empty area and never a blank bar.

  `tools/manhua-contact-sheet.mjs` now detects these bars mechanically, at any
  brightness, so a batch cannot ship with them again.
- **Stage characters apart.** Over-the-shoulder framing, reaction shots, one
  figure plus a blurred foreground shoulder — close physical interaction between
  two generated characters is where consistency breaks.
- Vary the aspect ratios (4:3 establishing, 4:5 tall, 16:9 close-up, 2:1
  letterbox, 3:2 reaction). A column of identically-shaped panels reads as a
  card list, which is the failure mode this format exists to avoid.

### Language bar

Stricter than a prose season: **100% of the level's word list, zero reach
words.** A prose chapter may declare a few reach words because writing narrative
without them goes flat — a manhua episode has the picture to carry the meaning
instead, so it has no excuse. `src/manhuaEpisodes.test.js` enforces it.

Lines are capped at 24 characters (prose gets 40): a manhua line has to fit in a
box drawn over a picture, on a phone.

### Episodes

| Episode | Level | State |
|---------|-------|-------|
| 第一话 · 我是新学生 | HSK 1 | Shipped. 23 lines over 14 panels, two choices. You arrive, 小雨 asks if you are the new student, she leads you to the hall, 林老师 asks whether you can write and answers you differently either way, and 小白 watches from behind a lantern. |
| 第二话 · 字会说话 | HSK 2 | Shipped. 32 lines over 21 panels, two choices. You arrive early to an empty hall and find a mark on your table you did not make; 小雨 says 小白 wrote it. 林老师 sets you a hundred repetitions and your hand starts to hurt. 小白 blots the page, and what you do with the blot is the lesson — you draw the bird either way, because there are no new notebooks. He takes the page without saying whether it was good. On her way out 小雨 stops grinning: 晚上不要一个人写字。因为晚上，字会说话。 |
| 第三话 · 夜里的字 | HSK 3 | Shipped. 30 lines over 20 panels, two choices. You come back to the dojo at night, and 小白 — silent for two whole episodes — speaks. What 小雨 warned you about is literally true: the marks come off the page, and they remember who wrote them. 林老师 arrives in the doorway entirely unsurprised, walks between the tables while the ink parts around him, and holds out his hand. The closing plate is your notebook with the bird gone from it and one ink feather on the boards. Promises 第四话 at HSK 4. |
| 第四话 | HSK 4 | Planned. Promised by 第三话's closing plate (`panels.meta.continues`), so it must be written at HSK 4 — the promise is load-bearing. |

## 7. The Rainy-Day Noodle Shop (the second drawn series)

A deliberate counterweight to The Inkbound. Where that one is monochrome ink,
night, a dojo and a ghost story, this is **warm colour, a working street food
stall, and nothing supernatural at all** — the drama is entirely that people are
kind to each other without saying so. It exists because the Inkbound starts at
HSK 1 and immediately climbs, and a beginner arriving today needs a series that
is *still* at their level next week.

Its engine is restraint: the quiet man is never named, nobody ever says what he
is short of money for, and the thing that finally gets said out loud is a cat's
name. **The rule is that the important thing stays unsaid and gets drawn
instead** — which is exactly the format's strength, since the reader is decoding
every word and cannot carry subtext in the prose.

| Character | Reading | Canon |
|-----------|---------|-------|
| 小美 | Xiǎo Měi | Ten, the daughter. Short ponytail, an apron too big for her. Names things and then defends the name; she is the one who decides to go and find someone. Model sheet: `data/manhua/bible/xiaomei-huahua-model-sheet.webp`. |
| 妈妈 | — | Her mother, forties, runs the stall. Tired and completely competent. She is the one who pushes the bowl across anyway. Deliberately NOT in `characterNames.js` — 妈妈 is ordinary HSK 1 vocabulary and must resolve as the word it is. Model sheet: `data/manhua/bible/mama-and-the-man-model-sheet.webp`. |
| 花花 | Huā Huā | The calico cat. Walks in out of the rain and stays. Chooses people; is never picked up. Sits in the doorway facing the street when someone is late. |
| the quiet man | — | Big, a soaked work jacket, eats there every evening. **Never named, in any episode.** He was one kuai short on the first night and nobody said anything about it. That silence is the series. |

### Art direction (locked — use this verbatim)

> Warm colour manhua illustration, rich amber and lantern-orange palette against
> cool blue-grey shadow, soft painterly digital rendering with clean confident
> lineart, gentle cel shading, cosy slice-of-life atmosphere, modern anime
> character rendering with expressive faces, premium serialized graphic-novel
> quality, no text, no letters, no signage, no captions, no speech bubbles, no
> logo, no watermark, no resemblance to any existing franchise or artist.

Everything in §6 applies here too — the same CRITICAL CONSTRAINTS block, the same
model-sheet rule, the same full-bleed rule. Two additions this series needs:

- **A noodle stall is the most sign-covered set in the world.** The constraints
  block must name them: *no shop signs, no menus, no price boards, no banners*.
  Without that the model hangs a lantern with characters on it in every shot.
- **`panels.meta.art_palette` must be `'colour'`** or the contact sheet's
  seal-stamp check fires on all fifteen panels at once and tells you nothing.

| Episode | Level | State |
|---------|-------|-------|
| 第一话 · 一块钱 | HSK 1 | Shipped. 26 lines over 18 panels. Night rain; a soaked cat outside the light, and you get it to come in. Then a big man in a wet jacket puts nine coins on the counter for a ten-kuai bowl, and 妈妈 pushes the bowl across without a word about it. He gives the cat half his egg. Nobody comments on any of it. |
| 第二话 · 花花 | HSK 1 | Shipped. 26 lines over 15 panels. The rain has stopped and the cat has moved in. 小美 wants to name her; 妈妈 is unimpressed; the cat is uninterested. The man comes back, sees her, and his face does something complicated — and the cat walks straight into his arms and settles, which answers a question nobody asked out loud. Still every word HSK 1. |
| 第三话 · 冷了的面条儿 | HSK 2 | Shipped. 26 lines over 16 panels. He eats there every evening — until one evening he doesn't, and the cat sits in the doorway facing the street. 小美 is already putting her coat on. They walk a long wet road to a doorway off an alley with a folded blanket in it, and the bowl they carry has gone completely cold — which is the one detail the episode turns on, because he smiles anyway. |
| 第四话 | HSK 2 | Planned. Promised by 第三话's closing plate. |

### The plate at the end of an episode

`panels.meta.continues` is `{ label, level }`, and the closing plate prints
"第二话 · continues at HSK 2". The **level** is the part that earns its place: a
serial that climbs the ladder should say so at the end of the episode, so "there
is more" and "you are not ready for it yet" arrive together rather than leaving
the reader to hunt the shelf for an episode a level up. `level` is a level
NUMBER in the story's own system, never a printed string — `getLevelLabel` turns
it into "HSK 2" (or "N4", or "A2"). Omit the block entirely for an episode that
ends a season.

**Whatever this promises has to be true.** If the plate says HSK 2, the next
episode is written at HSK 2 and published at level 2, or the promise is a lie
told to a learner.
