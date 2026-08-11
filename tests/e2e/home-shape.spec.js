import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// P10-C2 — the shape of Home, as a contract.
//
// Home used the same visual vocabulary for three different kinds of content: the
// main action, the story hand-off, and the week's progress. Three stacked panels
// of identical construction, each headed by an ALL-CAPS eyebrow, is what made it
// read as a stack of generated widgets. One box remains, and it is the action.

const PHONES = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
];

async function shape(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#main-content') || document.body;
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    };
    const rgba = (c) => {
      const n = (c.match(/[-\d.]+/g) || []).map(Number);
      if (!n.length) return [0, 0, 0, 0];
      const k = c.indexOf('color(') === 0 ? 255 : 1;
      return [n[0] * k, n[1] * k, n[2] * k, n.length > 3 ? n[3] : 1];
    };
    const all = Array.from(root.querySelectorAll('*')).filter(vis);
    const boxes = all.filter((el) => {
      const cs = getComputedStyle(el);
      const r = parseFloat(cs.borderTopLeftRadius) || 0;
      const b = el.getBoundingClientRect();
      if (b.width < 22 || b.height < 14) return false;
      const border = parseFloat(cs.borderTopWidth) > 0 && rgba(cs.borderTopColor)[3] > 0.04;
      const bg = rgba(cs.backgroundColor)[3] > 0.03 || cs.backgroundImage !== 'none';
      const shadow = cs.boxShadow && cs.boxShadow !== 'none';
      return r >= 6 && (border || bg || shadow);
    });
    const depthOf = (el) => {
      let d = 0, p = el.parentElement;
      while (p && p !== root) { if (boxes.indexOf(p) !== -1) d += 1; p = p.parentElement; }
      return d;
    };
    const major = boxes.filter((el) => {
      const b = el.getBoundingClientRect();
      return b.width >= 60 && b.height >= 28;
    }).map((el) => ({
      w: Math.round(el.getBoundingClientRect().width),
      h: Math.round(el.getBoundingClientRect().height),
      depth: depthOf(el),
      tag: el.tagName.toLowerCase(),
      txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
    }));
    return {
      total: boxes.length,
      major,
      docH: document.documentElement.scrollHeight,
      maxRight: Math.round(Math.max(...all.map((el) => el.getBoundingClientRect().right))),
      vw: window.innerWidth,
      headings: Array.from(root.querySelectorAll('h1,h2,h3')).filter(vis)
        .map((h) => h.tagName + ':' + h.textContent.trim()),
      text: (root.textContent || '').replace(/\s+/g, ' '),
    };
  });
}

for (const phone of PHONES) {
  test.describe('Home shape at ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('draws exactly one major surface — the action', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(1500);
      const s = await shape(page);
      // Panels — boxes that are not inside another box. The old screen drew
      // three; there is one, and it is the action.
      const panels = s.major.filter((m) => m.depth === 0);
      expect(panels.length, JSON.stringify(s.major)).toBe(1);
      expect(panels[0].txt).toMatch(/Ready to review|Queue clear|Couldn't load/i);
      // And it is the biggest thing on the screen.
      expect(panels[0].h).toBeGreaterThan(140);
      // The only nested surface is the CTA inside it — a button needs an edge.
      const nested = s.major.filter((m) => m.depth > 0);
      expect(nested.length).toBeLessThanOrEqual(1);
      for (const n of nested) expect(n.txt).toMatch(/Start reviewing|Read a story/);
    });

    test('keeps every section, in sentence case, as real headings', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(1500);
      const s = await shape(page);
      expect(s.headings[0]).toBe('H1:Today');
      expect(s.headings).toContain('H2:Your week');
      // No ALL-CAPS section taxonomy outside the lit panel.
      expect(s.text).not.toMatch(/THEN READ|YOUR WEEK|TODAY.S STORY REWARD/);
      // Nothing was dropped with the boxes.
      expect(s.text).toMatch(/Toward HSK 3/);
      expect(s.text).toMatch(/(waiting tomorrow|Nothing due tomorrow)/);
      expect(s.text).toMatch(/(No sessions yet|Studied \d+ of the last \d+ days)/);
    });

    test('fits a phone, and stays inside it', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(1500);
      const s = await shape(page);
      expect(s.maxRight).toBeLessThanOrEqual(s.vw);
      // 390 and up hold Home in one screen; 320 is allowed to scroll a little.
      expect(s.docH / phone.height).toBeLessThan(phone.width < 390 ? 1.45 : 1.05);
    });
  });
}

test.describe('Home — the story hand-off', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('is a row on the page, not a card, and opens Stories', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    const row = page.getByRole('button', { name: /you know \d+% of it/ });
    await expect(row).toBeVisible();

    // A real target, and pressable.
    const box = await row.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(row).toHaveClass(/hd-press/);

    // No box of its own: the row draws no background, border or shadow.
    const drawn = await row.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        radius: parseFloat(cs.borderTopLeftRadius) || 0,
        bg: cs.backgroundColor,
        shadow: cs.boxShadow,
        left: parseFloat(cs.borderLeftWidth) || 0,
      };
    });
    expect(drawn.radius).toBe(0);
    expect(drawn.shadow).toBe('none');
    expect(drawn.left).toBe(0);
    expect(drawn.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

    // The artwork is the anchor: a 2:3 cover inside the row.
    const cover = row.locator('div').first();
    const c = await cover.boundingBox();
    expect(Math.abs(c.height / c.width - 1.5)).toBeLessThan(0.12);

    await row.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/stories');
  });

  test('reaches Stories from the keyboard too', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    const row = page.getByRole('button', { name: /you know \d+% of it/ });
    await row.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/stories');
  });
});
