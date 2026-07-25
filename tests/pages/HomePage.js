// Page Object for the authenticated Home dashboard.
//
// Home leads with the story you have unlocked; the card queue is a readout
// beneath it, and there is exactly one primary action.
export class HomePage {
  constructor(page) {
    this.page = page;
    this.today = page.getByText('Today', { exact: true });
    // The hero's single call to action — "Review N first" while cards are due,
    // "Start reading" once the queue is clear.
    this.heroAction = page.getByText(/Review \d+ first|Start reading/);
    this.dueReadout = page.getByText('words due for review');
    this.newReadout = page.getByText('new words today');
  }
  async goto() {
    await this.page.goto('/');
    await this.today.waitFor({ state: 'visible' });
  }
}
