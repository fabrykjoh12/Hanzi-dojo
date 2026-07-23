import { authedTest as test, expect } from '../fixtures/mockSupabase.js';
import { ReaderPage } from '../pages/ReaderPage.js';

test.describe('Story reader', () => {
  test('opens a story from the library', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    // The story title appears in the reader.
    await expect(page.getByText('公园里的下午').first()).toBeVisible();
  });

  test('paced reveal: starts on one tap and advances beat by beat', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();

    // Launch screen.
    const start = page.getByRole('button', { name: /Start reading/i });
    await expect(start).toBeVisible();
    await start.click();

    // First beat + progress counter.
    await expect(page.getByText('1 / 3')).toBeVisible();
    await expect(page.getByText('今天', { exact: false }).first()).toBeVisible();

    // Advance with the Next control.
    await page.getByRole('button', { name: /Next line/i }).click();
    await expect(page.getByText('2 / 3')).toBeVisible();
  });

  test('paced reveal: play control toggles', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    await page.getByRole('button', { name: /Start reading/i }).click();
    await page.getByRole('button', { name: /^Play$/i }).click();
    await expect(page.getByRole('button', { name: /^Pause$/i })).toBeVisible();
    await page.getByRole('button', { name: /^Pause$/i }).click();
    await expect(page.getByRole('button', { name: /^Play$/i })).toBeVisible();
  });

  test('paced reveal: tap a word to look it up, then finish', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    await page.getByRole('button', { name: /Start reading/i }).click();

    // Tap a known vocab word on the first beat.
    await page.getByText('今天', { exact: true }).first().click();
    await expect(page.getByText('today')).toBeVisible();           // meaning in the sheet
    await page.getByRole('button', { name: 'Close' }).click();     // dismiss sheet

    // Advance to the end → finish overlay.
    await page.getByRole('button', { name: /Next line/i }).click();
    await page.getByRole('button', { name: /Next line/i }).click();
    await page.getByRole('button', { name: /Next line/i }).click();
    await expect(page.getByText('You read it')).toBeVisible();
  });

  test('paced reveal: reading mode is per word, not an all-or-nothing line', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    await page.getByRole('button', { name: /Start reading/i }).click();

    // 今天 is a card in review, so the default "Unknown" mode leaves it bare —
    // the learner already knows it. No whole-line pinyin either.
    await expect(page.getByText('jīntiān')).toHaveCount(0);

    // The reading control lives behind the quiet settings panel.
    await page.getByRole('button', { name: /Reader settings/i }).click();
    const panel = page.getByRole('dialog', { name: /Reader settings/i });
    await expect(panel).toBeVisible();
    // The four modes are their own labelled group, separate from the English
    // toggle (which also reads "Off").
    const modes = panel.getByRole('group', { name: /display/i });

    // Always → even the known word shows its reading, as ruby over that word.
    await modes.getByRole('button', { name: 'Always' }).click();
    await expect(page.locator('rt', { hasText: 'jīntiān' })).toBeVisible();

    // Off → readings disappear again.
    await modes.getByRole('button', { name: 'Off' }).click();
    await expect(page.getByText('jīntiān')).toHaveCount(0);

    // Escape closes the panel and returns focus to its button.
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.getByRole('button', { name: /Reader settings/i })).toBeFocused();
  });

  test('comprehension check appears after finishing and scores answers', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    await page.getByRole('button', { name: /Start reading/i }).click();
    await page.getByRole('button', { name: /Next line/i }).click();
    await page.getByRole('button', { name: /Next line/i }).click();
    await page.getByRole('button', { name: /Next line/i }).click();

    // Finish overlay now carries the shared comprehension quiz.
    await expect(page.getByText('You read it')).toBeVisible();
    await expect(page.getByText('Check your understanding')).toBeVisible();

    // Answer the first question correctly → running score shows.
    await page.getByRole('button', { name: 'Good' }).click();
    await expect(page.getByText('1/2')).toBeVisible();
  });

  test('chat reveal: reveals bubbles on tap, looks up a word, and finishes', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openStoryByTitle('朋友的问题');

    await page.getByRole('button', { name: /Start reading/i }).click();
    await expect(page.getByText('1/3')).toBeVisible();
    await expect(page.getByText('你今天好吗', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Tap anywhere to continue/i)).toBeVisible();

    // Tap a vocab word in the first bubble → shared lookup sheet shows its
    // meaning. The word span stops propagation, so this does NOT advance.
    await page.getByText('今天', { exact: true }).first().click();
    await expect(page.getByText('today')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('1/3')).toBeVisible();             // still on the first bubble

    // Tap the thread (the speaker label is plain text, not a vocab span, so the
    // click bubbles to the thread's reveal-next-bubble handler) to advance.
    await page.getByText('小明', { exact: true }).first().click();
    await expect(page.getByText('2/3')).toBeVisible();
    await expect(page.getByText('我很好', { exact: false }).first()).toBeVisible();

    // Advance to the last bubble, then one more tap → shared finish overlay.
    await page.getByText('小明', { exact: true }).first().click();
    await expect(page.getByText('3/3')).toBeVisible();
    await expect(page.getByText('我们去公园', { exact: false }).first()).toBeVisible();
    await page.getByText('小明', { exact: true }).first().click();
    await expect(page.getByText('You read it')).toBeVisible();
  });

  test('scene reveal: shows an emoji scene, advances, looks up a word, and finishes', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openStoryByTitle('下雨天');

    await page.getByRole('button', { name: /Start reading/i }).click();
    await expect(page.getByText('1 / 3')).toBeVisible();
    await expect(page.getByText('🌧️')).toBeVisible();                       // emoji illustration
    await expect(page.getByText('今天', { exact: false }).first()).toBeVisible();

    // Tap a vocab word → shared lookup sheet shows its meaning (word span stops
    // propagation, so this does NOT advance the scene).
    await page.getByText('今天', { exact: true }).first().click();
    await expect(page.getByText('today')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('1 / 3')).toBeVisible();

    // Advance to the end with the Next control → shared finish overlay.
    await page.getByRole('button', { name: /Next scene/i }).click();
    await expect(page.getByText('2 / 3')).toBeVisible();
    await page.getByRole('button', { name: /Next scene/i }).click();
    await expect(page.getByText('3 / 3')).toBeVisible();
    await page.getByRole('button', { name: /Next scene/i }).click();
    await expect(page.getByText('You read it')).toBeVisible();
  });

  test('interactive chat: reply panel, wrong pick retries, correct advances, recap', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openStoryByTitle('一起去公园');
    await page.getByRole('button', { name: /Start reading/i }).click();

    // First bubble is a "them" turn; the reply gate for 小明's first line (a
    // "you" beat with distractors) previews one beat ahead, so it is already
    // showing here — tap the speaker label (plain text, not a vocab span, so
    // the click bubbles to the thread's advance handler) to confirm the tap
    // is inert while gated.
    await expect(page.getByText('1/4')).toBeVisible();
    await page.getByText('朋友', { exact: true }).first().click();

    // Reply gate: the panel offers the correct reply + a distractor.
    await expect(page.getByText('Your reply — tap the right one')).toBeVisible();
    await expect(page.getByText('我不是学生。')).toBeVisible();
    // Keyboard must NOT bypass the gate.
    await page.keyboard.press('Space');
    await expect(page.getByText('1/4')).toBeVisible();
    await expect(page.getByText('Your reply — tap the right one')).toBeVisible();
    // Wrong pick → hint shows, does NOT advance past the gate.
    await page.getByRole('button', { name: /我不是学生/ }).click();
    await expect(page.getByText('Not quite — try another reply.', { exact: true })).toBeVisible();
    await expect(page.getByText('Your reply — tap the right one')).toBeVisible();
    // Correct pick → becomes the "you" bubble, chat continues.
    await page.getByRole('button', { name: /我很好/ }).click();
    await expect(page.getByText('2/4')).toBeVisible();

    // Advance past the non-gated beat (朋友's second line) to reveal the second
    // gate — tap the (still on-screen) 小明 speaker label to advance.
    await page.getByText('小明', { exact: true }).first().click();
    await expect(page.getByText('Your reply — tap the right one')).toBeVisible();
    // Correct pick reveals the final "you" bubble; one more tap (same pattern
    // as the observer chat reader) finishes the story.
    await page.getByRole('button', { name: /好，一起去/ }).click();
    await expect(page.getByText('4/4')).toBeVisible();
    await page.getByText('小明', { exact: true }).last().click();
    await expect(page.getByText('You read it')).toBeVisible();
    await expect(page.getByText(/on the first try/)).toBeVisible();
  });

  // Word-by-word read-along (Tasks 1-6): every seeded story in
  // tests/fixtures/mockSupabase.js has has_audio: false and every vocab row
  // has audio_path: null, so no clip ever loads under Playwright — the
  // moving-spotlight assertion (dimmed/spotlit word spans while `Play` runs)
  // cannot be exercised end-to-end here without faking an <audio> element,
  // which the task brief explicitly rules out. That behavior is proven at
  // the unit level instead, in src/readAlong.test.js (buildTimeline/
  // tokenAtTime/startOfToken invariants, 22 tests). These two tests cover
  // only the parts of the feature that don't depend on a clip loading: the
  // speed control UI and that a paused tap still opens the lookup sheet.
  test('paced reveal: the reader settings panel offers a speed control', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    await page.getByRole('button', { name: /Start reading/i }).click();

    await page.getByRole('button', { name: /Reader settings/i }).click();
    const speeds = page.getByRole('group', { name: /Playback speed/i });
    await expect(speeds).toBeVisible();

    // 1x is the default so nobody's audio silently slows.
    await expect(speeds.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true');

    await speeds.getByRole('button', { name: '0.6×' }).click();
    await expect(speeds.getByRole('button', { name: '0.6×' })).toHaveAttribute('aria-pressed', 'true');
    await expect(speeds.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('paced reveal: tapping a word while paused still opens the lookup sheet', async ({ page }) => {
    const reader = new ReaderPage(page);
    await reader.openFirstStory();
    await page.getByRole('button', { name: /Start reading/i }).click();

    // Not playing, so the tap must mean "what does that mean", unchanged.
    await page.getByText('今天', { exact: true }).first().click();
    await expect(page.getByRole('button', { name: /Add to deck/i })).toBeVisible();
  });
});
