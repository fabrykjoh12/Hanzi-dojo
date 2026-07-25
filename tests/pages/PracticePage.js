// Page Object for the Practice hub.
export class PracticePage {
  constructor(page) {
    this.page = page;
    // Matched by role, not text: "Practice" is also the sidebar / bottom-nav
    // label, so a plain text match would resolve to the nav item instead.
    this.heading = page.getByRole('heading', { name: 'Practice', exact: true });
  }
  async goto() {
    await this.page.goto('/practice');
    await this.heading.waitFor({ state: 'visible' });
  }
  mode(name) {
    return this.page.getByText(new RegExp(name, 'i')).first();
  }
}
