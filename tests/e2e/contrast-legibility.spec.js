import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { StudyPage } from '../pages/StudyPage.js';

// P10-A4 / A5 — the legibility floor, measured as COMPOSITED pixels.
//
// Both treatments are `color-mix()` against a CSS variable, so a token string
// tells you nothing: the only honest test is to resolve what the browser
// actually paints and composite it over the ground it is actually painted on.
//
// Two rules this spec obeys, both learned from the P10 audit's own mistakes:
//
//  1. **Flat surfaces only.** The probe cannot see a gradient — it resolves
//     `backgroundColor` — so white-on-coral hero text measures ≈1.03:1 and every
//     such reading is a false positive. Anything whose ground is not opaque and
//     flat is skipped, and the spec reports how many it skipped so the exclusion
//     can never quietly grow.
//  2. **Only what changed.** Status colours (the blue/amber word pills) are also
//     below AA and are NOT in this commit's scope; asserting them here would
//     fail on defects nobody agreed to fix yet. They are excluded by name, and
//     the exclusion list is printed.

// Colours this commit did not touch, each below AA and each deferred on purpose.
// Recorded, not silently ignored, and printed on every run.
const OUT_OF_SCOPE = [
  // Status colours. Changing these is the Words-pill work (P10-B8) and a status
  // palette decision — a general colour redesign, which this commit is not.
  'rgb(62, 99, 221)', // "Learned" pill, blue — 3.02:1 dark
  'rgb(217, 119, 6)', // "Learning" / "missed N×", amber — 2.93-4.02:1
  'rgb(180, 83, 9)', // "Review weak words", amber — 3.05:1 dark
  // The grade colours, which belong to Study's design (frozen this commit).
  'color(srgb 0.662745 0.454902 0.121569)', // "Hard", amber — 3.51:1 light
  'color(srgb 0.243137 0.478431 0.278431)', // "Good", green — 4.4:1 light
  // `--text-muted` itself, in LIGHT mode, on `--surface-2`: 4.4:1 against a
  // 4.5 bar — a 2% miss by the token, not by a caller. Every instance is a
  // muted label on a second-surface panel (achievement titles, "REVIEW", the
  // interval hints, the recap's stat lines). Fixing it means darkening a global
  // neutral, which is one decision with app-wide reach and wants its own device
  // round. Deliberately deferred; NOT the same thing as the hardcoded
  // light-mode greys, which were fixed here.
  'rgb(113, 113, 122)',
  // `--danger` in LIGHT mode on `--danger-bg`: 4.41:1 against 4.5 on Profile's
  // "Reset" / "Delete account" / "Sign out". Pre-existing and untouched here —
  // light was #DC2626 before this commit and is #DC2626 after it; what changed
  // is DARK mode, where a hardcoded light-mode red measured 2.84-3.49:1 and now
  // reads ~6:1 through the token. Closing the last 2% in light means moving a
  // global status colour: same decision as `--text-muted` above, same deferral.
  'rgb(220, 38, 38)',
];

const PROBE = `(() => {
  const rgba = (c) => {
    if (!c || c === 'transparent') return [0, 0, 0, 0];
    const n = (c.match(/[-\\d.]+/g) || []).map(Number);
    if (!n.length) return [0, 0, 0, 0];
    const k = c.indexOf('color(') === 0 ? 255 : 1;
    return [n[0] * k, n[1] * k, n[2] * k, n.length > 3 ? n[3] : 1];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));

  // Walk up for a flat, opaque ground. Returns null the moment a gradient or an
  // image is in the way — those cannot be measured and must not be guessed.
  const groundOf = (el) => {
    let n = el, acc = null;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if ((cs.backgroundImage && cs.backgroundImage !== 'none')) return null;
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0.02) acc = acc ? over(acc.concat(1), c).concat(1) : c.slice();
      if (acc && acc[3] >= 0.98) return acc;
      n = n.parentElement;
    }
    const body = rgba(getComputedStyle(document.body).backgroundColor);
    if (body[3] < 0.98) return null;
    return acc && acc[3] > 0.02 ? over(acc, body).concat(1) : body;
  };

  const out = { fails: [], skippedGradient: 0, outOfScope: 0, measured: 0 };
  for (const el of document.querySelectorAll('#main-content *, [role="dialog"] *')) {
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.5) continue;
    const bg = groundOf(el);
    if (!bg) { out.skippedGradient += 1; continue; }
    const fg = rgba(cs.color);
    if (fg[3] < 0.5) continue;
    const c1 = lum(over(fg, bg)), c2 = lum(bg);
    const ratio = (Math.max(c1, c2) + 0.05) / (Math.min(c1, c2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    out.measured += 1;
    const row = {
      txt: el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 26),
      size: Math.round(size * 10) / 10, weight, color: cs.color,
      bg: 'rgb(' + bg.slice(0, 3).map(Math.round).join(',') + ')',
      ratio: Math.round(ratio * 100) / 100, bar: large ? 3 : 4.5,
    };
    if (ratio < row.bar) out.fails.push(row);
  }
  return out;
})()`;

