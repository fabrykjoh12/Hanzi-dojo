// Page Object for the authenticated Home dashboard ("Today's Dojo").
export class HomePage {
  constructor(page) {
    this.page = page;
    this.reviewCta = page.getByRole('button', { name: /Review & unlock/i });
    this.fluency = page.getByText(/fluency/i).first();
    this.cardsWaiting = page.getByText(/Cards waiting/i);
  }
  async goto() {
    await this.page.goto('/');
    await this.reviewCta.waitFor({ state: 'visible' });
  }
  // The three count tiles on the dashboard, e.g. "New", "Learning", "Due".
  tile(label) {
    return this.page.getByText(new RegExp(`^${label}$`, 'i')).first();
  }
}
