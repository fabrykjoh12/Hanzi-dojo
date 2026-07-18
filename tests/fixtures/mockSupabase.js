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
];

// One published, Paced-Reveal story, and one published Chat-format story.
// Both share tier 1 so they land in the same "First Steps" story list.
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
}];

function card(n, o = {}) {
  const state = o.state || 'review';
  const isNew = state === 'new';
  const base_ = {
    id: `c${n}`, user_id: USER_ID, vocab_id: `v${n}`, state,
    due_at: dueNow, created_at: past, last_review: past,
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
];

const TABLE_FIXTURES = { profiles: PROFILE, language_tracks: TRACK, vocabulary: VOCAB, cards: CARDS, stories: STORIES, story_reads: [] };

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
      const body = fn === 'public_assessment_vocab' ? ASSESSMENT_VOCAB : null;
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
    try { window.localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session)); } catch {}
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
