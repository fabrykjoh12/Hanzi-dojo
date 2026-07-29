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
    example_translation: `A sentence with ${w.meaning}.`, audio_path: null,
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
  // The HSK 1 words the manga episode (st6) is written from. Level 1, so they
  // are on the cumulative shelf for a learner sitting at level 2. None of them
  // carries a card, so every word in the episode reads as "new" — which is what
  // the vocabulary popover's new-word state is exercised against.
  ...[
    ['我', 'wǒ', 'I, me'], ['来', 'lái', 'to come'], ['学校', 'xuéxiào', 'school'],
    ['了', 'le', 'particle for completed action'], ['这', 'zhè', 'this'], ['是', 'shì', 'to be'],
    ['吗', 'ma', 'question particle'], ['你好', 'nǐ hǎo', 'hello'], ['你', 'nǐ', 'you'],
    ['新', 'xīn', 'new'], ['学生', 'xuéshēng', 'student'], ['不', 'bù', 'not, no'],
    ['叫', 'jiào', 'to be called, to call'], ['什么', 'shénme', 'what'], ['名字', 'míngzi', 'name'],
    ['真', 'zhēn', 'really, true'], ['的', 'de', 'possessive particle'], ['老师', 'lǎoshī', 'teacher'],
    ['吧', 'ba', 'particle indicating suggestion'], ['也', 'yě', 'also, too'],
  ].map(([word, reading, meaning], i) => ({
    id: 'm' + (i + 1), word, reading, meaning,
    level: 1, system: 'hsk', language: 'chinese', is_active: true,
  })),
];

// One published, Paced-Reveal story, and one published Chat-format story.
// Both share tier 1 so they land in the same "First Steps" story list.
//
// The track sits at current_level 2 and the shelf is cumulative, so `st5` lives
// at level 1 — a level the learner has already passed. It exercises the grouped
// shelf (an "HSK 1" group under the "HSK 2" one) and per-level gating: it sits
// in tier 3, which would be locked at the learner's level-2 progress but is open
// because level 1 is complete. It is deliberately NOT tier 1, so "First Steps"
// stays a unique control on the screen for the existing reader specs.
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
  // The manga episode, carrying the SAME content and panel layout as the
  // authored source (data/manga/inkbound-hsk1-ep01.json). Duplicated rather than
  // imported because the fixture has to be a plain literal the route mock can
  // serve — but the e2e spec asserts against the same strings the unit spec
  // validates, so a drift in either shows up as a failing test somewhere.
  id: 'st6', language: 'chinese', system: 'hsk', level: 1, tier: 1, story_number: 2,
  title: '第一话 · 我是新学生', is_published: true, presentation: 'manga', has_audio: false,
  image_path: null,
  english_summary: 'You climb the lantern-lit steps to the Hanzi Dojo and meet 小雨.',
  content: [
    '我来学校了。', '这是学校吗？', '小雨：你好！你是新学生吗？',
    '你：是，我是新学生。', '你：不是！', '小雨：真的吗？',
    '小雨：我叫小雨。你叫什么名字？', '林老师：我是林老师。',
    '小雨：来吧！', '小白也来了。',
  ].join('\n'),
  english_content: [
    "I've come to the school.", 'Is this the school?', 'Hello! Are you the new student?',
    "Yes, I'm the new student.", "I'm not!", 'Really?',
    "I'm called Xiao Yu. What's your name?", 'I am Teacher Lin.',
    'Come on!', 'Xiao Bai came too.',
  ].join('\n'),
  panels: {
    meta: {
      series: 'Hanzi Dojo: The Inkbound',
      episode_label: '第一话',
      episode_title: '我是新学生',
      art_base: '/stories/inkbound/hsk1/ep01/',
      hook: 'Something small and white followed you through the gate. 第二话 is being drawn.',
    },
    cast: { '小雨': {}, '你': {}, '林老师': {} },
    panels: [
      { id: 'p1', art: 'panel-01-arrival.webp', ratio: '4/3', alt: 'A traveller at the foot of a lantern-lit stair below a dojo gate.', bubbles: [{ beat: 0, kind: 'narration', side: 'left', top: 6, width: 70 }] },
      { id: 'p2', art: 'panel-02-gate.webp', ratio: '4/5', alt: 'The huge dojo gateway towers over the traveller.', bubbles: [{ beat: 1, kind: 'thought', side: 'right', top: 8, width: 72 }] },
      { id: 'p3', art: 'panel-03-xiaoyu.webp', ratio: '16/9', alt: 'Close-up of 小雨 leaning grinning into frame.', bubbles: [{ beat: 2, kind: 'speech', side: 'right', top: 8, width: 68, tail: 'bottom-left' }] },
      { id: 'p4', choice: { prompt: '选择回答', options: [{ beat: 3 }, { beat: 4 }] } },
      {
        id: 'p5', art: 'panel-05-introduce.webp', ratio: '3/4', alt: '小雨 introduces herself in a lantern-lit courtyard.',
        bubbles: [
          { beat: 5, kind: 'speech', side: 'left', top: 5, width: 58, tail: 'bottom-right', when: { choice: 'p4', option: 1 } },
          { beat: 6, kind: 'speech', side: 'right', top: 62, width: 70, tail: 'bottom-left' },
        ],
      },
      { id: 'p6', art: 'panel-06-teacher.webp', ratio: '2/1', alt: 'A calligraphy master stands in a lit doorway.', bubbles: [{ beat: 7, kind: 'speech', side: 'left', top: 8, width: 58, tail: 'bottom-right' }] },
      { id: 'p7', art: 'panel-07-watcher.webp', ratio: '3/2', alt: 'A tiny white ink spirit peers out from behind a lantern.' },
      {
        id: 'p8', art: 'panel-08-hook.webp', ratio: '4/5', accent: true, alt: 'The traveller walks in through the gate as the spirit follows.',
        bubbles: [
          { beat: 8, kind: 'speech', side: 'center', top: 4, width: 62, tail: 'bottom-right' },
          { beat: 9, kind: 'narration', side: 'right', top: 66, width: 70 },
        ],
      },
    ],
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
    vocabulary: { id: 'dv1', level: null, word: '中文', reading: 'zhōng wén', meaning: 'Chinese language', language: 'chinese', system: 'hsk', is_active: true },
  }),
];

// End-of-story comprehension questions (served for every story in tests; the
// real RPC filters by story_id). Exercises the shared ComprehensionCheck.
const STORY_QUESTIONS = [
  { id: 'sq1', story_id: 'st1', question_number: 1, question: 'How is the weather?', options: ['Good', 'Bad'], correct_index: 0 },
  { id: 'sq2', story_id: 'st1', question_number: 2, question: 'Where did they go?', options: ['Park', 'School'], correct_index: 0 },
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

export async function mockSupabaseRoutes(page) {
  await page.route(`**/${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS, body: '' });
    const url = new URL(req.url());
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
        body = Array.isArray(f) ? (wantsObject ? (f[0] ?? {}) : f) : (wantsObject ? f : [f]);
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
