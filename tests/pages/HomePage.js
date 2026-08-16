// Page Object for TODAY — the authenticated root screen.
//
// Today is a state, not a dashboard: it rests on the learner's current real
// object. While cards are due that object IS the first card of the prepared
// session; after them it becomes tonight's story, then practice, then a quiet
// done state. Everything a dashboard would have listed lives in the overview
// sheet behind the date chip.
export class HomePage {
  constructor(page) {
    this.page = page;
    this.today = page.getByRole('heading', { name: 'Today', exact: true });
    this.stage = page.locator('[data-home-stage]');
    this.card = page.locator('[data-tour="home-queue"]');
    this.heroAction = page.getByRole('button', { name: 'Start cards' });
    this.storyHandoff = page.locator('[data-tour="home-then-read"]');
    this.dateChip = page.getByRole('button', { name: 'Open today’s overview' });
    this.profile = page.getByRole('button', { name: 'Open profile' });
    this.overview = page.getByRole('dialog', { name: 'Today overview' });
  }
  async goto() {
    await this.page.goto('/');
    await this.stage.waitFor({ state: 'visible' });
  }
  async openOverview() {
    await this.dateChip.click();
    await this.overview.waitFor({ state: 'visible' });
  }
}
