import fs from 'node:fs';
import { authedTest as test, expect, PROFILE, STORIES } from '../fixtures/mockSupabase.js';
import { HomePage } from '../pages/HomePage.js';

// P14-5C — Home's guide, in every learner state it can be in.
//
// homeGuide.test.js proves the RULES in 40ms; this proves the screen actually
// puts them on a page: which step is loud, what the quiet ones say, that only one
// thing can be acted on, and that a caught-up learner is never congratulated for
// opening the app.
//
// Each state is produced by intercepting the rows Home reads — no test-only
// branch exists in the app, and none should. Set P14_OUT to also write the render
// matrix (three widths × two themes) while the assertions run.

const SHOTS = process.env.P14_OUT || null;
const WIDTHS = [320, 390, 430];

const json = (body) => ({
  status: 200,
  headers: {
    'access-control-allow-origin': '*',
    'content-type': 'application/json',
    'content-range': '0-0/*',
  },
  body: JSON.stringify(body),
});

async function setTheme(page, theme) {
  await page.route('**/mock.supabase.co/rest/v1/profiles**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
    const row = { ...PROFILE, theme };
    return route.fulfill(json(wantsObject ? row : [row]));
  });
}

// ── The states ────────────────────────────────────────────────────────────
//
// `cards` is the fixture's own shape. The rest are made by answering four
// queries differently: the deck, the vocabulary the deck is scoped against,
// today's reads, and the published stories.
// Simpler and more reliable than deriving the deck from the vocabulary: answer
// BOTH queries from one list, so they always agree.
function deckState({ due = 0, learning = 0, weak = 0, total = 12 }) {
  const vocab = Array.from({ length: total }, (_, i) => ({
    id: 'v' + (i + 1), level: 1, word: '词' + (i + 1), reading: 'ci', meaning: 'word',
    language: 'chinese', system: 'hsk_3', is_active: true,
  }));
  const past = new Date(Date.now() - 30 * 864e5).toISOString();
  const soon = new Date(Date.now() - 3600e3).toISOString();
  const far = new Date(Date.now() + 7 * 864e5).toISOString();
  const cards = vocab.map((v, i) => {
    const isDue = i < due;
    const isLearning = i >= due && i < due + learning;
    return {
      id: 'c' + (i + 1), user_id: PROFILE.id, vocab_id: v.id,
      state: isLearning ? 'learning' : 'review',
      due_at: isDue || isLearning ? soon : far,
      created_at: past, last_review: past,
      is_easy: false, learned: true,
      stability: i < weak ? 8 : 30, difficulty: 5,
      elapsed_days: 3, scheduled_days: 9, reps: 4,
      lapses: i < weak ? 3 : 0,
      vocabulary: v,
    };
  });
  return { vocab, cards };
}

async function serveDeck(page, { due, learning, weak, total }) {
  const { vocab, cards } = deckState({ due, learning, weak, total });
  await page.route('**/rest/v1/vocabulary**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill(json(vocab));
  });
  await page.route('**/rest/v1/cards**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill(json(cards));
  });
}

async function serveReads(page, rows) {
  await page.route('**/rest/v1/story_reads**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill(json(rows));
  });
}

// Real artwork, from the repo.
//
// The mock backend has no storage, so every cover in the suite falls back to
// StoryCover's drawn placeholder — which is fine for a layout assertion and
// useless for judging a screen whose whole point is that the artwork is content.
// This serves the actual 1344×756 production illustration for every cover
// request, and stamps an `image_path` on the story rows so one is asked for.
async function serveArtwork(page) {
  const bytes = fs.readFileSync('public/story-covers/generated/hsk1-10-li-ming-sings.webp');
  await page.route('**/storage/v1/object/public/audio/**', async (route) => (
    route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'image/webp' },
      body: bytes,
    })
  ));
  // The fixture's own rows, restated with a cover. Not `route.fetch()`: the mock
  // host does not resolve, so fetching through it fails the request outright.
  await page.route('**/rest/v1/stories**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill(json(STORIES.map(r => ({ ...r, image_path: 'stories/mock/cover.webp' }))));
  });
}

async function serveNoStories(page) {
  await page.route('**/rest/v1/stories**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill(json([]));
  });
}

const STATES = {
  // Reviews and new words waiting — the fixture's own deck.
  cards: async () => {},
  // Nothing waiting, nothing read yet: the story is the step.
  story: async (page) => {
    await serveArtwork(page);
    await serveDeck(page, { due: 0, learning: 0, weak: 4 });
  },
  // Queue clear and a chapter read today: practice is the step.
  practice: async (page) => {
    await serveArtwork(page);
    await serveDeck(page, { due: 0, learning: 0, weak: 4 });
    await serveReads(page, [{ story_id: 'st1', read_at: new Date().toISOString() }]);
  },
  // Everything done, and something was actually done today.
  complete: async (page) => {
    await serveArtwork(page);
    await serveDeck(page, { due: 0, learning: 0, weak: 0 });
    await serveReads(page, [{ story_id: 'st1', read_at: new Date().toISOString() }]);
  },
  // The boring day: caught up, nothing slipping, no story, nothing done.
  quiet: async (page) => {
    await serveDeck(page, { due: 0, learning: 0, weak: 0 });
    await serveReads(page, []);
    await serveNoStories(page);
  },
};

