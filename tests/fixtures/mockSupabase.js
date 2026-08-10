// Deterministic, secret-free Supabase mock for E2E.
//
// The app talks to Supabase over REST + GoTrue. Rather than hit a real backend
// (which needs credentials and makes tests flaky and non-deterministic), we:
//   1. inject a fake auth session into localStorage before the app boots, and
//   2. intercept every request to the mock Supabase host and answer with fixtures.
//
// This lets `npm run e2e` run anywhere — laptop, CI, cloud sandbox — with no
// secrets and identical results every time. VITE_SUPABASE_URL is set to
// https://mock.supabase.co in .env.e2e, so the project ref is "mock".
import { test as base, expect } from '@playwright/test';
import {
  INKBOUND_MANIFEST,
  INKBOUND_HSK3_MANIFEST,
  NOODLESHOP_MANIFEST,
  TRAIN_MANIFEST,
  UPSTAIRS_MANIFEST,
  questionsFromManhuaManifest,
  storyFromManhuaManifest,
} from './manhuaManifest.js';

const REF = 'mock';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const past = '2026-01-01T08:00:00.000Z';
const dueNow = '2026-01-10T06:00:00.000Z';

const WORDS = [
  { word: '朋友', pinyin: 'péngyou', meaning: 'friend' },
  { word: '学生', pinyin: 'xuésheng', meaning: 'student' },
  { word: '老师', pinyin: 'lǎoshī', meaning: 'teacher' },
  { word: '中国', pinyin: 'Zhōngguó', meaning: 'China' },
  { word: '喜欢', pinyin: 'xǐhuan', meaning: 'to like' },
  { word: '吃饭', pinyin: 'chīfàn', meaning: 'to eat' },
  { word: '学校', pinyin: 'xuéxiào', meaning: 'school' },
  { word: '今天', pinyin: 'jīntiān', meaning: 'today' },
  { word: '谢谢', pinyin: 'xièxie', meaning: 'thank you' },
  { word: '喝水', pinyin: 'hē shuǐ', meaning: 'drink water' },
  { word: '看书', pinyin: 'kàn shū', meaning: 'read a book' },
  { word: '回家', pinyin: 'huí jiā', meaning: 'go home' },
];
function vocabFull(n) {
  const w = WORDS[(n - 1) % WORDS.length];
  return {
    id: `v${n}`, level: (n % 2) + 1, system: 'hsk', language: 'chinese', is_active: true,
    word: w.word, hanzi: w.word, pinyin: w.pinyin, reading: w.pinyin, meaning: w.meaning,
    example_sentence: `我和${w.word}。`, example_reading: w.pinyin,
    // A real bucket path, so the flashcard's audio controls actually render.
    // They are gated on a clip existing, and with `audio_path: null` every card
    // in every spec was silently a card with no Replay and no speed control —
    // the two controls P3 reshaped had no end-to-end coverage at all. The file
    // need not resolve: the controls are drawn from the URL, and a failed load
    // is its own state ("No audio"), which is worth reaching too.
    example_translation: `A sentence with ${w.meaning}.`,
    audio_path: `chinese/hsk_3/level_1/${n}_word.mp3`,
  };
}

