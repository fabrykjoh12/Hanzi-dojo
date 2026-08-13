import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
// The bar's height was a literal 58 in three places here, which is the mistake
// navMetrics.js exists to prevent: P14-4 made the bar a 60px floating tray and
// these were the last three copies of the old number in the suite.
import { MOBILE_NAV_HEIGHT } from '../../src/navMetrics.js';

// TEMPORARY prototype spec — P8, the Cards-emphasis pass.
//
// It exists to MEASURE and to RENDER, not to guard: the contract lives in
// nav-bar.spec.js. Two things it does that a screenshot cannot:
//
//   1. It reads the bar's real geometry — the bar's height, the Cards
//      container's box, and whether that container is fully inside the bar.
//   2. It measures each glyph's OPTICAL mass by rasterising it and summing
//      alpha. Two icons at the same CSS size are not the same weight: the 2×2
//      Practice grid carries far more ink than a house outline, which is
//      exactly what made Practice compete with Cards on a device.
//
// Delete it once the prototype is judged (the P8 audit's measuring spec was
// removed the same way).

const OUT = process.env.P8_OUT || '/tmp/p8';

const PHONE = { width: 390, height: 844 };
const SMALL = { width: 320, height: 568 };
const LARGE = { width: 430, height: 932 };

async function emptyQueue(page) {
  await page.route('**/rest/v1/vocabulary*', (route) => route.fulfill({
    status: 200,
    headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
    body: '[]',
  }));
}

async function theme(page, mode) {
  await page.evaluate((m) => document.documentElement.setAttribute('data-theme', m), mode);
  await page.waitForTimeout(250);
}

// Ink coverage per tab, in device-independent px². Rasterise the tab's own SVG
// at 4× and sum the alpha channel: a measure of how much the glyph actually
// darkens the bar, which is what "optical weight" means here.
async function opticalMass(page) {
  return page.evaluate(async () => {
    const tabs = Array.from(document.querySelectorAll('nav[aria-label="Primary"] button'));
    const out = [];
    for (const b of tabs) {
      const svg = b.querySelector('svg');
      const label = b.children[b.children.length - 1].textContent.trim();
      const r = svg.getBoundingClientRect();
      const clone = svg.cloneNode(true);
      // The glyphs carry `var(--text-muted)` / a color-mix() accent in their
      // fill and stroke attributes, and neither resolves inside a standalone
      // data-URI raster — the first attempt measured 0 ink for all five. Only
      // the alpha channel is being counted, so flatten every colour to black
      // and leave the `none`s alone: what is left is shape.
      for (const n of [clone, ...clone.querySelectorAll('*')]) {
        // Everything inside a <mask> is left exactly as authored: its black and
        // white are geometry, not colour. Flattening them blacked out the
        // mask's keep-rect, which erased the Cards glyph's back card and made it
        // measure 126px² instead of 182 — the measurement said the emphasis had
        // gone backwards when only the harness had.
        if (n.closest('mask')) continue;
        for (const attr of ['fill', 'stroke']) {
          const v = n.getAttribute(attr);
          if (v && v !== 'none') n.setAttribute(attr, '#000');
        }
      }
      clone.setAttribute('width', String(r.width));
      clone.setAttribute('height', String(r.height));
      const xml = new XMLSerializer().serializeToString(clone);
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const S = 4;
      const c = document.createElement('canvas');
      c.width = Math.ceil(r.width * S); c.height = Math.ceil(r.height * S);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let alpha = 0;
      for (let i = 3; i < d.length; i += 4) alpha += d[i] / 255;
      out.push({
        name: label,
        css: Math.round(r.width * 100) / 100,
        // Back to CSS px² so the number is comparable across icon sizes.
        ink: Math.round((alpha / (S * S)) * 10) / 10,
      });
    }
    return out;
  });
}

async function barGeometry(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary"]');
    const nr = nav.getBoundingClientRect();
    const tabs = Array.from(nav.querySelectorAll('button'));
    const cards = tabs.find((b) => b.textContent.trim() === 'Cards');
    // The container, if there is one: the icon's parent box, measured.
    const shell = cards.querySelector('svg').parentElement;
    const sr = shell.getBoundingClientRect();
    const cs = getComputedStyle(shell);
    // What the container ACTUALLY moves, composited over the bar's own ground.
    // The bar is translucent, so a token name says nothing about what lands.
    //
    // A color-mix() computes to `color(srgb r g b / a)` with components on 0–1,
    // while a plain token computes to `rgb(0–255)`. Mixing the two scales
    // silently — the first version of this read 19.7 for a step that is really
    // 6 — so both are normalised to 0–255 here.
    const rgba = (c) => {
      const n = (c.match(/[\d.]+/g) || []).map(Number);
      const k = c.indexOf('color(') === 0 ? 255 : 1;
      return [n[0] * k, n[1] * k, n[2] * k, n.length > 3 ? n[3] : 1];
    };
    const ground = rgba(getComputedStyle(nav).backgroundColor);
    const box = rgba(cs.backgroundColor);
    const alpha = box[3];
    const delta = Math.max(...[0, 1, 2].map(
      (i) => Math.abs((box[i] * alpha + ground[i] * (1 - alpha)) - ground[i]),
    ));
    return {
      bar: { height: Math.round(nr.height * 100) / 100, top: Math.round(nr.top * 100) / 100 },
      shellDelta: Math.round(delta * 10) / 10,
      shell: {
        w: Math.round(sr.width * 100) / 100,
        h: Math.round(sr.height * 100) / 100,
        radius: cs.borderRadius,
        background: cs.backgroundColor,
        insetTop: Math.round((sr.top - nr.top) * 100) / 100,
        insetBottom: Math.round((nr.bottom - sr.bottom) * 100) / 100,
      },
      tab: {
        h: Math.round(cards.getBoundingClientRect().height * 100) / 100,
        w: Math.round(cards.getBoundingClientRect().width * 100) / 100,
      },
      labels: tabs.map((b) => {
        const l = b.children[b.children.length - 1];
        const s = getComputedStyle(l);
        return { name: l.textContent.trim(), weight: Number(s.fontWeight), size: s.fontSize };
      }),
    };
  });
}

