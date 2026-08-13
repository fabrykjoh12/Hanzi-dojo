import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { HomePage } from '../pages/HomePage.js';
import { StudyPage } from '../pages/StudyPage.js';

// Home's data lifecycle, measured rather than asserted about.
//
// This screen used to cost 25 Supabase requests every time it became visible,
// and it paid them again on every visit: the tab roots are persistent now, so
// their effects reconnect on every show, and Home's data still lived in those
// effects. Nine of the 25 were a verbatim duplicate, four could never be
// rendered, and the other twelve were refetched because of which route the
// learner had come from rather than because anything had changed.
//
// The rule these two specs hold: a revisit that changed nothing costs nothing,
// and an event that changed one thing costs exactly that one thing.

function recorder(page) {
  const rows = [];
  page.on('request', (r) => {
    const url = r.url();
    if (url.indexOf('mock.supabase.co/rest/v1/') === -1) return;
    if (r.method() === 'OPTIONS') return;
    rows.push(r.method() + ' ' + url.split('/rest/v1/')[1].split('?')[0]);
  });
  return {
    reset() { rows.length = 0; },
    all() { return rows.slice(); },
    matching(table) { return rows.filter((r) => r.indexOf(' ' + table) !== -1); },
  };
}

test.describe('Home data lifecycle', () => {
  test('a revisit that changed nothing performs no requests at all', async ({ page }) => {
    const net = recorder(page);
    const home = new HomePage(page);
    await home.goto();
    await expect(home.primaryAction).toBeVisible();
    await page.waitForTimeout(1200);

    for (let i = 0; i < 2; i += 1) {
      await page.getByRole('button', { name: 'Stories', exact: true }).first().click();
      await page.waitForTimeout(1200);
      net.reset();
      await page.getByRole('button', { name: 'Home', exact: true }).first().click();
      await expect(home.today).toBeVisible();
      await page.waitForTimeout(1200);
      // Zero. Not "fewer" — the cache is either serving this or it isn't.
      expect(net.all()).toEqual([]);
    }

    // And the screen still has its data: no blank, no skeleton, no reload feel.
    await expect(home.primaryAction).toBeVisible();
    await expect(home.storyStep).toBeVisible();
  });

  test('grading a card refreshes the counts, and only the counts', async ({ page }) => {
    const net = recorder(page);
    const home = new HomePage(page);
    await home.goto();
    await page.waitForTimeout(1200);

    await page.getByRole('button', { name: /Flashcards/ }).first().click();
    const study = new StudyPage(page);
    await study.heading.waitFor({ state: 'visible' });
    await study.reveal();
    await study.gradeGood.click();
    await page.waitForTimeout(600);

    net.reset();
    await page.getByRole('button', { name: 'Home', exact: true }).first().click();
    await expect(home.today).toBeVisible();
    await page.waitForTimeout(1200);

    // The queue moved, so the counts are refetched…
    expect(net.matching('cards').length).toBeGreaterThan(0);
    // …and nothing else is. Who you are did not change by grading a card, and
    // neither did which chapter comes next.
    expect(net.matching('profiles')).toEqual([]);
    expect(net.matching('stories')).toEqual([]);
    expect(net.matching('story_unlocks')).toEqual([]);
  });
});
