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

  test('the primary action shows the real flashcard queue', async () => {
    await expect(home.queueEyebrow).toBeVisible();
    // The queue's own composition lives inside the block that is about it —
    // on mobile too, and labelled Review, never "Due".
    for (const label of ['New', 'Learning', 'Review']) {
      await expect(home.hero.getByText(new RegExp('^\\d+\\s*' + label + '$'))).toBeVisible();
    }
    await expect(home.hero.getByText('Due', { exact: true })).toHaveCount(0);
    // The headline number is the real queue: exactly the sum of the three.
    const numbers = await home.hero.evaluate((node) => {
      const spans = [...node.querySelectorAll('span')];
      const value = (label) => {
        const el = spans.find(s => new RegExp('^\\d+\\s*' + label + '$').test(s.textContent));
        return Number(el.querySelector('strong').textContent);
      };
      const headline = Number(node.textContent.match(/(\d+)\s*cards? waiting/)[1]);
      return { headline, sum: value('New') + value('Learning') + value('Review') };
    });
    expect(numbers.headline).toBeGreaterThan(0);
    expect(numbers.headline).toBe(numbers.sum);
  });

  test('the hero itself is the control: tapping it opens Study', async ({ page }) => {
    // ONE semantic element — a real <button>, not a clickable container with
    // another button inside it. The visible action text is part of this control.
    const tag = await home.hero.evaluate(node => node.tagName.toLowerCase());
    expect(tag).toBe('button');
    await expect(home.hero.locator('button')).toHaveCount(0);
    await expect(home.hero.getByText('Start reviewing', { exact: true })).toBeVisible();
    await expect(home.hero.getByText(/~\d+ min/)).toHaveCount(0);
    await expect(home.hero.getByText(/Daily goal/)).toHaveCount(0);
    // Its accessible name carries the session context.
    await expect(home.hero).toHaveAccessibleName(/Start reviewing — \d+ cards? waiting/);

    // Tapping the panel — not a button inside it — starts the session.
    await home.hero.click();
    await expect(page).toHaveURL(/\/study$/);
    await expect(new StudyPage(page).showAnswer).toBeVisible();
  });

  test('the hero answers Enter and Space from the keyboard', async ({ page }) => {
    await home.hero.focus();
    await expect(home.hero).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/study$/);
    await expect(new StudyPage(page).showAnswer).toBeVisible();

    await home.goto();
    await home.hero.focus();
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(/\/study$/);
    await expect(new StudyPage(page).showAnswer).toBeVisible();
  });

  test('the primary control remains stable while pressed and focused', async () => {
    const before = await home.hero.boundingBox();
    await home.hero.focus();
    await expect(home.hero).toBeFocused();
    await home.hero.dispatchEvent('pointerdown');
    await home.hero.dispatchEvent('pointerup');
    const after = await home.hero.boundingBox();
    expect(after.width).toBeCloseTo(before.width, 1);
    expect(after.height).toBeCloseTo(before.height, 1);
    expect(before.width).toBeGreaterThanOrEqual(44);
    expect(before.height).toBeGreaterThanOrEqual(44);
  });

  test('queue labels wrap without overlap at 320px with 200% text', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await home.goto();
    await home.hero.evaluate(node => {
      const sizes = [...node.querySelectorAll('*')].map(el => [el, getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight]);
      for (const [el, size, line] of sizes) {
        el.style.fontSize = parseFloat(size) * 2 + 'px';
        if (Number.isFinite(parseFloat(line))) el.style.lineHeight = parseFloat(line) * 2 + 'px';
      }
    });
    const labels = ['New', 'Learning', 'Review'];
    const boxes = [];
    for (const label of labels) {
      const row = home.hero.getByText(new RegExp('^\\d+\\s*' + label + '$'));
      await expect(row).toBeVisible();
      boxes.push(await row.boundingBox());
    }
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width).toBeLessThanOrEqual(320);
      for (const b of boxes.slice(i + 1)) {
        const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5
          && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;
        expect(overlap).toBe(false);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('every Home block scrolls clear of the floating dock at 320x568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await home.goto();
    await expect(home.weekPanel).toBeVisible();
    // The screen must genuinely scroll here, or the assertion proves nothing.
    const scrollable = await page.evaluate(() =>
      document.documentElement.scrollHeight > document.documentElement.clientHeight);
    expect(scrollable).toBe(true);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    const geometry = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Primary"]').getBoundingClientRect();
      const last = document.querySelector('[data-tour="home-week"]').getBoundingClientRect();
      return { clearance: nav.top - last.bottom, navBottomGap: window.innerHeight - nav.bottom };
    });
    // Scrolled to the very end, the last block still sits a comfortable margin
    // above the dock — the dock reserves its height, the inset, and the gap.
    expect(geometry.clearance).toBeGreaterThanOrEqual(24);
    expect(geometry.navBottomGap).toBeGreaterThan(0);
  });

  test('content has no decorative scenery competing with learning actions', async ({ page }) => {
    await expect(page.locator('[data-home-scene], [data-hero-art]')).toHaveCount(0);
  });

  test('the scene follows the local clock', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 7, 20, 8, 0, 0));
    await home.goto();
    await expect(page.locator('[data-home-stage]')).toHaveAttribute('data-scene', 'morning');
    await page.clock.setFixedTime(new Date(2026, 7, 20, 19, 0, 0));
    await home.goto();
    await expect(page.locator('[data-home-stage]')).toHaveAttribute('data-scene', 'evening');
  });

  test('offers exactly one primary action', async ({ page }) => {
    await expect(home.heroAction).toBeVisible();
    await expect(page.getByRole('button', { name: /Start reviewing/ })).toHaveCount(1);
    // Home is a coach, not a menu — no competing per-stat buttons.
    await expect(page.getByRole('button', { name: /Review now|Learn them|Practice now/ })).toHaveCount(0);
  });

  test('reading stays available while cards are due, with a clear knowledge denominator', async ({ page }) => {
    await expect(home.storyHandoff).toBeVisible();
    await expect(home.storyHandoff.getByText('Then read')).toBeVisible();
    await expect(home.storyHandoff).toBeEnabled();
    await expect(home.storyHandoff.getByText(/\d+% of matched words known|Read with word lookup/)).toBeVisible();
    await home.storyHandoff.click();
    await expect(page).toHaveURL(/\/stories\//);
    await expect(page.getByRole('button', { name: /Back to (library|story|stories)/ })).toBeVisible();
  });

  test('shows weekly activity and honestly scoped vocabulary progress', async () => {
    await expect(home.weekPanel.getByText('Your week')).toBeVisible();
    await expect(home.weekPanel.getByText(/No sessions yet|Studied \d+ of the last \d+ days/)).toBeVisible();
    await expect(home.weekPanel.getByText('Your study vocabulary')).toBeVisible();
    await expect(home.weekPanel.getByText(/\d+ of \d+ words/)).toBeVisible();
    await expect(home.weekPanel.getByRole('progressbar')).toBeVisible();
    await expect(home.weekPanel.getByText(/waiting tomorrow|free day/)).toBeVisible();
  });

  test('uses the approved three-tab primary navigation', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('button', { name: 'Stories' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('button', { name: 'Practice' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Cards' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'More' })).toHaveCount(0);
  });

  test('the header profile button opens Profile', async ({ page }) => {
    await page.getByRole('button', { name: 'Open profile' }).click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('does not show a streak badge, XP, or a fluency score', async ({ page }) => {
    await expect(page.getByText(/day streak/i)).toHaveCount(0);
    await expect(page.getByText(/study today to keep it/i)).toHaveCount(0);
    await expect(page.getByText(/\bXP\b/)).toHaveCount(0);
    await expect(page.getByText(/fluency/i)).toHaveCount(0);
  });

  test('a placeholder holds the hand-off row while the story is found', async ({ page }) => {
    // Slow the stories fetch down: the row must be held by a same-sized
    // skeleton rather than popping in and shifting the page.
    await page.route('**/rest/v1/stories**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await route.fallback();
    });
    await page.goto('/');
    const skeleton = page.locator('[data-home-stage] [aria-busy="true"]');
    await expect(skeleton).toBeVisible();
    await expect(home.storyHandoff).toBeVisible();
    await expect(skeleton).toHaveCount(0);
  });

  test('the hero opens Study while cards are due', async ({ page }) => {
    await home.heroAction.click();
    const study = new StudyPage(page);
    await expect(study.showAnswer).toBeVisible();
  });

  test('fits a small phone without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await home.goto();
    await expect(home.hero).toBeVisible();
    for (const label of ['New', 'Learning', 'Review']) {
      await expect(home.hero.getByText(new RegExp('^\\d+\\s*' + label + '$'))).toBeVisible();
    }
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
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
    // The hero has retargeted: the queue is clear and the one action is
    // reading, with the story hand-off unlocked beneath it.
    await expect(page.getByText('Queue clear')).toBeVisible();
    await expect(page.getByText('All caught up')).toBeVisible();
    await expect(page.getByRole('button', { name: /Read a story/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Start reviewing/ })).toHaveCount(0);
    await expect(home.storyHandoff).toBeEnabled();
  });
});
