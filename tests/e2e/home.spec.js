import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { HomePage } from '../pages/HomePage.js';
import { StudyPage } from '../pages/StudyPage.js';

// Home as a guide (P14-5C) — Cards → Story → Practice, one loud step at a time.
//
// These are behaviour contracts, not layout ones: which step the screen is about,
// that only that step can be acted on, and that Home never says a thing the app
// cannot know. The composition itself is home-shape.spec.js.
test.describe('Home (logged in)', () => {
  let home;
  test.beforeEach(async ({ page }) => {
    home = new HomePage(page);
    await home.goto();
  });

  test('is a numbered sequence of three steps, in order', async ({ page }) => {
    await expect(home.today).toBeVisible();
    await expect(home.stepLine).toBeVisible();
    // One active step, and the other two present as quiet rows — so the learner
    // can see what comes after the thing they are being asked to do.
    await expect(home.activeStep).toHaveCount(1);
    await expect(page.locator('[data-guide-step]')).toHaveCount(2);
  });

  test('opens on Cards while cards are waiting', async () => {
    expect(await home.active()).toBe('cards');
    await expect(home.storyStep).toBeVisible();
    await expect(home.practiceStep).toBeVisible();
  });

  test('offers exactly one primary action', async ({ page }) => {
    await expect(home.primaryAction).toHaveCount(1);
    // Home is a coach, not a menu — no competing per-stat buttons.
    await expect(page.getByRole('button', { name: /Review now|Learn them/ })).toHaveCount(0);
  });

  test('the action starts the session it names', async ({ page }) => {
    await home.primaryAction.click();
    const study = new StudyPage(page);
    await expect(study.showAnswer).toBeVisible();
  });

  test('shows how far through the level the learner is, quietly', async () => {
    await expect(home.levelFoot).toBeVisible();
  });

  test('does not show a streak badge or "keep it" guilt copy', async ({ page }) => {
    await expect(page.getByText(/day streak/i)).toHaveCount(0);
    await expect(page.getByText(/study today to keep it/i)).toHaveCount(0);
  });

  test('never offers to resume a session, because no such state exists', async ({ page }) => {
    // There is no resumable Study session in the product (the queue is rebuilt on
    // every entry), so any copy implying one would be a lie. P14-5B §4.
    await expect(page.getByText(/continue your session|resume where you left off|pick up where/i))
      .toHaveCount(0);
  });

  test('the dashboard leftovers are gone', async ({ page }) => {
    // Removed by P14-5C: none of these changed what the learner should do next.
    await expect(page.getByText('Your week')).toHaveCount(0);
    await expect(page.getByText(/Studied \d+ of the last \d+ days/)).toHaveCount(0);
    await expect(page.getByText(/Toward HSK/)).toHaveCount(0);
    await expect(page.getByText(/Daily goal/i)).toHaveCount(0);
  });
});
