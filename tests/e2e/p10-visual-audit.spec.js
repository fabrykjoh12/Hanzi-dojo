import fs from 'node:fs';
import { authedTest as test } from '../fixtures/mockSupabase.js';
import { StudyPage } from '../pages/StudyPage.js';

// P10 — the visual-system audit's MEASURING pass. Temporary; delete when the
// audit is signed off (docs/P10-VISUAL-AUDIT.md).
//
// This exists because a screenshot cannot tell you that a screen uses nine type
// sizes, that its gutter is 16px where the last screen's was 20, or that a
// caption is at 3.1:1. It walks every learner-facing screen at three phone
// widths in both themes and writes one JSON record per state, so the audit's
// claims are arithmetic rather than impressions.
//
// It asserts almost nothing on purpose: an audit that fails the suite tells you
// nothing new. The two things it does assert are the ones that are never
// acceptable — horizontal overflow, and content trapped under the tab bar.

// Gated: 150 states at ~3.5 minutes has no business running on every pull
// request. Run it on demand — `P10_AUDIT=1 npx playwright test p10-visual-audit`
// — and delete the file once the audit is signed off.
const ENABLED = !!process.env.P10_AUDIT;

const OUT = process.env.P10_OUT || '/tmp/p10';
const SHOTS = OUT + '/shots';

const PHONES = [
  { key: '390', width: 390, height: 844, themes: ['dark', 'light'], shots: true },
  { key: '320', width: 320, height: 568, themes: ['dark', 'light'], shots: true },
  { key: '430', width: 430, height: 932, themes: ['dark'], shots: false },
];

// Every learner-facing destination, and how to get to it. Admin views (hq,
// dashboard, dev) are deliberately out of scope, as are the two frozen tracks'
// script drills.
const SCREENS = [
  { id: 'home', go: async (p) => { await p.goto('/'); await p.getByText('Today', { exact: true }).waitFor(); } },
  { id: 'stories', go: async (p) => { await p.goto('/stories'); await p.waitForTimeout(900); } },
  { id: 'practice', go: async (p) => { await p.goto('/practice'); await p.waitForTimeout(700); } },
  { id: 'profile', go: async (p) => { await p.goto('/profile'); await p.waitForTimeout(800); } },
  { id: 'settings', go: async (p) => { await p.goto('/settings'); await p.waitForTimeout(600); } },
  { id: 'languages', go: async (p) => { await p.goto('/languages'); await p.waitForTimeout(600); } },
  { id: 'words', go: async (p) => { await p.goto('/words'); await p.waitForTimeout(800); } },
  { id: 'known', go: async (p) => { await p.goto('/known'); await p.waitForTimeout(800); } },
  { id: 'dictionary', go: async (p) => { await p.goto('/dictionary'); await p.waitForTimeout(700); } },
  { id: 'analyzer', go: async (p) => { await p.goto('/analyzer'); await p.waitForTimeout(600); } },
  { id: 'grammar', go: async (p) => { await p.goto('/grammar'); await p.waitForTimeout(700); } },
  { id: 'listen', go: async (p) => { await p.goto('/listen'); await p.waitForTimeout(800); } },
  { id: 'youtube', go: async (p) => { await p.goto('/youtube'); await p.waitForTimeout(800); } },
  { id: 'weak', go: async (p) => { await p.goto('/weak'); await p.waitForTimeout(900); } },
  { id: 'test', go: async (p) => { await p.goto('/test'); await p.waitForTimeout(900); } },
  { id: 'writing', go: async (p) => { await p.goto('/writing'); await p.waitForTimeout(900); } },
  { id: 'speak', go: async (p) => { await p.goto('/speak'); await p.waitForTimeout(800); } },
  { id: 'fillblank', go: async (p) => { await p.goto('/fillblank'); await p.waitForTimeout(900); } },
  { id: 'builder', go: async (p) => { await p.goto('/builder'); await p.waitForTimeout(800); } },
  { id: 'tones', go: async (p) => { await p.goto('/tones'); await p.waitForTimeout(800); } },
  { id: 'strokes', go: async (p) => { await p.goto('/strokes'); await p.waitForTimeout(800); } },
  { id: 'grammarpractice', go: async (p) => { await p.goto('/grammarpractice'); await p.waitForTimeout(800); } },
  { id: 'notfound', go: async (p) => { await p.goto('/definitely-not-a-route'); await p.waitForTimeout(600); } },

  // States that are not routes.
  {
    id: 'study-front',
    go: async (p) => { await new StudyPage(p).goto(); await p.waitForTimeout(400); },
  },
  {
    id: 'study-revealed',
    go: async (p) => {
      const s = new StudyPage(p);
      await s.goto();
      await s.reveal();
      await p.waitForTimeout(400);
    },
  },
  {
    id: 'study-paused',
    go: async (p) => {
      const s = new StudyPage(p);
      await s.goto();
      await s.reveal();
      await s.gradeGood.first().click();
      await p.waitForTimeout(300);
      const x = p.getByRole('button', { name: /close|exit|end session/i }).first();
      if (await x.count()) await x.click();
      await p.waitForTimeout(700);
    },
  },
  {
    id: 'session-complete',
    go: async (p) => {
      const s = new StudyPage(p);
      await s.goto();
      for (let i = 0; i < 80; i += 1) {
        const good = p.getByRole('button', { name: /Good/i });
        if (!(await good.count())) {
          const card = p.getByRole('button', { name: /flashcard.*tap to reveal/i });
          if (await card.count()) { await card.click(); await p.waitForTimeout(110); continue; }
          break;
        }
        await good.first().click();
        await p.waitForTimeout(140);
      }
      await p.waitForTimeout(700);
    },
  },
  {
    id: 'series',
    go: async (p) => {
      await p.goto('/stories');
      await p.waitForTimeout(900);
      const poster = p.getByRole('button', { name: /月下的朋友/ }).first();
      if (await poster.count()) { await poster.click(); await p.waitForTimeout(900); }
    },
  },
  {
    id: 'reader',
    go: async (p) => {
      await p.goto('/stories');
      await p.waitForTimeout(900);
      const poster = p.getByRole('button', { name: /月下的朋友/ }).first();
      if (await poster.count()) { await poster.click(); await p.waitForTimeout(800); }
      const ch = p.getByRole('button', { name: /Chapter 1/ }).first();
      if (await ch.count()) { await ch.click(); await p.waitForTimeout(1200); }
    },
  },
  {
    id: 'more-sheet',
    root: '[role="dialog"][aria-label="More menu"]',
    go: async (p) => {
      await p.goto('/');
      await p.getByText('Today', { exact: true }).waitFor();
      await p.getByRole('button', { name: 'More' }).click();
      await p.waitForTimeout(500);
    },
  },
];

