import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { NOODLESHOP_MANIFEST } from '../fixtures/manhuaManifest.js';
import { ReaderPage } from '../pages/ReaderPage.js';

const STORY = NOODLESHOP_MANIFEST.title;

async function openEpisode(page) {
  const reader = new ReaderPage(page);
  await reader.openStoryByTitle(STORY);
  await expect(page.getByRole('heading', { name: STORY, exact: true })).toBeVisible();
}

test.describe('《一块钱》 vertical slice', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('appears as a complete standalone work beside, not inside, series', async ({ page }) => {
    await page.goto('/stories');
    // The flat shelf: the standalone lives in the HSK 1 level section as its
    // own card (marked "Complete story"), beside — not inside — the series
    // card, which announces itself via its chapter-list chip.
    const shelf = page.getByRole('region', { name: 'HSK 1' });
    await expect(page.getByRole('button', { name: /All chapters of/ }).first()).toBeVisible();
    const card = shelf.getByRole('button', { name: new RegExp(STORY) });
    await expect(card.getByText('Complete story', { exact: true })).toBeVisible();
    await expect(card.getByText('3 chapters', { exact: true })).toBeVisible();
    await expect(card.getByText('8 min', { exact: true })).toBeVisible();
    await expect(card.getByText('第一话', { exact: true })).toHaveCount(0);
  });

  test('runs from shelf to choices, resume, comprehension, reward, and read state', async ({ page }) => {
    test.setTimeout(120000);
    await openEpisode(page);

    await expect(page.getByText('第一话', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Panel 1 of 18')).toBeVisible();
    await expect(page.getByRole('img', { name: /Night rain hammering a narrow street/ })).toBeVisible();

    // Educational text remains live UI over the art: translation and audio are
    // available on the line itself.
    const translation = page.getByRole('button', { name: 'Show English translation' }).first();
    await translation.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await translation.click();
    await expect(page.getByText('It started raining.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Play this line/ }).first().click();

    // The first decision opens the middle of the story.
    await page.getByRole('button', { name: /你想喝水吗？/ }).click();
    await expect(page.getByRole('img', { name: /cat and the reader’s outstretched hand/ })).toBeVisible();

    // A curriculum word in the canonical manifest opens the shared lookup.
    const noodles = page.getByRole('button', { name: '面条儿', exact: true }).first();
    await noodles.scrollIntoViewIfNeeded();
    await noodles.click();
    const lookup = page.locator('.app-overlay-viewport');
    await expect(lookup.getByText('miàntiáor', { exact: true })).toBeVisible();
    await expect(lookup.getByText('noodles', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    // Persist both position and branch, then prove a new reader mount resumes
    // at the saved panel instead of starting over.
    await page.getByRole('img', { name: /nine coins spread on the wooden counter/ })
      .evaluate(el => el.scrollIntoView({ block: 'center' }));
    await expect(page.getByLabel('Panel 13 of 18')).toBeVisible();
    await page.getByRole('button', { name: 'Back to stories' }).first().click();
    await openEpisode(page);
    await expect(page.getByLabel('Panel 13 of 18')).toBeVisible();
    await expect(page.getByRole('button', { name: /你想喝水吗？/ })).toHaveAttribute('aria-pressed', 'true');

    // The second decision opens the ending.
    await page.getByRole('button', { name: /妈妈，我有一块钱。/ }).click();
    await page.getByRole('img', { name: /neither of them looking at the other/ }).scrollIntoViewIfNeeded();

    const completion = page.getByRole('region', { name: 'Episode complete' });
    await expect(completion).toBeVisible();
    await expect(completion.getByText('Check your understanding')).toBeVisible();
    await expect(completion.getByRole('status', { name: /暖心读者/ })).toHaveCount(0);

    await completion.getByRole('button', { name: 'He had nine kuai, but the noodles cost ten.' }).click();
    await completion.getByRole('button', { name: 'One kuai' }).click();
    await completion.getByRole('button', { name: 'An egg' }).click();
    await expect(completion.getByText('3/3')).toBeVisible();
    await expect(completion.getByRole('status', { name: /暖心读者/ })).toBeVisible();

    await completion.getByRole('button', { name: /Back to stories/ }).click();
    const card = page.getByRole('region').getByRole('button', { name: new RegExp(STORY) }).first();
    await expect(card.getByText('Read', { exact: true })).toBeVisible();
  });
});

for (const width of [320, 390, 430]) {
  test(`fits the opening panel at ${width}px without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openEpisode(page);
    await expect(page.getByLabel('Panel 1 of 18')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const openingArt = page.getByRole('img', { name: /Night rain hammering a narrow street/ });
    await expect(openingArt).toHaveCSS('opacity', '1');
    const art = await openingArt.boundingBox();
    expect(art.x).toBeGreaterThanOrEqual(0);
    expect(art.x + art.width).toBeLessThanOrEqual(width);
  });
}