export const PROFILE = {
  id: USER_ID, active_language: 'chinese', daily_new_cards: 10, streak_freezes: 2,
  total_xp: 1250, theme: 'light', display_name: 'Test Learner',
  current_streak: 5, longest_streak: 12, created_at: past,
};
export const TRACK = {
  id: 'track-1', user_id: USER_ID, language: 'chinese', system: 'hsk',
  current_level: 2, is_active: true, created_at: past,
};
// Word-keyed vocab the reader looks up (word/reading/meaning matter now).
const VOCAB = [
  { id: 'v1', word: '今天', reading: 'jīntiān', meaning: 'today', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'v2', word: '天气', reading: 'tiānqì', meaning: 'weather', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'v3', word: '很', reading: 'hěn', meaning: 'very', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'v4', word: '好', reading: 'hǎo', meaning: 'good', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'v5', word: '公园', reading: 'gōngyuán', meaning: 'park', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'v6', word: '朋友', reading: 'péngyou', meaning: 'friend', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'v7', word: '花', reading: 'huā', meaning: 'flower', level: 2, system: 'hsk', language: 'chinese', is_active: true },
  // The HSK 1 words the manhua episode (st6) is written from. Level 1, so they
  // are on the cumulative shelf for a learner sitting at level 2. None of them
  // carries a card, so every word in the episode reads as "new" — which is what
  // the vocabulary popover's new-word state is exercised against.
  //
  // ⚠️ FIVE WORDS ARE DELIBERATELY MISSING from this list even though the
  // episode uses them: 你 我们 去 看 吧. They also appear in `st1`, and `st1`
  // having out-of-list words is what reader.spec.js's unknown-word test stands
  // on ("我们 has no vocabulary row at this level" — dashed mark, "Unknown word"
  // in the popover). Adding them here silently made that whole path untestable:
  // the story went 100% covered and the assertion timed out looking for a
  // dashed border that no longer existed. The cost is only that those five read
  // as unknown inside the mocked episode, which no manhua spec asserts on.
  // If you add a word here, check it is not one of st1's gaps first.
  ...[
    ['我', 'wǒ', 'I, me'], ['来', 'lái', 'to come'], ['学校', 'xuéxiào', 'school'],
    ['了', 'le', 'particle for completed action'], ['这', 'zhè', 'this'], ['是', 'shì', 'to be'],
    ['吗', 'ma', 'question particle'], ['你好', 'nǐ hǎo', 'hello'],
    ['新', 'xīn', 'new'], ['学生', 'xuéshēng', 'student'], ['不', 'bù', 'not, no'],
    ['叫', 'jiào', 'to be called, to call'], ['什么', 'shénme', 'what'], ['名字', 'míngzi', 'name'],
    ['真', 'zhēn', 'really, true'], ['的', 'de', 'possessive particle'], ['老师', 'lǎoshī', 'teacher'],
    ['也', 'yě', 'also, too'], ['那边', 'nàbiān', 'over there'],
    ['大', 'dà', 'big'], ['请', 'qǐng', 'please'], ['坐', 'zuò', 'to sit'],
    ['会', 'huì', 'to be able to'], ['写', 'xiě', 'to write'], ['汉字', 'hànzì', 'Chinese character'],
    ['一点儿', 'yìdiǎnr', 'a little'], ['没关系', 'méi guānxi', "it doesn't matter"],
    ['现在', 'xiànzài', 'now'], ['学', 'xué', 'to learn'], ['字', 'zì', 'character'],
    ['这个', 'zhège', 'this one'], ['漂亮', 'piàoliang', 'beautiful'], ['那', 'nà', 'that'],
    ['喜欢', 'xǐhuan', 'to like'], ['想', 'xiǎng', 'to want'],
  ].map(([word, reading, meaning], i) => ({
    id: 'm' + (i + 1), word, reading, meaning,
    level: 1, system: 'hsk', language: 'chinese', is_active: true,
  })),
  // One canonical noodle-shop term for its E2E lookup assertion. The rest of
  // the episode may use the normal fallback dictionary path; this row proves
  // the manifest-derived story is wired to the learner vocabulary map.
  { id: 'noodle-v1', word: '面条儿', reading: 'miàntiáor', meaning: 'noodles', level: 1, system: 'hsk', language: 'chinese', is_active: true },
  { id: 'upstairs-v1', word: '声音', reading: 'shēngyīn', meaning: 'sound, voice', level: 3, system: 'hsk', language: 'chinese', is_active: true },
// Every row gets a clip. The flashcard's Replay and speed controls are gated on
// one existing, so with no `audio_path` anywhere the two controls P3 reshaped
// had no end-to-end coverage at all — they simply never rendered in any spec.
// The file need not resolve: the controls are drawn from the URL, and a failed
// load is its own state ("No audio"), which is worth being able to reach.
].map(v => ({ audio_path: 'chinese/hsk_3/level_' + (v.level || 1) + '/' + v.id + '.mp3', ...v }));

