import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// P11-1 — the Practice hub's composition, as a contract.
//
// What it replaced: a lit hero, a bordered level-test card, EIGHT identical
// 173×136 tiles in a 2-column grid, and a tools panel. The grid was the app's
// most template-looking pattern and it claimed all eight drills matter equally,
// which is false (P11 audit). What ships: one recommendation, one panel of rows,
// a quiet open row for the level test, and the tools.
//
// These specs assert ROLES and the absence of the old patterns — not a surface
// count. Counts were the diagnostic; hierarchy is the goal.

// Six dividers of 1px between seven rows, and nothing else.
const rowsAllowance = 8;

const PHONES = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
];

const SHAPE = () => {
  const root = document.querySelector('#main-content') || document.body;
  const rgba = (c) => {
    const n = (c.match(/[-\d.]+/g) || []).map(Number);
    if (!n.length) return [0, 0, 0, 0];
    const k = c.indexOf('color(') === 0 ? 255 : 1;
    return [n[0] * k, n[1] * k, n[2] * k, n.length > 3 ? n[3] : 1];
  };
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const all = Array.from(root.querySelectorAll('*')).filter(vis);
  const boxes = all.filter((el) => {
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    if (b.width < 20 || b.height < 12) return false;
    const border = parseFloat(cs.borderTopWidth) > 0 && rgba(cs.borderTopColor)[3] > 0.04;
    const bg = rgba(cs.backgroundColor)[3] > 0.03 || cs.backgroundImage !== 'none';
    return (parseFloat(cs.borderTopLeftRadius) || 0) >= 6 && (border || bg || cs.boxShadow !== 'none');
  });
  const depthOf = (el) => {
    let d = 0, p = el.parentElement;
    while (p && p !== root) { if (boxes.indexOf(p) !== -1) d += 1; p = p.parentElement; }
    return d;
  };
  const major = boxes.filter((el) => {
    const b = el.getBoundingClientRect();
    return b.width >= 60 && b.height >= 28;
  });
  const drillPanel = document.querySelector('[aria-label="Practice drills"]');
  const drillRows = drillPanel ? Array.from(drillPanel.querySelectorAll('button')).filter(vis) : [];
  const targets = all.filter((el) => {
    const t = el.tagName.toLowerCase();
    return t === 'button' || t === 'a' || el.getAttribute('role') === 'button';
  });
  return {
    // A "lit" surface is one carrying a gradient ground — the hero's signature.
    lit: major.filter((el) => getComputedStyle(el).backgroundImage !== 'none')
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24)),
    panels: major.filter((el) => depthOf(el) === 0).length,
    // Cards inside cards, excluding the hero's own CTA pill (a button needs an
    // edge). Anything else nested is the pattern this redesign removed.
    nested: boxes.filter((el) => depthOf(el) > 0)
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24))
      .filter((t) => !/^(Start|Practise|Review) /.test(t)),
    // A decorative icon chip: a small rounded box that contains an icon and no
    // text. Sixteen of these were removed in P10-C1 and must not come back.
    iconChips: boxes.filter((el) => {
      const b = el.getBoundingClientRect();
      const small = b.width < 60 && b.height < 60;
      const noText = !(el.textContent || '').trim();
      return small && noText && el.querySelector('svg');
    }).length,
    drillRows: drillRows.length,
    drillRowNames: drillRows.map((el) => (el.getAttribute('aria-label') || '').split(' — ')[0]),
    drillRowHeights: drillRows.map((el) => Math.round(el.getBoundingClientRect().height)),
    // Rows must not draw themselves as cards inside the list panel.
    drillRowsDrawn: drillRows.filter((el) => {
      const cs = getComputedStyle(el);
      return (parseFloat(cs.borderTopLeftRadius) || 0) >= 6 || cs.boxShadow !== 'none';
    }).length,
    // How the two row families differ, without another box: colour and weight.
    families: (() => {
      const drill = drillRows[2];
      const tool = Array.from(root.querySelectorAll('button')).filter(vis)
        .find((el) => /Word list/.test(el.textContent || ''));
      const read = (el) => {
        if (!el) return null;
        const title = el.querySelector('span span') || el;
        const icon = el.querySelector('svg');
        return {
          titleSize: getComputedStyle(title).fontSize,
          titleWeight: getComputedStyle(title).fontWeight,
          // `stroke`, not `color`: lucide takes its `color` prop to the svg's
          // stroke attribute, so `color` here would only report inherited text.
          iconColor: icon ? getComputedStyle(icon).stroke : null,
        };
      };
      return { drill: read(drill), tool: read(tool) };
    })(),
    under44: targets.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height < 44 || r.width < 44;
    }).map((el) => ({
      t: ((el.textContent || '').trim() || el.getAttribute('aria-label') || '?').slice(0, 20),
      h: Math.round(el.getBoundingClientRect().height),
    })),
    docH: document.documentElement.scrollHeight,
    maxRight: Math.round(Math.max(...all.map((el) => el.getBoundingClientRect().right))),
    vw: window.innerWidth,
    headings: Array.from(root.querySelectorAll('h1,h2')).filter(vis).map((h) => h.tagName + ':' + h.textContent.trim()),
    text: (root.textContent || '').replace(/\s+/g, ' '),
  };
};

