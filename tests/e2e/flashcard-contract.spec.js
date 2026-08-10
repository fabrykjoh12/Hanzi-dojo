import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { StudyPage } from '../pages/StudyPage.js';

// The flashcard's contract with the rest of the app.
//
// `Flashcard` and `GradeRow` were lifted out of Study.jsx so the onboarding
// tutorial can show the REAL card rather than a lookalike — a lookalike is how
// a learner ends up relearning a control they were already taught. That only
// works while the two stay one thing, and a screenshot cannot tell you they
// have drifted: it tells you a pixel changed.
//
// So this spec pins the card's *identity* — the geometry, the labels, the
// controls and the states — measured on the real Study screen. When the
// tutorial lands, it is held to the same assertions, and any divergence fails
// here rather than on a device.

const PHONES = [
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone SE', width: 320, height: 568 },
];

async function cardContract(page) {
  return page.evaluate(() => {
    // The card is the element carrying the marker band — an inset shadow whose
    // second offset is MARKER_HEIGHT. Nothing else in the app draws one.
    const card = Array.from(document.querySelectorAll('div')).find((el) => {
      const bs = getComputedStyle(el).boxShadow || '';
      return bs.includes('inset') && /\s0px\s8px\s0px\s0px\s+inset/.test(bs);
    });
    if (!card) return null;
    const cs = getComputedStyle(card);
    const r = card.getBoundingClientRect();
    const pill = card.querySelector('span');
    return {
      radius: cs.borderTopLeftRadius,
      background: cs.backgroundColor,
      hasBand: (cs.boxShadow || '').includes('inset'),
      role: card.getAttribute('role'),
      label: card.getAttribute('aria-label'),
      live: card.getAttribute('aria-live'),
      cursor: cs.cursor,
      width: Math.round(r.width),
      height: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      pill: pill ? pill.textContent.trim() : null,
      // studyLayout drops the prompt line first on a short phone — the grade
      // buttons are never negotiable, a sentence of encouragement is. So this
      // is 'front' | 'back' | null, and null is a legitimate answer.
      footer: card.textContent.includes('Recall first, then reveal')
        ? 'front'
        : (card.textContent.includes('How well did you remember this?') ? 'back' : null),
    };
  });
}

async function gradeContract(page) {
  return page.evaluate(() => {
    const names = ['Again', 'Hard', 'Good', 'Easy'];
    const buttons = Array.from(document.querySelectorAll('button'))
      .filter((b) => names.some((n) => (b.textContent || '').trim().startsWith(n)));
    if (!buttons.length) return null;
    const row = buttons[0].parentElement;
    const rowStyle = getComputedStyle(row);
    return {
      columns: rowStyle.gridTemplateColumns.split(' ').length,
      display: rowStyle.display,
      buttons: buttons.map((b) => {
        const cs = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        // Two spans: the grade's name, then its schedule preview.
        const spans = b.querySelectorAll('span');
        return {
          label: spans[0] ? spans[0].textContent.trim() : null,
          interval: spans[1] ? spans[1].textContent.trim() : '',
          bg: cs.backgroundColor,
          height: Math.round(r.height),
          radius: cs.borderTopLeftRadius,
          bottom: Math.round(r.bottom),
        };
      }),
    };
  });
}

for (const phone of PHONES) {
  test.describe('The flashcard on ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('is one card: the surface, the status band, the radius', async ({ page }) => {
      const study = new StudyPage(page);
      await study.goto();
      const c = await cardContract(page);
      expect(c).not.toBe(null);
      expect(c.radius).toBe('26px');
      expect(c.hasBand).toBe(true);
      // FIRST TIME or REVIEW — never a third state, and never a struggling one.
      expect(['FIRST TIME', 'REVIEW']).toContain(c.pill);
      expect(c.width).toBeLessThanOrEqual(phone.width);
      expect(c.top).toBeGreaterThanOrEqual(0);
    });

    test('announces itself as tappable before the reveal, and not after', async ({ page }) => {
      const study = new StudyPage(page);
      await study.goto();

      const front = await cardContract(page);
      expect(front.role).toBe('button');
      expect(front.label).toMatch(/flashcard — tap to reveal the answer/i);
      expect(front.cursor).toBe('pointer');
      expect(front.live).toBe('polite');
      if (front.footer) expect(front.footer).toBe('front');

      await study.reveal();
      const back = await cardContract(page);
      // Revealed: no longer a control, so a screen reader does not offer a tap
      // that does nothing.
      expect(back.role).toBe(null);
      expect(back.label).toBe(null);
      expect(back.cursor).toBe('default');
      if (back.footer) expect(back.footer).toBe('back');
      // The two prompts are never both on screen, and never swapped.
      expect(front.footer === null).toBe(back.footer === null);
    });

    test('offers Replay and the speed control only once revealed', async ({ page }) => {
      const study = new StudyPage(page);
      await study.goto();
      expect(await page.getByRole('button', { name: 'Replay audio' }).count()).toBe(0);

      await study.reveal();
      const replay = page.getByRole('button', { name: 'Replay audio' });
      const speed = page.getByRole('button', { name: /Playback speed .+ Tap to change/ });
      // One replay, one speed. The turtle is gone and must not come back.
      //
      // Retrying rather than counting once: a brand-new card reaches the screen
      // from the queue and has its vocabulary merged in a moment later, so the
      // clip — and therefore the controls — can arrive on the second render.
      await expect(replay).toHaveCount(1);
      await expect(speed).toHaveCount(1);
      // The label names the CURRENT rate — a glyph alone reads as a value, not
      // a control, to anyone who cannot see it change.
      expect(await speed.getAttribute('aria-label')).toMatch(/^Playback speed \d(\.\d+)?×\. Tap to change\.$/);
    });

    test('grades in one row of four, each its own colour, each tappable', async ({ page }) => {
      const study = new StudyPage(page);
      await study.goto();
      await study.reveal();
      const g = await gradeContract(page);

      expect(g.display).toBe('grid');
      expect(g.columns).toBe(4);          // one row on every width, never 2x2
      expect(g.buttons.map((b) => b.label)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
      // Four distinguishable fills, and each carries its own schedule preview.
      expect(new Set(g.buttons.map((b) => b.bg)).size).toBe(4);
      for (const b of g.buttons) {
        expect(b.interval.length).toBeGreaterThan(0);
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.radius).toBe('16px');
        // …and on screen. This is the failure the mobile-fit specs exist for,
        // asserted here too because the extraction could reintroduce it.
        expect(b.bottom).toBeLessThanOrEqual(phone.height);
      }
    });
  });
}
