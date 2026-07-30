// Page Object for the story reader (level rail → story card → reader).
// See src/Stories.jsx: the library navigates by LEVEL now — a rail of tabs, one
// per level, opening on the learner's own level. Every story is a normalized
// card (src/Stories.jsx StoryCard) whose accessible name includes its title;
// tapping one opens the reader directly (there is no separate list drill-in).
export class ReaderPage {
  constructor(page) {
    this.page = page;
  }
  async gotoStories() {
    await this.page.goto('/stories');
  }
  // Opens the seeded first story into the reader.
  async openFirstStory() {
    await this.openStoryByTitle('公园里的下午');
  }

  // Opens a story by its title into the reader, wherever it lives on the rail:
  // the shelf the library opens on is checked first, then each level in turn.
  // Written this way so a spec names a story, not a level — the fixture is free
  // to move a story between levels without every reader spec knowing.
  async openStoryByTitle(title) {
    await this.gotoStories();
    const tabs = this.page.getByRole('tab');
    await tabs.first().waitFor();
    // Scope to the tab panel so the "Today's story" hero (which may show the
    // same title) never shadows the grid card we mean to open.
    const card = this.page.getByRole('tabpanel').getByRole('button', { name: new RegExp(title) });
    const levels = await tabs.count();
    for (let i = 0; i < levels; i++) {
      if (await card.count() > 0) break;
      await tabs.nth(i).click();
    }
    await card.first().click();
  }
}
