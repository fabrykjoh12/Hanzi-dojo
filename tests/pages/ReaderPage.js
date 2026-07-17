// Page Object for the story reader (categories → story list → reader).
// See src/Stories.jsx: the screen starts on the category grid (CategoryCard,
// tier 1 "First Steps" is unlocked from minWords 0 — src/storyTiers.js), then
// a tier's story list (StoryListCard, keyed by story.title), then the reader
// (StoryReaderImmersive).
export class ReaderPage {
  constructor(page) {
    this.page = page;
  }
  async gotoStories() {
    await this.page.goto('/stories');
  }
  // Opens the first available story into the reader: category grid → story
  // list → reader.
  async openFirstStory() {
    await this.gotoStories();
    // Category grid: tier 1 ("First Steps") is unlocked from day one.
    await this.page.getByRole('button', { name: /First Steps/ }).click();
    // Story list: click the seeded story's card by its title.
    await this.page.getByRole('button', { name: '公园里的下午' }).click();
  }

  // Opens a story by its title into the reader: category grid → story list →
  // reader. Mirrors openFirstStory's category-walk, but targets any title so
  // tests can open a specific tier-1 story (e.g. a chat-format story).
  async openStoryByTitle(title) {
    await this.gotoStories();
    await this.page.getByRole('button', { name: /First Steps/ }).click();
    await this.page.getByRole('button', { name: title }).click();
  }
}
