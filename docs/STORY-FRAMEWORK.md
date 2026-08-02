# Story Production Framework — Chinese stories & manhua at scale

The production half of the story system. The *universe* half is
[`docs/STORY-BIBLE.md`](STORY-BIBLE.md) (world rules, cast, canon); this file is
**how stories get conceived, written, drawn, validated and shipped** — the
quality bar, the level rules, the workflows, and the next catalogue. Where the
bible says "what is true in the world", this file says "what is true of the
work".

Everything here builds on machinery that already exists and has shipped
content: the tier targets (`storyLevels.mjs`), the offline validator
(`check-authored-stories.mjs`), the multi-pass generator
(`generate-serial-stories.mjs`), the manhua pipeline (`data/manhua/`,
`publish-manhua.mjs`, `src/manhuaEpisodes.test.js`), and the canon ledger
(`data/story-canon.chinese.json`). Where this document proposes something new,
it says so explicitly. Where existing practice already answers a question, the
existing practice wins — it has evidence behind it.

---

## 1. Executive recommendation

Ten decisions, defended in the rest of the document:

1. **Keep the hybrid production model (Model E, §18).** A shared prose universe
   (这条街) as the default home for new seasons, plus a small number of
   deliberately separate strands (the sea serial, 五族城, the two manhua
   series), plus at most one level-climbing serial per format. This is what has
   already shipped, and it is the right shape: shared casts are the retention
   mechanism, separate strands exist only when they pass the "can only be told
   this way" test.
2. **Manhua is the premium format, not the default.** It costs 15–20 art
   generations per episode plus consistency correction, and it carries the
   strictest language bar in the product (100% coverage, zero reach words). Use
   it where the picture does narrative work prose can't: silence, subtext,
   spectacle, atmosphere. Prose serials are the volume engine; manhua is the
   acquisition-and-retention engine.
3. **Constraint-first concepting.** Every concept starts from a pool probe —
   "what can this level uniquely say?" — never from a premise that then begs
   for vocabulary. 《在动物园》 died because HSK 2 cannot say *lion*; 《第七个人》
   works because HSK 1 has arithmetic in abundance. This is the single biggest
   determinant of quality and it happens before a word is written.
4. **Low levels are not children's levels.** The techniques that make HSK 1–2
   stories mature — silence as characterization, arithmetic as mystery,
   drawn subtext, cost-bearing resolutions — are codified in §4 and are
   mandatory, not aspirational.
5. **The kill-gate is a kill-gate.** Concepts scoring below threshold (§7) are
   rejected, not revised upward. Drafts that fail the blind naturalness
   critique twice are redrafted from scratch, not patched. "Technically
   passes the validator" is the floor, never the bar.
6. **AI drafts, deterministic tools gate, humans own taste.** The generator's
   plan → draft → validate → revise → critique → translate loop stays; §12
   extends it with an adversarial naturalness critic that scores the Chinese
   *without seeing the vocabulary constraints*, and a continuity agent that
   diffs against canon. No LLM ever gets to approve its own output.
7. **Pay the promise debt first.** Two closing plates already promise episodes
   that don't exist (Inkbound 第四话 at HSK 4, Noodle Shop 第四话 at HSK 2).
   A plate is a commitment to a learner; those two episodes precede any new
   catalogue work.
8. **Initial catalogue: 20 scored concepts (§17), weighted 50% HSK 1–2,
   30% HSK 3–4, 20% HSK 5–6** — matching where learners actually are and where
   comprehensible input is hardest to find anywhere else.
9. **Three visual styles at launch, no more** (§11): the ink monochrome
   register (Inkbound), the warm-colour register (Noodle Shop), and the
   painterly cover register the prose shelf already uses. A fourth style is
   earned by a series that cannot live in these three, not granted by default.
10. **The pilot for this framework is 《第四话》 of the Rainy-Day Noodle Shop**
    (§20) — it is already owed, its art direction and model sheets are locked
    (lowest visual risk), and its zero-reach HSK 2 bar is the strictest test of
    every rule in this document.

---

## 2. The two formats

### 2.1 Normal illustrated stories (prose serials)

**Purpose.** Volume, depth, interiority. Prose is where the product can afford
long arcs, memory, narrative distance, and seasons that live inside a
character's head. It is also ~10× cheaper per reading-minute than manhua.

**Shape** (numbers are the shipped tier targets in `storyLevels.mjs`; they are
the law, not a suggestion):

