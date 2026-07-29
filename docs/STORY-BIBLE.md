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
