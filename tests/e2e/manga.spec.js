import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { ReaderPage } from '../pages/ReaderPage.js';

const EPISODE = '第一话 · 我是新学生';

// The manga reader (src/MangaReader.jsx) — Hanzi Dojo Stories.
//
// These cover the behaviours the format actually adds on top of the shared
// reading engine: the panel-counting header, tapping a word inside a bubble,
// the story choice and the gate behind it, resuming, and completion. The word
// lookup, pinyin scaffolding and add-to-deck are the same components the other
// readers use and are covered by reader.spec.js.

async function openEpisode(page) {
  const reader = new ReaderPage(page);
  await reader.openStoryByTitle(EPISODE);
  // The reader opens straight onto the artwork — no launch screen.
  await expect(page.getByRole('heading', { name: '我是新学生' })).toBeVisible();
}

test.describe('Manga reader', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('opens on the first panel with the episode header', async ({ page }) => {
    await openEpisode(page);
    await expect(page.getByText('第一话', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Panel 1 of 14')).toBeVisible();
    // The opening narration is real text, not part of the picture: every word
    // in it is its own button. (getByText can't see it — the hanzi lives inside
    // a <ruby> with its pinyin, which is exactly the point.)
    await expect(page.getByRole('button', { name: '学校', exact: true }).first()).toBeVisible();
  });

  test('a panel is a figure with alt text, and the art is a real image', async ({ page }) => {
    await openEpisode(page);
    const art = page.getByRole('img', { name: /at the foot of a long stone stair/ });
    await expect(art).toBeVisible();
    await expect(art).toHaveAttribute('src', /panel-01-arrival\.webp/);
  });

  test('tapping 学生 opens its pinyin, meaning and audio control', async ({ page }) => {
    await openEpisode(page);
    // 学生 is on panel 3 — scroll it into view first.
    const word = page.getByRole('button', { name: '学生' }).first();
    await word.scrollIntoViewIfNeeded();
    await word.click();

    // The lookup popover: the word large, its pinyin under it, the meaning, and
    // an audio control. `.last()` because the pinyin also appears as ruby over
    // the word itself and inside the choice card — three true sightings, not an
    // ambiguous selector.
    const play = page.getByRole('button', { name: 'Play audio' });
    await expect(play).toBeVisible();
    await expect(page.getByText('xuéshēng').last()).toBeVisible();
    await expect(page.getByText('student', { exact: true })).toBeVisible();

    // Escape closes it — the popover must not need a hunt for the X.
    await page.keyboard.press('Escape');
    await expect(play).toHaveCount(0);
  });

  test('the choice gates the rest of the episode until it is answered', async ({ page }) => {
    await openEpisode(page);
    await expect(page.getByRole('group', { name: '选择回答' })).toBeVisible();
    await expect(page.getByText('Choose a reply to keep reading.')).toBeVisible();

    // Nothing past the gate is on the page yet.
    await expect(page.getByRole('img', { name: /introduces herself/ })).toHaveCount(0);

    await page.getByRole('button', { name: /是，我是新学生。/ }).click();

    // The reply becomes a line of the story, and the episode continues. (The
    // gate message does NOT disappear — the episode has a second gate, 林老师's
    // question, which is now the one waiting. What proves this gate opened is
    // the art beyond it, and the answered option being marked.)
    await expect(page.getByRole('img', { name: /introduces herself/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /是，我是新学生。/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the second reply gets its own reaction, then rejoins the story', async ({ page }) => {
    await openEpisode(page);
    await page.getByRole('button', { name: /不是！/ }).click();
    // 真的吗？ only exists on this branch…
    await expect(page.getByRole('button', { name: '真', exact: true })).toBeVisible();
    // …and the canonical line is there either way.
    await expect(page.getByRole('button', { name: '名字', exact: true })).toBeVisible();
  });

  test('the chosen reply stays in the flow, never over an earlier panel', async ({ page }) => {
    // Regression: the reply balloon was laid out as an overlay (position:
    // absolute) inside an unpositioned wrapper, so it climbed to the nearest
    // positioned ancestor — the artwork of the panel BEFORE the choice — and the
    // learner's own line appeared floating over the opening scene.
    await openEpisode(page);
    const openingArt = page.getByRole('img', { name: /at the foot of a long stone stair/ });
    await page.getByRole('button', { name: /是，我是新学生。/ }).click();

    const reply = page.getByRole('button', { name: '新', exact: true }).last();
    await expect(reply).toBeVisible();
    const replyBox = await reply.boundingBox();
    const artBox = await openingArt.boundingBox();
    // The reply sits below the opening panel, not on top of it.
    expect(replyBox.y).toBeGreaterThan(artBox.y + artBox.height);
  });

  test('an answered choice cannot be answered twice', async ({ page }) => {
    await openEpisode(page);
    const other = page.getByRole('button', { name: /不是！/ });
    await page.getByRole('button', { name: /是，我是新学生。/ }).click();
    await expect(other).toBeDisabled();
  });

  test("林老师's question answers both ways, then rejoins the story", async ({ page }) => {
    test.setTimeout(90000);
    await openEpisode(page);
    await page.getByRole('button', { name: /是，我是新学生。/ }).click();

    // Nothing past the second gate yet.
    await expect(page.getByRole('img', { name: /beginning a single bold stroke/ })).toHaveCount(0);
    await page.getByRole('button', { name: /会一点儿。/ }).click();

    // 很好 belongs to this branch; 没关系 belongs to the other and must not show.
    await expect(page.getByRole('button', { name: '好', exact: true }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: '没关系', exact: true })).toHaveCount(0);
    // …and the line after the branch is common to both, on the same panel.
    await expect(page.getByRole('img', { name: /beginning a single bold stroke/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '现在', exact: true })).toBeVisible();
  });

  test('the header counts panels as you scroll', async ({ page }) => {
    await openEpisode(page);
    // Centre it, not merely "into view": the header counts the panel FILLING
    // the screen, so a panel nudged just inside the bottom edge is correctly
    // still not the one you are reading.
    await page.getByRole('img', { name: /小雨 leans grinning/ })
      .evaluate(el => el.scrollIntoView({ block: 'center' }));
    await expect(page.getByLabel('Panel 3 of 14')).toBeVisible();
  });

  test('scrolling to the end without choosing does not complete the episode', async ({ page }) => {
    await openEpisode(page);
    await page.mouse.wheel(0, 8000);
    await expect(page.getByRole('region', { name: 'Episode complete' })).toHaveCount(0);
  });

  test('completing the episode shows the seal, the words met, and the hook', async ({ page }) => {
    test.setTimeout(90000);
    await openEpisode(page);
    // BOTH gates have to be answered — 小雨's question, then 林老师's.
    await page.getByRole('button', { name: /是，我是新学生。/ }).click();
    await page.getByRole('button', { name: /会一点儿。/ }).click();
    // Walk to the end.
    await page.getByRole('img', { name: /walks in through the dojo gate/ }).scrollIntoViewIfNeeded();

    const done = page.getByRole('region', { name: 'Episode complete' });
    await expect(done).toBeVisible();
    await expect(done.getByText(/第一话 · complete/i)).toBeVisible();
    await expect(done.getByText(/new$/)).toBeVisible();
    // The plate says where the story goes next AND at what level.
    await expect(done.getByText(/第二话 · continues at HSK 2/i)).toBeVisible();
    await expect(done.getByRole('button', { name: /Back to stories/ })).toBeVisible();
  });

  test('reopening the episode keeps the branch that was chosen', async ({ page }) => {
    // Two full app loads in one test — the default 30s budget covers one.
    test.setTimeout(90000);
    await openEpisode(page);
    await page.getByRole('button', { name: /不是！/ }).click();
    await expect(page.getByRole('img', { name: /introduces herself/ })).toBeVisible();

    // `.first()` — the header's back arrow. The closing plate carries a second
    // button with the same name, by design.
    await page.getByRole('button', { name: 'Back to stories' }).first().click();
    await openEpisode(page);

    // The gate is already answered, so the rest of the episode is still open…
    await expect(page.getByRole('img', { name: /introduces herself/ })).toBeVisible();
    // …and the reply that was made is still the one marked.
    await expect(page.getByRole('button', { name: /不是！/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the back button leaves the reader', async ({ page }) => {
    await openEpisode(page);
    await page.getByRole('button', { name: 'Back to stories' }).first().click();
    await expect(page.getByRole('heading', { name: '我是新学生' })).toHaveCount(0);
  });
});

test.describe('Manga reader on desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('centres the same reading column instead of widening into a dashboard', async ({ page }) => {
    await openEpisode(page);
    const art = page.getByRole('img', { name: /at the foot of a long stone stair/ });
    const box = await art.boundingBox();
    const column = page.locator('main').first();
    const outer = await column.boundingBox();
    // The column stays a phone-width reading column instead of stretching…
    expect(box.width).toBeLessThanOrEqual(520);
    // …and is centred in the space it has, with real air on both sides, rather
    // than pinned left like a dashboard panel.
    const centre = outer.x + outer.width / 2;
    expect(Math.abs((box.x + box.width / 2) - centre)).toBeLessThan(3);
    expect(box.x - outer.x).toBeGreaterThan(60);
  });
});
