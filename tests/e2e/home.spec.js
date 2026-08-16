import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { HomePage } from '../pages/HomePage.js';
import { StudyPage } from '../pages/StudyPage.js';

// TODAY, signed in: the screen rests on the learner's current real object, the
// compact dock keeps the other two destinations one tap away, and the overview
// sheet holds everything a dashboard used to spread across the screen.
test.describe('Today (logged in)', () => {
  let home;
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    home = new HomePage(page);
    await home.goto();
  });

  test('rests on the first card of the prepared session', async () => {
    await expect(home.card).toBeVisible();
    await expect(home.heroAction).toHaveCount(1);
    // The session's contents, on the object itself — not a panel about it.
    await expect(home.card.getByText(/review.*·.*new/)).toBeVisible();
  });

  test('is not a dashboard: no status rows, no progress bar, no step list', async ({ page }) => {
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.getByText('Finish cards to unlock')).toHaveCount(0);
    await expect(page.getByText('After your story')).toHaveCount(0);
    // Exactly one thing to act on while cards are due.
    await expect(page.locator('[data-home-stage] button')).toHaveCount(3); // chip, avatar, the card
  });

  test('offers the three primary destinations, with Today selected', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('button', { name: 'Stories' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('button', { name: 'Practice' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Home' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Cards' })).toHaveCount(0);
  });

  test('session-first, not session-forced: Stories is reachable without studying', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('button', { name: 'Stories' }).click();
    await expect(page).toHaveURL(/\/stories$/);
    await expect(nav.getByRole('button', { name: 'Stories' })).toHaveAttribute('aria-current', 'page');
    // …and the cards are still waiting, untouched.
    await nav.getByRole('button', { name: 'Today' }).click();
    await expect(home.heroAction).toBeVisible();
  });

  test('does not show a streak badge or "keep it" guilt copy', async ({ page }) => {
    await expect(page.getByText(/day streak/i)).toHaveCount(0);
    await expect(page.getByText(/study today to keep it/i)).toHaveCount(0);
  });

  test('the resting card opens the session it was dealt from', async ({ page }) => {
    // The word printed on Today comes from the SAME prepared queue Study
    // consumes — so the card the learner taps is the card the session opens on.
    const word = home.card.locator('span[lang]').first();
    await expect(word).not.toBeEmpty();
    const restingWord = (await word.textContent()).trim();
    await home.heroAction.click();
    await expect(page.getByText('Recall first, then reveal')).toBeVisible();
    await expect(page.locator('[aria-live="polite"]').getByText(restingWord, { exact: true })).toBeVisible();
  });

  test('the date chip opens the overview, which holds the rest of the day', async ({ page }) => {
    await home.openOverview();
    const sheet = home.overview;
    await expect(sheet.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(sheet.getByText('Cards', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Up now')).toBeVisible();
    await expect(sheet.getByText('Grammar review')).toBeVisible();
    // The utility rows a dashboard used to occupy the screen with.
    await expect(sheet.getByRole('button', { name: /Library/ })).toBeVisible();
    await expect(sheet.getByText(/of \d+ words/)).toBeVisible();

    // It is a sheet, not a screen: it covers the dock and closes again.
    const navBox = await page.locator('nav[aria-label="Primary"]').boundingBox();
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox.y).toBeLessThan(navBox.y);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });

  test('the avatar reaches Profile, which is not a dock destination', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Profile' })).toHaveCount(0);
    await home.profile.click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('navigation', { name: 'Account' })).toBeVisible();
  });

  test('keeps retired Cards and More deep links compatible', async ({ page }) => {
    await page.goto('/cards');
    await expect(page).toHaveURL(/\/study$/);
    await expect(new StudyPage(page).showAnswer).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page).not.toHaveURL(/\/cards$/);
    await page.goto('/more');
    await expect(page).toHaveURL(/\/profile$/);
    const account = page.getByRole('navigation', { name: 'Account' });
    await expect(account).toBeVisible();
    await account.getByRole('button', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('after the last card, Today retargets to the story — no dashboard', async ({ page }) => {
    test.setTimeout(90000);
    await home.heroAction.click();
    const study = new StudyPage(page);
    const back = page.getByRole('button', { name: 'Back to Today' });
    for (let graded = 0; graded < 40; graded += 1) {
      const next = await Promise.race([
        back.waitFor({ state: 'visible' }).then(() => 'done'),
        study.showAnswer.waitFor({ state: 'visible' }).then(() => 'card'),
      ]);
      if (next === 'done') break;
      await study.reveal();
      await study.gradeGood.click();
    }
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/$/);
    // The environment has retargeted: the story is now the object Today holds,
    // and the cards are not offered again.
    await expect(page.locator('[data-home-stage]')).toHaveAttribute('data-home-stage', 'story');
    await expect(home.storyHandoff).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start cards' })).toHaveCount(0);
    // The dock came back with it.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  });
});
