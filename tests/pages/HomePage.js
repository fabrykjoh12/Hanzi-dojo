// Page Object for the authenticated Home screen.
//
// Home exposes one whole-button study action, a directly available story
// hand-off and weekly activity. Select by behavior and stable tour hooks,
// leaving typography and surface treatment free to evolve.
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
