// Page Object for the flashcard study session.
export class StudyPage {
  constructor(page) {
    this.page = page;
    this.heading = page.getByText(/Study session/i);
    this.showAnswer = page.getByRole('button', { name: /Show answer/i });
    this.gradeAgain = page.getByRole('button', { name: /Again/i });
    this.gradeGood = page.getByRole('button', { name: /Good/i });
    this.gradeEasy = page.getByRole('button', { name: /Easy/i });
  }
  async goto() {
    await this.page.goto('/study');
    await this.heading.waitFor({ state: 'visible' });
  }
  async reveal() {
    await this.showAnswer.click();
    await this.gradeGood.waitFor({ state: 'visible' });
  }
}
