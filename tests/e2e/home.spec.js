import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { HomePage } from '../pages/HomePage.js';
import { StudyPage } from '../pages/StudyPage.js';

// Signed-in Home renders profile/track/counts from the mock backend.
test.describe('Home (logged in)', () => {
  let home;
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    home = new HomePage(page);
    await home.goto();
  });

  test('renders the locked Cards → Story → Practice sequence', async ({ page }) => {
    await expect(home.cardsHero).toBeVisible();
    await expect(page.getByText('2 · Story', { exact: true })).toBeVisible();
    await expect(page.getByText('3 · Practice', { exact: true })).toBeVisible();
  });

  test('offers exactly one primary action', async ({ page }) => {
    await expect(home.heroAction).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start cards' })).toHaveCount(1);
  });

  test('hands off to reading beneath the hero', async () => {
    await expect(home.storyHandoff).toBeVisible();
  });

  test('uses the approved three-tab primary navigation', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('button', { name: 'Stories' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('button', { name: 'Practice' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Cards' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'More' })).toHaveCount(0);
  });

  test('does not show a streak badge or "keep it" guilt copy', async ({ page }) => {
    await expect(page.getByText(/day streak/i)).toHaveCount(0);
    await expect(page.getByText(/study today to keep it/i)).toHaveCount(0);
  });

  test('the hero opens Study while cards are due', async ({ page }) => {
    await home.heroAction.click();
    const study = new StudyPage(page);
    await expect(study.showAnswer).toBeVisible();
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

  test('returns from a completed Study session with fresh Home availability', async ({ page }) => {
    test.setTimeout(90000);
    await home.heroAction.click();
    const study = new StudyPage(page);
    const backHome = page.getByRole('button', { name: 'Back home' });
    for (let graded = 0; graded < 40; graded += 1) {
      const next = await Promise.race([
        backHome.waitFor({ state: 'visible' }).then(() => 'done'),
        study.showAnswer.waitFor({ state: 'visible' }).then(() => 'card'),
      ]);
      if (next === 'done') break;
      await study.reveal();
      await study.gradeGood.click();
    }
    await expect(backHome).toBeVisible();
    await backHome.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-home-stage]')).toHaveAttribute('data-home-stage', 'story');
    await expect(page.getByRole('button', { name: 'Cards complete' })).toBeDisabled();
    await expect(page.getByText('Nothing due right now')).toBeVisible();
    await expect(page.getByText('Ready to read')).toBeVisible();
  });
});
