import { authedTest as test, expect, REF } from '../fixtures/mockSupabase.js';

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
    // already has one, and the screen drops those before sending — so pasting
    // one of them would just make the button say "Add 1", not produce a
    // duplicate for the database to decline.
    await page.locator('textarea').fill('面条儿\n声音');
    await page.getByRole('button', { name: 'Check this list' }).click();

    const add = page.getByRole('button', { name: /^Add \d+ to review$/ });
    await expect(add, 'both words must be offered, or the race below stages nothing')
      .toHaveText('Add 2 to review');

    // Stage the ONE situation where sent and inserted differ: another device
    // claims 声音 after this screen counted it and before the learner taps Add.
    // Without this the two numbers are always equal and the toast could be
    // reporting either — which is exactly the regression this test exists to
    // catch, since the screen used to report `claimIds.length`.
    await page.evaluate(async (ref) => {
      await fetch('https://' + ref + '.supabase.co/rest/v1/cards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([{ vocab_id: 'upstairs-v1' }]),
      });
    }, REF);

    await add.click();

    // The toast lives in the live region <Toasts /> keeps mounted — named, so
    // this does not also match Home's gentle-return banner once the learner is
    // back there. Reading the TEXT is the point: a payload of the wrong shape
    // renders a card with no title, which is visible-but-empty and would pass a
    // bare visibility check.
    const status = page.getByRole('status', { name: 'Notifications' });
    await expect(status).toContainText('Added 1 word to review · 1 already in your deck');
    // And back to the screen it came from, so the toast is not sitting on a
    // screen the learner never reached.
    await expect(page.getByRole('button', { name: 'Paste a list' })).toHaveCount(0);
  });
});
