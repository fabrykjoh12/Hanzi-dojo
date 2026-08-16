// Page Object for the authenticated Home screen.
//
// Home V4 ("paper deck"): the hero is today's actual deck — a paper card
// printing the session's opening word — followed by the story chapter card and
// the practice row. Cards first, then Story, then Practice.
export class HomePage {
  constructor(page) {
    this.page = page;
    this.today = page.getByRole('heading', { name: 'Today', exact: true });
    this.cardsHero = page.getByRole('region', { name: 'Cards' });
    this.heroAction = page.getByRole('button', { name: 'Start cards' });
    this.storyHandoff = page.getByRole('region', { name: 'Next story' });
  }
  async goto() {
    await this.page.goto('/');
    await this.today.waitFor({ state: 'visible' });
  }
}
