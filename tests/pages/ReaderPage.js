// Page Object for the story reader (poster grids → series page → reader).
// See src/Stories.jsx: the library is series-first vertical poster grids
// (current level's series, short reads, practice, collapsed earlier levels),
// one poster per series or standalone story. Tapping a standalone poster
// opens the reader directly; tapping a multi-chapter series poster opens its
// series detail page, whose chapter rows open the reader. Lookups scope to
// the grids so the Continue card — which may show the same title — never
// shadows a poster, and take the first match.
export class ReaderPage {
  constructor(page) {
    this.page = page;
  }
  async gotoStories() {
    await this.page.goto('/stories');
  }

  // Passed levels collapse to a two-poster preview — open every "See all"
  // so lookups reach the full library regardless of which level holds the
  // story. Each click flips one expander to "Show less".
  async expandAllLevels() {
    await this.page.getByTestId('poster-grid').first().waitFor({ state: 'visible' });
    for (let i = 0; i < 8; i += 1) {
      const seeAll = this.page.getByRole('button', { name: /See all \d+/ }).first();
      if ((await seeAll.count()) === 0) break;
      await seeAll.click();
    }
  }

  // Opens the seeded first story into the reader.
  async openFirstStory() {
    await this.openStoryByTitle('公园里的下午');
  }

  // Opens a story by its title into the reader. Scope to the shelf rails so
  // the hero — which may show the same title — never shadows the poster.
  async openStoryByTitle(title) {
    await this.gotoStories();
    await this.expandAllLevels();
    const card = this.page.getByTestId('poster-grid')
      .getByRole('button', { name: new RegExp(title) }).first();
    await card.click();
  }

  // Serial chapters live behind their series poster: open the series page,
  // then pick the chapter. A series whose reachable levels hold only ONE
  // chapter renders as a plain story poster and opens the reader directly —
  // in that case there is no chapter list to go through.
  async openSeriesStoryByTitle(seriesTitle, storyTitle) {
    await this.gotoStories();
    await this.expandAllLevels();
    const poster = this.page.getByTestId('poster-grid')
      .getByRole('button', { name: new RegExp(seriesTitle) }).first();
    await poster.click();
    const chapters = this.page.getByRole('heading', { name: 'Chapters' });
    try {
      await chapters.waitFor({ state: 'visible', timeout: 1500 });
    } catch {
      return; // single-chapter series — the poster already opened the reader
    }
    await this.page.getByRole('button', { name: new RegExp(storyTitle) }).first().click();
  }
}
