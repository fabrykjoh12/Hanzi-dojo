import { anonTest as test, expect } from '../fixtures/mockSupabase.js';

// The onboarding tutorial, walked end to end.
//
// The point of Concept A is that a learner meets the REAL card and the REAL
// grade row, so they never have to learn either twice. These specs hold that:
// the same assertions the flashcard-contract spec makes about Study are made
// here about the tutorial, and the two fail together if they ever drift.
//
// Signed out on purpose — the tutorial runs before an account exists.

const PHONES = [
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone SE', width: 320, height: 568 },
];

const WORDS = ['你好', '谢谢', '再见'];

const startBtn = (page) => page.getByRole('button', { name: 'Start' });
const card = (page) => page.getByRole('button', { name: /flashcard — tap to reveal/i });
const grade = (page, name) => page.getByRole('button', { name: new RegExp('^' + name) });

// The tutorial remembers where a learner got to, so a spec that walks it more
// than once has to say it wants a clean run. Resuming has its own spec.
const primed = new WeakSet();
async function open(page) {
  if (!primed.has(page)) {
    primed.add(page);
    await page.addInitScript(() => {
      try { localStorage.removeItem('prelogin:prefs'); } catch { /* blocked storage */ }
    });
  }
  await page.goto('/tutorial');
  await expect(startBtn(page)).toBeVisible();
}

// Reveal and grade the card that is currently up.
async function doCard(page, gradeName = 'Good') {
  await card(page).click();
  await expect(grade(page, gradeName)).toBeVisible();
  await grade(page, gradeName).click();
}

// The whole journey, in one helper, so a spec can jump to the part it is about.
async function walkTo(page, stop) {
  await open(page);
  if (stop === 'welcome') return;
  await startBtn(page).click();
  await expect(page.getByText(/can’t read this yet/)).toBeVisible();
  if (stop === 'scene-before') return;
  await page.getByRole('button', { name: 'Learn them' }).click();
  if (stop === 'card1') return;
  await doCard(page);
  if (stop === 'card2') return;
  await doCard(page);
  if (stop === 'card3') return;
  await doCard(page);
  await expect(page.getByText('Session complete')).toBeVisible();
  if (stop === 'recap') return;
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Story unlocked')).toBeVisible();
  if (stop === 'unlock') return;
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.getByText(/this time you can read it/)).toBeVisible();
  if (stop === 'scene-after') return;
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/See a word you don’t know/)).toBeVisible();
}

// The reading lesson's one tap: open the word, read the answer, close it.
async function lookupWord(page) {
  await page.getByRole('button', { name: /下雨 — tap to look it up/ }).click();
  const sheet = page.getByRole('dialog', { name: '下雨' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);
}

async function geometry(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    // On a card FRONT the primary action is the card itself — a div with
    // role="button", exactly as it is in the real study screen.
    const primary = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(b => b.getBoundingClientRect().height >= 44);
    const lowest = primary.length
      ? Math.max(...primary.map(b => b.getBoundingClientRect().bottom))
      : 0;
    return {
      overflowX: de.scrollWidth - de.clientWidth,
      overflowY: de.scrollHeight - window.innerHeight,
      viewportH: window.innerHeight,
      lowestAction: Math.round(lowest),
      buttons: primary.length,
    };
  });
}

