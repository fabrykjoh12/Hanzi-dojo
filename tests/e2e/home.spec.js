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

  test('greets quietly and states the loop: learn, then read', async ({ page }) => {
    // The mock profile's display name is "Test Learner" — the greeting takes
    // the first word only.
    await expect(page.getByText('你好, Test')).toBeVisible();
    await expect(page.getByText('Continue your Chinese')).toBeVisible();
    await expect(home.heroAction).toBeVisible();
    await expect(page.getByText('Today’s story · after your cards')).toBeVisible();
  });

  test('offers exactly one primary action', async ({ page }) => {
    await expect(home.heroAction).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue learning' })).toHaveCount(1);
  });

  test('connects the story to the learner’s vocabulary', async () => {
    // The story row prints the readability promise — the % of the story's
    // words the learner already knows — from real card data, never a fake.
    await expect(home.storyRow).toBeVisible();
    await expect(home.storyRow.getByText(/% readable/)).toBeVisible();
  });

  test('uses the five-tab primary navigation, Cards centred', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    for (const name of ['Home', 'Stories', 'Cards', 'Practice', 'Profile']) {
      await expect(nav.getByRole('button', { name })).toBeVisible();
    }
    await expect(nav.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('button', { name: 'More' })).toHaveCount(0);
  });

  test('does not show a streak badge or "keep it" guilt copy', async ({ page }) => {
    await expect(page.getByText(/day streak/i)).toHaveCount(0);
    await expect(page.getByText(/study today to keep it/i)).toHaveCount(0);
  });

  test('the primary action opens Study while cards are due', async ({ page }) => {
    await home.heroAction.click();
    const study = new StudyPage(page);
    await expect(study.showAnswer).toBeVisible();
  });

  test('the Cards tab opens Study too, and the dock steps aside', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('button', { name: 'Cards' }).click();
    await expect(new StudyPage(page).showAnswer).toBeVisible();
    await expect(nav).toBeHidden();
  });

  test('the preview word is the prepared session’s first card', async ({ page }) => {
    // The word previewed on Home comes from the SAME prepared queue Study
    // consumes — so the card the learner taps is the card the session opens on.
    const word = home.heroAction.locator('span[lang]').first();
    await expect(word).not.toBeEmpty();
    const previewWord = (await word.textContent()).trim();
    await home.heroAction.click();
    await expect(page.getByText('Recall first, then reveal')).toBeVisible();
    await expect(page.locator('[aria-live="polite"]').getByText(previewWord, { exact: true })).toBeVisible();
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
    // The primary block has gone quiet and the story row is ready.
    await expect(page.getByText('All caught up')).toBeVisible();
    await expect(page.getByText('Ready to read')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue learning' })).toHaveCount(0);
  });
});
