import { authedTest as test, expect } from '../fixtures/mockSupabase.js';

// "Words you already know" — the paste flow, end to end.
//
// This exists because of a specific failure: the screen's confirmation toast
// had never rendered since the screen was written, and NOTHING caught it. The
// pure module that builds the sentence was correct and well tested; the call
// site handed toast() a plain string, toast() dispatches its argument verbatim,
// and <Toasts /> spreads it — so the payload arrived as {0:'A',1:'d',…} with no
// title and drew an empty card. Every unit test stayed green, three artefacts
// said the confirmation worked, and the only thing that could have noticed was
// a browser.
//
// So these assert what a learner sees, not what a module returns.

test.describe('Words you already know', () => {
  const goto = async (page) => {
    await page.goto('/known');
    await expect(page.getByRole('button', { name: 'Paste a list' })).toBeVisible();
  };

  test('shows the lines it could not match, not just how many', async ({ page }) => {
    await goto(page);
    await page.getByRole('button', { name: 'Paste a list' }).click();
    // Two real fixture words, two lines nothing can match.
    await page.locator('textarea').fill('今天\n天气\nqqqq\nnot-a-word');
    await page.getByRole('button', { name: 'Check this list' }).click();

    await expect(page.getByText(/lines we didn’t recognise/)).toBeVisible();
    const disclosure = page.getByText('See what we didn’t recognise');
    await expect(disclosure).toBeVisible();
    await disclosure.click();
    // The content, which is the finding: a count alone cannot tell a typo from
    // a whole deck pasted in traditional characters.
    // Scoped to the disclosure's own list: the textarea still holds the pasted
    // text, so an unscoped text match is ambiguous about what it found.
    const samples = page.getByRole('listitem');
    await expect(samples.filter({ hasText: 'qqqq' })).toBeVisible();
    await expect(samples.filter({ hasText: 'not-a-word' })).toBeVisible();
  });

  test('confirms with a toast that says what the database wrote', async ({ page }) => {
    await goto(page);
    await page.getByRole('button', { name: 'Paste a list' }).click();
    // Two fixture words the mocked account has no card for. Every v1…v13 word
    // already has one, and a word already in the deck is exactly what the
    // upsert declines — so pasting those would produce nothing to add.
    await page.locator('textarea').fill('面条儿\n声音');
    await page.getByRole('button', { name: 'Check this list' }).click();

    const add = page.getByRole('button', { name: /^Add \d+ to review$/ });
    await expect(add).toBeVisible();
    const count = Number((await add.textContent()).match(/\d+/)[0]);
    expect(count).toBeGreaterThan(0);
    await add.click();

    // The toast lives in the live region <Toasts /> keeps mounted. Reading the
    // TEXT is the point: a payload of the wrong shape renders a card with no
    // title, which is visible-but-empty and would pass a bare visibility check.
    const status = page.locator('[role="status"]');
    await expect(status).toContainText(new RegExp('Added ' + count + ' word'));
    // And back to the screen it came from, so the toast is not sitting on a
    // screen the learner never reached.
    await expect(page.getByRole('button', { name: 'Paste a list' })).toHaveCount(0);
  });
});