// One published, Paced-Reveal story, and one published Chat-format story.
// Both share tier 1 so they land in the same "First Steps" story list.
//
// The track sits at current_level 2 and the shelf is cumulative, so `st5` lives
// at level 1 — a level the learner has already passed. It exercises the grouped
// shelf (an "HSK 1" group under the "HSK 2" one) and per-level gating: it sits
// in tier 3, which would be locked at the learner's level-2 progress but is open
// because level 1 is complete. It is deliberately NOT tier 1, so "First Steps"
// stays a unique control on the screen for the existing reader specs.
export const NOODLESHOP_STORY_ID = 'st-noodleshop-hsk1-ep01';
export const INKBOUND_HSK3_STORY_ID = 'st-inkbound-hsk3-ep03';
export const TRAIN_STORY_ID = 'st-train-hsk2-ep01';
export const UPSTAIRS_STORY_ID = 'st-upstairs-hsk3-ep01';

const STORIES = [{
  id: 'st1', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 1,
  title: '公园里的下午', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'An afternoon at the park.',
  content: ['今天天气很好。', '小明：我们去公园吧！', '朋友：你看，花很好！'].join('\n'),
}, {
  id: 'st2', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 2,
  title: '朋友的问题', is_published: true, presentation: 'chat', has_audio: false,
  image_path: null, english_content: 'Two friends chat.',
  content: ['小明：你今天好吗？', '朋友：我很好！', '小明：我们去公园。'].join('\n'),
}, {
  id: 'st3', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 3,
  title: '下雨天', is_published: true, presentation: 'scene', has_audio: false,
  image_path: null,
  english_content: ['The weather is not good today.', 'There are flowers in the park.', 'Friends are very good.'].join('\n'),
  content: ['🌧️ 今天天气不好。', '🌸 公园里有花。', '😊 朋友很好。'].join('\n'),
}, {
  id: 'st4', language: 'chinese', system: 'hsk', level: 2, tier: 1, story_number: 4,
  title: '一起去公园', is_published: true, presentation: 'chat', has_audio: false,
  image_path: null, english_content: 'A reply-along chat.',
  content: ['朋友：你今天好吗？', '小明：我很好！', '朋友：我们去公园吧。', '小明：好，一起去。'].join('\n'),
  interactions: { you: '小明', distractors: { '1': [{ text: '我不是学生。', pinyin: 'x' }], '3': [{ text: '再见。', pinyin: 'y' }] } },
}, {
  id: 'st5', language: 'chinese', system: 'hsk', level: 1, tier: 3, story_number: 1,
  title: '老朋友', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_content: 'An old friend.',
  content: ['今天我看朋友。', '朋友很好。'].join('\n'),
}, {
  // A three-chapter derived series (leading title numbers) exercising the
  // series detail page + chapter unlock rules: chapter 1 free, 2–3 behind
  // flashcard sessions. Tier 9 is deliberately OUTSIDE the tier table: the
  // shelf treats an unknown tier as unlocked, while the daily featured pick
  // (unlockedStories) skips it — so adding these rows cannot shift which
  // story is "Featured for you" on any given date, which several older specs
  // implicitly depend on.
  id: 'ml1', language: 'chinese', system: 'hsk', level: 1, tier: 9, story_number: 10,
  title: '1. 月下的朋友', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_summary: 'A friend under the moon.',
  content: ['今天我看朋友。', '朋友很好。'].join('\n'),
}, {
  id: 'ml2', language: 'chinese', system: 'hsk', level: 1, tier: 9, story_number: 11,
  title: '2. 学校的晚上', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_summary: 'An evening at school.',
  content: ['我来学校了。', '学校很大。'].join('\n'),
}, {
  id: 'ml3', language: 'chinese', system: 'hsk', level: 1, tier: 9, story_number: 12,
  title: '3. 新的名字', is_published: true, presentation: 'paced', has_audio: false,
  image_path: null, english_summary: 'A new name.',
  content: ['我叫什么名字？', '这是新的名字。'].join('\n'),
}, {
  // The manhua episode, carrying the SAME content and panel layout as the
  // authored source (data/manhua/inkbound-hsk1-ep01.json). Duplicated rather than
  // imported because the fixture has to be a plain literal the route mock can
  // serve — but the e2e spec asserts against the same strings the unit spec
  // validates, so a drift in either shows up as a failing test somewhere.
  id: 'st6', language: 'chinese', system: 'hsk', level: 1, tier: 1, story_number: 2,
  title: "第一话 · 我是新学生", is_published: true, presentation: 'manhua', has_audio: false,
  image_path: null,
  english_summary: "You climb the lantern-lit steps to the Hanzi Dojo, meet \u5c0f\u96e8, and kneel at a writing table for your first lesson. Something small and white is watching from behind a lantern.",
  content: "我来学校了。\n这是学校吗？\n小雨：你好！你是新学生吗？\n你：是，我是新学生。\n你：不是！\n小雨：真的吗？\n小雨：我叫小雨。你叫什么名字？\n小雨：来吧！我们去那边。\n学校很大。\n小雨：这是我们的学校。\n林老师：我是林老师。\n林老师：请坐。\n林老师：你会写汉字吗？\n你：会一点儿。\n你：不会。\n林老师：很好。\n林老师：没关系。\n林老师：现在我们学写字。\n小雨：这个字很漂亮。\n那是什么？\n小雨：那是小白。\n小雨：小白喜欢看我们写字。\n小白也想学汉字吗？",
  english_content: "I've come to the school.\nIs this the school?\nHello! Are you the new student?\nYes, I'm the new student.\nI'm not!\nReally?\nI'm called Xiao Yu. What's your name?\nCome on! Let's go over there.\nThe school is big.\nThis is our school.\nI am Teacher Lin.\nPlease sit.\nCan you write Chinese characters?\nA little.\nI can't.\nVery good.\nIt doesn't matter.\nNow we'll learn to write.\nThat character is beautiful.\nWhat is that?\nThat's Xiao Bai.\nXiao Bai likes watching us write.\nDoes Xiao Bai want to learn characters too?",
  panels: {"meta": {"series": "Hanzi Dojo: The Inkbound", "episode_label": "第一话", "episode_title": "我是新学生", "art_base": "/stories/inkbound/hsk1/ep01/", "hook": "Something small and white followed you through the gate.", "_continues_comment": "What the closing plate promises next, and the level it is written at. `level` is a level NUMBER in this story's own system — the reader prints it with getLevelLabel, so the plate says 'HSK 2' without anything hardcoding that string, and a Japanese or Russian season would print its own system's label. Omit the whole block for an episode that ends a season.", "continues": {"label": "第二话", "level": 2}}, "cast": {"小雨": {}, "你": {}, "林老师": {}}, "panels": [{"id": "p1", "art": "panel-01-arrival.webp", "ratio": "4/3", "alt": "Dusk. A young traveller with a scroll on their back stands small at the foot of a long stone stair, looking up at a lantern-hung dojo gate above a misty village.", "bubbles": [{"beat": 0, "kind": "narration", "side": "left", "top": 6, "width": 70}]}, {"id": "p2", "art": "panel-02-gate.webp", "ratio": "4/5", "alt": "Low angle: the huge tiled dojo gateway towers over the traveller, who is a small dark shape at the bottom of the frame.", "bubbles": [{"beat": 1, "kind": "thought", "side": "right", "top": 8, "width": 72}]}, {"id": "p3", "art": "panel-03-xiaoyu.webp", "ratio": "16/9", "alt": "Close-up: 小雨 leans grinning into the left of the frame, an ink brush through her hair and a red ribbon at one side; the right half of the panel is quiet empty wash.", "bubbles": [{"beat": 2, "kind": "speech", "side": "right", "top": 8, "width": 68, "tail": "bottom-left"}]}, {"id": "p4", "choice": {"prompt": "选择回答", "options": [{"beat": 3, "tone": "honest"}, {"beat": 4, "tone": "nervous"}]}}, {"id": "p5", "art": "panel-05-introduce.webp", "ratio": "3/4", "alt": "小雨 in a lantern-lit courtyard, one hand at her chest as she introduces herself; the traveller's shoulder is in dark foreground at the left edge.", "bubbles": [{"beat": 5, "kind": "speech", "side": "left", "top": 5, "width": 58, "tail": "bottom-right", "when": {"choice": "p4", "option": 1}}, {"beat": 6, "kind": "speech", "side": "right", "top": 62, "width": 70, "tail": "bottom-left"}]}, {"id": "p6", "art": "panel-06-walkway.webp", "ratio": "3/2", "alt": "小雨 walks ahead along a covered lantern-lit walkway, turning back over her shoulder to beckon the traveller on.", "bubbles": [{"beat": 7, "kind": "speech", "side": "left", "top": 6, "width": 64, "tail": "bottom-right"}, {"beat": 8, "kind": "narration", "side": "left", "top": 54, "width": 62}]}, {"id": "p7", "art": "panel-07-hall.webp", "ratio": "16/9", "alt": "The empty calligraphy hall: two rows of low writing tables, each with blank paper and a resting brush, under hanging lanterns.", "bubbles": [{"beat": 9, "kind": "speech", "side": "left", "top": 8, "width": 68, "tail": "bottom-right"}]}, {"id": "p8", "art": "panel-08-teacher.webp", "ratio": "2/1", "alt": "A letterbox panel: a tall calligraphy master stands in a lit doorway, face half in shadow, a brush held loosely at his side.", "bubbles": [{"beat": 10, "kind": "speech", "side": "left", "top": 8, "width": 58, "tail": "bottom-right"}]}, {"id": "p9", "art": "panel-09-seated.webp", "ratio": "3/4", "alt": "林老师 kneels behind a low writing table, looking straight at the reader and opening one hand toward the empty cushion in the foreground.", "bubbles": [{"beat": 11, "kind": "speech", "side": "left", "top": 5, "width": 56, "tail": "bottom-right"}, {"beat": 12, "kind": "speech", "side": "right", "top": 18, "width": 74, "tail": "bottom-left"}]}, {"id": "p10", "choice": {"prompt": "选择回答", "options": [{"beat": 13, "tone": "modest"}, {"beat": 14, "tone": "honest"}]}}, {"id": "p11", "art": "panel-11-stroke.webp", "_ratio_comment": "The generation came back 16:9; cropped to 4:3 here because this panel carries two lines and a letterbox has no room for the second. The brush is centred, so the crop only loses outer shadow.", "ratio": "4/3", "alt": "Extreme close-up of the master's hand and brush beginning a single bold stroke of wet ink on blank paper.", "_bubbles_comment": "Both branches answer here and exactly one is ever visible — 很好 to the learner who can already write a little, 没关系 to the one who cannot. The line after it is common to both, so the story rejoins itself on the same panel.", "bubbles": [{"beat": 15, "kind": "speech", "side": "left", "top": 6, "width": 50, "tail": "bottom-right", "when": {"choice": "p10", "option": 0}}, {"beat": 16, "kind": "speech", "side": "left", "top": 6, "width": 50, "tail": "bottom-right", "when": {"choice": "p10", "option": 1}}, {"beat": 17, "kind": "speech", "side": "right", "top": 44, "width": 74, "tail": "bottom-left"}]}, {"id": "p12", "art": "panel-12-delight.webp", "ratio": "3/2", "alt": "小雨 leans over the writing table with both hands flat on it, eyes shining, watching the master's brush.", "bubbles": [{"beat": 18, "kind": "speech", "side": "left", "top": 6, "width": 64, "tail": "bottom-right"}]}, {"id": "p13", "art": "panel-13-watcher.webp", "ratio": "3/2", "alt": "Almost darkness. A tiny white ink spirit with a single black brushstroke on its forehead peers out from behind a paper lantern, trailing a thread of ink-smoke.", "bubbles": [{"beat": 19, "kind": "thought", "side": "left", "top": 6, "width": 56}, {"beat": 20, "kind": "speech", "side": "left", "top": 48, "width": 66, "tail": "top-right"}]}, {"id": "p14", "art": "panel-14-hook.webp", "ratio": "4/5", "accent": true, "alt": "The traveller walks in through the dojo gate, seen from behind; far back down the steps the small white spirit drifts after them.", "bubbles": [{"beat": 21, "kind": "speech", "side": "center", "top": 4, "width": 78, "tail": "bottom-right"}, {"beat": 22, "kind": "thought", "side": "right", "top": 64, "width": 72}]}]},
  ...storyFromManhuaManifest(INKBOUND_MANIFEST, {
    id: 'st6',
    storyNumber: 2,
    system: TRACK.system,
  }),
}, storyFromManhuaManifest(NOODLESHOP_MANIFEST, {
  id: NOODLESHOP_STORY_ID,
  storyNumber: 3,
  // The production manifest uses the canonical HSK 3.0 key. This older mock
  // track predates that rename and still queries `hsk`, so adapt only the row
  // key while leaving every authored field untouched.
  system: TRACK.system,
}), storyFromManhuaManifest(TRAIN_MANIFEST, {
  id: TRAIN_STORY_ID,
  storyNumber: 5,
  system: TRACK.system,
}), storyFromManhuaManifest(UPSTAIRS_MANIFEST, {
  id: UPSTAIRS_STORY_ID,
  storyNumber: 1,
  system: TRACK.system,
}), {
  ...storyFromManhuaManifest(INKBOUND_HSK3_MANIFEST, {
    id: INKBOUND_HSK3_STORY_ID,
    storyNumber: 6,
    system: TRACK.system,
  }),
  // Keep this exact production episode unlocked in the level-2 E2E profile so
  // its reported balloon composition has deterministic browser coverage.
  level: TRACK.current_level,
  // Keep it out of the mocked HSK 1 series card; this fixture exists only for
  // direct reader geometry coverage and must not make shelf locators ambiguous.
  panels: {
    ...INKBOUND_HSK3_MANIFEST.panels,
    meta: { ...INKBOUND_HSK3_MANIFEST.panels.meta, series: null },
  },
}];