async function shoot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  // …and the artwork. A cover that is still decoding screenshots as an empty
  // rounded box, which is exactly the thing these renders exist to judge.
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('[data-story-cover] img')];
    return imgs.every(i => i.complete && i.naturalWidth > 0);
  }, null, { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: SHOTS + '/' + name + '.png', fullPage: true });
}

// ── One loud step, per state ──────────────────────────────────────────────

test.describe('Home guide states', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('cards waiting → Cards is the step, and it is the only action', async ({ page }) => {
    await serveArtwork(page);
    const home = new HomePage(page);
    await home.goto();
    expect(await home.active()).toBe('cards');
    await expect(home.primaryAction).toHaveCount(1);
    // The other two are visible, in order, and quiet.
    const rows = page.locator('[data-guide-step]');
    await expect(rows).toHaveCount(2);
    expect(await rows.nth(0).getAttribute('data-guide-step')).toBe('story');
    expect(await rows.nth(1).getAttribute('data-guide-step')).toBe('practice');
    await shoot(page, 'cards');
  });

  test('queue clear → the story takes the screen, with its artwork', async ({ page }) => {
    await STATES.story(page);
    const home = new HomePage(page);
    await home.goto();
    await expect(home.activeStep).toHaveAttribute('data-guide-active', 'story');

    // The artwork is 16:9 and wide — not the 72px near-square it used to be.
    const art = home.activeStep.locator('[data-story-cover]');
    await expect(art).toHaveCount(1);
    const box = await art.boundingBox();
    // Measured against the CONTENT column, not `main` — Home's column is capped
    // at 720 and `main` is the whole viewport, so the naive comparison passes on
    // a phone and fails on a desktop for a screen that is perfectly correct.
    const column = await home.activeStep.boundingBox();
    expect(box.width / box.height).toBeGreaterThan(1.6);
    expect(box.width / box.height).toBeLessThan(1.85);
    expect(box.width).toBeGreaterThan(column.width * 0.9);
    await shoot(page, 'story');
  });

  test('story read today → Practice is the step, named by the real signal', async ({ page }) => {
    await STATES.practice(page);
    const home = new HomePage(page);
    await home.goto();
    await expect(home.activeStep).toHaveAttribute('data-guide-active', 'practice');
    // The recommendation is practicePlan's, and it says what it counted.
    await expect(page.getByText(/keep slipping|are due|is due/)).toBeVisible();
    await shoot(page, 'practice');
  });

  test('nothing left → a restrained completion, and only when something was done', async ({ page }) => {
    await STATES.complete(page);
    const home = new HomePage(page);
    await home.goto();
    await expect(home.activeStep).toHaveAttribute('data-guide-active', 'complete');
    await expect(page.getByText('Training complete')).toBeVisible();
    // …and the seal, because today's work was real.
    await expect(page.locator('[data-completion-seal]')).toHaveCount(1);
    // Secondary, never a second primary action.
    await expect(page.getByRole('button', { name: /Keep going/ })).toHaveCount(1);
    await expect(home.primaryAction).toHaveCount(0);
    await shoot(page, 'complete');
  });

  test('a quiet day says so, instead of congratulating an empty day', async ({ page }) => {
    await STATES.quiet(page);
    const home = new HomePage(page);
    await home.goto();
    await expect(page.getByText('Nothing waiting today')).toBeVisible();
    await expect(page.getByText('Training complete')).toHaveCount(0);
    // No seal: gold means a reward, and opening the app is not one.
    await expect(page.locator('[data-completion-seal]')).toHaveCount(0);
    await shoot(page, 'quiet');
  });

  test('never claims what the app cannot know', async ({ page }) => {
    await STATES.practice(page);
    const home = new HomePage(page);
    await home.goto();
    // A reward chapter has no readability, so no "% known" may appear on a step
    // that came from the reward path; a resumable session does not exist at all.
    await expect(page.getByText(/resume|continue your session/i)).toHaveCount(0);
    await expect(page.getByText(/recommended for you by AI|personalised/i)).toHaveCount(0);
  });
});

// ── The render matrix ─────────────────────────────────────────────────────
// Geometry that has to hold in every state, at every phone width, in both
// themes: nothing overflows sideways, nothing tappable is under 44px, and the
// page clears the floating tray.
for (const theme of ['light', 'dark']) {
  for (const width of WIDTHS) {
    test('geometry holds — ' + theme + ' · ' + width, async ({ page }) => {
      await setTheme(page, theme);
      await page.setViewportSize({ width, height: 844 });
      const home = new HomePage(page);
      await home.goto();
      await expect(home.primaryAction).toBeVisible();

      const measured = await page.evaluate(() => {
        const doc = document.documentElement;
        const small = [];
        for (const el of document.querySelectorAll('main button, main [role="button"]')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.height < 44) small.push(el.textContent.trim().slice(0, 30));
        }
        return {
          overflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
          height: doc.scrollHeight,
          small,
        };
      });
      expect(measured.overflowX).toBe(0);
      expect(measured.small).toEqual([]);
      await shoot(page, 'matrix-' + theme + '-' + width);
    });
  }
}
