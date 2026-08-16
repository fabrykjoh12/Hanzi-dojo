import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The compact dock and the bottom-area contract (src/bottomBar.js): three equal
// destinations in a fixed-width control, every other bottom-anchored thing
// clears it, and focused work takes it away smoothly.

const WIDTHS = [320, 390, 430];
const DESTINATIONS = ['Stories', 'Today', 'Practice'];

test.describe('the compact dock', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('nothing resizes on selection — the segments are equal in every state', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const today = nav.getByRole('button', { name: 'Today' });
    const practice = nav.getByRole('button', { name: 'Practice' });

    const todaySelected = await today.boundingBox();
    const practiceResting = await practice.boundingBox();
    expect(Math.round(todaySelected.width)).toBe(Math.round(practiceResting.width));

    const navBefore = await nav.boundingBox();
    await practice.click();
    await expect(practice).toHaveAttribute('aria-current', 'page');
    await expect(today).not.toHaveAttribute('aria-current', 'page');

    // After the selection settles: same widths, same dock. Selection is a
    // colour change, so there is no layout to wait for and nothing to shift.
    await page.waitForTimeout(400);
    const practiceSelected = await practice.boundingBox();
    const todayResting = await today.boundingBox();
    expect(Math.round(practiceSelected.width)).toBe(Math.round(todaySelected.width));
    expect(Math.round(todayResting.width)).toBe(Math.round(practiceResting.width));

    const navAfter = await nav.boundingBox();
    expect(Math.round(navAfter.width)).toBe(Math.round(navBefore.width));
    expect(Math.round(navAfter.x)).toBe(Math.round(navBefore.x));
    expect(Math.round(navAfter.height)).toBe(58);
  });

  test('every destination shows its icon and label at all times', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    for (const name of DESTINATIONS) {
      const tab = nav.getByRole('button', { name });
      await expect(tab).toHaveCount(1);
      // The label is real, visible text — not a clipped element kept only for
      // the accessible name.
      const labelWidth = await tab.evaluate(node => node.lastElementChild.getBoundingClientRect().width);
      expect(labelWidth, name).toBeGreaterThan(20);
    }
  });

  test('an unselected destination reads as available, not disabled', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const resting = await nav.getByRole('button', { name: 'Stories' }).evaluate(node => ({
      opacity: Number(getComputedStyle(node).opacity),
      disabled: node.disabled,
    }));
    expect(resting.opacity).toBe(1);
    expect(resting.disabled).toBe(false);
  });

  for (const width of WIDTHS) {
    test(`${width}px: the dock floats clear, and nothing overlaps it on any root`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      const nav = page.getByRole('navigation', { name: 'Primary' });
      await expect(nav).toBeVisible();

      // Fixed width, centred, clear of both edges — the same control on every
      // phone, never a bar stretched to the viewport.
      const box = await nav.boundingBox();
      expect(Math.round(box.width)).toBe(276);
      expect(Math.round(box.x + box.width / 2)).toBe(Math.round(width / 2));
      expect(box.x).toBeGreaterThanOrEqual(16);
      expect(844 - (box.y + box.height)).toBeGreaterThanOrEqual(8);

      // Navigated the way a learner does — through the dock — rather than by
      // reloading each route.
      const steps = [
        ['Today', null],
        ['Stories', () => nav.getByRole('button', { name: 'Stories' }).click()],
        ['Practice', () => nav.getByRole('button', { name: 'Practice' }).click()],
        ['Profile', async () => {
          await nav.getByRole('button', { name: 'Today' }).click();
          await page.getByRole('button', { name: 'Open profile' }).click();
        }],
      ];
      for (const [label, go] of steps) {
        if (go) await go();
        await expect(nav).toBeVisible();
        await page.waitForTimeout(500);

        // Systemic, not per-button: every visible fixed-position element on the
        // screen must clear the dock's rectangle. This is the assertion the
        // feedback-button collision would have failed.
        const collisions = await page.evaluate(() => {
          const nav = document.querySelector('nav[aria-label="Primary"]');
          const navBox = nav.getBoundingClientRect();
          const hits = [];
          for (const el of document.body.querySelectorAll('*')) {
            if (nav.contains(el) || el.contains(nav)) continue;
            const style = getComputedStyle(el);
            if (style.position !== 'fixed') continue;
            if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
            if (style.pointerEvents === 'none') continue;
            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            // A full-screen scrim/background (or Today's own stage) is not a
            // competing control.
            if (box.width >= window.innerWidth && box.height >= window.innerHeight) continue;
            const overlaps = box.left < navBox.right && navBox.left < box.right
              && box.top < navBox.bottom && navBox.top < box.bottom;
            if (overlaps) hits.push((el.getAttribute('aria-label') || el.tagName) + ' @' + Math.round(box.top));
          }
          return hits;
        });
        expect(collisions, label).toEqual([]);
      }
    });
  }

  test('feedback is an in-flow row in Profile, not a floating control', async ({ page }) => {
    // Product decision behind the collision fix: a beta utility does not earn a
    // control floating over content on six screens.
    await page.goto('/practice');
    await expect(page.getByRole('button', { name: 'Send feedback' })).toHaveCount(0);

    await page.goto('/profile');
    const feedback = page.getByRole('button', { name: 'Send feedback' });
    await expect(feedback).toBeVisible();
    expect(await feedback.evaluate(node => getComputedStyle(node).position)).not.toBe('fixed');
  });

  test('the dock is gone during a flashcard session, and comes back after', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav).toBeVisible();

    await page.getByRole('button', { name: 'Start cards' }).click();
    await expect(page.getByText('Recall first, then reveal')).toBeVisible();
    // Hidden as a state (still mounted, so it animates), and unreachable.
    await expect(nav).toBeHidden();

    // Nothing in the session sits under where the dock used to be.
    await page.getByRole('button', { name: /flashcard.*tap to reveal/i }).click();
    const grade = page.getByRole('button', { name: /Good/i });
    await expect(grade).toBeVisible();
    const gradeBox = await grade.boundingBox();
    expect(gradeBox.y + gradeBox.height).toBeLessThanOrEqual(844);

    await page.getByRole('button', { name: 'Exit' }).click();
    await expect(nav).toBeVisible();
  });

  test('the dock steps aside for the story reader', async ({ page }) => {
    await page.goto('/stories');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav).toBeVisible();

    await page.getByRole('button', { name: /Featured for you/ }).click();
    // Every reader presentation (and the paced reader's launch screen) is
    // inside StoryReader, which declares focus.
    const back = page.getByRole('button', { name: /Back to (library|stories)/ });
    await expect(back).toBeVisible();
    await expect(nav).toBeHidden();

    await back.click();
    await expect(nav).toBeVisible();
  });

  test('the dock steps aside for a focused drill, and returns when it ends', async ({ page }) => {
    // Resting vs focused is the product model: answering questions owns the
    // screen, browsing what to answer does not. Navigated in-app (the way a
    // learner does) rather than by reloading each route.
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('button', { name: 'Practice' }).click();
    await expect(page).toHaveURL(/\/practice$/);
    await expect(nav).toBeVisible();

    await page.getByRole('button', { name: /Fill in the blank/i }).first().click();
    await expect(page).toHaveURL(/\/fillblank$/);
    await expect(nav).toBeHidden();

    await page.getByRole('button', { name: /Back|Practice/ }).first().click();
    await expect(nav).toBeVisible();
  });
});
