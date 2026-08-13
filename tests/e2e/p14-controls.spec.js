import fs from 'node:fs';
import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';

// The half of the P14-1 contract that only a browser can settle.
//
// controlTokens.test.js proves every control DECLARES 44px. jsdom does not lay
// anything out, so it cannot prove one MEASURES 44px — a flex parent, a
// `flex-shrink`, an `overflow: hidden` ancestor or a `box-sizing` slip all show
// up only in a real layout. This spec measures the boxes.
//
// It also carries the migration proof: the three icon buttons P14-1 replaced
// were 28, 30 and 32 pixels, and the whole claim is that they are now 44 while
// occupying the same layout box and leaving the glyph exactly where it was.
//
// Runs in CI with the rest of the suite — these are cheap and they are the only
// place the geometry claim is actually tested.

const OUT = process.env.P14_OUT || '/tmp/p14-controls';
const TAP_MIN = 44;

async function setTheme(page, theme) {
  await page.route('**/mock.supabase.co/rest/v1/profiles**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
    const row = { ...PROFILE, theme };
    return route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'application/json',
        'content-range': '0-0/*',
      },
      body: JSON.stringify(wantsObject ? row : [row]),
    });
  });
}

// The box a control OCCUPIES (its border box) and the box it CATCHES (the same
// rect — a negative margin moves the border box without shrinking it, which is
// the whole trick). Reported separately from the layout footprint, which is what
// the neighbouring content actually sees.
async function boxes(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const mt = parseFloat(cs.marginTop) || 0;
    const mr = parseFloat(cs.marginRight) || 0;
    const mb = parseFloat(cs.marginBottom) || 0;
    const ml = parseFloat(cs.marginLeft) || 0;
    const svg = el.querySelector('svg');
    const g = svg ? svg.getBoundingClientRect() : null;
    return {
      // What a finger hits.
      hit: { w: Math.round(r.width), h: Math.round(r.height) },
      // What the layout reserves — border box plus (possibly negative) margins.
      footprint: { w: Math.round(r.width + ml + mr), h: Math.round(r.height + mt + mb) },
      // Where the drawn mark actually is, in viewport coordinates.
      glyph: g ? { x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.width), h: Math.round(g.height) } : null,
      margin: [mt, mr, mb, ml].map(n => Math.round(n)),
    };
  });
}

