import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { INKBOUND_MANIFEST } from '../fixtures/manhuaManifest.js';
import { ReaderPage } from '../pages/ReaderPage.js';

const EPISODE = INKBOUND_MANIFEST.title;
const EPISODE_TITLE = INKBOUND_MANIFEST.panels.meta.episode_title;
const SERIES = INKBOUND_MANIFEST.panels.meta.series;
const PANEL_COUNT = INKBOUND_MANIFEST.panels.panels.length;
const RESUME_PANEL = 8;

async function openEpisode(page) {
  const reader = new ReaderPage(page);
  await reader.openSeriesStoryByTitle(SERIES, EPISODE);
  await expect(page.getByRole('heading', { name: EPISODE_TITLE })).toBeVisible();
}

test.describe('Manhua reader', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('opens on the first artwork with the episode header', async ({ page }) => {
    await openEpisode(page);
    await expect(page.getByText('第一话', { exact: true })).toBeVisible();
    await expect(page.getByLabel(`Panel 1 of ${PANEL_COUNT}`)).toBeVisible();
    await expect(page.getByRole('button', { name: '学校', exact: true }).first()).toBeVisible();
  });

  test('uses real artwork with useful alt text', async ({ page }) => {
    await openEpisode(page);
    const art = page.getByRole('img', { name: /at the foot of a long stone stair/ });
    await expect(art).toBeVisible();
    await expect(art).toHaveAttribute('src', /panel-01-arrival\.webp/);
  });

  test('tapping 学生 opens its pinyin, meaning, and audio control', async ({ page }) => {
    await openEpisode(page);
    const word = page.getByRole('button', { name: '学生' }).first();
    await word.scrollIntoViewIfNeeded();
    await word.click();

    const play = page.getByRole('button', { name: 'Play audio' });
    await expect(play).toBeVisible();
    await expect(page.getByText('xuéshēng').last()).toBeVisible();
    await expect(page.getByText('student', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(play).toHaveCount(0);
  });

  test('keeps narration below the art, uses manga balloons, and shows no choices', async ({ page }) => {
    await openEpisode(page);
    const openingArt = page.getByRole('img', { name: /at the foot of a long stone stair/ });
    const captions = page.locator('[data-manhua-text-layout="caption"]');

    await expect(page.getByRole('region', { name: '选择回答' })).toHaveCount(0);
    expect(await page.locator('[data-manhua-text-layout="overlay"]').count()).toBeGreaterThan(0);
    expect(await captions.count()).toBeGreaterThan(0);

    const art = await openingArt.boundingBox();
    const firstCaption = await captions.first().boundingBox();
    expect(firstCaption.y).toBeGreaterThanOrEqual(art.y + art.height - 1);
  });

  test('updates the panel count while scrolling', async ({ page }) => {
    await openEpisode(page);
    await page.locator('[data-panel-index="2"]')
      .evaluate(el => el.scrollIntoView({ block: 'center' }));
    await expect(page.getByLabel(`Panel 3 of ${PANEL_COUNT}`)).toBeVisible();
  });

  test('restores the saved reading position without branch state', async ({ page }) => {
    test.setTimeout(90000);
    await openEpisode(page);
    await page.getByRole('img', { name: /kneels behind a low writing table/ })
      .evaluate(el => el.scrollIntoView({ block: 'center' }));
    await expect(page.getByLabel(`Panel ${RESUME_PANEL} of ${PANEL_COUNT}`)).toBeVisible();

    await page.getByRole('button', { name: 'Back to stories' }).first().click();
    await openEpisode(page);
    await expect(page.getByLabel(`Panel ${RESUME_PANEL} of ${PANEL_COUNT}`)).toBeVisible();
    await expect(page.getByRole('region', { name: '选择回答' })).toHaveCount(0);
  });

  test('reaching the end completes the episode', async ({ page }) => {
    test.setTimeout(90000);
    await openEpisode(page);
    await page.getByRole('img', { name: /walks in through the dojo gate/ })
      .evaluate(el => el.scrollIntoView({ block: 'center' }));
    await page.mouse.wheel(0, 900);

    const done = page.getByRole('region', { name: 'Episode complete' });
    await expect(done).toBeVisible();
    await expect(done.getByText(/第一话 · complete/i)).toBeVisible();
    await expect(done.getByText(/第二话 · continues at HSK 2/i)).toBeVisible();
    await expect(done.getByRole('button', { name: /Back to stories/ })).toBeVisible();
  });

  test('the back button leaves the reader', async ({ page }) => {
    await openEpisode(page);
    await page.getByRole('button', { name: 'Back to stories' }).first().click();
    await expect(page.getByRole('heading', { name: EPISODE_TITLE })).toHaveCount(0);
  });
});

test.describe('Manhua reader on desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('centres the same reading column instead of widening into a dashboard', async ({ page }) => {
    await openEpisode(page);
    const art = page.getByRole('img', { name: /at the foot of a long stone stair/ });
    const box = await art.boundingBox();
    const outer = await page.locator('main').first().boundingBox();
    expect(box.width).toBeLessThanOrEqual(520);
    const centre = outer.x + outer.width / 2;
    expect(Math.abs((box.x + box.width / 2) - centre)).toBeLessThan(3);
    expect(box.x - outer.x).toBeGreaterThan(60);
  });
});
