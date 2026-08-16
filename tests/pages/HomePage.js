// Page Object for the authenticated Home screen.
//
// The "Desk" Home: the screen holds the learner's current real task object —
// before cards, the actual first flashcard of the prepared session (the desk
// card IS the primary action); after cards, tonight's story; then practice.
// The other steps sit below as quiet status rows.
export class HomePage {
  constructor(page) {
    this.page = page;
    this.today = page.getByRole('heading', { name: 'Today', exact: true });
    this.desk = page.locator('[data-tour="home-queue"]');
    this.heroAction = page.getByRole('button', { name: 'Start cards' });
    this.storyHandoff = page.locator('[data-tour="home-then-read"]');
  }
  async goto() {
    await this.page.goto('/');
    await this.page.locator('[data-home-stage]').waitFor({ state: 'visible' });
  }
}
