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

  test('the lit block is about the flashcard queue, with real counts', async () => {
    await expect(home.queueEyebrow).toBeVisible();
    // The queue's own composition lives inside the block that is about it —
    // on mobile too, and labelled Review, never "Due".
    for (const label of ['New', 'Learning', 'Review']) {
      await expect(home.hero.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(home.hero.getByText('Due', { exact: true })).toHaveCount(0);
    // The headline number is the real queue: exactly the sum of the three.
    const numbers = await home.hero.evaluate((node) => {
      const spans = [...node.querySelectorAll('span')];
      const value = (label) => {
        const el = spans.find(s => s.textContent === label);
        return Number(el.previousElementSibling.textContent);
      };
      const headline = Number(node.textContent.match(/(\d+)\s*cards? waiting/)[1]);
      return { headline, sum: value('New') + value('Learning') + value('Review') };
    });
    expect(numbers.headline).toBeGreaterThan(0);
    expect(numbers.headline).toBe(numbers.sum);
  });

  test('the hero shows its action, and is still a single control', async () => {
    // Visible, so nobody has to discover that the panel is tappable…
    await expect(home.hero.getByText('Start reviewing')).toBeVisible();
    // …but the panel itself is the button: no nested control inside it.
    await expect(home.hero).toHaveAttribute('role', 'button');
    await expect(home.hero.locator('button')).toHaveCount(0);
    await expect(home.hero.getByText(/~\d+ min/)).toHaveCount(0);
    await expect(home.hero.getByText(/Daily goal/)).toHaveCount(0);
  });

  test('the breakdown holds one row of three equal columns at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await home.goto();
    const columns = await home.hero.evaluate((node) => {
      const grid = [...node.querySelectorAll('div')]
        .find(d => getComputedStyle(d).display === 'grid');
      return [...grid.children].map((col) => {
        const [value, label] = col.children;
        const box = col.getBoundingClientRect();
        const valueBox = value.getBoundingClientRect();
        const labelBox = label.getBoundingClientRect();
        return {
          label: label.textContent,
          top: box.top, width: box.width,
          valueText: value.textContent,
          valueSize: parseFloat(getComputedStyle(value).fontSize),
          labelSize: parseFloat(getComputedStyle(label).fontSize),
          labelWidth: labelBox.width, labelScrollWidth: label.scrollWidth,
          valueAboveLabel: valueBox.bottom <= labelBox.top + 0.5,
        };
      });
    });
    expect(columns.map(c => c.label)).toEqual(['New', 'Learning', 'Review']);
    for (const column of columns) {
      // One row: every column shares the first one's top edge…
      expect(column.top, column.label).toBeCloseTo(columns[0].top, 0);
      // …and its width, so the three read as fixed equal columns.
      expect(column.width, column.label).toBeCloseTo(columns[0].width, 0);
      // The label never wraps, and the value stays the prominent half.
      expect(column.labelScrollWidth, column.label).toBeLessThanOrEqual(column.labelWidth + 0.5);
      expect(column.valueSize, column.label).toBeGreaterThan(column.labelSize);
      expect(column.valueAboveLabel, column.label).toBe(true);
      expect(Number(column.valueText), column.label).not.toBeNaN();
    }
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
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

  test('offers exactly one primary action', async ({ page }) => {
    await expect(home.heroAction).toBeVisible();
    await expect(page.getByRole('button', { name: /Start reviewing/ })).toHaveCount(1);
    // Home is a coach, not a menu — no competing per-stat buttons.
    await expect(page.getByRole('button', { name: /Review now|Learn them|Practice now/ })).toHaveCount(0);
  });

  test('hands off to reading beneath the hero, locked behind today’s cards', async () => {
    await expect(home.storyHandoff).toBeVisible();
    await expect(home.storyHandoff.getByText('Then read')).toBeVisible();
    // While cards are due the story is a locked next step, with its readability.
    await expect(home.storyHandoff.getByText('Finish cards to unlock')).toBeVisible();
    await expect(home.storyHandoff.getByText(/HSK \d · \d+% readable/)).toBeVisible();
  });

  test('shows the week rhythm and the road to the next level in one panel', async () => {
    await expect(home.weekPanel.getByText('Your week')).toBeVisible();
    await expect(home.weekPanel.getByText(/No sessions yet|Studied \d+ of the last \d+ days/)).toBeVisible();
    await expect(home.weekPanel.getByText(/Toward HSK \d/)).toBeVisible();
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
      await expect(home.hero.getByText(label, { exact: true })).toBeVisible();
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
    await expect(page.getByText('all caught up')).toBeVisible();
    await expect(page.getByRole('button', { name: /Read a story/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Start reviewing/ })).toHaveCount(0);
    await expect(home.storyHandoff.getByText('Ready to read')).toBeVisible();
  });
});
