// Page Object for the authenticated Home screen.
//
// Home answers "what should I do next?": a quiet greeting, one primary
// learning action built from the real prepared queue, the story that learning
// unlocks (with its readability), and a calm progress line.
export class HomePage {
  constructor(page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Home', exact: true });
    this.primary = page.locator('[data-tour="home-queue"]');
    this.heroAction = page.getByRole('button', { name: 'Continue learning' });
    this.storyRow = page.locator('[data-tour="home-then-read"]');
  }
  async goto() {
    await this.page.goto('/');
    await this.page.locator('[data-home-stage]').waitFor({ state: 'visible' });
  }
}