// ── The gallery: every variant, measured ────────────────────────────────────
for (const theme of ['light', 'dark']) {
  test.describe('P14-1 controls · ' + theme, () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test.beforeEach(async ({ page }) => {
      await setTheme(page, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/dev');
      await page.locator('[data-controls-gallery]').waitFor();
      // The evidence is only evidence if the theme took.
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);
    });

    test('every Button clears the tap floor at its declared height', async ({ page }) => {
      const gallery = page.locator('[data-controls-gallery]');
      for (const name of ['Primary', 'Secondary', 'Ghost', 'Destructive']) {
        const b = await boxes(gallery.locator('[data-gallery-group="Button · variants"]')
          .getByRole('button', { name, exact: true }));
        expect(b.hit.h, name + ' is ' + b.hit.h + 'px tall').toBeGreaterThanOrEqual(TAP_MIN);
      }
      const sizes = gallery.locator('[data-gallery-group="Button · sizes and icons"]');
      const md = await boxes(sizes.getByRole('button', { name: 'Medium' }));
      const lg = await boxes(sizes.getByRole('button', { name: 'Large' }));
      expect(md.hit.h).toBe(44);
      expect(lg.hit.h).toBe(52);
    });

    test('a full-width Button fills its container and no more', async ({ page }) => {
      const btn = page.locator('[data-gallery-group="Button · full width"]')
        .getByRole('button', { name: 'Start reviewing' });
      const w = await btn.evaluate((el) => ({
        self: Math.round(el.getBoundingClientRect().width),
        parent: Math.round(el.parentElement.getBoundingClientRect().width),
      }));
      expect(w.self).toBe(w.parent);
      // And the page never scrolls sideways because of it.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    });

    test('every IconButton measures 44x44 after layout', async ({ page }) => {
      // Scoped to the group: /dev's own tool buttons share several of these
      // names, and an ambiguous locator is a test that fails for the wrong reason.
      const group = page.locator('[data-gallery-group="IconButton"]');
      for (const name of ['Close', 'Play', 'Play round', 'Delete', 'Disabled', 'Toggle off', 'Toggle on']) {
        const b = await boxes(group.getByRole('button', { name, exact: true }));
        expect(b.hit, name + ' measures ' + b.hit.w + 'x' + b.hit.h).toEqual({ w: 44, h: 44 });
      }
    });

    test('a Row clears the floor and grows for a second line', async ({ page }) => {
      const group = page.locator('[data-gallery-group="Row"]');
      const one = await boxes(group.getByRole('button', { name: /Speaking/ }));
      const two = await boxes(group.getByRole('button', { name: /Listening/ }));
      expect(one.hit.h).toBeGreaterThanOrEqual(TAP_MIN);
      // The two-line row is TALLER — a fixed height would have clipped it.
      expect(two.hit.h).toBeGreaterThan(one.hit.h);
    });

    test('a run of Rows draws one line between each pair and none at the ends', async ({ page }) => {
      const lines = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-gallery-group="Row"] button')];
        return rows.map(r => getComputedStyle(r).borderTopWidth);
      });
      expect(lines.length).toBe(3);
      // First row: no line above it. The rest: exactly one.
      expect(lines[0]).toBe('0px');
      expect(lines[1]).not.toBe('0px');
      expect(lines[2]).not.toBe('0px');
    });

    test('the Row divider resolves to a visible colour, not a white highlight', async ({ page }) => {
      // The --hairline bug, caught in a browser rather than in a source grep: a
      // white inset highlight used as a border draws nothing on a light surface.
      const { colour, surface } = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-gallery-group="Row"] button')];
        return {
          colour: getComputedStyle(rows[1]).borderTopColor,
          surface: getComputedStyle(document.body).backgroundColor,
        };
      });
      expect(colour).not.toBe(surface);
      expect(colour).not.toBe('rgba(0, 0, 0, 0)');
      // Not white-on-white: a divider that matches the paper is not a divider.
      expect(colour).not.toBe('rgb(255, 255, 255)');
    });

    test('the Segmented track is 44 tall and its segments share the width', async ({ page }) => {
      const group = page.getByRole('radiogroup', { name: 'Reading mode' });
      const t = await boxes(group);
      expect(t.hit.h).toBe(44);
      const widths = await group.evaluate((el) => [...el.querySelectorAll('[role="radio"]')]
        .map(r => Math.round(r.getBoundingClientRect().width)));
      expect(widths.length).toBe(3);
      // Equal to within a rounding pixel.
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    });

    test('the selected segment is the only one that lifts', async ({ page }) => {
      const group = page.getByRole('radiogroup', { name: 'Reading mode' });
      const before = await group.evaluate((el) => [...el.querySelectorAll('[role="radio"]')]
        .map(r => ({ on: r.getAttribute('aria-checked'), shadow: getComputedStyle(r).boxShadow })));
      expect(before.filter(s => s.on === 'true').length).toBe(1);
      expect(before.filter(s => s.shadow !== 'none').length).toBe(1);
      expect(before.find(s => s.on === 'true').shadow).not.toBe('none');

      // And the lift follows the selection.
      await group.getByRole('radio', { name: 'Chat' }).click();
      const after = await group.evaluate((el) => [...el.querySelectorAll('[role="radio"]')]
        .map(r => ({ label: r.textContent, on: r.getAttribute('aria-checked'), shadow: getComputedStyle(r).boxShadow })));
      expect(after.find(s => s.on === 'true').label).toBe('Chat');
      expect(after.filter(s => s.shadow !== 'none').length).toBe(1);
    });

    test('arrow keys move the selection in a real browser', async ({ page }) => {
      const group = page.getByRole('radiogroup', { name: 'Reading mode' });
      await group.getByRole('radio', { name: 'Paged' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(group.getByRole('radio', { name: 'Scroll' })).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('End');
      await expect(group.getByRole('radio', { name: 'Chat' })).toHaveAttribute('aria-checked', 'true');
      // Wraps, and focus came along for the ride.
      await page.keyboard.press('ArrowRight');
      await expect(group.getByRole('radio', { name: 'Paged' })).toHaveAttribute('aria-checked', 'true');
      expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Paged');
    });

    test('Tab enters the group once, not once per option', async ({ page }) => {
      const group = page.getByRole('radiogroup', { name: 'Reading mode' });
      const tabbable = await group.evaluate((el) => [...el.querySelectorAll('[role="radio"]')]
        .filter(r => r.tabIndex === 0).length);
      expect(tabbable).toBe(1);
    });

    test('a selected Chip is filled with the brand and reads white', async ({ page }) => {
      const chip = page.locator('[data-gallery-group="Chip"]').getByRole('button', { name: 'All', exact: true });
      const c = await chip.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, fg: cs.color, radius: cs.borderTopLeftRadius };
      });
      expect(c.fg).toBe('rgb(255, 255, 255)');
      expect(c.bg).not.toBe('rgba(0, 0, 0, 0)');
      // A pill, not a rounded rectangle.
      expect(parseFloat(c.radius)).toBeGreaterThan(15);
    });

    test('a disabled control ignores the tap', async ({ page }) => {
      const readout = page.locator('[data-controls-gallery] >> text=/\\d+ taps/');
      const before = await readout.textContent();
      await page.locator('[data-gallery-group="Button · disabled and loading"]')
        .getByRole('button', { name: 'Disabled', exact: true }).first().click({ force: true });
      expect(await readout.textContent()).toBe(before);
      // While an enabled one does not.
      await page.locator('[data-gallery-group="IconButton"]')
        .getByRole('button', { name: 'Close', exact: true }).click();
      expect(await readout.textContent()).not.toBe(before);
    });

    test('nothing in the gallery overflows the phone', async ({ page }) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    });

    test('records the measured geometry', async ({ page }) => {
      // Written out so the report quotes measurements rather than intentions.
      const data = await page.evaluate(() => {
        const out = {};
        for (const g of document.querySelectorAll('[data-gallery-group]')) {
          out[g.getAttribute('data-gallery-group')] = [...g.querySelectorAll('button, [role="radiogroup"], span')]
            .filter(el => el.getBoundingClientRect().height > 2)
            .map((el) => {
              const r = el.getBoundingClientRect();
              const cs = getComputedStyle(el);
              return {
                label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
                w: Math.round(r.width), h: Math.round(r.height),
                radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, fg: cs.color,
                font: cs.fontSize + '/' + cs.fontWeight,
              };
            });
        }
        return out;
      });
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(OUT + '/gallery.' + theme + '.json', JSON.stringify(data, null, 1));
      await page.screenshot({ path: OUT + '/gallery.' + theme + '.png', fullPage: true });
    });
  });
}

