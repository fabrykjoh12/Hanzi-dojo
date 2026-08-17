import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// The bottom-area contract (src/bottomBar.js): the floating dock owns the
// bottom of the screen, every other bottom-anchored control clears it, and
// focused experiences take it away smoothly.

const WIDTHS = [320, 390, 430];

test.describe('the floating dock', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('selection moves between tabs without moving the dock', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const home = nav.getByRole('button', { name: 'Home' });
    const stories = nav.getByRole('button', { name: 'Stories' });

    await expect(home).toHaveAttribute('aria-current', 'page');
    const navBefore = await nav.boundingBox();

    await stories.click();
    await expect(stories).toHaveAttribute('aria-current', 'page');
    await expect(home).not.toHaveAttribute('aria-current', 'page');

    await page.waitForTimeout(300);
    const navAfter = await nav.boundingBox();
    expect(Math.round(navAfter.x)).toBe(Math.round(navBefore.x));
    expect(Math.round(navAfter.y)).toBe(Math.round(navBefore.y));
    expect(Math.round(navAfter.width)).toBe(Math.round(navBefore.width));
    expect(Math.round(navAfter.height)).toBe(64);
  });

  test('every tab keeps its destination as the accessible name', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    for (const name of ['Home', 'Stories', 'Cards', 'Practice', 'Profile']) {
      await expect(nav.getByRole('button', { name })).toHaveCount(1);
    }
  });

  for (const width of WIDTHS) {
    test(`${width}px: nothing floating overlaps the dock, on any root`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      const nav = page.getByRole('navigation', { name: 'Primary' });
      await expect(nav).toBeVisible();

      // Navigated the way a learner does — through the dock — rather than by
      // reloading each route. (Cards is excluded: it opens a focused session
      // that hides the dock, covered by its own test below.)
      const steps = [
        ['Home', null],
        ['Stories', () => nav.getByRole('button', { name: 'Stories' }).click()],
        ['Practice', () => nav.getByRole('button', { name: 'Practice' }).click()],
        ['Profile', () => nav.getByRole('button', { name: 'Profile' }).click()],
      ];
      for (const [label, go] of steps) {
        if (go) await go();
        await expect(nav).toBeVisible();
        await page.waitForTimeout(500);
        const path = label;

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
            // A full-screen scrim/background is not a competing control.
            if (box.width >= window.innerWidth && box.height >= window.innerHeight) continue;
            const overlaps = box.left < navBox.right && navBox.left < box.right
              && box.top < navBox.bottom && navBox.top < box.bottom;
            if (overlaps) hits.push((el.getAttribute('aria-label') || el.tagName) + ' @' + Math.round(box.top));
          }
          return hits;
        });
        expect(collisions, path).toEqual([]);
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

    await page.getByRole('button', { name: 'Continue learning' }).click();
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
});