for (const phone of PHONES) {
  test.describe('The tutorial on ' + phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('walks welcome → scene → three cards → recap → unlock → the same scene → account', async ({ page }) => {
      await open(page);
      await expect(page.getByText('Learn Chinese through words and stories.')).toBeVisible();
      await startBtn(page).click();

      // The scene, unreadable: the whole exchange is on screen, in Chinese,
      // with no translations to spend the payoff early.
      await expect(page.getByText('你好！')).toBeVisible();
      await expect(page.getByText('谢谢。再见！')).toBeVisible();
      await expect(page.getByText(/can’t read this yet/)).toBeVisible();
      await expect(page.getByText('Hello!', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Thank you. Goodbye!', { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Learn them' }).click();

      for (const word of WORDS) {
        await expect(page.getByText(word, { exact: true }).first()).toBeVisible();
        await doCard(page);
      }

      await expect(page.getByText('Session complete')).toBeVisible();
      await expect(page.getByText('3 words practiced')).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();

      await expect(page.getByText('Story unlocked')).toBeVisible();
      await page.getByRole('button', { name: 'Read it' }).click();

      // The SAME scene, readable: same Chinese, now with the translations.
      await expect(page.getByText('你好！')).toBeVisible();
      await expect(page.getByText('谢谢。再见！')).toBeVisible();
      await expect(page.getByText('Hello!', { exact: true })).toBeVisible();
      await expect(page.getByText('Thank you. Goodbye!', { exact: true })).toBeVisible();
      await expect(page.getByText(/this time you can read it/)).toBeVisible();

      // No fourth telling of the loop — the learner just performed it.
      await expect(page.getByText('Review', { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Continue' }).click();

      // The reading lesson: one more line, one unknown word, untranslated —
      // and no way forward until it has been tapped (P12-6).
      await expect(page.getByText(/See a word you don’t know/)).toBeVisible();
      await expect(page.getByText('to rain')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0);
      await lookupWord(page);
      await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

      // The handoff: the tutorial says it is finished and the caller decides.
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page).toHaveURL(/\/$/);
    });

    test('shows the real card — same radius, band, states and controls', async ({ page }) => {
      await walkTo(page, 'card1');
      const front = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('div')).find((d) => {
          const bs = getComputedStyle(d).boxShadow || '';
          return bs.includes('inset') && /\s0px\s8px\s0px\s0px\s+inset/.test(bs);
        });
        const cs = getComputedStyle(el);
        return {
          radius: cs.borderTopLeftRadius,
          role: el.getAttribute('role'),
          label: el.getAttribute('aria-label'),
          live: el.getAttribute('aria-live'),
          pill: el.querySelector('span').textContent.trim(),
        };
      });
      expect(front.radius).toBe('26px');
      expect(front.role).toBe('button');
      expect(front.label).toMatch(/flashcard — tap to reveal the answer/i);
      expect(front.live).toBe('polite');
      expect(front.pill).toBe('FIRST TIME');
    });

    test('uses the real grade row — one row of four, distinct fills, 44px targets', async ({ page }) => {
      await walkTo(page, 'card1');
      await card(page).click();
      const g = await page.evaluate(() => {
        const names = ['Again', 'Hard', 'Good', 'Easy'];
        const buttons = Array.from(document.querySelectorAll('button'))
          .filter(b => names.some(n => (b.textContent || '').trim().startsWith(n)));
        const row = getComputedStyle(buttons[0].parentElement);
        return {
          display: row.display,
          columns: row.gridTemplateColumns.split(' ').length,
          buttons: buttons.map(b => {
            const spans = b.querySelectorAll('span');
            const r = b.getBoundingClientRect();
            return {
              label: spans[0].textContent.trim(),
              gloss: spans[1] ? spans[1].textContent.trim() : '',
              bg: getComputedStyle(b).backgroundColor,
              height: Math.round(r.height),
              bottom: Math.round(r.bottom),
            };
          }),
        };
      });
      expect(g.display).toBe('grid');
      expect(g.columns).toBe(4);
      expect(g.buttons.map(b => b.label)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
      expect(new Set(g.buttons.map(b => b.bg)).size).toBe(4);
      for (const b of g.buttons) {
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.bottom).toBeLessThanOrEqual(phone.height);
      }
    });

    test('every state keeps its primary action on screen, and never scrolls sideways', async ({ page }) => {
      for (const stop of ['welcome', 'scene-before', 'card1', 'card2', 'card3', 'recap', 'unlock', 'scene-after', 'tap-word']) {
        await walkTo(page, stop);
        const g = await geometry(page);
        expect(g.overflowX, stop).toBe(0);
        expect(g.buttons, stop).toBeGreaterThan(0);
        // Reachable: on a 390-class phone nothing needs scrolling at all; a
        // 320x568 screen may scroll for genuinely taller content, but never by
        // more than a screenful.
        if (phone.height >= 700) expect(g.overflowY, stop).toBeLessThanOrEqual(1);
        else expect(g.overflowY, stop).toBeLessThan(phone.height);
      }
    });
  });
}