// ── The migration proof ────────────────────────────────────────────────────
// Feedback's close button was a 28x28 target (a 20px glyph in 4px of padding).
// It is now the shared IconButton at 44x44 with holdLayout(28), which is the
// claim under test: the target grew, and nothing else did.
test.describe('P14-1 migration · Feedback close', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('is a 44x44 target inside a 28x28 footprint', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await page.getByRole('button', { name: 'Send feedback' }).click();
    const close = page.getByRole('dialog', { name: /Send feedback/ }).getByRole('button', { name: 'Close' });
    const b = await boxes(close);
    expect(b.hit).toEqual({ w: 44, h: 44 });
    // 44 - 2*8 = 28: the layout box the row's other content sees is unchanged.
    expect(b.footprint).toEqual({ w: 28, h: 28 });
    expect(b.margin).toEqual([-8, -8, -8, -8]);
    // And the glyph is still the 20px mark it always was.
    expect(b.glyph.w).toBe(20);
    expect(b.glyph.h).toBe(20);

    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(OUT + '/feedback-close.json', JSON.stringify(b, null, 1));
    await page.screenshot({ path: OUT + '/feedback-dialog.png' });
  });

  test('still closes the dialog', async ({ page }) => {
    // The point of a migration is that behaviour is unchanged, so assert the
    // behaviour and not only the box.
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await page.getByRole('button', { name: 'Send feedback' }).click();
    const dialog = page.getByRole('dialog', { name: /Send feedback/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });
});
