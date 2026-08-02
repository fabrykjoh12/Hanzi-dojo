import { authedTest as test, expect, INKBOUND_HSK3_STORY_ID } from '../fixtures/mockSupabase.js';

test('keeps the reported Inkbound exchange compact at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/stories/${INKBOUND_HSK3_STORY_ID}`);

  const panelArt = page.getByRole('img', { name: /ink spirit half turned away/ });
  await panelArt.evaluate(el => el.scrollIntoView({ block: 'center' }));

  const exchange = page.locator('[data-manhua-bubble-kind="speech"]')
    .filter({ has: page.getByRole('button', { name: '哪个', exact: true }) });
  await expect(exchange).toHaveCount(1);
  await expect(exchange.locator('[data-manhua-line-actions="stacked"]')).toHaveCount(1);

  const box = await exchange.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(185);
  expect(box.height).toBeLessThanOrEqual(150);

  const wordRows = await exchange.locator('[data-manhua-word]').evaluateAll(words => (
    [...new Set(words.map(word => Math.round(word.getBoundingClientRect().top)))]
  ));
  expect(wordRows).toHaveLength(2);
});
