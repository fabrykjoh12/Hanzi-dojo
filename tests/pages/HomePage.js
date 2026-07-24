// Page Object for the authenticated Home dashboard ("Today's Dojo").
export class HomePage {
  constructor(page) {
    this.page = page;
    this.dojoCard = page.getByText('Today’s Dojo');
    this.cardsWaiting = page.getByText(/Cards waiting/i);
  }
  async goto() {
    await this.page.goto('/');
    await this.dojoCard.waitFor({ state: 'visible' });
  }
  // The three count tiles on the dashboard, e.g. "New", "Learning", "Due".
  tile(label) {
    return this.page.getByText(new RegExp(`^${label}$`, 'i')).first();
  }
}
