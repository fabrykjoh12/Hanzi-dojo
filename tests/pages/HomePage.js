// Page Object for the authenticated Home screen.
//
// Home V4 is a launcher, not a dashboard: a "Today" header, ONE session panel
// (the screen's single accent surface), plain rows for Story and Practice, and
// the level progress line.
export class HomePage {
  constructor(page) {
    this.page = page;
    this.today = page.getByRole('heading', { name: 'Today' });
    this.cardsPanel = page.getByRole('region', { name: 'Cards' });
    // The whole panel is the button — its accessible name starts with the count.
    this.heroAction = this.cardsPanel.getByRole('button');
    this.storyRow = page.getByRole('region', { name: 'Up next' }).getByRole('button').first();
  }
  async goto() {
    await this.page.goto('/');
    await this.today.waitFor({ state: 'visible' });
  }
}
