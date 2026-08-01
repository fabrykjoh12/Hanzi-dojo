import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { TRAIN_MANIFEST } from '../fixtures/manhuaManifest.js';
import { ReaderPage } from '../pages/ReaderPage.js';

const STORY = TRAIN_MANIFEST.title;
const PANEL_COUNT = TRAIN_MANIFEST.panels.panels.length;
const RESUME_PANEL = 10;

async function openStory(page) {
  const reader = new ReaderPage(page);
  await reader.openStoryByTitle(STORY);
  await expect(page.getByRole('heading', { name: STORY, exact: true })).toBeVisible();
}

test.describe('《末班车》 standalone story', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('appears as a complete HSK 2 work outside every series', async ({ page }) => {
    await page.goto('/stories');
    // The flat shelf: the standalone is its own card in the HSK 2 section.
    const shelf = page.getByRole('region', { name: 'HSK 2' });
    const card = shelf.getByRole('button', { name: new RegExp(STORY) });
    await expect(card.getByText('Complete story', { exact: true })).toBeVisible();
    await expect(card.getByText('3 chapters', { exact: true })).toBeVisible();
    await expect(card.getByText('12 min', { exact: true })).toBeVisible();
    await expect(card.getByText('第一话', { exact: true })).toHaveCount(0);
  });

  test('runs linearly through captions, resume, questions, reward, and read state', async ({ page }) => {
    test.setTimeout(120000);
    await openStory(page);

    await expect(page.getByText('第一话', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(`Panel 1 of ${PANEL_COUNT}`)).toBeVisible();
    await expect(page.getByRole('img', { name: /Night rain over a small family restaurant/ })).toBeVisible();

    const translation = page.getByRole('button', { name: 'Show English translation' }).first();
    await translation.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await translation.click();
    await expect(page.getByText('Eight in the evening. Outside, it is raining.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Play this line/ }).first().click();

    await expect(page.getByRole('group', { name: '选择回答' })).toHaveCount(0);
    await expect(page.locator('[data-manhua-text-layout="overlay"]')).toHaveCount(0);
    const rainArt = page.getByRole('img', { name: /two small figures bursting out of the restaurant doorway/ });
    await rainArt.scrollIntoViewIfNeeded();
    await expect(rainArt).toBeVisible();

    await page.getByRole('img', { name: /wall of legs, bags and umbrellas/ })
      .evaluate(el => el.scrollIntoView({ block: 'center' }));
    await expect(page.getByLabel(`Panel ${RESUME_PANEL} of ${PANEL_COUNT}`)).toBeVisible();
    await page.getByRole('button', { name: 'Back to stories' }).first().click();
    await openStory(page);
    await expect(page.getByLabel(`Panel ${RESUME_PANEL} of ${PANEL_COUNT}`)).toBeVisible();
    await expect(page.getByRole('group', { name: '选择回答' })).toHaveCount(0);

    await page.getByRole('img', { name: /dark restaurant window from outside/ })
      .evaluate(el => el.scrollIntoView({ block: 'center' }));
    await page.mouse.wheel(0, 900);

    const completion = page.getByRole('region', { name: 'Episode complete' });
    await expect(completion).toBeVisible();
    await expect(completion.getByText('Check your understanding')).toBeVisible();
    await expect(completion.getByRole('status', { name: /守时读者/ })).toHaveCount(0);

    await completion.getByRole('button', { name: "To return Grandpa's phone before his train left" }).click();
    await completion.getByRole('button', { name: 'At the hospital' }).click();
    await completion.getByRole('button', { name: 'He caught the last train and called his wife' }).click();
    await expect(completion.getByText('3/3')).toBeVisible();
    await expect(completion.getByRole('status', { name: /守时读者/ })).toBeVisible();

    await completion.getByRole('button', { name: /Back to stories/ }).click();
    const card = page.getByRole('region').getByRole('button', { name: new RegExp(STORY) }).first();
    await expect(card.getByText('Read', { exact: true })).toBeVisible();
  });
});

for (const width of [320, 390, 430]) {
  test(`fits the opening panel at ${width}px without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openStory(page);
    await expect(page.getByLabel(`Panel 1 of ${PANEL_COUNT}`)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const openingArt = page.getByRole('img', { name: /Night rain over a small family restaurant/ });
    await expect(openingArt).toHaveCSS('opacity', '1');
    const art = await openingArt.boundingBox();
    expect(art.x).toBeGreaterThanOrEqual(0);
    expect(art.x + art.width).toBeLessThanOrEqual(width);
    const captions = page.locator('[data-manhua-text-layout="caption"]');
    expect(await captions.count()).toBeGreaterThan(0);
    const firstCaption = await captions.first().boundingBox();
    expect(firstCaption.y).toBeGreaterThanOrEqual(art.y + art.height - 1);
    expect(await page.locator('[data-manhua-text-layout="overlay"]').count()).toBe(0);
  });
}