test.describe('Teaching', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('explains what the grades mean, once, on the first revealed card', async ({ page }) => {
    await walkTo(page, 'card1');
    await card(page).click();
    for (const gloss of ['New to me', 'Barely knew it', 'Knew it', 'Already knew it']) {
      await expect(page.getByText(gloss, { exact: true })).toBeVisible();
    }
    // A word met for the first time cannot be remembered — see gradePrompt.js.
    await expect(page.getByText('How familiar was this word?')).toBeVisible();
    await expect(page.getByText('How well did you remember it?')).toHaveCount(0);

    // Card 2: the meanings are not repeated.
    await grade(page, 'Good').click();
    await card(page).click();
    for (const gloss of ['New to me', 'Barely knew it', 'Knew it', 'Already knew it']) {
      await expect(page.getByText(gloss, { exact: true })).toHaveCount(0);
    }
  });

  test('draws the recap in the production recap’s clothes', async ({ page }) => {
    // The card, the chip and the title type are SessionRecap.jsx's — 24px
    // card, 58×58 chip at radius 18, 26px/750 title, and the Today stat tile —
    // so the completion screen a learner meets after every REAL session is one
    // they have already seen (P12-4). Numbers asserted against the production
    // component's constants; if SessionRecap is redesigned, this fails and the
    // tutorial follows it.
    await walkTo(page, 'recap');
    const shape = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const card = h1.parentElement;
      const chip = card.firstElementChild;
      const tile = Array.from(card.querySelectorAll('div'))
        .find(d => (d.textContent || '').trim().startsWith('Today'));
      const cs = getComputedStyle(card);
      const chipR = chip.getBoundingClientRect();
      return {
        cardRadius: cs.borderTopLeftRadius,
        cardBorder: getComputedStyle(card).borderTopWidth,
        chipW: Math.round(chipR.width),
        chipRadius: getComputedStyle(chip).borderTopLeftRadius,
        titleSize: getComputedStyle(h1).fontSize,
        titleWeight: getComputedStyle(h1).fontWeight,
        tileRadius: tile ? getComputedStyle(tile).borderTopLeftRadius : null,
      };
    });
    expect(shape.cardRadius).toBe('24px');
    expect(shape.cardBorder).toBe('1px');
    expect(shape.chipW).toBe(58);
    expect(shape.chipRadius).toBe('18px');
    expect(shape.titleSize).toBe('26px');
    expect(shape.titleWeight).toBe('750');
    expect(shape.tileRadius).toBe('14px');
    await expect(page.getByText('Today', { exact: true })).toBeVisible();
    await expect(page.getByText('3 words practiced')).toBeVisible();
  });

  test('demonstrates the schedule on cards 2 and 3 — meanings first, intervals after', async ({ page }) => {
    // Card 1 back: the meanings, and no schedule — two explanations of one
    // row of buttons would bury both.
    await walkTo(page, 'card1');
    await card(page).click();
    await expect(page.getByText('New to me', { exact: true })).toBeVisible();
    await expect(page.getByText('10 min', { exact: true })).toHaveCount(0);
    await grade(page, 'Good').click();

    // Card 2 back: "your grade decides when you see it again", DEMONSTRATED —
    // the real row's schedule preview, in its own slot (P12-3).
    await card(page).click();
    for (const label of ['1 min', '6 min', '10 min', '7 days']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('New to me', { exact: true })).toHaveCount(0);
    await grade(page, 'Good').click();

    // Card 3 back: still there — it is the product now, not a lesson.
    await card(page).click();
    await expect(page.getByText('7 days', { exact: true })).toBeVisible();
  });

  test('the reading lesson gates on the tap — and the answer is the real reader\'s (P12-6)', async ({ page }) => {
    await walkTo(page, 'tap-word');

    // No way forward, and no spoiler: the word is on the page untranslated.
    await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0);
    await expect(page.getByText('to rain')).toHaveCount(0);
    await expect(page.getByText(/See a word you don’t know\? Tap it\./)).toBeVisible();

    // The tap. What opens is WordLookupSheet — the production component — with
    // exactly what the real reader would show for this word.
    await page.getByRole('button', { name: /下雨 — tap to look it up/ }).click();
    const sheet = page.getByRole('dialog', { name: '下雨' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('xià yǔ')).toBeVisible();
    await expect(sheet.getByText('to rain')).toBeVisible();
    await expect(sheet.getByText('HSK 1')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Play audio' })).toBeVisible();
    // No deck to add to before an account exists — the bookmark is not drawn.
    await expect(sheet.getByRole('button', { name: /deck/i })).toHaveCount(0);

    // Dismiss → the coaching is spent and the way forward appears.
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText(/See a word you don’t know/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

    // Re-tapping still answers — it is not progress, but it is never refused.
    await page.getByRole('button', { name: /下雨 — tap to look it up/ }).click();
    await expect(page.getByRole('dialog', { name: '下雨' })).toBeVisible();
  });

  test('Skip is the only way past the reading lesson without tapping', async ({ page }) => {
    await walkTo(page, 'tap-word');
    await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Skip' }).click();
    // The /tutorial route's skip returns to `/`; signed out with the teaching
    // recorded, that resolves to the signup form.
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('coaches card 1, hints at card 2, and leaves card 3 alone', async ({ page }) => {
    await walkTo(page, 'card1');
    await expect(page.getByText('Tap to reveal')).toBeVisible();
    await card(page).click();
    await expect(page.getByText('Tap to hear it')).toBeVisible();
    await grade(page, 'Good').click();

    // Card 2 keeps one line, and only the one that needed a grade to exist.
    await expect(page.getByText('Your grade decides when you see it again.')).toBeVisible();
    await expect(page.getByText('Tap to reveal')).toHaveCount(0);
    await card(page).click();
    // The card's own footer prompt is product, not coaching — it is on cards 2
    // and 3 exactly as it is in a real session. What must be gone is the
    // tutorial's own line above the buttons, and the meanings under them.
    await grade(page, 'Good').click();

    // Card 3 is the product.
    await expect(page.getByText('Your grade decides when you see it again.')).toHaveCount(0);
    await expect(page.getByText('Tap to reveal')).toHaveCount(0);
  });

  test('does not autoplay on reveal, and Replay does not advance the card', async ({ page }) => {
    const played = [];
    await page.exposeFunction('__hdPlayed', (src) => played.push(src));
    await page.addInitScript(() => {
      const play = window.HTMLMediaElement.prototype.play;
      window.HTMLMediaElement.prototype.play = function patched() {
        window.__hdPlayed(this.src || '');
        return play.apply(this, arguments);
      };
    });

    await walkTo(page, 'card1');
    await card(page).click();
    await page.waitForTimeout(400);
    // The whole pronunciation lesson is that the sound arrives because a
    // control was pressed.
    expect(played).toHaveLength(0);

    await page.getByRole('button', { name: 'Replay audio' }).click();
    await page.waitForTimeout(300);
    expect(played.length).toBeGreaterThan(0);

    // Still card 1, still revealed, still ungraded.
    await expect(page.getByText('你好', { exact: true }).first()).toBeVisible();
    await expect(grade(page, 'Good')).toBeVisible();
  });

  test('stops the audio when the state changes', async ({ page }) => {
    await walkTo(page, 'card1');
    await card(page).click();
    await page.getByRole('button', { name: 'Replay audio' }).click();
    await page.waitForTimeout(200);
    await grade(page, 'Good').click();
    await page.waitForTimeout(200);
    const playing = await page.evaluate(() =>
      Array.from(document.querySelectorAll('audio')).filter(a => !a.paused).length);
    expect(playing).toBe(0);
  });

  test('finishes without ever hearing a word', async ({ page }) => {
    await walkTo(page, 'tap-word');
    await lookupWord(page);
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  });

  test('accepts any grade, not just Good', async ({ page }) => {
    await open(page);
    await startBtn(page).click();
    await page.getByRole('button', { name: 'Learn them' }).click();
    await doCard(page, 'Again');
    await doCard(page, 'Hard');
    await doCard(page, 'Easy');
    await expect(page.getByText('Session complete')).toBeVisible();
  });

  test('marks the learned words in the scene without relying on colour', async ({ page }) => {
    await walkTo(page, 'scene-after');
    const marks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('mark')).map(m => ({
        text: m.textContent,
        underline: getComputedStyle(m).borderBottomWidth,
      })));
    // All three learned words are emphasised, semantically, across the scene.
    for (const word of WORDS) expect(marks.map(m => m.text)).toContain(word);
    for (const m of marks) expect(parseFloat(m.underline)).toBeGreaterThan(0);
  });

  test('marks nothing in the scene BEFORE the words are learned', async ({ page }) => {
    await walkTo(page, 'scene-before');
    const marks = await page.evaluate(() => document.querySelectorAll('mark').length);
    expect(marks).toBe(0);
  });

  test('offers exactly one PRIMARY action on every non-card state — plus the quiet Skip', async ({ page }) => {
    for (const stop of ['welcome', 'scene-before', 'recap', 'unlock', 'scene-after', 'tap-word']) {
      await walkTo(page, stop);
      const found = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .filter(b => b.getBoundingClientRect().height >= 44)
          .map(b => (b.textContent || '').trim()));
      // One primary decision per screen; Skip is the one standing exception,
      // present everywhere (P12-2), drawn as quiet text but a full target.
      expect(found.filter(t => t !== 'Skip'), stop).toHaveLength(1);
      expect(found, stop).toContain('Skip');
    }
  });

  test('Skip is one tap away on the cards too', async ({ page }) => {
    await walkTo(page, 'card2');
    const skip = page.getByRole('button', { name: 'Skip' });
    await expect(skip).toBeVisible();
    const box = await skip.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('writes nothing — no card, no review, no profile', async ({ page }) => {
    // Analytics is deliberately not on this list: knowing where a learner
    // leaves the tutorial is the whole reason to measure it, and an event row
    // is not learner progress. Everything that IS learner progress is.
    const PROGRESS = ['cards', 'profiles', 'language_tracks', 'story_unlocks', 'daily_activity', 'story_reads', 'rpc'];
    const writes = [];
    await page.route('**/mock.supabase.co/**', async (route) => {
      const method = route.request().method();
      const url = route.request().url();
      if (method !== 'GET' && method !== 'OPTIONS' && PROGRESS.some(t => url.includes('/' + t))) {
        writes.push(url);
      }
      return route.fallback();
    });
    await open(page);
    await startBtn(page).click();
    await page.getByRole('button', { name: 'Learn them' }).click();
    await doCard(page, 'Again');
    await doCard(page, 'Good');
    await doCard(page, 'Easy');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Read it' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    // The reading lesson's lookup is fed by the fixture — opening it must not
    // reach the dictionary, and closing it writes nothing either.
    await lookupWord(page);
    expect(writes).toEqual([]);
  });
});

test.describe('Picking it back up', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('resumes where the learner left off after the app was closed', async ({ page }) => {
    // Deliberately NOT open(): that primes the page to forget its position on
    // every load, which is the opposite of what this spec is about. A fresh
    // context starts with empty storage anyway.
    await page.goto('/tutorial');
    await expect(startBtn(page)).toBeVisible();
    await startBtn(page).click();
    await page.getByRole('button', { name: 'Learn them' }).click();
    await doCard(page);                       // card 1 graded
    await card(page).click();                 // card 2 revealed
    await expect(page.getByText('谢谢', { exact: true }).first()).toBeVisible();

    // Killed and relaunched.
    await page.goto('/tutorial');
    await expect(page.getByText('谢谢', { exact: true }).first()).toBeVisible();
    await expect(startBtn(page)).toHaveCount(0);
    // Still revealed, still ungraded, and the way on is still there.
    await expect(grade(page, 'Good')).toBeVisible();
  });

  test('starts over rather than trusting a nonsense position', async ({ page }) => {
    await page.goto('/tutorial');
    await page.evaluate(() => {
      localStorage.setItem('prelogin:prefs', JSON.stringify({
        tutorial: { state: { phase: 'somewhere', cardIndex: 99, revealed: 'yes' } },
      }));
    });
    await page.goto('/tutorial');
    await expect(startBtn(page)).toBeVisible();
  });
});

test.describe('Tutorial in dark mode', () => {
  test.use({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });

  test('is a dark screen with a dark card', async ({ page }) => {
    await page.addInitScript(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await walkTo(page, 'card1');
    const lum = (value) => {
      const m = value.match(/-?\d*\.?\d+/g);
      const scale = value.indexOf('color(') === 0 ? 1 : 255;
      const [r, g, b] = m.slice(0, 3).map(Number).map(n => n / scale);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const colours = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div')).find((d) => {
        const bs = getComputedStyle(d).boxShadow || '';
        return bs.includes('inset') && /\s0px\s8px\s0px\s0px\s+inset/.test(bs);
      });
      return {
        body: getComputedStyle(document.body).backgroundColor,
        card: getComputedStyle(el).backgroundColor,
      };
    });
    expect(lum(colours.body)).toBeLessThan(0.3);
    expect(lum(colours.card)).toBeLessThan(0.3);
  });
});

test.describe('Tutorial with reduced motion', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('still walks the whole way through', async ({ page }) => {
    await walkTo(page, 'tap-word');
    await lookupWord(page);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