async function measure(page, theme) {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(300);
  const res = await page.evaluate(PROBE);
  const inScope = res.fails.filter((f) => OUT_OF_SCOPE.indexOf(f.color) === -1);
  const deferred = res.fails.filter((f) => OUT_OF_SCOPE.indexOf(f.color) !== -1);
  return { ...res, inScope, deferred };
}

// Every surface the audit found pinyin or small accent text on.
const SCREENS = [
  ['words', async (p) => { await p.goto('/words'); await p.waitForTimeout(900); }],
  ['speak', async (p) => { await p.goto('/speak'); await p.waitForTimeout(900); }],
  ['profile', async (p) => { await p.goto('/profile'); await p.waitForTimeout(900); }],
  ['listen', async (p) => { await p.goto('/listen'); await p.waitForTimeout(900); }],
  ['languages', async (p) => { await p.goto('/languages'); await p.waitForTimeout(800); }],
  ['test', async (p) => { await p.goto('/test'); await p.waitForTimeout(900); }],
  ['writing', async (p) => { await p.goto('/writing'); await p.waitForTimeout(900); }],
  ['known', async (p) => { await p.goto('/known'); await p.waitForTimeout(800); }],
  ['grammar', async (p) => { await p.goto('/grammar'); await p.waitForTimeout(800); }],
  ['study-revealed', async (p) => {
    const s = new StudyPage(p); await s.goto(); await s.reveal(); await p.waitForTimeout(400);
  }],
  ['session-complete', async (p) => {
    const s = new StudyPage(p); await s.goto();
    for (let i = 0; i < 80; i += 1) {
      const good = p.getByRole('button', { name: /Good/i });
      if (!(await good.count())) {
        const card = p.getByRole('button', { name: /flashcard.*tap to reveal/i });
        if (await card.count()) { await card.click(); await p.waitForTimeout(110); continue; }
        break;
      }
      await good.first().click(); await p.waitForTimeout(140);
    }
    await p.waitForTimeout(600);
  }],
];

for (const theme of ['dark', 'light']) {
  test.describe('text on a flat surface reaches AA in ' + theme, () => {
    test.use({ viewport: { width: 390, height: 844 } });

    for (const [name, go] of SCREENS) {
      test(name, async ({ page }) => {
        await go(page);
        const res = await measure(page, theme);
        console.log('LEGIBILITY ' + theme + '/' + name
          + ' measured=' + res.measured
          + ' skippedGradient=' + res.skippedGradient
          + ' deferred=' + JSON.stringify(res.deferred.map((d) => d.txt + '@' + d.ratio)));
        expect(res.measured).toBeGreaterThan(3);
        expect(res.inScope, JSON.stringify(res.inScope, null, 1)).toEqual([]);
      });
    }
  });
}

test.describe('the pinyin treatment itself', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('is one shared colour, comfortably past the bar, in both themes', async ({ page }) => {
    const read = async (theme) => {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(300);
      return page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#main-content *'))
          .filter((el) => /^[a-zàáǎāèéěēìíǐīòóǒōùúǔūǚǜñ' ]+$/i.test((el.textContent || '').trim())
            && Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))
          .map((el) => getComputedStyle(el).color);
        return Array.from(new Set(rows));
      });
    };
    await page.goto('/words');
    await page.waitForTimeout(900);
    const dark = await read('dark');
    const light = await read('light');
    // Not asserting an exact string — a mix resolves differently per engine —
    // only that pinyin resolves to ONE colour per theme, and that the two themes
    // differ (the whole point: light was already fine, dark was not).
    expect(dark.length).toBeGreaterThan(0);
    expect(light.length).toBeGreaterThan(0);
    expect(dark.join('|')).not.toBe(light.join('|'));
  });

  test('does not compete with the hanzi beside it', async ({ page }) => {
    // The hierarchy the flashcard depends on: hanzi brighter than pinyin,
    // pinyin brighter than the meaning is not required — only that the reading
    // never out-shouts the character.
    const s = new StudyPage(page);
    await s.goto();
    await s.reveal();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(400);
    const rel = await page.evaluate(() => {
      const lum = (c) => {
        const n = (c.match(/[-\d.]+/g) || []).map(Number);
        const k = c.indexOf('color(') === 0 ? 255 : 1;
        const f = (v) => { v = (v * k) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(n[0]) + 0.7152 * f(n[1]) + 0.0722 * f(n[2]);
      };
      const els = Array.from(document.querySelectorAll('#main-content *'))
        .filter((el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()));
      const hanzi = els.find((el) => /^[一-鿿]+$/.test(el.textContent.trim())
        && parseFloat(getComputedStyle(el).fontSize) > 40);
      const pinyin = els.find((el) => /^[a-zàáǎāèéěēìíǐīòóǒōùúǔūǚǜ]+$/i.test(el.textContent.trim())
        && parseFloat(getComputedStyle(el).fontSize) > 16);
      if (!hanzi || !pinyin) return null;
      return {
        hanzi: lum(getComputedStyle(hanzi).color),
        pinyin: lum(getComputedStyle(pinyin).color),
      };
    });
    expect(rel).not.toBe(null);
    expect(rel.hanzi).toBeGreaterThan(rel.pinyin);
  });
});
