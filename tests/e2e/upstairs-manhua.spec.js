import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { UPSTAIRS_MANIFEST } from '../fixtures/manhuaManifest.js';
import { ReaderPage } from '../pages/ReaderPage.js';

const STORY = UPSTAIRS_MANIFEST.title;
const PANEL_COUNT = UPSTAIRS_MANIFEST.panels.panels.length;
const RESUME_PANEL = 12;

async function serveHsk3Track(page) {
  await page.route('**/rest/v1/language_tracks**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
    const track = {
      id: 'track-1', user_id: '00000000-0000-4000-8000-000000000001', language: 'chinese',
      system: 'hsk', current_level: 3, is_active: true, created_at: '2026-01-01T08:00:00.000Z',
    };
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify(wantsObject ? track : [track]),
    });
  });
}

async function openStory(page) {
  await serveHsk3Track(page);
  const reader = new ReaderPage(page);
  await reader.openStoryByTitle(STORY);
  await expect(page.getByRole('heading', { name: STORY, exact: true })).toBeVisible();
}

test.describe('《楼上没有声音》 standalone story', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('appears as a complete HSK 3 work outside every series', async ({ page }) => {
    await serveHsk3Track(page);
    await page.goto('/stories');
    const shelf = page.getByRole('tabpanel');
    const standalone = shelf.locator('section[aria-labelledby="standalone-stories-3"]');
    await expect(standalone.getByRole('heading', { name: 'Standalone stories' })).toBeVisible();
    const card = standalone.getByRole('button', { name: new RegExp(STORY) });
    await expect(card.getByText('Complete story', { exact: true })).toBeVisible();
    await expect(card.getByText('3 chapters', { exact: true })).toBeVisible();
    await expect(card.getByText('12 min', { exact: true })).toBeVisible();
    await expect(card.getByText('第一话', { exact: true })).toHaveCount(0);
  });

  test('runs through three choices, resume, lookup, questions, reward, and read state', async ({ page }) => {
    test.setTimeout(120000);
    await openStory(page);

    await expect(page.getByLabel(`Panel 1 of ${PANEL_COUNT}`)).toBeVisible();
    await expect(page.getByRole('img', { name: /Blue-hour exterior of an older city apartment building/ })).toBeVisible();

    const translation = page.getByRole('button', { name: 'Show English translation' }).first();
    await translation.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await translation.click();
    await expect(page.getByText('I live in a new place.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Play this line/ }).first().click();

    await page.getByRole('button', { name: /可能她一个人不开心。/ }).click();
    await expect(page.getByRole('img', { name: /elderly woman opens a teal apartment door/ })).toBeVisible();
    await page.getByRole('button', { name: /没有。我只是想认识你。/ }).click();

    const sound = page.getByRole('button', { name: '声音', exact: true }).first();
    await sound.scrollIntoViewIfNeeded();
    await sound.click();
    const lookup = page.locator('.app-overlay-viewport');
    await expect(lookup.getByText('shēngyīn', { exact: true })).toBeVisible();
    await expect(lookup.getByText('sound, voice', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('img', { name: /student frozen over unfinished homework/ })
      .evaluate(el => el.scrollIntoView({ block: 'center' }));
    await expect(page.getByLabel(`Panel ${RESUME_PANEL} of ${PANEL_COUNT}`)).toBeVisible();
    await page.getByRole('button', { name: 'Back to stories' }).first().click();
    await openStory(page);
    await expect(page.getByLabel(`Panel ${RESUME_PANEL} of ${PANEL_COUNT}`)).toBeVisible();
    await expect(page.getByRole('button', { name: /可能她一个人不开心。/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /没有。我只是想认识你。/ })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: /我应该上去看看。/ }).click();
    await page.getByRole('img', { name: /two warm windows stacked one above the other/ })
      .evaluate(el => el.scrollIntoView({ block: 'center' }));
    await page.mouse.wheel(0, 900);

    const completion = page.getByRole('region', { name: 'Episode complete' });
    await expect(completion).toBeVisible();
    await expect(completion.getByText('Check your understanding')).toBeVisible();
    await expect(completion.getByRole('status', { name: /细心读者/ })).toHaveCount(0);

    await completion.getByRole('button', { name: 'Grandma sang upstairs' }).click();
    await completion.getByRole('button', { name: 'Grandma when she was young' }).click();
    await completion.getByRole('button', { name: 'Grandma was on the floor and could not reach her phone' }).click();
    await expect(completion.getByText('3/3')).toBeVisible();
    await expect(completion.getByRole('status', { name: /细心读者/ })).toBeVisible();

    await completion.getByRole('button', { name: /Back to stories/ }).click();
    const card = page.getByRole('tabpanel').getByRole('button', { name: new RegExp(STORY) });
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
    const openingArt = page.getByRole('img', { name: /Blue-hour exterior of an older city apartment building/ });
    await expect(openingArt).toHaveCSS('opacity', '1');
    const art = await openingArt.boundingBox();
    expect(art.x).toBeGreaterThanOrEqual(0);
    expect(art.x + art.width).toBeLessThanOrEqual(width);
  });
}