function card(n, o = {}) {
  const state = o.state || 'review';
  const isNew = state === 'new';
  const base_ = {
    id: `c${n}`, user_id: USER_ID, vocab_id: `v${n}`, state,
    due_at: dueNow, created_at: past, last_review: past,
    source_sentence: '我今天很开心。',
    is_easy: false, learned: true,
    stability: isNew ? 0 : 20, difficulty: isNew ? 0 : 5,
    elapsed_days: 3, scheduled_days: 9, reps: 4, lapses: 0,
    vocabulary: vocabFull(n),
  };
  return { ...base_, ...o, vocabulary: o.vocabulary || vocabFull(n) };
}
const CARDS = [
  card(1), card(2), card(3), card(4), card(5),
  card(6, { state: 'learning', stability: 3, difficulty: 5, learned: false }),
  card(7, { state: 'learning', stability: 2, difficulty: 6, learned: false }),
  card(8, { is_easy: true, stability: 40 }),
  card(9, { is_easy: true, stability: 45 }),
  card(10, { lapses: 3, stability: 8, difficulty: 7 }),
  card(11, { lapses: 2, stability: 10, difficulty: 6 }),
  card(12, { state: 'learning', stability: 1, difficulty: 5, learned: false }),
  // Dictionary-sourced card: NULL level (not curriculum vocab) so it stays
  // excluded from level-scoped views but still surfaces in the review deck.
  card(13, {
    vocab_id: 'dv1', state: 'review', due_at: dueNow,
    // Carries a clip like every other row — without one this card is the only
    // one in the deck with no Replay button, which made any spec that happened
    // to draw it first fail intermittently.
    vocabulary: {
      id: 'dv1', level: null, word: '中文', reading: 'zhōng wén', meaning: 'Chinese language',
      language: 'chinese', system: 'hsk', is_active: true,
      audio_path: 'chinese/hsk_3/level_1/dv1.mp3',
    },
  }),
];

