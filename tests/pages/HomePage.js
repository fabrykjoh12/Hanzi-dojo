// Page Object for the authenticated Home screen.
//
// Home V3 keeps the daily learning sequence visible without turning it into a
// dashboard: Cards first, then Story, then Practice.
export class HomePage {
  constructor(page) {
    this.page = page;
    this.today = page.getByRole('heading', { name: 'Today’s training' });
    this.cardsHero = page.getByRole('region', { name: 'Cards' });
    this.heroAction = page.getByRole('button', { name: 'Start cards' });
    this.storyHandoff = page.getByRole('region', { name: 'Next story' });
  }
  async goto() {
    await this.page.goto('/');
    await this.today.waitFor({ state: 'visible' });
  }
}