for (const phone of PHONES) {
  test.describe('Practice at ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('lights exactly one surface — the recommendation', async ({ page }) => {
      await page.goto('/practice');
      await page.waitForTimeout(1400);
      const s = await page.evaluate(SHAPE);
      expect(s.lit.length, JSON.stringify(s.lit)).toBe(1);
      expect(s.lit[0]).toMatch(/WAITING FOR YOU|START HERE/i);
    });

    test('has no card inside a card, and no icon chips', async ({ page }) => {
      await page.goto('/practice');
      await page.waitForTimeout(1400);
      const s = await page.evaluate(SHAPE);
      expect(s.nested, JSON.stringify(s.nested)).toEqual([]);
      // The sixteen tinted squares removed in P10-C1 stay removed.
      expect(s.iconChips).toBe(0);
    });

    test('draws the drills as rows, not as cards', async ({ page }) => {
      await page.goto('/practice');
      await page.waitForTimeout(1400);
      const s = await page.evaluate(SHAPE);
      expect(s.drillRows).toBeGreaterThanOrEqual(7);
      expect(s.drillRowsDrawn, 'a row drew itself as a card').toBe(0);
      // Every row is a comfortable target.
      for (const h of s.drillRowHeights) expect(h).toBeGreaterThanOrEqual(44);
    });

    test('keeps every target tappable and stays inside the viewport', async ({ page }) => {
      await page.goto('/practice');
      await page.waitForTimeout(1400);
      const s = await page.evaluate(SHAPE);
      expect(s.under44, JSON.stringify(s.under44)).toEqual([]);
      expect(s.maxRight).toBeLessThanOrEqual(s.vw);
    });

    test('keeps the level test, quiet and honest', async ({ page }) => {
      await page.goto('/practice');
      await page.waitForTimeout(1400);
      const s = await page.evaluate(SHAPE);
      // The requirement is stated, not the urgency.
      expect(s.text).toMatch(/Unlocks at \d+ mastered words/);
      expect(s.text).toMatch(/\d+ of \d+ words mastered/);
      // And it is not a card of its own competing with the hero.
      const row = page.getByRole('button', { name: /test — (locked|unlocked)/ });
      const drawn = await row.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          radius: parseFloat(cs.borderTopLeftRadius) || 0,
          shadow: cs.boxShadow,
          border: parseFloat(cs.borderTopWidth) || 0,
        };
      });
      expect(drawn.radius).toBe(0);
      expect(drawn.shadow).toBe('none');
      expect(drawn.border).toBe(0);
    });
  });
}

test.describe('Practice — the two row families', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('are told apart by colour and weight, not by another box', async ({ page }) => {
    await page.goto('/practice');
    await page.waitForTimeout(1400);
    const s = await page.evaluate(SHAPE);
    const { drill, tool } = s.families;
    expect(drill).not.toBeNull();
    expect(tool).not.toBeNull();
    // A drill's title is larger and heavier than a tool's.
    expect(parseFloat(drill.titleSize)).toBeGreaterThan(parseFloat(tool.titleSize));
    expect(Number(drill.titleWeight)).toBeGreaterThan(Number(tool.titleWeight));
    // A drill's icon is coloured; a tool's is muted. Things you do are in the
    // accent, places you look are not.
    expect(drill.iconColor).not.toBe(tool.iconColor);
  });

  test('gives each section a heading, and the drill list none', async ({ page }) => {
    await page.goto('/practice');
    await page.waitForTimeout(1400);
    const s = await page.evaluate(SHAPE);
    expect(s.headings[0]).toBe('H1:Practice');
    expect(s.headings).toContain('H2:Look things up');
    // No heading over the drill list: the hero asked the question, the list is
    // the rest of the answer, and "MORE DRILLS" was a taxonomy for one thing.
    expect(s.text).not.toMatch(/MORE DRILLS/i);
  });
});

test.describe('Practice without speech recognition', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // What the store apps actually show. `speechRecognitionSupported()` is false in
  // any webview, so iOS and Android omit the Speaking drill entirely and see one
  // row fewer than the web (docs/BACKLOG.md). Removing the constructors here
  // reproduces that honestly, without faking the native shell.
  test('shows seven rows with no hole where Speaking was', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        delete window.SpeechRecognition;
        delete window.webkitSpeechRecognition;
      } catch { /* a browser that will not let go of it is not the case under test */ }
    });
    await page.goto('/practice');
    await page.waitForTimeout(1400);
    const s = await page.evaluate(SHAPE);

    expect(s.drillRowNames).not.toContain('Speaking');
    expect(s.text).not.toMatch(/Speaking/);
    expect(s.drillRows).toBe(7);

    // No hole: the panel's height is its rows plus their dividers, so an omitted
    // drill leaves no gap behind.
    const gap = await page.evaluate(() => {
      const panel = document.querySelector('[aria-label="Practice drills"] > div');
      const rows = Array.from(panel.querySelectorAll('button'));
      const sum = rows.reduce((t, el) => t + el.getBoundingClientRect().height, 0);
      return Math.round(panel.getBoundingClientRect().height - sum);
    });
    expect(gap).toBeLessThanOrEqual(rowsAllowance);
    for (const h of s.drillRowHeights) expect(h).toBeGreaterThanOrEqual(44);
  });
});