// End-of-story comprehension questions (served for every story in tests; the
// real RPC filters by story_id). Exercises the shared ComprehensionCheck.
const STORY_QUESTIONS = [
  { id: 'sq1', story_id: 'st1', question_number: 1, question: 'How is the weather?', options: ['Good', 'Bad'], correct_index: 0 },
  { id: 'sq2', story_id: 'st1', question_number: 2, question: 'Where did they go?', options: ['Park', 'School'], correct_index: 0 },
  ...questionsFromManhuaManifest(NOODLESHOP_MANIFEST, NOODLESHOP_STORY_ID),
  ...questionsFromManhuaManifest(TRAIN_MANIFEST, TRAIN_STORY_ID),
  ...questionsFromManhuaManifest(UPSTAIRS_MANIFEST, UPSTAIRS_STORY_ID),
];

const TABLE_FIXTURES = { profiles: PROFILE, language_tracks: TRACK, vocabulary: VOCAB, cards: CARDS, stories: STORIES, story_reads: [], story_questions: STORY_QUESTIONS };

// How many active words the mock curriculum holds. The profile's known-word map
// is a proportion of THIS, so it is derived rather than written as a literal —
// adding vocabulary for a new story must not break a spec about a different
// screen. (How many of them are readable is a property of the mock DECK, not the
// curriculum, and stays asserted as a literal in the spec.)
export const ACTIVE_VOCAB_COUNT = VOCAB.filter(v => v.is_active).length

