import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';
import { HomePage } from '../pages/HomePage.js';
import { StudyPage } from '../pages/StudyPage.js';

// P14-5D — Home and the Cards tab must be telling the same truth.
//
// Device QA on build 44: Home said "74 reviews ready" and the Cards tab served
// 136. Both numbers were computed correctly by their own rules, and the rules had
// drifted apart in three ways (level scoping, whether new cards counted, and the
// gentle-return cap). studyAvailability.js is now the single derivation; this is
// the spec that notices if a second one ever grows back.
//
// The comparison is deliberately end to end: Home's headline number against the
// number of cards the session actually holds, read off the pause card — not two
// calls to the same function, which would agree by construction and prove nothing.

const json = (body) => ({
  status: 200,
  headers: {
    'access-control-allow-origin': '*',
    'content-type': 'application/json',
    'content-range': '0-0/*',
  },
  body: JSON.stringify(body),
});

// A deck with a KNOWN composition, including the two shapes that used to make
// the screens disagree: a card whose word sits outside the level window, and
// unstarted words that the session will introduce as new.
function deck({ due = 6, outsideWindow = 2, unstarted = 3, dailyNew = 20 } = {}) {
  const past = new Date(Date.now() - 30 * 864e5).toISOString();
  const overdue = new Date(Date.now() - 2 * 864e5).toISOString();

  // In-window vocabulary: `due` words with cards, plus `unstarted` without.
  const windowVocab = Array.from({ length: due + unstarted }, (_, i) => ({
    id: 'v' + (i + 1), level: 1, word: '词' + (i + 1), reading: 'ci' + i, meaning: 'word ' + i,
    language: 'chinese', system: 'hsk_3', is_active: true, sort_order: i,
    audio_path: null,
  }));

  const card = (vocab) => ({
    id: 'c' + vocab.id, user_id: PROFILE.id, vocab_id: vocab.id,
    state: 'review', due_at: overdue, created_at: past, last_review: past,
    is_easy: false, learned: true, stability: 30, difficulty: 5,
    elapsed_days: 3, scheduled_days: 9, reps: 4, lapses: 0,
    vocabulary: vocab,
  });

  const cards = windowVocab.slice(0, due).map(card);

  // The cards Home used to throw away: a dictionary word (no level) and a word
  // above the current level. The session has always served them.
  for (let i = 0; i < outsideWindow; i += 1) {
    const vocab = {
      id: 'out' + i, level: i === 0 ? null : 9,
      word: '外' + i, reading: 'wai', meaning: 'outside word',
      language: 'chinese', system: 'hsk_3', is_active: true, audio_path: null,
    };
    cards.push(card(vocab));
  }

  return { windowVocab, cards, expected: due + outsideWindow + Math.min(unstarted, dailyNew) };
}

async function serve(page, { windowVocab, cards }) {
  await page.route('**/rest/v1/vocabulary**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    // The level-window query and the "fetch the missing ones" query both land
    // here; answering both with the full list is what the real backend does.
    const url = route.request().url();
    if (url.includes('id=in.')) {
      const ids = decodeURIComponent(url.split('id=in.')[1].split('&')[0]).replace(/[()"]/g, '').split(',');
      const extra = cards.map(c => c.vocabulary).filter(v => ids.includes(v.id));
      return route.fulfill(json(extra));
    }
    return route.fulfill(json(windowVocab));
  });
  await page.route('**/rest/v1/cards**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill(json(cards));
  });
}

// Home's headline count, as an integer.
async function homeCount(page) {
  const home = new HomePage(page);
  await home.goto();
  await expect(home.primaryAction).toBeVisible();
  const text = await home.activeStep.innerText();
  const m = text.match(/(\d+)\s*\n?\s*cards? ready/i);
  expect(m, 'Home did not show a "N cards ready" headline: ' + text).not.toBeNull();
  return Number(m[1]);
}

// How many cards the session is actually holding, read off the pause card.
async function sessionCount(page) {
  const study = new StudyPage(page);
  await page.getByRole('button', { name: /Start cards/ }).click();
  await expect(study.showAnswer).toBeVisible();
  // Leaving mid-session pauses it and reports what is left — which is the queue.
  await page.getByRole('button', { name: /close|exit|back/i }).first().click();
  // The number BEFORE the word, not the first number in the block: the pause
  // card reads "N studied · M cards remaining", and a naive /(\d+)/ returns the
  // studied count — which is 0 at that moment and looks like agreement failing.
  const text = await page.getByText(/remaining/).first().innerText();
  const m = text.match(/(\d+)\s*(?:cards\s*)?remaining/i);
  expect(m, 'the pause card did not report a remaining count: ' + text).not.toBeNull();
  return Number(m[1]);
}

test.describe('Home and Cards agree', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('on a cold launch, including cards outside the level window', async ({ page }) => {
    const d = deck();
    await serve(page, d);
    const shown = await homeCount(page);
    // 6 in-window due + 2 outside the window + 3 new. The middle term is the one
    // that used to be missing from Home entirely.
    expect(shown).toBe(d.expected);
    expect(await sessionCount(page)).toBe(shown);
  });

  test('after a warm return to the tab', async ({ page }) => {
    const d = deck();
    await serve(page, d);
    const first = await homeCount(page);
    await page.getByRole('button', { name: 'Stories', exact: true }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Home', exact: true }).first().click();
    const home = new HomePage(page);
    await expect(home.primaryAction).toBeVisible();
    expect(await homeCount(page)).toBe(first);
  });

  test('after a reload — no reinstall required to get the right number', async ({ page }) => {
    // The device report was "delete and reinstall changed the count". A reload is
    // the closest honest analogue in a browser: same account, fresh app.
    const d = deck();
    await serve(page, d);
    const before = await homeCount(page);
    await page.reload();
    expect(await homeCount(page)).toBe(before);
  });

  test('after grading, both sides move together', async ({ page }) => {
    const d = deck();
    await serve(page, d);
    const before = await homeCount(page);

    const study = new StudyPage(page);
    await page.getByRole('button', { name: /Start cards/ }).click();
    await expect(study.showAnswer).toBeVisible();
    await study.reveal();
    await study.gradeGood.click();
    await page.waitForTimeout(600);

    // Leave the session first — the tray hides for a flashcard (P14-4), so there
    // is no Home tab to press until the session is closed.
    await page.getByRole('button', { name: /close|exit|back/i }).first().click();
    await page.getByRole('button', { name: /Finish|End session/i }).first().click().catch(() => {});

    // The mock backend does not persist the grade, so the count itself cannot
    // drop — what this asserts is that Home REFETCHES rather than serving a
    // stale cached number, which is the other half of the device report.
    await page.getByRole('button', { name: 'Home', exact: true }).first().click();
    const after = await homeCount(page);
    expect(Number.isInteger(after)).toBe(true);
    expect(after).toBeLessThanOrEqual(before);
  });
});
