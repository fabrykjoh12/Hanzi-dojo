import { authedTest as test, expect, PROFILE } from '../fixtures/mockSupabase.js';
import { StudyPage } from '../pages/StudyPage.js';

// The grade buttons, in the theme the learner is actually in.
//
// Reported from an iPhone in dark mode: Again / Hard / Good / Easy stayed light
// and read as light-mode elements pasted onto a dark interface. They were four
// hardcoded near-white pastels, so no test that only asked "are they visible?"
// could ever have caught it. These read the COMPUTED colour and compare it to
// the surface it sits on.

// Chromium reports a color-mix() result as `color(srgb 0.96 0.91 0.90)` —
// floats, not the 0-255 `rgb()` triple. Both forms have to parse, or the
// palette that fixed this bug looks like a failure.
function luminance(value) {
  if (!value) return null;
  const m = value.match(/-?\d*\.?\d+/g);
  if (!m || m.length < 3) return null;
  const nums = m.slice(0, 3).map(Number);
  const scale = value.indexOf('color(') === 0 ? 1 : 255;
  const [r, g, b] = nums.map((n) => n / scale);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function gradeColours(page) {
  return page.evaluate(() => {
    const names = ['Again', 'Hard', 'Good', 'Easy'];
    const buttons = Array.from(document.querySelectorAll('button'))
      .filter((b) => names.some((n) => (b.textContent || '').trim().startsWith(n)));
    const body = getComputedStyle(document.body).backgroundColor;
    return {
      body,
      buttons: buttons.map((b) => {
        const cs = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        return {
          label: (b.textContent || '').trim().slice(0, 6),
          bg: cs.backgroundColor,
          color: cs.color,
          border: cs.borderTopColor,
          height: Math.round(r.height),
        };
      }),
    };
  });
}

// The theme comes from the learner's PROFILE — App applies `prof.theme` on
// load, which overrides anything the device remembered. So a dark-mode spec
// sets it on the account, in front of the fixture's own route (Playwright runs
// the most recently registered handler first).
async function setTheme(page, theme) {
  // Fulfil outright rather than chaining: the fixture ANSWERS this request, so
  // there is no upstream to fetch from and route.fetch() would go looking for a
  // host that does not exist.
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

async function revealCard(page, theme) {
  const study = new StudyPage(page);
  await study.goto();
  await study.reveal();
  await page.waitForTimeout(400);
  // Prove we are in the theme under test before asserting anything about it.
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);
}

test.describe('grade buttons in dark mode', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => { await setTheme(page, 'dark'); });

  test('sit on dark surfaces, not bright cards', async ({ page }) => {
    await revealCard(page, 'dark');
    const { body, buttons } = await gradeColours(page);
    expect(buttons.length).toBe(4);

    const pageLum = luminance(body);
    expect(pageLum).toBeLessThan(0.3); // we are genuinely in dark mode

    for (const b of buttons) {
      const bgLum = luminance(b.bg);
      // The specific failure: a near-white fill. #FBEDEA is ~0.93.
      expect(bgLum).toBeLessThan(0.35);
      // And it belongs to this screen — close to the page, not floating on it.
      expect(Math.abs(bgLum - pageLum)).toBeLessThan(0.25);
    }
  });

  test('keep their labels readable against their own fill', async ({ page }) => {
    await revealCard(page, 'dark');
    const { buttons } = await gradeColours(page);
    for (const b of buttons) {
      const contrast = Math.abs(luminance(b.color) - luminance(b.bg));
      expect(contrast).toBeGreaterThan(0.25);
    }
  });

  test('stay four distinguishable choices', async ({ page }) => {
    await revealCard(page, 'dark');
    const { buttons } = await gradeColours(page);
    expect(new Set(buttons.map((b) => b.bg)).size).toBe(4);
  });

  test('keep their touch targets', async ({ page }) => {
    await revealCard(page, 'dark');
    const { buttons } = await gradeColours(page);
    for (const b of buttons) expect(b.height).toBeGreaterThanOrEqual(44);
  });
});

