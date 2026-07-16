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
const VOCAB = Array.from({ length: 30 }, (_, i) => ({ id: `v${i + 1}`, level: (i % 2) + 1 }));

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

const TABLE_FIXTURES = { profiles: PROFILE, language_tracks: TRACK, vocabulary: VOCAB, cards: CARDS };

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
export async function mockSupabaseRoutes(page) {
  await page.route(`**/${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS, body: '' });
    const url = new URL(req.url());
    const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
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