async function shots(page, name) {
  const nav = page.locator('nav[aria-label="Primary"]');
  await nav.screenshot({ path: OUT + '/bar-' + name + '.png' });
  await page.screenshot({ path: OUT + '/screen-' + name + '.png' });
}

test.describe('P8 Cards emphasis — renders and measurements', () => {
  test.use({ viewport: PHONE, deviceScaleFactor: 3 });

  test('Home active, dark, 390', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await theme(page, 'dark');
    await shots(page, 'home-dark-390');
    const geo = await barGeometry(page);
    const mass = await opticalMass(page);
    console.log('GEO home-dark-390 ' + JSON.stringify(geo));
    console.log('MASS home-dark-390 ' + JSON.stringify(mass));
    expect(geo.bar.height).toBe(MOBILE_NAV_HEIGHT);
  });

  test('Cards active, dark, 390', async ({ page }) => {
    await emptyQueue(page);
    await page.goto('/study');
    await page.locator('nav[aria-label="Primary"]').waitFor();
    await page.waitForTimeout(900);
    await theme(page, 'dark');
    await shots(page, 'cards-dark-390');
    console.log('GEO cards-dark-390 ' + JSON.stringify(await barGeometry(page)));
    console.log('MASS cards-dark-390 ' + JSON.stringify(await opticalMass(page)));
  });

  test('Stories active, dark, 390', async ({ page }) => {
    await page.goto('/stories');
    await page.locator('nav[aria-label="Primary"]').waitFor();
    await page.waitForTimeout(700);
    await theme(page, 'dark');
    await shots(page, 'stories-dark-390');
    console.log('GEO stories-dark-390 ' + JSON.stringify(await barGeometry(page)));
    // Stories active here, so this is where Home's RESTING mass can be read —
    // the Home-active run measures Home filled, which is a different number.
    console.log('MASS stories-dark-390 ' + JSON.stringify(await opticalMass(page)));
  });

  test('Cards active, light, 390 — the tint has to survive both grounds', async ({ page }) => {
    await emptyQueue(page);
    await page.goto('/study');
    await page.locator('nav[aria-label="Primary"]').waitFor();
    await page.waitForTimeout(900);
    await theme(page, 'light');
    await shots(page, 'cards-light-390');
  });

  test('Home active, light, 390', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await theme(page, 'light');
    await shots(page, 'home-light-390');
  });

  test('Practice active, dark, 390', async ({ page }) => {
    await page.goto('/practice');
    await page.locator('nav[aria-label="Primary"]').waitFor();
    await page.waitForTimeout(700);
    await theme(page, 'dark');
    await shots(page, 'practice-dark-390');
    console.log('GEO practice-dark-390 ' + JSON.stringify(await barGeometry(page)));
  });

  test('More open, dark, 390 — the sheet still belongs to the far-right column', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await theme(page, 'dark');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('dialog', { name: 'More menu' }).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + '/screen-more-dark-390.png' });
  });
});

test.describe('P8 Cards emphasis — the largest phone', () => {
  test.use({ viewport: LARGE, deviceScaleFactor: 3 });

  test('Cards active, dark, 430', async ({ page }) => {
    await emptyQueue(page);
    await page.goto('/study');
    await page.locator('nav[aria-label="Primary"]').waitFor();
    await page.waitForTimeout(900);
    await theme(page, 'dark');
    await shots(page, 'cards-dark-430');
    const geo = await barGeometry(page);
    console.log('GEO cards-dark-430 ' + JSON.stringify(geo));
    expect(geo.bar.height).toBe(MOBILE_NAV_HEIGHT);
  });
});

test.describe('P8 Cards emphasis — the tightest phone', () => {
  test.use({ viewport: SMALL, deviceScaleFactor: 3 });

  test('Cards active, dark, 320', async ({ page }) => {
    await emptyQueue(page);
    await page.goto('/study');
    await page.locator('nav[aria-label="Primary"]').waitFor();
    await page.waitForTimeout(900);
    await theme(page, 'dark');
    await shots(page, 'cards-dark-320');
    const geo = await barGeometry(page);
    console.log('GEO cards-dark-320 ' + JSON.stringify(geo));
    // The whole point: the container is INSIDE the bar, not floating over it.
    expect(geo.bar.height).toBe(MOBILE_NAV_HEIGHT);
    expect(geo.shell.insetTop).toBeGreaterThan(0);
    expect(geo.shell.insetBottom).toBeGreaterThan(0);
  });

  test('Home active, dark, 320', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Today.s training/ }).waitFor();
    await theme(page, 'dark');
    await shots(page, 'home-dark-320');
  });
});
