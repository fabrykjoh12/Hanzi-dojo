// Page Object for the story reader (flat shelf → story card → reader).
// See src/Stories.jsx: the library is ONE page of level sections (current
// level first), each a grid of cards — one card per series, one per standalone
// story, plus a Practice Scenarios group. Every card is a button whose
// accessible name includes its title; tapping a story card opens the reader
// directly, tapping a series card resumes its next unread chapter, and the
// chapter-count chip on a series card opens its chapter list.
export class ReaderPage {
  constructor(page) {
    this.page = page;
  }
  async gotoStories() {
    await this.page.goto('/stories');
  }

  async revealInCollapsedLevel(target) {
    await this.page.getByRole('region').first().waitFor();
    if (await target.count()) return;
    const toggles = this.page.getByRole('heading', { level: 2 }).getByRole('button');
    for (let i = 0; i < await toggles.count(); i += 1) {
      const toggle = toggles.nth(i);
      if (await toggle.getAttribute('aria-expanded') !== 'false') continue;
      await toggle.click();
      if (await target.count()) return;
    }
  }
  // Opens the seeded first story into the reader.
  async openFirstStory() {
    await this.openStoryByTitle('公园里的下午');
  }

  // Opens a story by its title into the reader. Scope to the level sections
  // (each an aria-labelled <section>, exposed as a region) so the "Today's
  // story" hero — which may show the same title — never shadows the grid card.
  async openStoryByTitle(title) {
    await this.gotoStories();
    const card = this.page.getByRole('region').getByRole('button', { name: new RegExp(title) }).first();
    await this.revealInCollapsedLevel(card);
    await card.click();
  }

  // Serial chapters live behind their series card's chapter list: open it via
  // the "All chapters" chip, then pick the chapter.
  async openSeriesStoryByTitle(seriesTitle, storyTitle) {
    await this.gotoStories();
    const chapters = this.page.getByRole('button', { name: new RegExp('All chapters of .*' + seriesTitle) });
    await this.revealInCollapsedLevel(chapters);
    await chapters.click();
    await this.page.getByRole('button', { name: new RegExp(storyTitle) }).click();
  }
}
