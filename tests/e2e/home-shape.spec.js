import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// P10-C3 — Home's composition, as a contract.
//
// Three shapes have been on a phone now. Three equal rounded cards read as a
// generated dashboard. One card plus open sections (build 38) read as
// unfinished: headings floating away from their data, hairlines making empty
// bands, the lower half disconnected. What ships is **two surfaces with clearly
// different jobs** — a lit accent block that means *act now*, and one flat
// surface that means *the context around it*.
//
// So these specs assert ROLES, not counts. Surface counts were the diagnostic
// that found the problem; they are not the product goal, and a screen with two
// excellent surfaces beats one surface with poor structure.

const PHONES = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
];

// The secondary surface: the nearest ancestor of the story row that draws itself
// as a panel. Found by walking up rather than by test id, so the assertion holds
// whatever the markup is called.
const SURFACES = () => {
  const root = document.querySelector('#main-content') || document.body;
  const hero = document.querySelector('[data-tour="home-queue"]');
  const row = document.querySelector('[data-tour="home-then-read"]');
  const week = document.querySelector('[data-tour="home-week"]');
  let panel = row || week;
  while (panel && panel !== root) {
    const cs = getComputedStyle(panel);
    if ((parseFloat(cs.borderTopWidth) || 0) > 0 && (parseFloat(cs.borderTopLeftRadius) || 0) >= 6) break;
    panel = panel.parentElement;
  }
  const read = (el) => {
    if (!el || el === root) return null;
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return {
      h: Math.round(b.height),
      w: Math.round(b.width),
      top: Math.round(b.top + window.scrollY),
      gradient: cs.backgroundImage !== 'none',
      bg: cs.backgroundColor,
      color: cs.color,
      radius: parseFloat(cs.borderTopLeftRadius) || 0,
      shadow: cs.boxShadow,
    };
  };
  const inside = panel && panel !== root ? Array.from(panel.querySelectorAll('*')) : [];
  return {
    hero: read(hero),
    panel: read(panel),
    row: row ? read(row) : null,
    week: week ? read(week) : null,
    // A card inside the card. None may exist.
    nestedPanels: inside.filter((el) => {
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return (parseFloat(cs.borderTopLeftRadius) || 0) >= 12 && b.width > 60 && b.height > 40
        && ((parseFloat(cs.borderTopWidth) || 0) > 0 || cs.boxShadow !== 'none');
    }).map((el) => (el.textContent || '').trim().slice(0, 24)),
    // Everything pressable inside the supporting surface.
    pressable: inside.filter((el) => el.classList.contains('hd-press')
      || el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button')
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        press: el.classList.contains('hd-press'),
        txt: ((el.textContent || '').trim() || el.getAttribute('aria-label') || '?').slice(0, 22),
      })),
    docH: document.documentElement.scrollHeight,
    maxRight: Math.round(Math.max(...Array.from(root.querySelectorAll('*'))
      .map((el) => el.getBoundingClientRect().right))),
    vw: window.innerWidth,
    headings: Array.from(root.querySelectorAll('h1,h2,h3')).map((h) => h.tagName + ':' + h.textContent.trim()),
    text: (root.textContent || '').replace(/\s+/g, ' '),
  };
};

for (const phone of PHONES) {
  test.describe('Home at ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('is two surfaces, and only the hero is lit', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(1500);
      const s = await page.evaluate(SURFACES);

      // The hero: accent gradient ground, white text, its own tinted shadow.
      expect(s.hero).not.toBeNull();
      expect(s.hero.gradient).toBe(true);
      expect(s.hero.color).toBe('rgb(255, 255, 255)');

      // The supporting surface: flat, no gradient, no accent wash, text colour
      // from the theme rather than white-on-accent.
      expect(s.panel).not.toBeNull();
      expect(s.panel.gradient).toBe(false);
      expect(s.panel.color).not.toBe('rgb(255, 255, 255)');
      expect(s.panel.radius).toBeGreaterThanOrEqual(12);

      // The hero comes first and is the heavier object per pixel of content;
      // the panel is taller only because it holds three sections.
      expect(s.hero.top).toBeLessThan(s.panel.top);
    });

    test('has no card inside the card', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(1500);
      const s = await page.evaluate(SURFACES);
      expect(s.nestedPanels, JSON.stringify(s.nestedPanels)).toEqual([]);
    });

    test('keeps every section, and none of them float', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(1500);
      const s = await page.evaluate(SURFACES);
      expect(s.headings[0]).toBe('H1:Today');
      expect(s.headings).toContain('H2:Your week');
      // No ALL-CAPS section taxonomy outside the lit panel.
      expect(s.text).not.toMatch(/THEN READ|YOUR WEEK|TODAY.S STORY REWARD/);
      // Every number the old three panels carried.
      expect(s.text).toMatch(/Toward HSK 3/);
      expect(s.text).toMatch(/(waiting tomorrow|Nothing due tomorrow)/);
      expect(s.text).toMatch(/(No sessions yet|Studied \d+ of the last \d+ days)/);
      // The week and the progress live inside the surface, not on the page.
      expect(s.week.top).toBeGreaterThan(s.panel.top);
      expect(s.week.top + s.week.h).toBeLessThanOrEqual(s.panel.top + s.panel.h);
    });

    test('fits a phone, and stays inside it', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(1500);
      const s = await page.evaluate(SURFACES);
      expect(s.maxRight).toBeLessThanOrEqual(s.vw);
      // 390 and up hold Home in one screen; 320 legitimately scrolls.
      expect(s.docH / phone.height).toBeLessThan(phone.width < 390 ? 1.45 : 1.05);
    });
  });
}