// ── the probe ─────────────────────────────────────────────────────────────
// One evaluate, run in the page. Everything it reports is measured from
// computed style and layout boxes.
async function probe(page, rootSel) {
  // Overlap has to be read at the BOTTOM of the scroll: `main` reserves the bar,
  // so comparing document coordinates against a fixed bar's viewport position
  // reports nonsense on any screen that scrolls.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(250);
  const atBottom = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary"]');
    const main = document.querySelector('#main-content') || document.body;
    const els = Array.from(main.querySelectorAll('*')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && (el.textContent || '').trim().length > 0;
    });
    const lowest = Math.max(-Infinity, ...els.map((el) => el.getBoundingClientRect().bottom));
    const navTop = nav ? nav.getBoundingClientRect().top : null;
    return {
      // Positive = real content is behind the tab bar at the end of the scroll.
      underNav: navTop === null || !Number.isFinite(lowest) ? null : Math.round(lowest - navTop),
      // How much clear space is left below the last content — a "too close to
      // the bar" reading that does not depend on a screenshot.
      clearance: navTop === null || !Number.isFinite(lowest) ? null : Math.round(navTop - lowest),
    };
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const main = await page.evaluate((sel) => {
    const root = sel ? document.querySelector(sel) : null;
    return root ? true : false;
  }, rootSel || null);
  void main;

  const result = await page.evaluate((sel) => {
    const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };
    // A color-mix() computes to color(srgb 0–1); a token to rgb(0–255).
    const rgba = (c) => {
      if (!c || c === 'transparent') return [0, 0, 0, 0];
      const n = (c.match(/[-\d.]+/g) || []).map(Number);
      if (!n.length) return [0, 0, 0, 0];
      const k = c.indexOf('color(') === 0 ? 255 : 1;
      return [n[0] * k, n[1] * k, n[2] * k, n.length > 3 ? n[3] : 1];
    };
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (fg, bg) => {
      const a = fg[3];
      return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
    };
    // Walk up for the first background that actually paints.
    const groundOf = (el) => {
      let n = el, acc = null;
      while (n && n !== document.documentElement) {
        const c = rgba(getComputedStyle(n).backgroundColor);
        if (c[3] > 0.02) acc = acc ? over(acc.concat(1), c).concat(1) : c.slice();
        if (acc && acc[3] >= 0.98) return acc;
        n = n.parentElement;
      }
      const body = rgba(getComputedStyle(document.body).backgroundColor);
      return acc && acc[3] > 0.02 ? over(acc, body).concat(1) : body;
    };
    const contrast = (el) => {
      const cs = getComputedStyle(el);
      const fg = rgba(cs.color);
      if (fg[3] < 0.05) return null;
      const bg = groundOf(el);
      const c1 = lum(over(fg, bg)), c2 = lum(bg);
      const hi = Math.max(c1, c2), lo = Math.min(c1, c2);
      return round((hi + 0.05) / (lo + 0.05), 2);
    };

    const de = document.documentElement;
    // The More sheet lives outside #main-content (it is a fixed dialog), so a
    // screen can nominate its own root or it gets measured as the page behind it.
    const main = (sel && document.querySelector(sel))
      || document.querySelector('#main-content') || document.body;
    const nav = document.querySelector('nav[aria-label="Primary"]');
    const all = Array.from(main.querySelectorAll('*')).filter(vis);

    // Text-bearing leaf-ish elements only: an element whose own text nodes
    // carry content, so a wrapper is not counted as if it were a label.
    const textEls = all.filter((el) => Array.from(el.childNodes)
      .some((n) => n.nodeType === 3 && n.textContent.trim().length > 0));

    const typeTally = {};
    const weights = new Set();
    const upper = [];
    const tiny = [];
    const lowContrast = [];
    for (const el of textEls) {
      const cs = getComputedStyle(el);
      const size = round(parseFloat(cs.fontSize));
      const key = size + '/' + cs.fontWeight;
      typeTally[key] = (typeTally[key] || 0) + 1;
      weights.add(Number(cs.fontWeight));
      const txt = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 42);
      if (cs.textTransform === 'uppercase' || (parseFloat(cs.letterSpacing) > 0.6 && txt === txt.toUpperCase())) {
        upper.push({ txt, size });
      }
      if (size < 11.5) tiny.push({ txt, size });
      const ratio = contrast(el);
      // Large text gets the 3:1 bar, body text 4.5:1 (WCAG AA).
      const big = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio !== null && ratio < (big ? 3 : 4.5)) {
        lowContrast.push({ txt, size, weight: Number(cs.fontWeight), ratio, bar: big ? 3 : 4.5 });
      }
    }

    // "Container": something drawn as a surface — a radius plus either a border
    // or its own background — which is what reads as a card on a phone.
    const containers = all.filter((el) => {
      const cs = getComputedStyle(el);
      const r = parseFloat(cs.borderTopLeftRadius) || 0;
      if (r < 6) return false;
      const hasBorder = parseFloat(cs.borderTopWidth) > 0 && rgba(cs.borderTopColor)[3] > 0.03;
      const hasBg = rgba(cs.backgroundColor)[3] > 0.03;
      const box = el.getBoundingClientRect();
      return (hasBorder || hasBg) && box.width > 40 && box.height > 24;
    });
    const radii = {};
    const borderColors = {};
    let maxNest = 0;
    for (const el of containers) {
      const cs = getComputedStyle(el);
      const r = round(parseFloat(cs.borderTopLeftRadius));
      radii[r] = (radii[r] || 0) + 1;
      if (parseFloat(cs.borderTopWidth) > 0 && rgba(cs.borderTopColor)[3] > 0.03) {
        borderColors[cs.borderTopColor] = (borderColors[cs.borderTopColor] || 0) + 1;
      }
      let depth = 0, n = el.parentElement;
      while (n && n !== main) { if (containers.indexOf(n) !== -1) depth += 1; n = n.parentElement; }
      if (depth > maxNest) maxNest = depth;
    }

    const tappable = all.filter((el) => {
      const tag = el.tagName.toLowerCase();
      return tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button'
        || tag === 'input' || tag === 'select';
    });
    const btnHeights = {}, btnRadii = {}, btnSizes = {};
    const small = [];
    const unlabelled = [];
    for (const el of tappable) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      btnHeights[Math.round(r.height)] = (btnHeights[Math.round(r.height)] || 0) + 1;
      btnRadii[round(parseFloat(cs.borderTopLeftRadius))] = (btnRadii[round(parseFloat(cs.borderTopLeftRadius))] || 0) + 1;
      btnSizes[round(parseFloat(cs.fontSize))] = (btnSizes[round(parseFloat(cs.fontSize))] || 0) + 1;
      if (r.height < 44 || r.width < 44) {
        small.push({
          txt: (el.textContent || '').trim().slice(0, 24) || el.getAttribute('aria-label') || '(icon)',
          w: Math.round(r.width), h: Math.round(r.height),
        });
      }
      const named = (el.textContent || '').trim() || el.getAttribute('aria-label')
        || el.getAttribute('title') || el.getAttribute('placeholder');
      if (!named) unlabelled.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 30) });
    }

    const svgs = all.filter((el) => el.tagName.toLowerCase() === 'svg');
    const strokeW = {};
    const iconSizes = {};
    for (const s of svgs) {
      const w = s.getAttribute('stroke-width') || getComputedStyle(s).strokeWidth || '';
      if (w) strokeW[round(parseFloat(w), 2)] = (strokeW[round(parseFloat(w), 2)] || 0) + 1;
      const r = s.getBoundingClientRect();
      iconSizes[Math.round(r.width)] = (iconSizes[Math.round(r.width)] || 0) + 1;
    }

    const blurs = all.filter((el) => {
      const cs = getComputedStyle(el);
      return (cs.backdropFilter && cs.backdropFilter !== 'none')
        || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none');
    }).length;
    const animated = all.filter((el) => {
      const cs = getComputedStyle(el);
      return (cs.animationName && cs.animationName !== 'none');
    }).map((el) => getComputedStyle(el).animationName);

    // Headings, in document order — the outline a screen reader hears.
    const headings = Array.from(main.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .filter(vis).map((h) => ({
        lvl: Number(h.tagName[1]),
        txt: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 40),
        size: round(parseFloat(getComputedStyle(h).fontSize)),
        weight: Number(getComputedStyle(h).fontWeight),
      }));

    // The biggest text on screen, whatever element it is — the de-facto title.
    let title = null;
    for (const el of textEls) {
      const size = round(parseFloat(getComputedStyle(el).fontSize));
      if (!title || size > title.size) {
        title = { size, weight: Number(getComputedStyle(el).fontWeight), txt: el.textContent.trim().slice(0, 40) };
      }
    }

    const mcs = getComputedStyle(main);

    // The EFFECTIVE gutter: `main` carries no horizontal padding — every screen
    // pads itself — so the number that matters is where a screen's own content
    // blocks actually start. Take the widest blocks (the ones that define the
    // column) and report the inset they agree on, plus whether they agree at all.
    // Only blocks wide enough to BE the column count: at 0.5×vw an inner text
    // run qualifies, and the mode then reports a row's text inset as if it were
    // the page gutter (Settings measured 101px that way). 0.8×vw is the column.
    const wide = all.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width >= window.innerWidth * 0.8 && r.width <= window.innerWidth + 1 && r.height > 16;
    });
    const insets = {};
    for (const el of wide) {
      const left = round(el.getBoundingClientRect().left);
      insets[left] = (insets[left] || 0) + 1;
    }
    const insetEntries = Object.entries(insets).sort((a, b) => b[1] - a[1]);
    // The narrowest inset any column-width block uses — the screen's real edge.
    const minInset = insetEntries.length
      ? Math.min(...insetEntries.map((e) => Number(e[0]))) : null;

    // Paragraphs long enough to read as web prose rather than app copy.
    const prose = textEls.filter((el) => el.textContent.trim().length > 180)
      .map((el) => ({ len: el.textContent.trim().length, txt: el.textContent.trim().slice(0, 60) }));

    const pills = containers.filter((el) => {
      const cs = getComputedStyle(el);
      const r = parseFloat(cs.borderTopLeftRadius) || 0;
      const box = el.getBoundingClientRect();
      return r >= box.height / 2 - 1 && box.height < 44;
    }).length;

    return {
      overflowX: de.scrollWidth - de.clientWidth,
      docH: de.scrollHeight,
      viewportH: window.innerHeight,
      scrolls: de.scrollHeight > window.innerHeight + 2,
      gutter: {
        mainPadding: [round(parseFloat(mcs.paddingLeft)), round(parseFloat(mcs.paddingRight))],
        // The inset most of the screen's own column-width blocks use…
        effective: insetEntries.length ? Number(insetEntries[0][0]) : null,
        min: minInset,
        // …and every other inset present, which is where "the gutter wanders"
        // shows up as a number instead of a feeling.
        allInsets: insetEntries.slice(0, 6),
        distinctInsets: insetEntries.length,
      },
      elements: all.length,
      title,
      headings,
      type: {
        distinct: Object.keys(typeTally).length,
        tally: typeTally,
        weights: Array.from(weights).sort((a, b) => a - b),
        uppercase: upper.length,
        uppercaseSamples: upper.slice(0, 6),
        tiny: tiny.length,
        tinySamples: tiny.slice(0, 8),
      },
      surfaces: {
        containers: containers.length,
        radii,
        borderColors,
        maxNesting: maxNest,
        pills,
        blurs,
      },
      buttons: {
        count: tappable.length,
        heights: btnHeights,
        radii: btnRadii,
        fontSizes: btnSizes,
        under44: small.length,
        under44Samples: small.slice(0, 10),
        unlabelled: unlabelled.length,
      },
      icons: { count: svgs.length, strokeWidths: strokeW, sizes: iconSizes },
      motion: { animatedNow: animated.length, names: Array.from(new Set(animated)).slice(0, 6) },
      a11y: {
        lowContrast: lowContrast.length,
        lowContrastWorst: lowContrast.sort((a, b) => a.ratio - b.ratio).slice(0, 8),
        headingLevels: Array.from(new Set(headings.map((h) => h.lvl))).sort(),
      },
      webish: { longParagraphs: prose.length, proseSamples: prose.slice(0, 3) },
      hasNav: !!nav,
    };
  }, rootSel || null);

  return { ...result, bottom: atBottom };
}