export const SESSION = {
  access_token: 'mock', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800,
  refresh_token: 'mock',
  user: {
    id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'test@example.com',
    email_confirmed_at: past, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: past,
  },
};

const CORS = {
  'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range',
};

/** Install the Supabase REST/auth interceptor on a page. */
// Vocab returned by the anon public_assessment_vocab RPC on the reading-test
// page: 12 words per level across levels 1–2, enough to form 4 bands of ≥4.
// Reference-dictionary rows served by the dict_* RPCs (Full dictionary scope).
export const DICT_ENTRIES = [
  { id: 'd1', simplified: '中文', traditional: '中文', pinyin: 'zhōng wén', pinyin_plain: 'zhong wen', definitions: ['Chinese language'], hsk_level: 1 },
  { id: 'd2', simplified: '中国', traditional: '中國', pinyin: 'zhōng guó', pinyin_plain: 'zhong guo', definitions: ['China'], hsk_level: 1 },
];

export const ASSESSMENT_VOCAB = (() => {
  const rows = []; let so = 0;
  for (const level of [1, 2]) {
    for (let i = 0; i < 12; i += 1) {
      rows.push({ id: `${level}-${i}`, word: `词${level}${i}`, reading: `pin${level}${i}`, meaning: `word ${level}-${i}`, level, sort_order: so++ });
    }
  }
  return rows;
})();

