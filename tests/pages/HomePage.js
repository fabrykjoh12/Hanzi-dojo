// Page Object for the authenticated Home screen.
//
// Home is an ink painting with one card resting in it. The whole card is the
// one control: it starts today's cards (or, once the queue is clear, opens the
// stories), and it says how many cards are waiting, roughly how long they
// take, and how far they carry the learner toward the next level.
export class HomePage {
  constructor(page) {
    this.page = page;
    this.today = page.getByRole('heading', { name: 'Today', exact: true });
    this.card = page.locator('[data-tour="home-queue"]');
    // Kept as an alias: other specs reach "the hero" to start a session.
    this.hero = this.card;
    this.heroAction = page.getByRole('button', { name: /Start reviewing|Read a story|Try again/ });
    this.painting = page.locator('[data-home-scene]');
  }
  async goto() {
    await this.page.goto('/');
    await this.page.locator('[data-home-stage]').waitFor({ state: 'visible' });
  }
}