for (const phone of PHONES) {
  for (const theme of phone.themes) {
    test.describe('P10 audit · ' + phone.key + ' · ' + theme, () => {
      test.skip(!ENABLED, 'audit pass — set P10_AUDIT=1 to run');
      test.use({ viewport: { width: phone.width, height: phone.height } });

      for (const screen of SCREENS) {
        test(screen.id, async ({ page }) => {
          const errors = [];
          page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
          page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 120)));

          await page.emulateMedia({ colorScheme: theme });
          await page.addInitScript((t) => {
            document.addEventListener('DOMContentLoaded', () => {
              document.documentElement.setAttribute('data-theme', t);
            });
          }, theme);

          let reached = true;
          try {
            await screen.go(page);
          } catch (e) {
            reached = false;
            errors.push('nav: ' + String(e.message).slice(0, 120));
          }
          await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
          await page.waitForTimeout(350);

          const data = reached ? await probe(page, screen.root) : null;
          const record = {
            screen: screen.id, width: phone.width, height: phone.height, theme,
            reached, url: page.url(), consoleErrors: errors.slice(0, 6), data,
          };
          fs.mkdirSync(OUT, { recursive: true });
          fs.writeFileSync(
            OUT + '/' + screen.id + '.' + phone.key + '.' + theme + '.json',
            JSON.stringify(record, null, 1),
          );

          if (phone.shots) {
            fs.mkdirSync(SHOTS, { recursive: true });
            await page.screenshot({
              path: SHOTS + '/' + screen.id + '.' + phone.key + '.' + theme + '.png',
            });
          }
        });
      }
    });
  }
}
