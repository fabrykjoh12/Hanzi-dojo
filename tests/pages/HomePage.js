// Page Object for the authenticated Home screen.
//
// Home's one lit block is the flashcard queue: how many cards are waiting, the
// day's goal, and a single button that starts the session. The story you have
// unlocked is a quiet hand-off beneath it — the next step in the loop, not a
// rival call to action.
export class HomePage {
  constructor(page) {
    this.page = page;
    this.today = page.getByText('Today', { exact: true });
    this.queueEyebrow = page.getByText(/Ready to review|Queue clear/);
    // The hero's single action: cards while cards are due, reading once clear.
    this.heroAction = page.getByText(/Start reviewing|Read a story/);
    this.storyHandoff = page.getByText('Then read');
  }
  async goto() {
    await this.page.goto('/');
    await this.today.waitFor({ state: 'visible' });
  }
}