test.describe('Home — the supporting surface', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('gives the press interaction to the story row and nothing else', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    const s = await page.evaluate(SURFACES);

    // Exactly one interactive thing in the whole surface: the hand-off.
    expect(s.pressable.length, JSON.stringify(s.pressable)).toBe(1);
    expect(s.pressable[0].press).toBe(true);
    expect(s.pressable[0].txt).toMatch(/Then read|Read it now|Next chapter/);

    // The week strip and the progress bar are readouts, not controls.
    const strip = page.getByRole('img', { name: /Studied \d+ of the last \d+ days/ });
    const bar = page.getByRole('img', { name: /words learned toward/ });
    await expect(strip).toBeVisible();
    await expect(bar).toBeVisible();
    for (const passive of [strip, bar]) {
      expect(await passive.getAttribute('tabindex')).toBeNull();
      await expect(passive.locator('button, a, [role="button"]')).toHaveCount(0);
    }
  });

  test('the story row is a row, not a card, and opens Stories', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    const row = page.getByRole('button', { name: /you know \d+% of it/ });
    await expect(row).toBeVisible();

    const box = await row.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(row).toHaveClass(/hd-press/);

    // No surface of its own — the panel around it is the boundary.
    const drawn = await row.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        radius: parseFloat(cs.borderTopLeftRadius) || 0,
        bg: cs.backgroundColor,
        shadow: cs.boxShadow,
        border: parseFloat(cs.borderTopWidth) || 0,
      };
    });
    expect(drawn.radius).toBe(0);
    expect(drawn.shadow).toBe('none');
    expect(drawn.border).toBe(0);
    expect(drawn.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

    // The artwork is the anchor: a 2:3 cover, 52–60px wide.
    const cover = row.locator('div').first();
    const c = await cover.boundingBox();
    expect(c.width).toBeGreaterThanOrEqual(52);
    expect(c.width).toBeLessThanOrEqual(60);
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

  test('separates its three rows with hairlines that can actually be seen', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    // `--hairline` is a WHITE inset top-edge highlight — rgba(255,255,255,0.75)
    // in light — so as a divider on a white surface it is invisible, which is
    // exactly how it shipped for one build. Dividers use `--border`, and this
    // asserts they contrast with the surface they sit on.
    const seen = await page.evaluate(() => {
      const px = (c) => {
        const n = (c.match(/[-\d.]+/g) || []).map(Number);
        const k = c.indexOf('color(') === 0 ? 255 : 1;
        return [n[0] * k, n[1] * k, n[2] * k, n.length > 3 ? n[3] : 1];
      };
      const surface = px(getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
        .replace(/^#(..)(..)(..)$/, (m, r, g, b) => 'rgb(' + parseInt(r, 16) + ',' + parseInt(g, 16) + ',' + parseInt(b, 16) + ')'));
      const row = document.querySelector('[data-tour="home-then-read"]');
      let panel = row;
      while (panel) { const cs = getComputedStyle(panel); if ((parseFloat(cs.borderTopWidth) || 0) > 0 && (parseFloat(cs.borderTopLeftRadius) || 0) >= 6) break; panel = panel.parentElement; }
      return Array.from(panel.querySelectorAll('div'))
        .filter((el) => (parseFloat(getComputedStyle(el).borderTopWidth) || 0) > 0)
        .map((el) => {
          const c = px(getComputedStyle(el).borderTopColor);
          const delta = Math.max(...[0, 1, 2].map((i) => Math.abs(c[i] - surface[i])));
          return { alpha: c[3], delta: Math.round(delta) };
        });
    });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (const d of seen) {
      expect(d.alpha).toBeGreaterThan(0.3);
      expect(d.delta).toBeGreaterThanOrEqual(10);   // a line you can see
    }
  });
});
