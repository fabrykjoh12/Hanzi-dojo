import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { MOBILE_NAV_HEIGHT, MOBILE_NAV_RESERVE } from '../../src/navMetrics.js';

// P10-A2 and A3: the global feedback button.
//
// A2 — it is `position: fixed` at z-index 45 and the More sheet renders at 41,
// so it floated ON TOP of a modal dialog. The P10 audit caught it in its own
// screenshot. The fix is not a bigger z-index on the sheet: the button does not
// render at all while a sheet is open.
//
// A3 — its bottom offset was a hardcoded 72px while the bar is 58
// (`navMetrics.js`). It happened to still look right, because 58 + 14 = 72,
// which is exactly the kind of coincidence that stops being one.

const PHONES = [
  { name: 'iPhone SE', width: 320, height: 568 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone Pro Max', width: 430, height: 932 },
];

const FAB = 'button[aria-label="Send feedback"]';

test.describe('the feedback button and a modal sheet', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('is gone while the More sheet is open, and back when it closes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await expect(page.locator(FAB)).toBeVisible();

    await page.getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('dialog', { name: 'More menu' })).toBeVisible();

    // Not merely behind the sheet — not rendered.
    await expect(page.locator(FAB)).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'More menu' })).toHaveCount(0);
    await expect(page.locator(FAB)).toBeVisible();
  });

  test('nothing paints above the sheet, whatever its z-index', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('dialog', { name: 'More menu' }).waitFor();
    await page.waitForTimeout(400);

    // The generic version of the same claim: no fixed element sits at a higher
    // stacking level than the dialog. This is what would catch the next one.
    const above = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="More menu"]');
      const dz = Number(getComputedStyle(dialog).zIndex) || 0;
      return Array.from(document.querySelectorAll('body *'))
        .filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.position !== 'fixed') return false;
          if (dialog.contains(el) || el.contains(dialog)) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return false;
          if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
          return (Number(cs.zIndex) || 0) > dz;
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          label: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24),
          z: Number(getComputedStyle(el).zIndex) || 0,
        }));
    });
    expect(above, JSON.stringify(above)).toEqual([]);
  });

  test('the button still opens its own dialog', async ({ page }) => {
    // The fix must not have cost the feature.
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await page.locator(FAB).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

for (const phone of PHONES) {
  test.describe('the feedback button on ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('sits clear of the tab bar, derived from the one nav height', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
      const geo = await page.evaluate(() => {
        const fab = document.querySelector('button[aria-label="Send feedback"]');
        const nav = document.querySelector('nav[aria-label="Primary"]');
        const f = fab.getBoundingClientRect();
        const n = nav.getBoundingClientRect();
        return {
          gap: Math.round(n.top - f.bottom),
          fabBottomFromViewport: Math.round(window.innerHeight - f.bottom),
          navHeight: Math.round(n.height),
          inside: f.right <= window.innerWidth && f.left >= 0,
          size: [Math.round(f.width), Math.round(f.height)],
        };
      });

      // The offset is the navigation's declared geometry plus one gap, and it
      // follows the navigation rather than restating it.
      //
      // P14-4 made that two numbers: the tray is `MOBILE_NAV_HEIGHT` tall and
      // floats on `NAV_TRAY_BOTTOM`, so what the button has to clear is the
      // RESERVE. The gap above the tray is unchanged at 14 — which is the whole
      // point of deriving it, since nothing in Feedback.jsx was tuned by hand.
      expect(geo.navHeight).toBe(MOBILE_NAV_HEIGHT);
      expect(geo.fabBottomFromViewport).toBe(MOBILE_NAV_RESERVE + 14);
      expect(geo.gap).toBe(14);
      expect(geo.inside).toBe(true);
      // A 50px control is under the 44px floor in neither dimension.
      expect(geo.size[0]).toBeGreaterThanOrEqual(44);
      expect(geo.size[1]).toBeGreaterThanOrEqual(44);
    });
  });
}