// The band across the top of the flashcard — the second thing a device caught
// in dark mode, and the same class of bug as the grade buttons: a colour picked
// for white paper, drawn at full strength on a dark card. 8px of cream across
// the whole card width is not a mark, it is a lit surface.
//
// The band is drawn as an inset box-shadow (it follows the card's radius for
// free), so it is read out of the computed shadow rather than off an element.
async function stripColours(page) {
  return page.evaluate(() => {
    // COLOR <offsets…> [inset] — colours contain commas, so the layers cannot
    // simply be split on them.
    const LAYER = /((?:rgba?\([^)]*\)|color\([^)]*\)))((?:\s+-?[\d.]+px)+)(\s+inset)?/g;
    let best = null;
    for (const el of document.querySelectorAll('div')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.height < 200) continue;
      for (const m of (cs.boxShadow || '').matchAll(LAYER)) {
        if (!m[3]) continue;                       // not an inset layer
        const offsets = m[2].trim().split(/\s+/);  // x y blur spread
        if (offsets[1] !== '8px') continue;        // MARKER_HEIGHT
        const area = r.width * r.height;
        if (!best || area > best.area) {
          best = { area, strip: m[1], card: cs.backgroundColor, width: Math.round(r.width) };
        }
      }
    }
    return best && { ...best, body: getComputedStyle(document.body).backgroundColor };
  });
}

// The exact 8-bit triple a computed colour resolves to, in either notation.
function channels(value) {
  const m = value.match(/-?\d*\.?\d+/g);
  const nums = m.slice(0, 3).map(Number);
  const scale = value.indexOf('color(') === 0 ? 255 : 1;
  return nums.map((n) => Math.round(n * scale));
}

test.describe('the flashcard status band in dark mode', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => { await setTheme(page, 'dark'); });

  test('is a tint of the dark card, not a bright bar across it', async ({ page }) => {
    await revealCard(page, 'dark');
    const s = await stripColours(page);
    expect(s).not.toBe(null);

    expect(luminance(s.body)).toBeLessThan(0.3);     // genuinely dark mode
    // The finding, as a number. #E4DCCB — the old band — is ~0.87 here.
    expect(luminance(s.strip)).toBeLessThan(0.35);
    // And it belongs to the card it sits on rather than floating over it.
    expect(Math.abs(luminance(s.strip) - luminance(s.card))).toBeLessThan(0.25);
  });

  test('still says something — it is quiet, not invisible', async ({ page }) => {
    await revealCard(page, 'dark');
    const s = await stripColours(page);
    const [cr, cg, cb] = channels(s.card);
    const [sr, sg, sb] = channels(s.strip);
    // Separated from the card face by lightness or by hue, and in practice both.
    expect(Math.abs(sr - cr) + Math.abs(sg - cg) + Math.abs(sb - cb)).toBeGreaterThan(20);
    expect(s.strip).not.toBe(s.card);
  });

  test('spans the card, so its calm matters more than its colour', async ({ page }) => {
    await revealCard(page, 'dark');
    const s = await stripColours(page);
    // This is why 8px of a pale colour reads as a second surface: it is as wide
    // as the card. Kept as an assertion so a future "just make it thicker" has
    // to answer for it.
    expect(s.width).toBeGreaterThan(280);
  });
});

test.describe('the flashcard status band in light mode', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => { await setTheme(page, 'light'); });

  test('is exactly the colour it has always been', async ({ page }) => {
    await revealCard(page, 'light');
    const s = await stripColours(page);
    // The two card tones, unchanged: #7FA0B5 (first time) and #E4DCCB (review).
    // The dark-mode fix is a mix that resolves to precisely these on white
    // paper, so light mode has to come out byte-identical — anything else is a
    // regression dressed up as a fix.
    const rgb = channels(s.strip);
    expect([[127, 160, 181], [228, 220, 203]]).toContainEqual(rgb);
  });
});

test.describe('grade buttons in light mode', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => { await setTheme(page, 'light'); });

  test('are still the light, quiet tints they always were', async ({ page }) => {
    await revealCard(page, 'light');
    const { body, buttons } = await gradeColours(page);
    const pageLum = luminance(body);
    expect(pageLum).toBeGreaterThan(0.7);
    for (const b of buttons) {
      const bgLum = luminance(b.bg);
      expect(bgLum).toBeGreaterThan(0.7);      // light, as before
      expect(bgLum).toBeLessThanOrEqual(1);
      expect(Math.abs(luminance(b.color) - bgLum)).toBeGreaterThan(0.25);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    expect(new Set(buttons.map((b) => b.bg)).size).toBe(4);
  });
});
