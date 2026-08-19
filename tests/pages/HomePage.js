// Page Object for the authenticated Home screen.
//
// Home's one lit block is the flashcard queue: how many cards are waiting, the
// New/Learning/Review composition, the day's goal, and a single button that
// starts the session. The story you have unlocked is a quiet hand-off beneath
// it — the next step in the loop, not a rival call to action — and the week's
// rhythm and level progress share one flat panel below.
export class HomePage {
  constructor(page) {
    this.page = page;
    this.today = page.getByRole('heading', { name: 'Today', exact: true });
    this.hero = page.locator('[data-tour="home-queue"]');
    this.queueEyebrow = page.getByText(/Ready to review|Queue clear/);
    // The hero's single action: cards while cards are due, reading once clear.
    this.heroAction = page.getByRole('button', { name: /Start reviewing|Read a story/ });
    this.storyHandoff = page.locator('[data-tour="home-then-read"]');
    this.weekPanel = page.locator('[data-tour="home-week"]');
  }
  async goto() {
    await this.page.goto('/');
    await this.page.locator('[data-home-stage]').waitFor({ state: 'visible' });
  }
}