| Property | Target |
|---|---|
| Season length | 5–6 chapters (12 only for a declared long-form season like 五族城) |
| Chapter length | 18–26 lines (tier 1) → 30–44 lines (tier 3); one beat per line |
| Line length | ≤30 chars at HSK 1, rising to ≤40 at HSK 6 — soft cap, egregious 2× lines get revised |
| Scenes per chapter | 1–3, with **at most one location change**; the chapter outline is the finest planning grain (the bible bans scene-level blueprints, and it's right — at 25–45 lines a "scene outline" is the chapter outline) |
| Narration : dialogue | ≈40:60 at HSK 1–2 (dialogue is the comprehension scaffold — short turns, named speakers), drifting to ≈55:45 by HSK 5–6 as narration gains the grammar to carry interiority |
| Vocabulary coverage | 83–90% in-pool by tier (see §4); misses are *chosen* reach words, 6–15 distinct per chapter |
| Paragraphing | None — the reader is line-based (`NAME：text` dialogue format). "Paragraph length" in this product means beat density: one idea per line, no line doing two jobs |
| Pacing | A want or question by line 5 of chapter 1; every chapter ends on a hook (open question, small reversal, or arrival); resolution in the final chapter must cost something |
| Interaction frequency | Every word tappable (that is what the coverage gate guarantees); comprehension questions at season end; word-save prompts are ambient, never interruptive |
| Illustration frequency | One painted cover per chapter, minimum and usually maximum. Prose earns immersion with language, not with art (below) |
| Completion time | 3–8 minutes per chapter; a season is a 20–40 minute commitment spread across days |

**Suitable genres:** warm mystery, slice of life, family drama, elegy/memory,
farce, workplace/craft drama, folk tale, interior drama. Anything whose engine
is *what people feel and don't say over time*.

**Learning goals it serves best:** volume reading, grammar-in-context,
narration comprehension, re-exposure of the whole cumulative pool, long-arc
retention ("what happens to 奶奶 next").

**Use prose instead of manhua when:** the story spans days or years; the drama
is interior or retrospective (letters, memory, regret); the cast is large; the
level is HSK 4+ where language itself can carry subtext; or the concept needs
6+ chapters to land.

**Immersion without an image per moment.** Prose doesn't need pictures because
the pool supplies concrete sensory anchors — this is a technique, not luck:

- **One recurring object per season** that accumulates meaning (the cup on the
  windowsill, the chair outside the shop, the cold bowl of noodles). The
  object is described in pool words, cheap to repeat, and by chapter 4 it
  carries the emotion so the narration doesn't have to declare it.
- **Concrete over abstract, always.** "他看了看表。六点半了。" beats "他很着急"
  at every level — and at HSK 1 it is the *only* option, which is why HSK 1
  prose done right reads like Hemingway rather than like a primer.
- **Weather and light as scene paint**, one line each, from the pool (下雨了 /
  天黑了 / 太阳出来了) — never as mood metaphor (that's an AI tell, §3).
- **The cover does the establishing shot.** One strong painted cover per
  chapter sets place and palette; the prose then never needs to establish
  geography again.

### 2.2 Manhua stories

**Purpose.** Acquisition and delight. A manhua episode is the thing a learner
shows a friend; it is also the format where a rank beginner gets a *complete,
adult-feeling* story on day one, because the art carries everything the pool
can't say.

**Shape** (from the five shipped episodes and the reader's own rules):

| Property | Target |
|---|---|
| Panels per episode | 14–21 |
| Lines (beats) per episode | 23–32; **≤24 characters per line** (hard cap — a line must fit in a bubble on a phone) |
| Bubbles per panel | 0–2. Zero is a feature: 2–4 **silent panels** per episode, placed at emotional peaks |
| Narration boxes | ≤1 per panel; front-loaded (scene-setting) and closing (the plate); never mid-scene explanation — the picture explains |
| Chapters | 2–3 chapter markers in `panels.meta.chapters`, each anchored to a panel |
| Choices | 1–2 per episode; the choice must change at least the next line of dialogue (第一话's 会写/不会写 is the model) |
| Vocabulary | **100% of the cumulative level pool, zero reach words** (`src/manhuaEpisodes.test.js` enforces it). The picture is the reach word |
| Panel variety | Vary aspect ratios deliberately (4:3 establishing, 4:5 tall, 16:9 close-up, 2:1 letterbox, 3:2 reaction). A column of same-shaped panels reads as a card list — the exact failure this format exists to avoid |
| Visual pacing | Wide → medium → close as tension rises; a full-width 2:1 beat panel before each turn; the last panel of an episode is always a held image (the plate) |
| Action readability | One action per panel. Motion reads left→right for progress, right→left for opposition. If a panel needs an arrow to be understood, it's two panels |
| Character placement | Speaker on the side their bubble sits; **stage characters apart** (over-the-shoulder, reaction shots, blurred foreground shoulder) — close two-character interaction is where generated consistency breaks |
| Speech bubbles | Drawn by the app, never the model. Composed-for, not composed-in: each panel names a *quiet region* ("keep the upper-left third free of faces — but FULLY PAINTED, never a flat empty area") and the bubble lands there. A bubble never covers a face |
| Scene transitions | Cut on action or on gaze: end a scene on someone looking at something, open the next on what they see. Establishing panel only when location actually changes |
| Cliffhanger structure | The closing plate (`panels.meta.continues = { label, level }`) prints "第N话 · continues at HSK M" — the promise and the prerequisite arrive together. **Whatever the plate promises must become true**, or it's a lie told to a learner |
| Completion time | 5–10 minutes |

**Suitable genres:** anything that earns artwork — supernatural/ghost story,
wuxia-adjacent, sports, silent romance, atmospheric slice of life, adventure,
visual comedy. A kitchen table does not earn 18 generations; a lantern-lit
dojo does.

**Learning goals it serves best:** day-one reading confidence, dialogue
comprehension, high-frequency-word overlearning (the zero-reach bar forces the
pool's core into every episode), pull-forward motivation (the plate pointing
one level up).

**Use manhua instead of prose when:** the important thing must stay *unsaid
and drawn* (the Noodle Shop rule); the level is HSK 1–2 and the concept needs
more meaning than the pool can say; the story is short, atmospheric and
continuous in time; or the concept's hook is an image.

**How to avoid "prose in boxes"** — the defining failure of educational
comics. Three enforceable rules:

1. **The swap test.** If a panel's artwork could be swapped with a generic
   image of the same location and no meaning is lost, the panel fails. Every
   panel must carry information that is not in its text: a facial reaction,
   an object noticed, a distance between people.
2. **The silent-beat quota.** At least two panels per episode carry no text at
   all. In the Noodle Shop these are the entire point — the pushed bowl, the
   cat settling into the man's arms. If nothing in the story can be said
   picture-only, the concept is a prose concept.
3. **Text states, image reveals.** Dialogue may state facts ("十块钱。"
   "他有九块。"); the *meaning* (nobody mentions it) lives only in the drawing.
   Reverse this — image states, text explains — and you've written prose in
   boxes.

---

## 3. Story-quality principles

The bar every Hanzi-dojo story clears, both formats, all levels. Numbered so
the critique pass (§12) can cite them.

**Openings & structure**

1. **A concrete anomaly by line 5.** Not "an interesting day began" — a number
   that's wrong, a mark you didn't make, a man one kuai short, a cat that
   stops coming. The hook must be *stateable in pool words* and refusable to
   explain (the refusal is the tension).
2. **Every named character wants something**, and every *recurring* character
   wants something that has nothing to do with the protagonist (bible rule).
   A character with no want is a prop; cut or replace them.
3. **Conflict is understandable in one sentence** at the story's own level.
   If explaining the conflict needs words the reader doesn't have, the
   conflict is at the wrong level.
4. **Stakes escalate by narrowing, not by inflating.** The street doesn't
   burn down; the shop might not reopen, and today is the last day to ask.
   Escalation = a deadline, a cost made visible, a second person implicated.
5. **Every chapter turns.** Something is true at the end of a chapter that
   wasn't true at the start — a fact, a relationship, a decision. A chapter
   that only "develops atmosphere" is cut or merged.
6. **Endings cost something.** Someone decides, admits, or gives something up
   before the warmth arrives (bible rule: resolutions are warm but *earned*).
   A problem never dissolves on its own; a coincidence may complicate but
   never resolve.

**Texture & register**

7. **Emotional variation inside every chapter.** A tense chapter has one warm
   beat; a warm chapter has one shadow. Monotone chapters — all cozy, all
   grim — are the #1 marker of generated fiction.
8. **Mystery = information the reader wants and a character has.** Sustain
   curiosity by making the *withholding* visible (adults answering with
   silence, a question changed the subject on) rather than by narrator
   coyness.
9. **Humor comes from character, not wordplay.** Puns don't survive
   translation or a learner's dictionary; a boy confidently wrong four times
   about cooking dinner survives anything. Farce of consequences (一个字's
   卖/买) is the house comedy register.
10. **Action is sequence, not adjectives.** 他跑。他摔了。他又站起来。 Low
    levels can't intensify, so they enumerate — which reads as restraint, and
    restraint reads as mature.
11. **Meaningful decisions over events.** The most memorable shipped beats are
    choices: draw the bird or ask for a new notebook; carry the cold bowl
    anyway. Prefer a small decision to a big event in every outline.
12. **Dialogue is oblique.** People answer a different question than the one
    asked, deflect, understate. 100% on-the-nose dialogue ("我很难过，因为…")
    is an automatic revision trigger at every level above HSK 1, and even
    HSK 1 can do obliqueness by silence (猫不说话。他也不说话。).
13. **The cup rule.** Emotion lands on objects, not adjectives. Before writing
    a feeling-word, check whether an object in the scene can carry it.
14. **Theme is never stated.** If a line could be pasted into a fortune
    cookie, delete it. The reader assembles the theme from consequences.

**Complexity & exposition**

15. **One new thing at a time.** New character, new location, new grammar
    pattern — a chapter introduces at most one of each.
16. **No exposition dumps.** Backstory arrives as evidence (a photo, a
    ledger, an overheard half-sentence) that the *characters* react to, never
    as narration explaining. If three consecutive lines contain no present-
    tense action, revise.
17. **Sentence-frame variety.** No more than two consecutive lines sharing
    the same syntactic frame (X是Y / X很ADJ / X在PLACE VERB) unless repetition
    is deliberate rhythm (the counting motif in 《第七个人》 — repetition
    with *escalating meaning* is a technique; repetition from poverty is a
    defect, and the difference is whether the third occurrence lands harder
    than the first).

**Banned AI-fiction patterns** (the critique pass rejects on sight)

18. 突然 more than once per chapter; any hook that begins with weather-as-mood.
19. The rule of three as plot skeleton (three tries then success) unless
    subverted — it's the single most common generated shape.
20. Endings where everyone smiles / 从此他们都很开心 / the lesson is stated;
    "little did they know" narration; a wise elder who exists to explain the
    theme; naming an emotion the scene already showed.
21. Symmetric chapter shapes across a season (every chapter: problem at line
    3, complication at midpoint, resolution in last 2 lines). Vary where the
    turn falls.

**Why educational stories are boring, and the countermeasure each gets:**

| Failure | Cause | Countermeasure here |
|---|---|---|
| Vocabulary display case | Story exists to exhibit words | Constraint-first concepting (§5): the premise is derived from what the pool can say, so words occur because the story needs them |
| Nobody wants anything | "Situations" instead of stories (a day at the market) | Principle 1–2; the concept scorecard kills want-less concepts (§7) |
| Condescension | Writing down to "beginners" as if they were children | The maturity techniques in §4; adult protagonists and adult silences at every level |
| Zero subtext | Fear that learners miss implication | Put the subtext in the *drawing* (manhua) or in *actions* (prose); comprehension questions can even test it |
| Resolution without cost | Niceness as a genre | Principle 6, enforced at outline review |
| Sameness at scale | One prompt, many runs | Seed rotation + register ledger (§7), similarity gate (§13) |

**How a simple story feels mature:** withhold, don't simplify. The difference
between a children's story and a spare adult story is not vocabulary — it is
that the children's story explains itself. HSK 1 *forces* non-explanation (no
因为, no 但是, no 告诉), which means the level's biggest limitation is
literary restraint for free. Every HSK 1–2 story should be designed so that
what's missing is *felt* — the shipped proof is 《一块钱》, where the absence
of comment on the missing kuai IS the story.

---

## 4. HSK-level framework

Pools are cumulative (level N = all lists ≤N plus names). Numbers align with
`storyLevels.mjs` tiers; "reach words" = distinct out-of-pool words, chosen
not leaked. The app's system is HSK 3.0 with levels 1–9; stories currently
cover 1–6, and the 7–9 band inherits the HSK 6 row until it gets its own.

| | HSK 1 | HSK 2 | HSK 3 | HSK 4 | HSK 5 | HSK 6 |
|---|---|---|---|---|---|---|
| Pool (approx cumulative) | ~300 | ~470 | ~970 | ~1470 | ~1970 | ~2470 |
| In-pool coverage bar | 83–85% | 85–90% | 84–88% | 84–88% | 83–87% | 83–87% |
| Reach words / chapter | ≤10–14 | ≤6–12 | ≤8–14 | ≤8–14 | ≤9–15 | ≤9–15 |
| Line cap (chars) | 30 | 32 | 34 | 36 | 38 | 40 |
| Grammar ceiling | 了, 和/也/还/都, numbers, dates; **no conjunctions of cause/contrast** | 因为/所以, 但是, 虽然, 让, 告诉, 已经, 过, 着 | 以前, 才/又, 如果, 把/被, 决定/发现/相信/忘记, comparisons | 变化/记得/奇怪/认识; relative-time layering; reported speech | 商量/解决/支持; multi-clause reasoning; formal register available | 答应/选择/回忆; abstraction, concession, irony carried by grammar |
| Dialogue | 2–6 char turns, named speakers, questions & answers | Short exchanges with reasons (often wrong ones) | Real conversations; disagreement sustained over turns | Subtext via deflection; people talk past each other | Negotiation; things deliberately left unsaid mid-sentence | Register shifts as characterization (who speaks formally to whom) |
| Narration | Pure action & observation | Action + simple causation | Past vs present ("then vs now") | History, noticing, unreliable memory | Interiority, weighing, consequence | Retrospection, letters, restraint |
| Chapter length (lines) | 18–42 by tier | 18–42 | 20–44 | 20–44 | 20–44 | 20–44 |
| Named characters on stage | 2–3 (+1 animal) | 3–4 | 4–5 | 5–6 | 6+ | 6+, incl. off-stage characters who matter |
| Plot complexity | One question, linear, single thread | One question + one wrong answer discarded | A thread and a sub-thread; a revealed past | Two threads that turn out connected | Competing legitimate interests; no villain | Ambiguity held to the end; what happened vs what it meant |
| Themes the pool can carry | Routine, family, food, weather, counting, presence/absence | Reasons, promises kept simply, small money, school, animals | Memory, discovery, then-vs-now, folk tales | The street's past, change, strangers becoming known | Work, family negotiation, things left unsaid, rivalry between goods | Promises, regret, choice, letters, forgiveness |
| Emotional complexity | Felt but unnamed (shown in action) | Named simply, one feeling at a time | Mixed feelings sequenced ("先…后来…") | Two feelings at once, one hidden | Conflicted loyalty; guilt without wrongdoing | Irony, mourning, self-knowledge arriving late |
| Implied meaning | Carried entirely by silence & action (or the drawing) | Reader infers the *reason* behind a stated fact | Reader infers what a character won't say | Reader infers what a character doesn't know about themselves | Motive triangulated from three viewpoints | The text's surface and meaning may diverge (restraint, understatement) |
| Visual support | High — manhua native zone; prose needs strong covers & object anchors | High | Moderate — art is amplifier, not crutch | Moderate | Low — decorative/atmospheric | Low |
| Idiom / colloquial policy | None. Particles (吧/呢/啊) from the pool are the entire "colloquial" budget | None; set phrases only if in-pool (没关系) | Frequent in-pool set phrases; still no chengyu | 1 chengyu per season max, treated as a taught reach word, used ≥3× | Chengyu & colloquialisms as *characterization* (one character uses them, others don't) | Free, within coverage; register contrast becomes a device |

### 4.1 Genre is structure, not vocabulary — the low-level proof

Every "advanced" genre works at HSK 1–2 if its *engine* is rebuilt from what
the pool has. Shipped proofs exist for most of these:

- **Mystery** — arithmetic and absence. A number that's wrong (《第七个人》), a
  routine that breaks (《店外边的椅子》). HSK 1 has numbers, days and 没有.
- **Suspense** — a stated rule plus an approaching violation. 晚上不要一个人写字
  is HSK 2, and it's a horror beat.
- **Horror** — the ghost-story register, never gore: something moves that
  shouldn't, at night, and adults aren't surprised (Inkbound 第三话, HSK 3 —
  its scariest line is 林老师's calm).
- **Romance** — proximity, objects and weather; no love vocabulary needed. Two
  people, one umbrella, and who walks on the wet side. HSK 1 can say all of it.
- **Rivalry** — counting again: who reached the gate first, every day, for two
  years (the running serial). 比 exists at HSK 2; before that, sequence does it.
- **Adventure** — displacement plus resourcefulness: a wrong bus, a mountain
  path, weather turning. HSK 2 has directions, weather, 找不到.
- **Comedy** — confident wrongness and escalation of consequences (我做晚饭;
  一个字). Requires zero vocabulary beyond the situation's own.
- **Emotional stakes** — always available, because they live in actions:
  a bowl pushed across a counter needs no words at all.

### 4.2 The same scene at three levels

The scene: a regular customer hasn't arrived; the shop is waiting and nobody
will say so.

**HSK 1** — facts and actions only; the feeling is the pattern's break:

> 六点了。他每天六点来。
> 今天他没来。
> 妈妈做了面条。面条冷了。
> 猫坐在门口。猫看外边。
> 我们不说话。

**HSK 3** — the past exists, so the break can be *measured*; someone can
notice someone else noticing:

> 已经六点半了，他还没来。
> 以前他每天都来，从来没有晚过。
> 小美发现，妈妈一直在看门口。
> 「妈，你在看什么？」
> 「没什么。」妈妈说，可是她没有走开。
> 猫也在等。它比我们诚实。

**HSK 5** — interiority and negation of speech; the narration can now say
that nothing is being said, and mean it:

> 六点半过了，门口始终没有动静。
> 妈妈一边收拾桌子，一边不时朝街上看一眼，动作比平时慢了一半。
> 谁都没提他。可是那碗一直温在锅上的面，替我们都问了。
> 小美穿上了外套。没有人问她去哪儿——不用问。

Same beat, three renderings; each level says exactly as much as it can and
*uses the ceiling as the style*. This is the house method.

---

## 5. Vocabulary framework

The pool is the world's physics (bible §2). This section is the operating
manual.

### 5.1 Word classes and how each is handled

| Class | Rule |
|---|---|
| **Target vocabulary** (current level's list) | The story's raw material. Each season names an **anchor word** (already in the data model) used ≥5 times with escalating weight, plus 8–15 focus words placed in varied frames |
| **Previously learned** (levels below) | Free, and *deliberately* recycled — a season should touch all high-frequency function words; the story shelf's "% known" makes this visible to the learner |
| **New / reach words** | Prose only, within `maxMisses`. A reach word must be: concrete, guessable from context on first meeting, worth tapping (碗, 摔, 圈 — never a grammar word, never a synonym of an in-pool word), and used ≥3× across the season |
| **Unavoidable out-of-level words** | There are none. If a premise "needs" a word the budget can't carry, the premise is wrong for the level — fix the premise (the 在动物园 lesson) |
| **Names** | Only names in `src/characterNames.js` (or role labels in `CN_ROLE_SPEAKERS`) — that's what makes a name tappable instead of chopped into dictionary words. Two characters minimum (the 白 vs 小白 lesson). Names never count against coverage |
| **Places** | Built from pool words (面馆, 学校, 山上) or established canon locations. A named invented place is a reach word and must earn its slot |
| **Fantasy terminology** | Only in a declared `world: true` season with lowered bar (五族城 precedent: `min_coverage: 0.80`, `max_reach: 22`), and the invented lexicon is ≤12 relentlessly repeated concrete nouns. A fantasy world at HSK 2 affords a dozen new nouns, not a glossary |
| **Sound effects** | Sparingly, as text beats, only if in-pool or spent as reach; in manhua the *drawing* is the sound effect (art carries no text, ever) |
| **Slang** | None below HSK 5; at 5–6, as characterization for exactly one character |
| **Idioms / chengyu** | Per the ladder in §4's table |
| **Grammar structures** | ≤1 new pattern per chapter, introduced in dialogue first (shorter frame), then narration; the roadmap's "grammar in context" flag names it |

### 5.2 Limits (per chapter unless noted)

| Quantity | Limit |
|---|---|
| Distinct reach words | `maxMisses` for the tier: 6–15 (prose); **0** (manhua) |
| Reach-word occurrences | ≥3 each across the season, ≥1 in the chapter that introduces it |
| Anchor word | ≥5 occurrences per season, in ≥3 distinct frames |
| New grammar patterns | ≤1 |
| In-pool coverage | The tier bar (83–90%) — the validator's number is final |
| Unique words | No hard cap; watch the *ratio*: a chapter using 200 unique words in 30 lines is a word salad; healthy chapters re-use aggressively (type–token ratio roughly ≤0.55 at HSK 1–2, ≤0.65 above) |

### 5.3 Introducing a word naturally — the seven mechanisms

1. **Action**: the word happens before it's said — someone 摔了 and *then*
   the word recurs in dialogue about it.
2. **Dialogue**: a character asks what another character means; the answer is
   a demonstration, not a definition.
3. **Visual context** (manhua): the panel shows the referent in the same beat.
4. **Repetition**: 3+ spaced occurrences, each in a slightly wider frame.
5. **Contrast**: paired with its in-pool opposite (冷的面 vs 热的面).
6. **Consequence**: the word matters — the plot turns on what it names, so
   the reader *needs* it, which is the strongest encoding there is.
7. **Character reaction**: someone on the page responds to the referent, and
   the reaction glosses the meaning (a wince glosses 疼 better than a note).

Never the eighth mechanism: a sentence that exists to contain the word. The
test for that is below.

### 5.4 Validating naturalness

Three gates, in order:

1. **Deterministic** — `check-authored-stories.mjs` (coverage, speaker rules,
   line lengths, translation parallelism, the narration-colon trap). Exists;
   final authority on numbers.
2. **Blind critique** — an LLM critic scores the Chinese *without being shown
   the vocabulary constraints or the level*, and answers two questions: "which
   words or lines feel inserted rather than needed?" and "which consecutive
   lines share a frame?" A word that the critic flags AND that has <2
   occurrences AND that is on the focus list = forced; rewrite the beat or
   drop the word from focus. (New — §12 wires it into the pipeline.)
3. **Read-aloud** — the TTS narration is generated anyway; listening to a
   chapter is the cheapest human check there is. Clunky rhythm survives silent
   reading and dies out loud. The maintainer (or any reviewer) plays the
   chapter once before flipping `is_published`.

Collocation rule for writers and prompts both: a focus word's *first*
occurrence uses its most frequent collocation (打电话, not 打 in an exotic
frame); creative placement is allowed from the second occurrence on.

---

## 6. Genre strategy

Evaluated against: fit for language learning, HSK range, prose vs manhua,
vocabulary risk, visual opportunity, genericness risk, and the twist that
makes it ours. The tone rules of 这条街 (no villains, no violence, stakes
emotional) apply inside that universe; separate strands may go further
(ghosts, fantasy) but never into gore, gamified power-scaling, or cruelty.

**Core (launch weight ~60%)**

- **Warm mystery / slice-of-life hybrid** — the house genre; every question
  is answerable in pool words and the answer is always a person, not a ghost
  (五楼的灯 precedent). All levels. Prose-first. Risk: register sameness —
  managed by the season ledger's register rotation. Our twist: the mystery's
  solution must *cost* someone an admission.
- **School & rivalry drama** — daily-routine vocabulary is the HSK 1–3 pool;
  competition supplies stakes for free (the running serial is the model:
  power-levels-as-clock-times). HSK 1–4, both formats (sports manhua is
  visually rich). Risk: sports-anime cliché; the fix is losing well (he
  doesn't win the last race).
- **Family / craft drama** — 商量-class vocabulary at HSK 4–6; the noodle
  shop's "别的可以变，面不能变" is a whole genre. Prose. Risk: cozy inertia —
  every season needs a real disagreement with two defensible sides.
- **Comedy of consequences** — farce built on one small error escalating
  (一个字). HSK 2–4, prose; visual comedy variant works in manhua. Risk:
  wordplay that dies in translation — comedy must be situational.

**Strong (launch weight ~30%)**

- **Supernatural / ghost-story register** — manhua-native (Inkbound). The
  pool constraint *helps*: horror is withholding, and low levels can't
  explain. HSK 1–4. Keep out of 这条街. Risk: escalation pressure toward
  action-fantasy; the ink stays quiet.
- **Silent romance** — objects, weather, proximity; almost no dialogue needed,
  so it works at HSK 1–2 where nothing else does. Manhua-first. Risk:
  preciousness; anchor it in a mundane cost (who pays for the umbrella).
- **Adventure / survival-lite** — displacement + weather + numbers. HSK 2–4,
  manhua for the visuals, prose for multi-day arcs. Risk: needing nouns the
  pool lacks (equipment, terrain) — probe first.
- **Folk tale & historical** — already at HSK 2–3 (司马光, 田螺姑娘); the
  known-shape story is a comprehension gift, and it's culture content for
  free. Prose. Risk: museum dust; retell with a present-day frame character.
- **Detective (casebook)** — recurring-detective serials recycle an
  investigation lexicon across cases; each case is one season. HSK 3–5. Both
  formats (noir is visually cheap: rain + shadow, which the style already
  does). Risk: crime vocabulary ceiling — cases are about *objects and
  people*, never violence (a missing bicycle, a switched sign, a wrong bill).

**Situational (launch weight ~10%)**

- **Cultivation-adjacent fantasy** — only as the Inkbound's own register
  (practice, mastery, ink spirits) — the *discipline* half of the genre, never
  the power-scaling half. HSK 3–6, manhua.
- **Secondary-world fantasy** — only as declared `world: true` seasons with a
  ≤12-noun lexicon (五族城 precedent). HSK 2–4, prose. Expensive to do well;
  one per year is plenty.
- **Sci-fi-lite / time-slip** — one anomaly, mundane setting (tomorrow's
  newspaper; a phone that rings from the past). HSK 3+. Risk: technobabble —
  ban explanation entirely; the anomaly is never explained, only lived with.
- **Workplace drama** — the office tower is canon geography; HSK 5–6 has the
  pool for it. Prose.

**Rejected for now:** martial-arts action (fight vocabulary + choreography
cost, and it drags toward violence), crime-as-crime (tone rules), pure
travelogue (no want), time-travel-as-plot-machine (paradox exposition is a
grammar nightmare below HSK 5).

---

## 7. Story concept engine

### 7.1 The concept card

Every concept is one card, filled before any prose exists. (This becomes the
`brief` object in §14.)

```
title:            《…》 (working)
hook:             one sentence, stateable at the target level
genre / tone:     from §6 / one register word (elegiac, farcical, tense, warm…)
level & tier:     e.g. HSK 2 t3   format: prose | manhua
universe:         这条街 | sea | 五族城 | inkbound | noodleshop | NEW (justify)
protagonist:      who + their want (one line)
opposition:       person / circumstance / self — never a villain in 这条街
setting:          canon location or new (new = canon-file update)
central question: the thing the reader keeps reading to learn
emotional core:   the feeling underneath the plot (one line)
learning focus:   anchor word + 8–15 focus words + ≤1 grammar pattern/chapter
vocab themes:     the pool clusters the story will recycle
visual identity:  cover palette / (manhua) style + palette + signature image
length:           chapters × lines (from tier targets)
chapter turns:    one line per chapter — what becomes true in it
ending type:      earned-warm | bittersweet | open-with-answer | plate→next
sequel potential: what thread stays open (goes in canon open_threads if used)
pool probe:       PASTE THE EVIDENCE — the 10 pool words that carry the
                  premise, and the 3 words the premise wants but the pool
                  lacks, with the workaround for each
```

The **pool probe is the heart of the card.** A card without one is not a
concept, it's a wish.

### 7.2 Generation method

1. Pick level & format from catalogue gaps (§13 tracks them).
2. Probe the pool: list what this level can *newly* say (bible §2's ladder).
3. Draw a premise shape from `SEASON_SEEDS`, offset past the season ledger.
4. Check the canon ledger and rotate the **register** too (mystery → domestic
   → elegiac → farce…), so consecutive seasons don't land the same beat.
5. Write the card. For a climbing serial, apply the strand test: *does the
   story get more articulate exactly as the reader does?* If the same story
   could be told flat at one level, it's not a strand.
6. Score it (below). Kill or proceed.

### 7.3 Scoring — 10 axes × 0–5, weighted to 100

| Axis | Weight | 5 looks like |
|---|---|---|
| Hook strength | ×3 | Stateable in one pool-word sentence; produces an immediate question |
| Originality vs shelf | ×2 | Register + premise shape both differ from the level's last 3 seasons |
| Character potential | ×2 | Wants collide; at least one character must change |
| Emotional potential | ×2 | The ending can cost something specific |
| Visual potential | ×2 | (manhua) ≥3 beats work with no text; (prose) covers + one recurring object are obvious |
| Vocabulary suitability | ×3 | Pool probe shows the premise runs on pool words; reach list ≤ budget and all guessable |
| HSK suitability | ×2 | The level's *ceiling* is used as a device, not suffered |
| Series potential | ×1 | A thread can stay open without cheating this season's ending |
| Production difficulty | ×2 | (reverse-scored) No new characters sheets, no new locations, no new style |
| Distinctness (similarity check) | ×1 | No shipped season shares its premise shape AND register |

**Kill rules (any one is fatal, regardless of total):** hook ≤2 · vocabulary
suitability ≤2 · a pool probe that lists >3 missing load-bearing words · same
premise shape + register as any shipped season at the level. **Threshold:
score ≥70 to enter the backlog; ≥80 to enter production.** Concepts between
60–70 are not "revised until they pass" — one rework attempt, then archived.
The catalogue in §17 carries these scores.

The last field of every surviving card is one sentence beginning **"The unfair
advantage of this story is…"** If the sentence can't be finished without the
word "vocabulary", the concept is usable but not compelling — archive it.

---

## 8. Character system

### 8.1 The character sheet

One compact block per important character; the human half lives in the canon
file, the visual half in `data/manhua/bible/` (or the cover-prompt notes for
prose-only characters). This is also the exact context block an image prompt
or a writing prompt receives.

```
name:            小美            reading: Xiǎo Měi     (in characterNames.js: yes)
role:            the namer of things
silhouette:      small, round-shouldered, apron too big — readable at 100px
color language:  warm apricot + white apron (colour series) — one accent per character
personality:     decides fast, defends what she names, unembarrassable
want:            for the shop's regulars to be *hers*
fear:            that people leave and it was her fault
flaw:            claims things (cats, people, outcomes) she can't control
contradiction:   the boldest speaker; goes silent exactly when it matters most
speech:          short declaratives, names things, asks 为什么 nobody answers;
                 NEVER: hedges, apologizes twice, uses words above HSK 2
signature move:  puts her coat on before anyone has decided anything
relationships:   妈妈 — obeys slowly; the man — adopted him before he noticed
arc this season: learns a name is a promise, not a label
recurring beat:  announces the cat's opinion as fact
vocab niche:     names, numbers, 喜欢/不喜欢 constructions
never-do:        cries on-page; explains her feelings
model sheet:     data/manhua/bible/xiaomei-huahua-model-sheet.webp
```

### 8.2 Voice differentiation inside one pool

Everyone shares the same few hundred words, so voice is **distribution, not
lexicon**:

- **Sentence length**: 李明 asks in bursts of 4 characters; 林老师 answers in
  one clause that lands like a verdict.
- **Question-to-statement ratio**: 小雨 asks the direct question first and the
  polite one never; 妈妈 barely asks at all.
- **Particles as fingerprint** (吧/呢/啊/嘛 are in-pool early): one character
  softens everything with 吧, another never uses a particle in her life.
- **What they never say** — the never-list is half of any voice. The quiet
  man's voice is that he has almost none.
- **A signature move** that is *staging*, not vocabulary: 小红's sheet of
  paper and pen; 小美's coat.

No slang, no eye-dialect, no out-of-level words for flavor — flavor is
rhythm.

### 8.3 Consistency maintenance

- **Appearance**: model sheet attached as reference image to *every*
  generation featuring the character (bible rule; it is what keeps 小雨 the
  same person). Clothing is part of the sheet — a costume change is a canon
  event, noted in the season entry.
- **Personality & speech**: `BIBLE_CHINESE` blocks in `storyLevels.mjs` feed
  the generator; the never-list is checked by the critique pass.
- **Relationships & emotional progression**: the canon file's `open_threads`
  and season ledger. A season may move a relationship one step; it may not
  reset one.
- **Naming**: `characterNames.js` is the registry; ≥2 characters per name;
  pronouns are never speaker labels; role labels come from `CN_ROLE_SPEAKERS`.
- **Death & permanence**: bible §1 — the dead stay dead, the cat is not a
  device, geography doesn't move.

---

## 9. Normal-story workflow

Twenty-two steps; the middle third is automated today. Per-step: **In** →
**Out** · who (AI / tool / human) · the failure mode that actually happens ·
the check.

| # | Step | In → Out | Who | Real failure mode | Check |
|---|---|---|---|---|---|
| 1 | Concept selection | catalogue gaps + season ledger → concept card | Human picks, AI drafts cards | picking by novelty, not by shelf gap | scorecard §7, kill rules |
| 2 | Learning objective | level word list → anchor + focus words + grammar flag | AI proposes, human approves | focus words nobody needs (rare synonyms) | frequency rank of focus words |
| 3 | Vocabulary plan | concept + pool → pool probe, reach list | AI | reach spent on grammar words | reach rules §5.1 |
| 4 | Character selection/design | canon → cast list (+ new sheet if needed) | Human decision, AI drafts sheet | new character invented when a canon one fits | "could 阿姨 do this?" question, asked literally |
| 5 | Plot outline | card → 5–6 chapter turns, one line each | AI drafts, human approves | symmetric chapter shapes; costless ending | principles 5, 6, 21 |
| 6 | Chapter outline | plot → per-chapter beat list (8–12 beats) | AI | beats that are atmosphere, not events | every beat states what *changes* |
| 7 | (Scene outline) | — folded into 6; the bible bans scene-grain blueprints at 25–45 lines and is right | — | over-planning kills voice | — |
| 8 | First draft | outline + bible + tier targets → chapter text, `NAME：text` | AI (premium tier) | display-case sentences; frame repetition | blind critique §5.4 |
| 9 | Chinese-language review | draft → flagged lines | AI critic (blind), then human spot-read | critic praising grammatical-but-dead prose | critic prompt scores *needed-ness* of words, not correctness |
| 10 | Level validation | draft → coverage report, reach list, line lengths | **Tool** — `check-authored-stories.mjs` | trusting the LLM's own coverage claim | the checker's number is final |
| 11 | Dialogue polish | draft + character sheets → revised turns | AI + human ear | voices converging | read two characters' lines in isolation — can you tell whose? |
| 12 | Pacing revision | full season read → cuts & re-orders | Human (this is taste) | fixing pace by adding, not cutting | season reads in one sitting |
| 13 | Translation | Chinese → line-parallel `english_content` | AI | line-count drift; translating the subtext | checker enforces parallelism; translation states only what the Chinese states |
| 14 | Pinyin | (reader-side per-word; no authoring step) | Tool | — | — |
| 15 | Vocabulary annotations | validated draft → reach_words, anchor_word fields | Tool + AI | annotating words the story doesn't teach | occurrence counts ≥3 |
| 16 | Illustration planning | season → 5–6 cover briefs (palette arc across chapters) | AI drafts, human approves | covers that illustrate a noun, not the chapter's *turn* | brief names the beat, not the setting |
| 17 | Illustration prompts | brief + style register → prompts | AI | style drift; text in image | locked style blocks §11; no-text constraints |
| 18 | Continuity review | season + canon → canon diff | AI proposes diff, human merges | facts changed silently; threads forgotten | canon file update is part of the PR, not after |
| 19 | Audio | published lines → per-line TTS | Tool (`story-audio-*` Actions) | partial generation shipping | `has_audio` only flips on 100% success (existing behavior) |
| 20 | Final QA | everything → rubric score §15 | Human, with the checklist | rubber-stamping own work | the QA reader is not the writer/prompter |
| 21 | Publish | JSON → `authored-insert` Action → `stories` rows | Tool | forgetting comprehension questions / covers (the bible's "definition of done") | the publication checklist §15 |
| 22 | Post-publication | analytics §16 + feedback → revision or archive | Human | optimizing for completion by flattening | the guardrails in §16 |

**Templates.** The story brief is §7.1's card. The chapter outline is:

```
chapter N — 《title》
turn:      what is true at the end that wasn't at the start
opens on:  (place, time, who) — carried over or one move from ch N-1
beats:     8–12 lines, each an event or a decision, no atmosphere beats
hook out:  the question/reversal the last 2 lines leave open
grammar:   the one pattern this chapter introduces (or "none")
reach:     words spent here (running season total vs budget)
```

Final chapter data is the existing `authored-stories.json` entry shape
(content / english_content / names / reach_words / anchor_word / questions —
see §14). The QA report is §15's rubric filled in, attached to the PR.

---

## 10. Manhua production workflow

Five artifact layers, in order — each exists because the next one needs it:

1. **Prose outline** — the story as 10–15 plain sentences. Proves the story
   works *before* paying for art. If the outline is boring, no paneling saves it.
2. **Screenplay** — beats as numbered lines of dialogue/narration in final
   Chinese (`NAME：text`, ≤24 chars), validated against the pool *at this
   stage* (zero reach — cheaper to fix here than after art exists).
3. **Comic script** — beats grouped into panels with shot, staging and the
   quiet region (the format below). This is where "prose in boxes" is caught:
   apply the swap test and the silent-beat quota to the script, not the art.
4. **Panel prompt** — one generation prompt per panel: locked style block +
   composition + the CRITICAL CONSTRAINTS block + model-sheet references.
5. **Final reader data** — the `data/manhua/*.json` entry: beats in
   `content`, layout in `panels` (art file, ratio, alt, bubbles→beat indices,
   choices, meta). Beat indices are 0-based; **inserting a line means
   re-indexing panels** (the file's own warning).

### 10.1 The steps

| # | Step | Notes / who |
|---|---|---|
| 1 | Concept | §7 card; manhua kill-rule extra: the pool probe runs at **zero reach** |
| 2 | Story arc | series-level: which episode climbs to which level; every plate promise scheduled before ep 1 ships |
| 3 | Chapter beats | prose outline (layer 1) — human-approved before any drawing |
| 4 | Scroll structure | 14–21 panels, 2–3 chapter anchors, choice positions |
| 5 | Panel breakdown | comic script (layer 3); swap test + silent quota here |
| 6 | Visual script | shot/angle/staging per panel (format below) |
| 7 | Dialogue | screenplay Chinese, ≤24 chars, validated (tool) |
| 8 | Narration | boxes front-loaded + plate only |
| 9–10 | Character & location refs | model sheets from `data/manhua/bible/`; a new character means a new sheet *before* episode art starts |
| 11–14 | Composition, camera, expression, pose | in the visual script; staging-apart rule; expressions named concretely ("his face does something complicated" is a writing note — the prompt says brows/mouth) |
| 15 | Bubble placement | quiet-region wording (never "empty" — the letterbox-bar lesson, bible §6); bubble never covers a face |
| 16 | Sound effects | drawn, not written — art carries zero text |
| 17 | Image generation | Higgsfield, style block + constraints block verbatim, model sheets attached; pre-approved spend |
| 18 | Consistency correction | `tools/manhua-contact-sheet.mjs` (bars, seal-stamps) + human contact-sheet review; regenerate failures — episode 2's first pass lost 14/19 panels to constraint violations, so budget for a second pass |
| 19 | Lettering | the app draws bubbles/keylines/gutters — never the model (full-bleed rule) |
| 20 | Translation & pinyin | line-parallel english_content; pinyin is reader-side |
| 21 | Interactive vocab | tap-anything comes free from the zero-reach bar; names in `characterNames.js` |
| 22 | Mobile layout | ratios varied; crop-safety = nothing load-bearing in outer 8% of any edge; verify on a phone width |
| 23 | Final QA | rubric §15 + `src/manhuaEpisodes.test.js` + published-content validator |

### 10.2 Panel script format

One block per panel (this is layer 3+4 combined; it compiles to the
`.art.json` prompt file and the `panels` jsonb):

```
panel:        p07          ratio: 16:9
purpose:      the reader must see that the man noticed the cat before anyone spoke
location:     noodle stall interior, counter level     time: night, rain
shot:         medium close-up      angle: from behind the counter, child height
characters:   the man (right third, seated); 花花 (foreground left, blurred)
pose:         chopsticks paused halfway; head turned slightly down-left
expression:   brows neutral, eyes down — restraint, not sadness
action:       none (held beat)
environment:  steam between camera and subject; lantern warm from right
dialogue:     — (silent panel)
narration:    —
sfx:          rain carried by the drawing (streaks on the window behind)
vocab beat:   — (bubbles reference beat indices; silent = no beat)
continuity:   jacket still soaked (ep-01 p05); nine coins still on counter edge
quiet region: upper-left third free of faces/detail — FULLY PAINTED with
              steam and window rain, never a flat empty area
prompt:       [locked style block] + the above, prose-composed
              + [CRITICAL CONSTRAINTS block, verbatim]
negative:     covered by the constraints block (text, seals, borders,
              franchise resemblance); add per-panel negatives only for
              observed failures
bubbles:      none    crop safety: coins ≥8% from right edge
```

### 10.3 Cross-panel consistency — the six causes of drift and their fixes

| Drift | Fix |
|---|---|
| Character face/outfit | Model sheet attached to every generation, no exceptions; costume changes are canon events |
| Two characters interacting | Stage apart (OTS, reaction shots, blurred foreground) — the bible rule born from real failures |
| Location layout | One location reference sheet per set (counter axis, door side, lantern positions); prompts state the camera's side of the axis |
| Props | Load-bearing props (the coins, the notebook) named in every panel's continuity line |
| Lighting | The series palette is locked in the style block; per-episode, one light source declared once and repeated in every prompt |
| Style | The style block is verbatim, never paraphrased; `art_palette` set correctly so the contact-sheet checks run |

---

## 11. Art-direction system

**Overall identity:** drawn, never photographic; painterly-cinematic; light
carries the emotional arc (the shipped covers' "the light does the arc"
principle); zero text in artwork, always — the app renders every word so
every word stays tappable.

**Three controlled styles at launch — and only three:**

1. **Prose cover register** — painterly, cinematic, "good animated film, not
   textbook" (60+ shipped covers). Per-season palette arcs are the variety
   mechanism; the register itself doesn't change.
2. **Ink register** (Inkbound) — the locked monochrome block in bible §6.
3. **Warm-colour register** (Noodle Shop) — the locked block in bible §7.

A new manhua series first tries to live in style 2 or 3 (palette and set
dressing give plenty of differentiation — noir detective is style 2 with rain;
sports is style 3 with daylight). A fourth style requires a series that
*cannot* read correctly in either, approved like a `world: true` season: with
a written justification. Unbounded style growth is how consistency dies and
how every generation stops benefiting from accumulated prompt-craft.

**Standards** (what must exist before production art starts):

- **Character reference sheet** — full-body turnaround + face detail, in the
  series style, stored in `data/manhua/bible/`; silhouette must read at 100px.
- **Expression sheet** — 6 named expressions per principal (neutral, the
  character's signature expression, and 4 the season needs). Generated once,
  referenced always.
- **Pose sheet** — only for characters with a signature physical move.
- **Clothing** — on the reference sheet; one outfit per character per season.
- **Location sheet** — one wide establishing render per set + a written axis
  note (what's left/right of camera).
- **Prop sheet** — only load-bearing props (the notebook, the coins).
- **Palette** — locked per series in the style block; per-season arc notes
  for covers (cold blue → night → gold dawn precedent).
- **Cover composition** — one subject, one light source, the chapter's *turn*
  not its setting; series covers rhyme deliberately (the two reaching-hands
  covers precedent).
- **Panel composition** — quiet region named; full bleed; no borders (app
  draws the frame).
- **Iconography / title / HSK labeling** — all UI, never baked into art. The
  shelf's "% known" pill and level chips are the product's labeling system;
  art stays clean.
- **Genre differentiation** — palette and light, not style: mystery is
  rain-desaturated, comedy warm and crowded, elegy over-lit and hazy (all
  shipped precedents).

No copyrighted characters, franchises or recognizable designs, and never name
a franchise, studio or artist in a prompt — describe the picture (bible rule,
kept absolute).

---

## 12. AI production system

### 12.1 Division of labor

| Task | AI is good at | AI reliably gets wrong | Context it needs | Verified by |
|---|---|---|---|---|
| Concept generation | volume, recombination | sameness across runs; wants-free "situations" | season ledger, pool probe, seeds | scorecard + human pick |
| Outlining | coverage of beats | symmetric shapes, costless endings | principles §3 as rubric | human approval (cheap, high-leverage) |
| Drafting Chinese | fluent in-register prose at volume | inserted-word sentences; frame repetition; explaining subtext | bible block, tier targets, focus list, chapter outline | validator + blind critic |
| Vocabulary control | none — it *claims* compliance | its own coverage estimates | — | **deterministic checker only** |
| HSK/level validation | flagging suspicious lines | precision | pool files | checker is authoritative; LLM only triages |
| Chinese proofreading | grammar, collocation flags | over-normalizing voice into blandness | character sheets | human spot-read of flagged lines only |
| Dialogue improvement | variety generation | voice convergence | never-lists, voice fingerprints §8.2 | isolation read test |
| Translation | line-parallel accuracy | translating implication (adding what the Chinese withholds) | "state only what the Chinese states" rule | checker (parallelism) + spot-read |
| Pinyin | — (reader-side, deterministic) | — | — | — |
| Image prompts | composing style+scene | violating format constraints (text, borders, empty→letterbox) | locked blocks verbatim, failure lexicon from the bible | contact-sheet tool + human review |
| Character sheets | drafts | contradictions with canon | canon file | human merge |
| Panel generation | the art itself | consistency, readable marks, seals | model sheets attached | contact sheet + regeneration budget |
| Audio | (pipeline exists) | — | — | has_audio all-or-nothing rule |
| Metadata / annotations | extraction | annotating untaught words | occurrence counts | tooling |
| QA | rubric pre-scoring | grading itself leniently | the rubric | **a different model/prompt than the writer**, plus human |
| Continuity | diffing text vs canon | silent omissions | canon file | human merges the canon diff |

### 12.2 The agent roles — and why they disagree on purpose

The existing generator already runs plan → draft → validate → revise →
critique (score ≥7 or revise/redraft) → translate. Extend it to six roles
with **separated incentives** — each sees different context, so consensus
means something:

1. **Architect** — sees: concept card, season ledger, principles §3. Produces
   outlines. Cannot write prose.
2. **Writer** — sees: outline, bible, focus list, tier targets. Produces
   chapters. Never sees the rubric it will be graded on (prevents
   teaching-to-the-test prose).
3. **Validator** — not an LLM. The checker. Its numbers are final.
4. **Blind critic** — sees: the Chinese text ONLY. No constraints, no level,
   no outline. Scores: does this read as a story a person would write? Which
   words feel inserted? Which lines share frames? Its ignorance is the
   feature — it can't excuse flatness as "well, it's HSK 2".
5. **Continuity agent** — sees: draft + canon file. Produces a canon diff and
   a violation list (dead characters speaking, geography moved, never-list
   breaches).
6. **Visual director** — sees: approved text + style blocks + sheets.
   Produces briefs and prompts. Never edits text.

**Disagreement protocol:** the Writer revises against critic notes at most
twice; a third failure triggers redraft-from-outline (already the pipeline's
behavior — "drafted from scratch again if it still isn't good enough").
Critic and Validator verdicts are never averaged: the Validator gates
mechanically, the critic gates on taste, and *both* must pass. Nothing the
Writer produces is approved by the Writer's own prompt lineage.

**Preventing generic output, concretely:** seed + register rotation (§7.2);
the banned-pattern list (§3) in the critic's rubric, not the writer's prompt
(telling a writer "don't be generic" produces generic-with-disclaimers;
having a critic hunt specific patterns produces rejections that stick);
few-shot the Writer with the *shipped* best chapters (《一块钱》, 《第七个人》
ch1) rather than with instructions.

---

## 13. Content pipeline

**Statuses** (a `status` field on the authored entry / dashboard row):

`idea → concept-approved → outlined → drafted → language-review →
visual-production → qa → published → revision-needed → archived`

**Stage gates — what blocks promotion:**

| Transition | Blocked unless |
|---|---|
| idea → concept-approved | scorecard ≥70, no kill-rule hit, pool probe attached |
| → outlined | human-approved chapter turns; ending has a cost; register differs from level's last season |
| → drafted | every chapter passes the offline validator (coverage, speakers, lengths, parallelism) |
| → language-review passed | blind critic ≥7; zero banned patterns; canon diff produced |
| → visual-production | covers/panels briefed; new characters have sheets; (manhua) contact sheet clean |
| → qa | rubric §15 scored by non-author; ≥80 and no category floor breached |
| → published | publication checklist complete (questions, cover, audio dispatched, canon merged, ROADMAP updated) |
| published → revision-needed | analytics triggers (§16) or reported error |
| → archived | one rework attempted, or superseded |

**Infrastructure mapping (exists / new):**

- Content database: `data/authored-stories.json` + `data/manhua/*.json` +
  `stories` table — git is the CMS (bible §5: no editor UIs). *Exists.*
- Versioning: git history + `previous_titles`. *Exists.*
- Approval: PR review + `is_published` flag + dashboard. *Exists.*
- Automated checks: offline checker, `manhuaEpisodes.test.js`,
  `authoredStories.test.js`, contact sheet, `check-published-stories.mjs`
  (live-DB validator — run after every content change). *Exists.*
- Asset storage: covers in the `audio` bucket, panel art committed under
  `public/stories/`. *Exists.*
- Character refs: `data/manhua/bible/` + canon. *Exists.*
- Vocabulary tracking: `story_vocab`, snapshots in `data/`. *Exists.*
- **Duplicate/similarity detection: NEW** — extend the canon season ledger so
  every season records `premise_shape` (which seed) and `register`; the
  concept gate greps it. Embedding-based similarity is not worth building
  until the shelf triples.
- **Continuity tracking:** canon `facts` / `open_threads` — the continuity
  agent (§12) makes updating it mechanical instead of remembered. *Exists,
  gains automation.*
- Analytics & feedback: `story_reads`, dashboard, Discord #feedback-feed.
  *Exists; §16 adds definitions.*
- Revision workflow: `revision-needed` status + the same gates on the way
  back up. A published story is never edited outside the pipeline.

---

## 14. Data-model recommendations

Principle: **the authoring layer is richer than the storage layer, and
compiles down to it.** The DB shape (`stories` + `panels` jsonb +
`story_vocab` + `story_questions` + `story_reads`) is deployed, working, and
serves every reader format; don't normalize panels/scenes/blocks into tables
the product doesn't query. What follows documents the canonical shapes and
the additive fields worth adopting. (JSON, not TypeScript — repo rule.)

**Story (authored entry → `stories` row).** Existing shape, with the additive
`brief` block (the concept card, §7.1) and `status`:

```json
{
  "language": "chinese", "system": "hsk_3", "level": 2, "tier": 3,
  "presentation": "prose",
  "status": "qa",
  "title": "《…》",
  "english_summary": "…",
  "content": "line\nNAME：line\n…",
  "english_content": "line-parallel translation",
  "names": ["小美"],
  "reach_words": ["碗"],
  "anchor_word": "面条儿",
  "questions": [ { "question": "…", "options": ["…","…","…","…"], "correct_index": 0 } ],
  "brief": { "hook": "…", "register": "elegiac", "premise_shape": "seed-09",
             "focus_words": ["…"], "grammar_flag": "把", "ending": "earned-warm",
             "unfair_advantage": "…" }
}
```

**Chapter** = one story row in a season (grouped by title numbering — 第N话 /
N. — which the shelf already parses). **Scene / prose block** = deliberately
not modeled (bible §5: the chapter is the grain; a line is the beat unit).

**Manhua panel** (inside `panels` jsonb — existing, documented):

```json
{
  "id": "p7", "art": "panel-07-noticing.webp", "ratio": "16/9",
  "alt": "…style, subject, and where the quiet region is…",
  "bubbles": [ { "beat": 12, "kind": "speech", "speaker": "小美",
                 "side": "left", "top": 8, "width": 56 } ],
  "choice": { "beat": 13, "options": [ { "text": "…", "next_beat": 14 } ] }
}
```

with `panels.meta = { story_kind, estimated_minutes, chapters:[{title,panel}],
art_base, art_palette, text_placement, reward, continues:{label, level} }` —
`continues.level` is always a level *number*, rendered via `getLevelLabel`.

**Character / location** — canon file entries (authoring layer only):

```json
{ "name": "小美", "reading": "Xiǎo Měi", "in_character_names": true,
  "want": "…", "fear": "…", "flaw": "…", "contradiction": "…",
  "speech": { "style": "…", "never": ["…"] }, "signature": "…",
  "relationships": { "妈妈": "obeys slowly" },
  "model_sheet": "data/manhua/bible/xiaomei-huahua-model-sheet.webp" }
```

**Vocabulary item / translation / audio / dialogue line / bubble / progress /
question** — all already modeled: `vocabulary` + `story_vocab`;
`english_content` (line-parallel — the invariant every tool enforces);
`tts_audio` + per-line story clips with `has_audio`; dialogue lines as
`NAME：text` beats; bubbles as above; `story_reads` (one progress system for
every format — bible's explicit rule); `story_questions`.

The reader features the structure must support — pinyin/translation toggles,
word-level taps, audio playback, progress, responsive layouts — are all
derived from these shapes today; that's the strongest argument for not
changing them. Future story *editing* is git.

---

## 15. Quality-control rubric

**100 points, five categories. Release requires ≥80 total AND ≥60% of each
category's points.** Scored at the `qa` gate by someone (or some prompt
lineage) that didn't write the story.

**Narrative — 25**
| pts | |
|---|---|
| 5 | Hook: concrete anomaly by line 5, stateable at level |
| 4 | Pacing: every chapter turns; hooks out of each chapter |
| 4 | Motivation: every named character wants; wants collide |
| 4 | Conflict & stakes: understandable in one sentence; escalates by narrowing |
| 4 | Ending: costs something; no dissolution, no stated moral |
| 4 | Originality: register + shape differ from the level's recent seasons |

**Language — 30**
| pts | |
|---|---|
| 8 | Natural Chinese: blind-critic ≥7; zero inserted-word flags surviving |
| 6 | Level fit: validator green (coverage, reach budget, line caps) — *floor: any red = automatic fail, not a deduction* |
| 5 | Grammar: ≤1 new pattern/chapter, introduced dialogue-first |
| 5 | Dialogue: voices distinguishable in isolation; oblique where the level allows |
| 3 | Translation: line-parallel; states only what the Chinese states |
| 3 | Read-aloud: TTS pass sounds like speech, not a list |

**Educational — 20**
| pts | |
|---|---|
| 6 | Target vocabulary: anchor ≥5×, focus words needed by the plot |
| 5 | Repetition: reach words ≥3×; type–token ratio in band |
| 4 | Contextual learning: each new word enters by a §5.3 mechanism |
| 3 | Difficulty: "% known" at target tier lands in the tier's band |
| 2 | Comprehension questions: test meaning (even subtext), never trivia |

**Visual — 15**
| pts | |
|---|---|
| 5 | Consistency: characters/props/lighting stable across panels or covers |
| 4 | Composition: quiet regions honored; bubbles never cover faces; crop-safe |
| 3 | Readability & clarity: one action per panel; silent beats land |
| 3 | Cover: depicts the chapter's turn; palette follows the season arc |

**Product — 10**
| pts | |
|---|---|
| 3 | Mobile: verified at phone width; ratios varied; no dead taps |
| 3 | Interactions: every word tappable; names resolve as names; choices alter text |
| 2 | Audio dispatched; metadata (level/tier/summary) correct |
| 2 | Progress & accessibility: counts as read correctly; alts written |

**Automatic rejection regardless of score:** validator red · any canon
contradiction (dead speak, geography moves, never-list breach) · readable
text/glyphs in artwork · a `continues` plate pointing at an unscheduled
episode · a banned pattern (§3 items 18–21) surviving revision · translation
line-count mismatch · (manhua) any reach word at all.

**Human-review checklist (the 10-minute pass):** read the season in one
sitting on a phone → play one chapter's audio → tap 10 words including both
names → answer the questions without rereading → check the canon diff → check
the cover against the chapter's turn → sign the rubric.

**Publication checklist:** rubric attached · questions present · cover
applied (`story-images-apply`) · audio task dispatched · canon merged ·
`check-published` run and warnings read · ROADMAP.md updated · (serial) next
episode's promise scheduled.

---

## 16. Analytics & improvement

Definitions go in `docs/METRICS.md` (one definition per number — house law);
staff excluded from aggregates, never from error monitoring. Instrumentation
base already exists (`story_reads`, analytics events, the dashboard).

**Collect, per story and per chapter:** open rate (shelf-impression →
open) · start & completion rate · **abandonment point** (last beat/panel
reached — the single highest-value new signal) · active reading time ·
translation-reveal rate · pinyin-toggle rate · audio-play rate · word-taps
per 100 words (and *which* words) · saves-to-deck · comprehension accuracy
per question · next-chapter rate within 7 days · return-to-series rate ·
calm ratings (👍/👎 + "felt: too easy / right / too hard") · difficulty
perception vs measured "% known" · (later) favorite characters via a
lightweight "more of 小美?" prompt at season end.

**How signals steer production — with the diagnosis step in between:**

- A spike of word-taps + translation reveals at the abandonment beat →
  *difficulty* problem → check whether reach words clustered there; fix the
  chapter, don't lower the level.
- Abandonment with *low* tap activity → *boredom* problem → the beat didn't
  turn; this is a §3 failure, feeds the critic's few-shot examples.
- High completion + low next-chapter → ending failed to hook or plate missing.
- Comprehension misses concentrated on one question → the story didn't earn
  that inference, or the question is bad; read it before blaming readers.
- High saves on a reach word → the reach list did its job; words nobody taps
  or saves get replaced in future seasons.

**Guardrails against shallow-engagement optimization:** completion rate is a
*diagnostic*, never a target — the known failure mode is shortening and
flattening stories until completion looks great and nobody remembers them.
Ratings never gate visibility (no popularity shelf — the shelf sorts by
readability). No engagement mechanic gets added to fix a content problem
(bible §5: if a chapter needs a badge, the chapter failed). Difficulty
perception is compared against measured "% known" before any vocabulary rule
changes — feelings and coverage disagree often, and coverage wins.

---

## 17. Initial catalogue — 20 scored concepts

Scores are §7.3 estimates; every concept passed the kill rules and the pool
probe at card level. None duplicates a shipped season's shape+register at its
level. Production difficulty: ●○○ low → ●●● high.

### Prose (10)

**P1 · 《十一个杯子》** — HSK 1 t2 · warm mystery/elegy · 这条街 — *score 84*
Hook: 奶奶 sets out eleven cups every morning. 李明 counts the people who
come: ten. Protagonist: 李明; want: to know who the eleventh cup is for.
Conflict: the one question nobody will answer at a level with no 告诉.
Learning: numbers, family words, 每天; anchor 杯子. Ending: he stops asking
and starts filling it — the answer arrives as an action (a photo on the
shelf), never as a sentence. Visual: morning table, one cover per chapter,
light moving across the same table. 5 chapters. Continue-reading pull: the
count is checkable every chapter. Difficulty ●○○. Weakness: adjacent to the
letter-elegy register — the season ledger must confirm distance from
《三十年前的信》-class seasons.

**P2 · 《大毛的一天》** — HSK 1 t3 · comedy/slice · 这条街 — *score 78*
Hook: the street told by its cat: 大毛 visits five homes in one day, and in
each one sees something the humans think is private. Want (cat-logic): food
and warm places; the *reader* wants the five secrets to connect — and they
do: everyone is secretly preparing the same birthday. Learning: rooms, food,
verbs of motion; anchor 看. POV constraint = pure observation = HSK 1's
native register. 5 chapters. Difficulty ●○○. Weakness: cat-POV whimsy could
go childish — the fix is that the secrets are adult (money counted twice, a
letter half-written), observed without comment. Canon note: stays within
"the cat is never a device" — he witnesses, never acts.

**P3 · 《第二名》** — HSK 2 t2 · school rivalry · 这条街 — *score 82*
Hook: a transfer student beats 小红 at everything, and never once smiles
doing it. Want: 小红 wants to win; then wants the real answer to a better
question. Conflict: rivalry that curdles into worry. Reveal: the girl's
family may move again any week — winning is the only thing that travels.
Learning: school/comparison vocabulary (比 arrives at HSK 2); anchor 第.
Ending: 小红 loses the last test and does the sheet-of-paper move (her canon
signature) — writes one question and slides it over: 你想留下吗？ 5 chapters.
Difficulty ●○○. Weakness: school-drama beats are well-trodden; the
never-smiling detail must stay strange for 3 chapters, not 1.

**P4 · 《晚上的电话》** — HSK 2 t3 · suspense→elegy · 这条街 — *score 80*
Hook: the shop's phone rings every night at nine. Nobody is ever there —
until 李明 answers wrong-footed and hears breathing that says one word: a
name that belongs to nobody on the street. Truth: an old man dialing a
30-year-old number that once was his late wife's shop; the number was
reassigned. Learning: time words, 打电话, 让/告诉 (new at 2); anchor 电话.
Ending: they don't correct him; 姑娘 starts answering at nine. Cost: someone
gives up their evening, nightly, without being thanked. 5 chapters.
Difficulty ●○○. Weakness: must dodge sentimentality — the critic's
no-stated-feelings rule carries the ending.

**P5 · 《小红的本子》** — HSK 3 t1–3 · detective casebook · 这条街 — *score 86*
Hook: 小红 starts a notebook of street problems; each season = one case, each
chapter = one wrong theory discarded. Case 1: every plant on the street's
south side is dying, and the obvious culprit (the new shop's cleaning water)
is innocent. Learning: HSK 3's evidence verbs (发现/如果/因为…就); anchor
发现. Serial engine: the casebook is infinitely extensible with vocabulary
recycling built in — the strongest series-potential card in the catalogue.
Ending type: answer + a cost (the real cause is a kindness done wrong).
Difficulty ●○○. Weakness: needs case-of-the-season discipline or it becomes
a formula; register must rotate per case.

**P6 · 《愚公说不》** — HSK 3 t3 · folk tale, reframed · standalone — *score 75*
Hook: a folk-tale season (the 司马光/田螺姑娘 slot at 3): the mountain-mover
story told by the *neighbor* who said it was impossible — and kept bringing
food every day for thirty years. Want: the neighbor wants to be right; feeds
them anyway. Learning: 以前/坚持-class vocabulary; anchor 山. Ending: the
mountain doesn't matter; the daily bowl does. Difficulty ●○○. Weakness:
retelling risk = museum dust; the unfaithful-narrator frame is the antidote.

**P7 · 《对面的楼》** — HSK 4 t2 · history/mystery · 这条街 — *score 83*
Hook: an old woman stands outside the office tower every morning looking up
at the 8th floor — which is air where her demolished house used to be. 李明
assumes grief; the truth inverts it: she's checking the ginkgo tree she
planted survives in the courtyard — the only living thing left of the row of
houses (canon fact: the tower replaced small houses 30 years ago). Learning:
HSK 4's 变化/记得/奇怪; anchor 楼. Ending: the building's manager (管理员 is
an established role label) has been watering it for years; two strangers who
kept the same secret meet. 5 chapters. Difficulty ●●○ (new minor character).
Weakness: risks the elegy register again — play it as *mystery* until ch4.

**P8 · 《面不能变》** — HSK 4 t3 · workplace/craft comedy-drama · 这条街 — *score 81*
Hook: 姑娘 takes an apprentice who films everything and wants to "make the
shop famous". Every improvement works — and each one quietly costs a regular.
Conflict: two people who are both right ("别的可以变，面不能变" is her canon
line — this season is that sentence, dramatized). Learning: work/change
vocabulary; anchor 变. Ending: the apprentice's viral video is of the one
thing he was told not to change. Difficulty ●●○ (new character: apprentice —
needs canon sheet). Weakness: "old vs new" is a cliché shape; the fix is that
the apprentice is *good*, not wrong.

**P9 · 《去，还是不去》** — HSK 5 t2 · family negotiation · 这条街 — *score 79*
Hook: 妈妈 is offered a better job in another city; the family agrees to
decide together in seven days, and the story is the seven days. No villain,
three defensible positions, and the decision costs whichever way it lands.
Learning: HSK 5's 商量/解决/支持; anchor 商量. Structure: each chapter is
one evening's conversation plus the day around it. Ending: they stay — and
the story is honest that staying is also a loss. Difficulty ●○○. Weakness:
low-event; carried entirely by dialogue quality — the isolation-read voice
test is the gate. (Ledger check: distinct in structure from the shipped
job-offer season — this one is the *negotiation*, day by day, not the offer.)

**P10 · 《午夜电台》** — HSK 4→6 climbing strand (3 seasons) · interior — *score 85*
The second climbing serial (the sea strand's adult sibling; new strand, so it
must pass the "only this way" test — it does): a night-shift radio host takes
listener calls. At HSK 4 the callers can *describe* their problems; at HSK 5
they can *negotiate* them; at HSK 6 they can finally say what they actually
mean — and the last season reveals the host has been answering one recurring
caller for two years without knowing it's his estranged father. The learner's
climb IS the callers' growing articulacy. Learning: the whole 4→6 abstraction
ladder; anchor 听. Reach lexicon for all three seasons: 电台, 节目, 深夜 —
three words, sea-strand style. 15 chapters. Difficulty ●●○. Weakness: an
interior strand lives or dies on voice variety across callers; budget extra
critic passes.

### Manhua (10)

**M1 · 《一把伞》** — HSK 1 · silent romance · new mini-series (colour register) — *score 84*
Hook: rainy season; two students, one bus stop, one umbrella that keeps
changing hands by engineering rather than conversation. Nearly dialogue-free —
12 of 16 panels silent; the story is *whose shoulder is wet*. Learning:
weather, days, 给; anchor 雨. Plate: 第二话 at HSK 1 (stays at level — the
noodle-shop principle: beginners need a series that's still there next week).
3-episode season. Difficulty ●●○ (two new character sheets; colour register
reused). Weakness: two-character interaction is the consistency danger zone —
stage apart per §10.3, which the premise conveniently wants (they're shy).

**M2 · 《快一点》** — HSK 1 · sports comedy · colour register — *score 77*
Hook: the slowest kid in class is unbeatable at exactly one thing nobody
knew was a sport: he can carry eight bowls of noodles up the hill without
spilling. School sports day needs him. Learning: numbers, 快/慢, food words;
anchor 快. Visual: pure physical comedy, balance as spectacle — earns its
panels. 2 episodes. Difficulty ●●○. Weakness: comedy timing in panels is a
craft risk — storyboard the spills first; if the beats don't land silent,
they won't land at all.

**M3 · 《门后边》** — HSK 2 · suspense (no ghost) · ink register — *score 80*
Hook: the door at the end of the corridor is the only one with two locks,
and every night at ten, light moves under it. The kid watches for six
nights. Truth: a neighbor rehearsing — she's a widowed projectionist showing
films to one empty chair. Learning: rooms, time, 开/关; anchor 门. Silent-
beat showcase: the reveal panel (the chair, the beam of light) has no text.
Plate: standalone (ends its season). 2 episodes. Difficulty ●●○ (ink register
reused; one new sheet). Weakness: the reveal must feel *warmer* than the
setup was scary, or it reads as anticlimax — the last panel carries it.

**M4 · 《山上的一天》** — HSK 2 · adventure/survival-lite · colour register — *score 81*
Hook: class hike; 小美-age kid takes the shortcut that isn't, and the
weather turns. One afternoon, alone, no danger-vocabulary — the tension is
entirely drawn (sky panels darkening across the scroll). Learning:
directions, weather, 找/看见; anchor 山. Choice beats: which path — the
choice changes two panels, then reconverges honestly (both were wrong).
Ending: found by the *dog* from 天天来的那只狗-class canon streetlife, not by
an adult — cost: admitting she was lost, out loud. 2 episodes. Difficulty
●●○. Weakness: solo protagonist = many single-figure panels; vary shots
aggressively or it monotones.

**M5 · 《明天的报纸》** — HSK 3 · sci-fi-lite · ink register — *score 83*
Hook: a newspaper with tomorrow's date keeps arriving at one mailbox. The
kid uses it to prevent one small bad thing — and causes it, exactly. Rule
(never explained, per §6): the paper reports; it doesn't negotiate.
Learning: HSK 3's 如果/发现/相信; anchor 明天. Visual identity: the same
street corner drawn twice per episode — as printed, as lived. Plate: 3
episodes, ends with the mailbox empty and one blank page. Difficulty ●●○.
Weakness: causal-loop plotting at HSK 3 grammar — outline must be airtight
before paneling; this is the concept most likely to need a redraft cycle.

**M6 · 《扫地的人》** — HSK 3 · quiet wuxia-adjacent · ink register — *score 78*
Hook: the school's old sweeper moves like water, and one kid notices. She
asks him to teach her. He teaches her sweeping. It stays sweeping — there is
no hidden kung fu — but by winter she's the calmest person in her class, and
the season's one action sequence is her catching a falling shelf of jars,
alone, with everyone watching. Learning: motion verbs, 慢/稳-class words;
anchor 学. The anti-trope IS the twist (the genre promises a master; the
story delivers a habit). 3 episodes. Difficulty ●●○. Weakness: withholding
the fantasy payoff risks reader frustration — the jar scene must genuinely
astonish, visually; it's the episode budget's centerpiece.

**M7 · 《第十一层》** — HSK 4 · workplace ghost-story · ink register — *score 82*
Hook: the office tower's elevator has no button for 11, but the intern's
misdelivered envelope is addressed to 11层 — and one night the doors open
there anyway: an untouched 1990s office, one desk lamp on. Truth held to the
plate: the floor is leased, empty, by someone who lost the company that died
there — 奶奶-generation history, connecting to street canon (the tower that
replaced the houses). Learning: HSK 4 work/history vocabulary; anchor 层.
3 episodes. Difficulty ●●● (new set: two location sheets; new character).
Weakness: canon-heavy — the continuity agent earns its keep here; must not
contradict 《对面的楼》 (P7) — coordinate the two, or ship only one per
half-year.

**M8 · 《雨衣》** — HSK 4 · detective noir · ink register + rain — *score 79*
Hook: casebook manhua, one case per episode: someone is swapping the
street's shop signs at night — noodle prices on the bookshop, bookshop hours
on the noodle shop — and the only witness detail is a yellow raincoat.
Detective: the delivery courier who's the one person who reads *every* sign
nightly (in-fiction signs exist as story text — the art keeps them blank per
the format's law, which noir shadows make natural). Truth: a shopkeeper
losing his sight, memorizing the street by rearranging it. Cost: saying so
to his daughter. Learning: HSK 4 observation/inference vocabulary; anchor
发现. 3 episodes. Difficulty ●●○. Weakness: signs-as-plot in a no-text-in-art
format is a tightrope — every sign's content must live in dialogue beats;
the panel script must be merciless about it.

**M9 · 《茶凉了》** — HSK 5 · family drama · colour register, muted — *score 76*
Hook: a father and adult son who haven't spoken in a year run the same
teahouse in alternating shifts and communicate only through the state of the
shop — a moved chair, a refilled jar, one cup left warm. The whole series is
the swap test passing: every panel's meaning is what changed since the last
shift. Dialogue-minimal at the level where dialogue is *cheapest* — an
inversion that earns the format at HSK 5. Learning: HSK 5 implication
grammar in narration boxes; anchor 茶. 3 episodes; plate ends on the first
spoken line of the series. Difficulty ●●○. Weakness: commercial appeal is
narrow; schedule after a broader HSK 5 prose season exists.

**M10 · 《灯会》** — HSK 5–6 · historical frame · new register decision — *score 74*
Hook: restoring the street's lantern festival, abandoned decades ago; each
episode intercuts today's fumbling rehearsal with one elder's memory of the
last festival — same shots, two eras (the visual rhyme is the point).
Learning: HSK 6 retrospection grammar; anchor 灯. Difficulty ●●● — the
two-era intercut argues for the catalogue's only new-style *variant*
(colour register + a desaturated past treatment), which per §11 needs
written justification: this is it, and it's the reason the score is lowest.
Build last, if at all this cycle. Weakness: cost; and festival crowd scenes
are consistency hell — cap crowd panels at 3 per episode.

**Catalogue balance:** HSK 1–2: 8 concepts · HSK 3–4: 8 · HSK 5–6: 4.
Registers: mystery 5, comedy 3, elegy/quiet 4, rivalry/sport 2, suspense 3,
romance 1, negotiation/craft 3. Formats: 10 prose (7 seasons + 1 strand + 1
casebook engine + 1 folk slot), 10 manhua (3 in colour register, 5 in ink
register, 2 needing new assets). No concept is a learner-orders-food story;
every one has a want, an obstacle, and a bill that comes due.

---

## 18. Production model — comparison and recommendation

| | A: separate stories per level | B: one story climbing 1→6 | C: same story rewritten per level | D: shared universe, self-contained per level | E: hybrid |
|---|---|---|---|---|---|
| Learning quality | good | excellent (grammar ladder = plot ladder) | poor (re-reading known plot kills inference) | good | excellent |
| Motivation | weak (nothing carries) | excellent but fragile (fall behind = stuck) | weak | strong (cast carries) | strongest |
| Writing quality | fine | hard to sustain ×6 | degrades (constraint retrofit) | high | high |
| Replay value | low | high | none | high | high |
| Production cost | high (no reuse) | medium | low per unit, high per *value* | medium (reuse of cast/canon) | medium |
| Visual cost | high | medium | low | medium (sheets amortize) | medium |
| Maintenance | low | high (one break breaks six levels) | low | medium (canon upkeep) | medium |
| Vocabulary control | easy | hard but proven | easy | easy | per-strand appropriate |
| Character continuity | none | total | none | strong | strong |
| Scalability | linear cost | one per format, max | fast but hollow | good | best |

**Recommendation: Model E — formalizing what has already shipped and
worked.** Specifically: **D is the default** (这条街 for prose; each manhua
series its own small universe) because recurring people are the retention
mechanism and canon amortizes across seasons. **B exists as exactly one
flagship strand per format** (the sea serial in prose; the Inkbound in
manhua; 《午夜电台》 as the eventual HSK 4→6 prose strand) because "the story
gets more articulate exactly as you do" is the product's single best trick —
and also its most fragile, so it stays rare. **A survives only as declared
standalone seasons** (folk tales, `world: true` experiments) where isolation
is the point. **C is rejected** — rewriting one plot across levels spends the
reader's most precious resource, *not knowing what happens next*, and the
level-climbing strand delivers C's promised benefit ("your story grows with
you") without the staleness. The evidence is on the shelf: the highest-value
content shipped to date (sea strand, Inkbound, Noodle Shop, 这条街 seasons)
is exactly this mix.

---

## 19. First 90 days

**Days 1–14 — pay debts, arm the gates.**
Build: the blind-critic pass and banned-pattern list wired into
`generate-serial-stories.mjs`'s critique stage; `premise_shape` + `register`
columns added to the canon season ledger; the §15 rubric as a PR template.
Publish: **Noodle Shop 第四话 (HSK 2)** — the pilot (below) — through the
full §10 workflow, and start Inkbound 第四话 (HSK 4) art. Test: rubric-score
two *already-shipped* seasons to calibrate the bar (if they score <80 the
rubric is miscalibrated, not the shelf).

**Days 15–30 — one of each, by the book.**
Publish: Inkbound 第四话; first new prose season 《十一个杯子》 (P1, HSK 1) —
chosen because HSK 1 is the thinnest shelf per learner and the cheapest
production. Build: abandonment-point analytics (§16's highest-value signal)
and its METRICS.md definitions. Test: full pipeline timing — measure real
hours per prose season and per manhua episode; these numbers set the Q2 pace.

**Days 31–60 — the volume lane.**
Publish: 《第二名》 (P3, HSK 2) and 《小红的本子》 case 1 (P5, HSK 3) — the
casebook engine is the scalability bet, prove it early; plus manhua 《一把伞》
ep 1–2 (M1, HSK 1) for the beginner shelf. Build: the continuity agent
(canon diff automation). Review: first abandonment-point data on the new
seasons against old ones — the framework's first empirical test.

**Days 61–90 — up the ladder.**
Publish: 《对面的楼》 (P7, HSK 4), 《明天的报纸》 ep 1 (M5, HSK 3), and
《去，还是不去》 (P9, HSK 5). Score and lock the next quarter's catalogue
using the 90-day data. Decide with evidence: whether 《午夜电台》 (the 4→6
strand) starts in Q2, and whether manhua pace is sustainable at one episode
per 2–3 weeks or needs to drop to monthly.

Total shipped in 90 days: **2 owed episodes + 5 new prose seasons + 4 new
manhua episodes** (~30 prose chapters, ~6 hours of new reading), weighted to
the beginner shelf.

## 20. Immediate next steps & closing calls

- **Best format to build first:** manhua — but as the *owed* episodes, not a
  new series; then prose carries the volume while manhua ships fortnightly.
- **Initial batch:** the 11 items in §19 (2 owed + 9 new), from the scored
  catalogue — not more; the gates only mean something if the pace leaves
  time to enforce them.
- **HSK distribution:** 50% HSK 1–2, 30% HSK 3–4, 20% HSK 5–6.
- **Genre distribution:** ~40% warm-mystery/slice core, ~35% strong genres
  (suspense, rivalry, romance, adventure, detective), ~25% ladder-climbers
  and experiments — per §6's weights.
- **Best AI workflow:** the existing multi-pass generator plus the two new
  adversaries — the blind naturalness critic and the continuity agent — with
  deterministic validation as the only authority on numbers (§12).
- **The most important quality-control step:** the blind critique kill-gate.
  The validator already guarantees stories are *readable*; nothing until now
  guarantees they're *worth reading* — and it only works if failing twice
  means redraft, not patch.
- **Five largest risks:** (1) register sameness at scale — mitigated by the
  ledger + rotation, but it needs watching quarterly, by a human, reading;
  (2) manhua economics — a second regeneration pass is the norm, not the
  exception; budget it or quality will silently absorb the cost; (3) the
  coverage bar warping prose into display-case Chinese — the blind critic is
  the counterweight, keep it blind; (4) broken plate promises — every
  `continues` is a scheduled obligation, tracked in BACKLOG until shipped;
  (5) analytics steering toward flat, safe, completable stories — completion
  is a diagnostic, never a target, and that sentence should outlive everyone
  currently holding the pen.
- **The pilot:** **《第四话》 of the Rainy-Day Noodle Shop, HSK 2** — already
  promised by 第三话's plate (the debt comes first), locked art direction and
  model sheets (lowest visual risk), zero-reach HSK 2 bar (the strictest
  language test in the product), and a series whose entire method — the
  important thing stays unsaid and gets drawn — is this framework's §2.2 in
  miniature. If the framework can't ship that episode well, the framework is
  wrong; fix it before scaling it.
