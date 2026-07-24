// Page Object for the story reader (browse tabs → story card → reader).
// See src/Stories.jsx: the library opens on the tier tabs (First Steps is
// unlocked from minWords 0 — src/storyTiers.js) with the tier's stories grouped
// into arcs + a Practice Scenarios section. Every story is a normalized card
// (src/Stories.jsx StoryCard) whose accessible name includes its title; tapping
// one opens the reader directly (there is no separate list drill-in anymore).
export class ReaderPage {
  constructor(page) {
    this.page = page;
  }
  async gotoStories() {
    await this.page.goto('/stories');
  }
  // Opens the seeded first story into the reader: First Steps tab → its card.
  async openFirstStory() {
    await this.openStoryByTitle('公园里的下午');
  }

  // Opens a story by its title into the reader. First Steps (tier 1) is unlocked
  // from day one and holds every seeded story (arc + practice). The card is a
  // button whose accessible name embeds the title, so match it as a substring.
  async openStoryByTitle(title) {
    await this.gotoStories();
    await this.page.getByRole('tab', { name: /First Steps/ }).click();
    // Scope to the tab panel so the "Today's story" card (which may show the same
    // title) never shadows the grid card we mean to open.
    await this.page.getByRole('tabpanel').getByRole('button', { name: new RegExp(title) }).click();
  }
}
