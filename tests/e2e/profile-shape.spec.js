import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// P10-B — the shape of Profile, as a contract.
//
// The audit measured 4.48 viewports, 55 containers, 24 type styles and 117
// sub-44px targets, 115 of which were one component: a 17x7 grid of tappable
// 16px day cells. These assertions are what stop each of those coming back.

const PHONES = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
];

async function shape(page) {
  return page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const vh = window.innerHeight;
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const all = Array.from(main.querySelectorAll('*')).filter(vis);
    const rgba = (c) => {
      const n = (c.match(/[-\d.]+/g) || []).map(Number);
      if (!n.length) return [0, 0, 0, 0];
      const k = c.indexOf('color(') === 0 ? 255 : 1;
      return [n[0] * k, n[1] * k, n[2] * k, n.length > 3 ? n[3] : 1];
    };
    const containers = all.filter((el) => {
      const cs = getComputedStyle(el);
      const r = parseFloat(cs.borderTopLeftRadius) || 0;
      if (r < 6) return false;
      const box = el.getBoundingClientRect();
      const hasBorder = parseFloat(cs.borderTopWidth) > 0 && rgba(cs.borderTopColor)[3] > 0.03;
      const hasBg = rgba(cs.backgroundColor)[3] > 0.03;
      return (hasBorder || hasBg) && box.width > 40 && box.height > 24;
    });
    const type = new Set();
    for (const el of all) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const cs = getComputedStyle(el);
      type.add(Math.round(parseFloat(cs.fontSize) * 10) / 10 + '/' + cs.fontWeight);
    }
    const controls = all.filter((el) => {
      const tag = el.tagName.toLowerCase();
      return tag === 'button' || tag === 'a' || tag === 'select' || el.getAttribute('role') === 'button';
    });
    const small = controls.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height < 44 || r.width < 44;
    }).map((el) => ({
      txt: ((el.textContent || '').trim() || el.getAttribute('aria-label') || '(icon)').slice(0, 30),
      w: Math.round(el.getBoundingClientRect().width),
      h: Math.round(el.getBoundingClientRect().height),
    }));
    // The heatmap's signature: a run of tiny same-sized buttons.
    const tiny = controls.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width <= 20 && r.height <= 20;
    }).length;
    return {
      docH: document.documentElement.scrollHeight,
      viewports: Math.round((document.documentElement.scrollHeight / vh) * 100) / 100,
      containers: containers.length,
      typeStyles: type.size,
      controls: controls.length,
      under44: small,
      tinyButtons: tiny,
      maxRight: Math.round(Math.max(...all.map((el) => el.getBoundingClientRect().right))),
      vw: window.innerWidth,
      headings: Array.from(main.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(vis)
        .map((h) => h.tagName + ':' + h.textContent.trim().slice(0, 32)),
      text: (main.textContent || '').replace(/\s+/g, ' '),
    };
  });
}

for (const phone of PHONES) {
  test.describe('Profile shape at ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('has no heatmap, and no tiny controls at all', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForTimeout(1200);
      const s = await shape(page);
      // 115 of the old 117 sub-44px targets were 16x16 day cells; the last two
      // were the Level-mastery InfoTip and the language chips. B3 and B4 removed
      // or resized all of them, so the count is now zero and stays zero.
      expect(s.tinyButtons, JSON.stringify(s.under44)).toBe(0);
      expect(s.text).not.toMatch(/Study activity/);
      expect(s.text).not.toMatch(/days studied/);
      // No grid replaced it, in any form.
      const grids = await page.evaluate(() => Array.from(
        document.querySelectorAll('#main-content *'))
        .filter((el) => (getComputedStyle(el).display || '').indexOf('grid') === 0)
        .filter((el) => el.children.length > 20).length);
      expect(grids).toBe(0);
    });

    test('says how recently the learner studied, without coercion', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForTimeout(1200);
      const s = await shape(page);
      expect(s.text).toMatch(/(Studied \d+ of the last 30 days|No sessions in the last 30 days)/);
      // No streak language, anywhere on the screen.
      expect(s.text).not.toMatch(/streak|consecutive|day in a row|🔥/i);
    });

    test('stays inside the viewport', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForTimeout(1200);
      const s = await shape(page);
      expect(s.maxRight).toBeLessThanOrEqual(s.vw);
    });
  });
}

test.describe('Profile shape — the budget', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('reports its measurements', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForTimeout(1200);
    const s = await shape(page);
    console.log('PROFILE_SHAPE ' + JSON.stringify({
      viewports: s.viewports, docH: s.docH, containers: s.containers,
      typeStyles: s.typeStyles, controls: s.controls, under44: s.under44.length,
      headings: s.headings,
    }));
    // The audit's numbers were 4.48 / 55 / 24 / 117.
    expect(s.viewports).toBeLessThan(4.48);
    // B4 gave the last two sub-44px targets a real hit area; nothing may
    // reintroduce one.
    expect(s.under44.length, JSON.stringify(s.under44)).toBe(0);
  });

  // The five controls — daily goal, reset, remove, delete, sign out — were four
  // panels and a button, ~590px of permanent screen. As collapsed rows they are
  // a fraction of that, with every option still one tap away (P10-B4).
  test('keeps the controls to a band of rows, not a stack of panels', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForTimeout(1200);
    const band = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#main-content button'))
        .filter((b) => b.hasAttribute('aria-expanded') || /sign out/i.test(b.textContent || ''));
      const tops = rows.map((b) => b.getBoundingClientRect().top);
      const bottoms = rows.map((b) => b.getBoundingClientRect().bottom);
      return { count: rows.length, height: Math.round(Math.max(...bottoms) - Math.min(...tops)) };
    });
    console.log('PROFILE_CONTROL_BAND ' + JSON.stringify(band));
    expect(band.count).toBe(4);          // goal, sign out, reset, delete
    expect(band.height).toBeLessThan(320);
  });
});
