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
