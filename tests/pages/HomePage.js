// Page Object for the authenticated Home screen.
//
// Home is a GUIDE since P14-5C: Cards → Story → Practice, with exactly one step
// loud at a time. The screen is a heading line, the active step (the only thing
// with a button), the other two steps as quiet numbered rows, and one line of
// level context at the foot.
//
// The locators are keyed on the guide's own data attributes rather than on copy,
// because the copy changes with the learner's state and the structure does not.
export class HomePage {
  constructor(page) {
    this.page = page;
    this.today = page.getByRole('heading', { name: /Today’s training|Today's training/ });
    // Where the learner is in the sequence: "Step 1 of 3 · about 6 min".
    this.stepLine = page.getByText(/Step \d of 3|Training complete|Nothing waiting today/);
    // The one loud step. `data-guide-active` carries which one it is.
    this.activeStep = page.locator('[data-guide-active]');
    // The single call to action — whatever the active step's verb happens to be.
    this.primaryAction = page.getByRole('button', {
      name: /Start cards|Open cards|Continue story|Practise these|Review patterns|Start listening/,
    });
    this.storyStep = page.locator('[data-guide-step="story"]');
    this.practiceStep = page.locator('[data-guide-step="practice"]');
    this.cardsStep = page.locator('[data-guide-step="cards"]');
    this.levelFoot = page.getByText(/\d+ \/ \d+ words/);
  }

  async goto() {
    await this.page.goto('/');
    await this.today.waitFor({ state: 'visible' });
  }

  // Which step the screen is currently about ('cards' | 'story' | 'practice' |
  // 'complete').
  async active() {
    return this.activeStep.first().getAttribute('data-guide-active');
  }
}
