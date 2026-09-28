import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

test('opening a story never resurfaces an interactive shelf', async ({ page }) => {
  await page.goto('/stories');
  const poster = page.getByTestId('story-shelf-rail').getByRole('button', { name: /公园里的下午/ }).first();
  await expect(poster).toBeVisible();
  await page.evaluate(() => {
    window.readerExposures = [];
    let sawReader = false;
    window.readerObserver = new MutationObserver(() => {
      const reader = document.querySelector('[aria-label="Back to library"], [aria-label="Back to stories"]')
        || document.body.textContent.includes('Opening story…');
      if (reader) sawReader = true;
      if (sawReader && document.querySelector('[data-testid="story-shelf-rail"]')) window.readerExposures.push(performance.now());
    });
    window.readerObserver.observe(document.body, { childList: true, subtree: true });
  });
  await poster.click();
  await expect(page).toHaveURL('/stories/st1');
  await expect(page.getByRole('heading', { name: '公园里的下午', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start reading', exact: true }).click();
  await expect(page.getByText('1 / 3')).toBeVisible();
  expect(await page.evaluate(() => { window.readerObserver.disconnect(); return window.readerExposures; })).toEqual([]);
});

test('chapter origin survives reload and browser Back/Forward', async ({ page }) => {
  await page.goto('/stories');
  await page.getByRole('button', { name: /月下的朋友 · HSK 1 · 3 chapters/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
  const seriesUrl = page.url();
  await page.getByRole('button', { name: /Chapter 1 · 月下的朋友/ }).click();
  await expect(page).toHaveURL('/stories/ml1');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start reading', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(seriesUrl);
  await page.goForward();
  await expect(page).toHaveURL('/stories/ml1');
  await page.getByRole('button', { name: /Back to (library|stories)/ }).click();
  await expect(page).toHaveURL(seriesUrl);
  await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
});

test('an unavailable story has a safe exit without exposing the shelf', async ({ page }) => {
  await page.goto('/stories/missing-story');
  await expect(page.getByText("That story isn't available")).toBeVisible();
  await expect(page.getByTestId('story-shelf-rail')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to stories' }).click();
  await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();
});

test('mobile scroll-reader preferences remain open while choosing pinyin', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/stories/st1');
  await page.getByRole('button', { name: 'Scroll', exact: true }).click();
  await page.getByRole('button', { name: 'Reader settings', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Reader settings', exact: true });
  await sheet.getByRole('button', { name: 'Always', exact: true }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Always', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Off', exact: true }).click();
  await expect(sheet).toBeVisible();
});

test('speaking retry replaces a prompt score and stale recognition cannot score the next prompt', async ({ page }) => {
  await page.addInitScript(() => {
    window.speechAttempts = [];
    window.SpeechRecognition = class {
      start() { window.speechAttempts.push(this); }
      abort() { this.aborted = true; }
    };
  });
  await page.goto('/speak');
  const mic = page.getByRole('button', { name: 'Tap and speak', exact: true });
  await expect(mic).toBeVisible();
  const word = await page.locator('div[lang="zh-CN"], div[lang="zh-Hans"]').last().textContent();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await mic.click();
    await page.evaluate((word) => {
      const rec = window.speechAttempts.at(-1);
      rec.onresult({ results: [[{ transcript: word }]] });
      rec.onend();
      window.staleSpeakingResult = rec.onresult;
    }, word);
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.evaluate(word => window.staleSpeakingResult({ results: [[{ transcript: word }]] }), word);
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeVisible();
  await mic.click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  expect(await page.evaluate(() => window.speechAttempts.at(-1).aborted)).toBe(true);
  await expect(mic).toBeVisible();
  while (await page.getByRole('button', { name: 'Skip', exact: true }).count()) await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByText('Speech recognition matched 1 of 10 prompts (10%).')).toBeVisible();
});
