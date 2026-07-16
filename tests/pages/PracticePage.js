// Page Object for the Practice Lab ("Sharpen your skills").
export class PracticePage {
  constructor(page) {
    this.page = page;
    this.heading = page.getByText(/Sharpen your skills/i);
  }
  async goto() {
    await this.page.goto('/practice');
    await this.heading.waitFor({ state: 'visible' });
  }
  mode(name) {
    return this.page.getByText(new RegExp(name, 'i')).first();
  }
}
