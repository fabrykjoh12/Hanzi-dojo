import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// P11-0 — one tap, one event, and no event from coming back to the tab.
test.describe('practice_drill_started', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const captured = async (page) => {
    const rows = [];
    await page.route('**/rest/v1/analytics_events*', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      // `insert(event)` posts a single object, not an array — spreading one
      // throws, which is how this spec silently captured nothing for a minute.
      try {
        const body = JSON.parse(route.request().postData() || 'null');
        if (Array.isArray(body)) rows.push(...body);
        else if (body) rows.push(body);
      } catch { /* a body we cannot read is not an event we care about */ }
      return route.fulfill({ status: 201, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '[]' });
    });
    return rows;
  };

  test('fires once per tap, with the drill key and where it was tapped', async ({ page }) => {
    const rows = await captured(page);
    await page.goto('/practice');
    await page.waitForTimeout(1200);

    // The hero — whatever pickPrimary chose.
    await page.getByRole('button', { name: /Start listening|Practise these|Review patterns/ }).first().click()
      .catch(async () => { await page.locator('[data-tour], div').first().click(); });
    await page.waitForTimeout(900);
    const drillEvents = () => rows.filter(r => r.name === 'practice_drill_started');
    expect(drillEvents().length).toBe(1);
    expect(drillEvents()[0].props.from).toBe('hero');
    expect(typeof drillEvents()[0].props.key).toBe('string');
    // No personal text ever.
    expect(JSON.stringify(drillEvents()[0].props)).not.toMatch(/@|password|token/i);
  });

  test('a list row reports from:list', async ({ page }) => {
    const rows = await captured(page);
    await page.goto('/practice');
    await page.waitForTimeout(1200);

    await page.getByRole('button', { name: /Writing/ }).first().click();
    await page.waitForTimeout(900);
    const evts = rows.filter(r => r.name === 'practice_drill_started');
    expect(evts.length).toBe(1);
    expect(evts[0].props).toMatchObject({ key: 'writing', from: 'list' });
  });

  test('coming back to the tab is not a drill start', async ({ page }) => {
    // The reason this event fires on the tap rather than on a drill screen's
    // mount: <Activity> tears down and re-runs a hidden tab's effects, so
    // anything mount-based counts re-entering the tab as a fresh start
    // (NAV-MODEL §2). Leaving Practice and returning twice must report nothing.
    const rows = await captured(page);
    await page.goto('/practice');
    await page.waitForTimeout(1200);

    for (let i = 0; i < 2; i += 1) {
      await page.getByRole('button', { name: 'Home' }).click();
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: 'Practice' }).click();
      await page.waitForTimeout(800);
    }
    expect(rows.filter(r => r.name === 'practice_drill_started')).toHaveLength(0);
  });

  test('opening the level test or a tool is not a drill start', async ({ page }) => {
    const rows = await captured(page);
    await page.goto('/practice');
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /HSK 2 test/ }).first().click();
    await page.waitForTimeout(900);
    expect(rows.filter(r => r.name === 'practice_drill_started')).toHaveLength(0);
  });
});
