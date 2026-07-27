// Page Object for the flashcard study session.
export class StudyPage {
  constructor(page) {
    this.page = page;
    // The whole card is the tap-to-reveal target (role="button", aria-label
    // set only while unflipped) — no separate "Show answer" button anymore.
    this.showAnswer = page.getByRole('button', { name: /flashcard.*tap to reveal/i });
    this.heading = this.showAnswer;
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