// A tenth of a second of silence, 8-bit mono WAV, built rather than pasted.
//
// The `audio` bucket is a real public bucket in production and nothing stood in
// for it here: every clip 404'd, so any card that reached the screen dropped
// into the flashcard's "No audio" state a beat after it rendered. That made the
// audio controls untestable — and intermittently wrong for every other spec
// that happened to look at a card. Chromium decodes by content, not by the
// .mp3 in the path, so a WAV served from an .mp3 URL is fine.
function silentWav(samples = 800) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);      // PCM header size
  header.writeUInt16LE(1, 20);       // format: PCM
  header.writeUInt16LE(1, 22);       // mono
  header.writeUInt32LE(8000, 24);    // sample rate
  header.writeUInt32LE(8000, 28);    // byte rate
  header.writeUInt16LE(1, 32);       // block align
  header.writeUInt16LE(8, 34);       // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(samples, 40);
  // 0x80 is the zero point for unsigned 8-bit audio.
  return Buffer.concat([header, Buffer.alloc(samples, 0x80)]);
}

export async function mockSupabaseRoutes(page) {
  await page.route(`**/${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS, body: '' });
    const url = new URL(req.url());
    if (url.pathname.startsWith('/storage/v1/object/public/audio/')) {
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'audio/wav', 'accept-ranges': 'bytes' },
        body: silentWav(),
      });
    }
    const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.replace('/rest/v1/rpc/', '');
      let body = null;
      if (fn === 'public_assessment_vocab') body = ASSESSMENT_VOCAB;
      else if (fn === 'dict_search') body = DICT_ENTRIES;
      else if (fn === 'dict_entry') body = DICT_ENTRIES[0];
      else if (fn === 'dict_examples_for') body = [];
      else if (fn === 'dict_words_containing') body = [];
      else if (fn === 'dict_add_to_deck') body = { vocab_id: 'ddeck1', source: 'dictionary', already_in_deck: false };
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.replace('/rest/v1/', '').split('?')[0];
      let body;
      if (table in TABLE_FIXTURES) {
        const f = TABLE_FIXTURES[table];
        let rows = f;
        // Unlike most broad fixture reads, comprehension is story-scoped. Keep
        // that contract in the mock so one story cannot accidentally display
        // another story's questions and still pass E2E.
        if (table === 'story_questions' && Array.isArray(rows)) {
          const filter = url.searchParams.get('story_id');
          const storyId = filter && filter.startsWith('eq.') ? filter.slice(3) : null;
          if (storyId) rows = rows.filter(row => row.story_id === storyId);
        }
        // The flat shelf issues TWO stories queries — reachable levels
        // (level=lte.N) and the next level's teaser (level=eq.N+1). Honor the
        // level filter, or the teaser echoes the whole library and the shelf
        // renders every level twice.
        if (table === 'stories' && Array.isArray(rows)) {
          const lf = url.searchParams.get('level');
          if (lf && lf.startsWith('eq.')) rows = rows.filter(row => row.level === Number(lf.slice(3)));
          else if (lf && lf.startsWith('lte.')) rows = rows.filter(row => row.level <= Number(lf.slice(4)));
        }
        body = Array.isArray(rows) ? (wantsObject ? (rows[0] ?? {}) : rows) : (wantsObject ? rows : [rows]);
      } else body = wantsObject ? null : [];
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json', 'content-range': '0-0/*' },
        body: JSON.stringify(body),
      });
    }
    if (url.pathname.startsWith('/auth/v1/'))
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(SESSION) });
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '{}' });
  });
}

async function injectSession(page) {
  await page.addInitScript(([ref, session]) => {
    try {
      window.localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
    } catch {
      // localStorage can throw (disabled cookies / private mode). Nothing to do:
      // without a session the app drops to the Landing page, which the anon
      // specs already cover — failing the init script would be noisier.
    }
  }, [REF, SESSION]);
}

/**
 * `authedTest` — page arrives with a mock session + mocked backend (logged-in app).
 * `anonTest`   — page has mocked backend but NO session (drops to the Landing page).
 */
export const authedTest = base.extend({
  page: async ({ page }, use) => {
    await mockSupabaseRoutes(page);
    await injectSession(page);
    await use(page);
  },
});
export const anonTest = base.extend({
  page: async ({ page }, use) => {
    await mockSupabaseRoutes(page);
    await use(page);
  },
});

export { expect };
