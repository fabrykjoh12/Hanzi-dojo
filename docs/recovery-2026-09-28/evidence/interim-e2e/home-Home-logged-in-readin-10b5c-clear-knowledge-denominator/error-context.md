# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: home.spec.js >> Home (logged in) >> reading stays available while cards are due, with a clear knowledge denominator
- Location: tests/e2e/home.spec.js:153:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /Back to (library|story)/ })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: /Back to (library|story)/ })

```

```yaml
- link "Skip to content":
  - /url: "#main-content"
- main:
  - button "Back to stories"
  - text: 第一话
  - heading "我是新学生" [level=1]
  - text: 1 / 12
  - progressbar "Reading progress"
  - figure "Story line. Press Enter or the right arrow to explore words.":
    - img "Dusk. A young traveller with a scroll on their back stands small at the foot of a long stone stair, looking up at a lantern-hung dojo gate above a misty village."
    - group "Story line. Press Enter or the right arrow to explore words.":
      - button "Play this line"
      - button "Show English translation"
      - button "我": 我 wǒ
      - button "来": 来 lái
      - button "学校": 学校 xuéxiào
      - button "了": 了 le
      - text: 。
  - figure:
    - 'img "Low angle: the huge tiled dojo gateway towers over the traveller, who is a small dark shape at the bottom of the frame."'
    - group "Story line. Press Enter or the right arrow to explore words.":
      - button "Play this line"
      - button "Show English translation"
      - button "这": 这 zhè
      - button "是": 是 shì
      - button "学校": 学校 xuéxiào
      - button "吗": 吗 ma
      - text: ？
  - figure "Story line. Press Enter or the right arrow to explore words. Story line. Press Enter or the right arrow to explore words.":
    - 'img "Close-up: 小雨 leans grinning into the left of the frame, an ink brush through her hair and a red ribbon at one side; the right half of the panel is quiet empty wash."'
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 小雨
      - button "Play this line"
      - button "Show English translation"
      - button "你好": 你好 nǐ hǎo
      - text: ！
      - button "你是"
      - button "新": 新 xīn
      - button "学生": 学生 xuéshēng
      - button "吗": 吗 ma
      - text: ？
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 你
      - button "Play this line"
      - button "Show English translation"
      - button "是": 是 shì
      - text: ，
      - button "我": 我 wǒ
      - button "是": 是 shì
      - button "新": 新 xīn
      - button "学生": 学生 xuéshēng
      - text: 。
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 你
      - button "Play this line"
      - button "Show English translation"
      - button "我": 我 wǒ
      - button "来": 来 lái
      - button "学": 学 xué
      - button "写": 写 xiě
      - button "字": 字 zì
      - text: 。
  - figure:
    - img "小雨 in a lantern-lit courtyard, one hand at her chest as she introduces herself; the traveller's shoulder is in dark foreground at the left edge."
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 小雨
      - button "Play this line"
      - button "Show English translation"
      - button "太好了"
      - text: ！
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 小雨
      - button "Play this line"
      - button "Show English translation"
      - button "我": 我 wǒ
      - button "叫": 叫 jiào
      - button "小雨": 小雨 Xiǎo Yǔ
      - text: 。
      - button "你"
      - button "叫": 叫 jiào
      - button "什么": 什么 shénme
      - button "名字": 名字 míngzi
      - text: ？
  - figure "Story line. Press Enter or the right arrow to explore words.":
    - img "小雨 walks ahead along a covered lantern-lit walkway, turning back over her shoulder to beckon the traveller on."
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 小雨
      - button "Play this line"
      - button "Show English translation"
      - button "来": 来 lái
      - button "吧"
      - text: ！
      - button "我们"
      - button "去"
      - button "那边": 那边 nàbiān
      - text: 。
    - group "Story line. Press Enter or the right arrow to explore words.":
      - button "Play this line"
      - button "Show English translation"
      - button "学校": 学校 xuéxiào
      - button "很"
      - button "大": 大 dà
      - text: 。
  - figure:
    - 'img "The empty calligraphy hall: two rows of low writing tables, each with blank paper and a resting brush, under hanging lanterns."'
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 小雨
      - button "Play this line"
      - button "Show English translation"
      - button "这": 这 zhè
      - button "是": 是 shì
      - button "我们"
      - button "的": 的 de
      - button "学校": 学校 xuéxiào
      - text: 。
  - figure:
    - 'img "A letterbox panel: a tall calligraphy master stands in a lit doorway, face half in shadow, a brush held loosely at his side."'
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 林老师
      - button "Play this line"
      - button "Show English translation"
      - button "我": 我 wǒ
      - button "是": 是 shì
      - button "林老师": 林老师 Lín lǎoshī
      - text: 。
  - figure "Story line. Press Enter or the right arrow to explore words. Story line. Press Enter or the right arrow to explore words.":
    - img "林老师 kneels behind a low writing table, looking straight at the reader and opening one hand toward the empty cushion in the foreground."
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 林老师
      - button "Play this line"
      - button "Show English translation"
      - button "请": 请 qǐng
      - button "坐": 坐 zuò
      - text: 。
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 林老师
      - button "Play this line"
      - button "Show English translation"
      - button "你会"
      - button "写": 写 xiě
      - button "汉字": 汉字 hànzì
      - button "吗": 吗 ma
      - text: ？
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 你
      - button "Play this line"
      - button "Show English translation"
      - button "会": 会 huì
      - button "一点儿": 一点儿 yìdiǎnr
      - text: 。
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 你
      - button "Play this line"
      - button "Show English translation"
      - button "我": 我 wǒ
      - button "写": 写 xiě
      - button "不": 不 bù
      - button "好"
      - text: 。
  - figure:
    - img "Extreme close-up of the master's hand and brush beginning a single bold stroke of wet ink on blank paper."
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 林老师
      - button "Play this line"
      - button "Show English translation"
      - button "很"
      - button "好"
      - text: 。
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 林老师
      - button "Play this line"
      - button "Show English translation"
      - button "没关系": 没关系 méi guānxi
      - text: 。
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 林老师
      - button "Play this line"
      - button "Show English translation"
      - button "现在": 现在 xiànzài
      - button "我们"
      - button "学": 学 xué
      - button "写": 写 xiě
      - button "字": 字 zì
      - text: 。
  - figure:
    - img "小雨 leans over the writing table with both hands flat on it, eyes shining, watching the master's brush."
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 小雨
      - button "Play this line"
      - button "Show English translation"
      - button "这个": 这个 zhège
      - button "字": 字 zì
      - button "很"
      - button "漂亮": 漂亮 piàoliang
      - text: 。
  - figure "Story line. Press Enter or the right arrow to explore words.":
    - img "Almost darkness. A tiny white ink spirit with a single black brushstroke on its forehead peers out from behind a paper lantern, trailing a thread of ink-smoke."
    - group "Story line. Press Enter or the right arrow to explore words.":
      - button "Play this line"
      - button "Show English translation"
      - button "那": 那 nà
      - button "是": 是 shì
      - button "什么": 什么 shénme
      - text: ？
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 小雨
      - button "Play this line"
      - button "Show English translation"
      - button "那": 那 nà
      - button "是": 是 shì
      - button "小白": 小白 Xiǎo Bái
      - text: 。
  - figure:
    - img "The traveller walks in through the dojo gate, seen from behind; far back down the steps the small white spirit drifts after them."
    - group "Story line. Press Enter or the right arrow to explore words.":
      - text: 小雨
      - button "Play this line"
      - button "Show English translation"
      - button "小白": 小白 Xiǎo Bái
      - button "喜欢": 喜欢 xǐhuan
      - button "看"
      - button "我们"
      - button "写": 写 xiě
      - button "字": 字 zì
      - text: 。
    - group "Story line. Press Enter or the right arrow to explore words.":
      - button "Play this line"
      - button "Show English translation"
      - button "小白": 小白 Xiǎo Bái
      - button "也": 也 yě
      - button "想": 想 xiǎng
      - button "学": 学 xué
      - button "汉字": 汉字 hànzì
      - button "吗": 吗 ma
      - text: ？
- status "Notifications"
```

# Test source

```ts
  60  |
  61  |     await home.goto();
  62  |     await home.hero.focus();
  63  |     await page.keyboard.press('Space');
  64  |     await expect(page).toHaveURL(/\/study$/);
  65  |     await expect(new StudyPage(page).showAnswer).toBeVisible();
  66  |   });
  67  |
  68  |   test('the primary control remains stable while pressed and focused', async () => {
  69  |     const before = await home.hero.boundingBox();
  70  |     await home.hero.focus();
  71  |     await expect(home.hero).toBeFocused();
  72  |     await home.hero.dispatchEvent('pointerdown');
  73  |     await home.hero.dispatchEvent('pointerup');
  74  |     const after = await home.hero.boundingBox();
  75  |     expect(after.width).toBeCloseTo(before.width, 1);
  76  |     expect(after.height).toBeCloseTo(before.height, 1);
  77  |     expect(before.width).toBeGreaterThanOrEqual(44);
  78  |     expect(before.height).toBeGreaterThanOrEqual(44);
  79  |   });
  80  |
  81  |   test('queue labels wrap without overlap at 320px with 200% text', async ({ page }) => {
  82  |     await page.setViewportSize({ width: 320, height: 568 });
  83  |     await home.goto();
  84  |     await home.hero.evaluate(node => {
  85  |       const sizes = [...node.querySelectorAll('*')].map(el => [el, getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight]);
  86  |       for (const [el, size, line] of sizes) {
  87  |         el.style.fontSize = parseFloat(size) * 2 + 'px';
  88  |         if (Number.isFinite(parseFloat(line))) el.style.lineHeight = parseFloat(line) * 2 + 'px';
  89  |       }
  90  |     });
  91  |     const labels = ['New', 'Learning', 'Review'];
  92  |     const boxes = [];
  93  |     for (const label of labels) {
  94  |       const row = home.hero.getByText(new RegExp('^\\d+\\s*' + label + '$'));
  95  |       await expect(row).toBeVisible();
  96  |       boxes.push(await row.boundingBox());
  97  |     }
  98  |     for (let i = 0; i < boxes.length; i++) {
  99  |       const a = boxes[i];
  100 |       expect(a.x).toBeGreaterThanOrEqual(0);
  101 |       expect(a.x + a.width).toBeLessThanOrEqual(320);
  102 |       for (const b of boxes.slice(i + 1)) {
  103 |         const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5
  104 |           && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;
  105 |         expect(overlap).toBe(false);
  106 |       }
  107 |     }
  108 |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  109 |   });
  110 |
  111 |   test('every Home block scrolls clear of the floating dock at 320x568', async ({ page }) => {
  112 |     await page.setViewportSize({ width: 320, height: 568 });
  113 |     await home.goto();
  114 |     await expect(home.weekPanel).toBeVisible();
  115 |     // The screen must genuinely scroll here, or the assertion proves nothing.
  116 |     const scrollable = await page.evaluate(() =>
  117 |       document.documentElement.scrollHeight > document.documentElement.clientHeight);
  118 |     expect(scrollable).toBe(true);
  119 |
  120 |     await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  121 |     await page.waitForTimeout(200);
  122 |     const geometry = await page.evaluate(() => {
  123 |       const nav = document.querySelector('nav[aria-label="Primary"]').getBoundingClientRect();
  124 |       const last = document.querySelector('[data-tour="home-week"]').getBoundingClientRect();
  125 |       return { clearance: nav.top - last.bottom, navBottomGap: window.innerHeight - nav.bottom };
  126 |     });
  127 |     // Scrolled to the very end, the last block still sits a comfortable margin
  128 |     // above the dock — the dock reserves its height, the inset, and the gap.
  129 |     expect(geometry.clearance).toBeGreaterThanOrEqual(24);
  130 |     expect(geometry.navBottomGap).toBeGreaterThan(0);
  131 |   });
  132 |
  133 |   test('content has no decorative scenery competing with learning actions', async ({ page }) => {
  134 |     await expect(page.locator('[data-home-scene], [data-hero-art]')).toHaveCount(0);
  135 |   });
  136 |
  137 |   test('the scene follows the local clock', async ({ page }) => {
  138 |     await page.clock.setFixedTime(new Date(2026, 7, 20, 8, 0, 0));
  139 |     await home.goto();
  140 |     await expect(page.locator('[data-home-stage]')).toHaveAttribute('data-scene', 'morning');
  141 |     await page.clock.setFixedTime(new Date(2026, 7, 20, 19, 0, 0));
  142 |     await home.goto();
  143 |     await expect(page.locator('[data-home-stage]')).toHaveAttribute('data-scene', 'evening');
  144 |   });
  145 |
  146 |   test('offers exactly one primary action', async ({ page }) => {
  147 |     await expect(home.heroAction).toBeVisible();
  148 |     await expect(page.getByRole('button', { name: /Start reviewing/ })).toHaveCount(1);
  149 |     // Home is a coach, not a menu — no competing per-stat buttons.
  150 |     await expect(page.getByRole('button', { name: /Review now|Learn them|Practice now/ })).toHaveCount(0);
  151 |   });
  152 |
  153 |   test('reading stays available while cards are due, with a clear knowledge denominator', async ({ page }) => {
  154 |     await expect(home.storyHandoff).toBeVisible();
  155 |     await expect(home.storyHandoff.getByText('Then read')).toBeVisible();
  156 |     await expect(home.storyHandoff).toBeEnabled();
  157 |     await expect(home.storyHandoff.getByText(/\d+% of matched words known|Read with word lookup/)).toBeVisible();
  158 |     await home.storyHandoff.click();
  159 |     await expect(page).toHaveURL(/\/stories\//);
> 160 |     await expect(page.getByRole('button', { name: /Back to (library|story)/ })).toBeVisible();
      |                                                                                 ^ Error: expect(locator).toBeVisible() failed
  161 |   });
  162 |
  163 |   test('shows weekly activity and honestly scoped vocabulary progress', async () => {
  164 |     await expect(home.weekPanel.getByText('Your week')).toBeVisible();
  165 |     await expect(home.weekPanel.getByText(/No sessions yet|Studied \d+ of the last \d+ days/)).toBeVisible();
  166 |     await expect(home.weekPanel.getByText('Your study vocabulary')).toBeVisible();
  167 |     await expect(home.weekPanel.getByText(/\d+ of \d+ words/)).toBeVisible();
  168 |     await expect(home.weekPanel.getByRole('progressbar')).toBeVisible();
  169 |     await expect(home.weekPanel.getByText(/waiting tomorrow|free day/)).toBeVisible();
  170 |   });
  171 |
  172 |   test('uses the approved three-tab primary navigation', async ({ page }) => {
  173 |     const nav = page.getByRole('navigation', { name: 'Primary' });
  174 |     await expect(nav.getByRole('button', { name: 'Stories' })).toBeVisible();
  175 |     await expect(nav.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  176 |     await expect(nav.getByRole('button', { name: 'Practice' })).toBeVisible();
  177 |     await expect(nav.getByRole('button', { name: 'Cards' })).toHaveCount(0);
  178 |     await expect(nav.getByRole('button', { name: 'More' })).toHaveCount(0);
  179 |   });
  180 |
  181 |   test('the header profile button opens Profile', async ({ page }) => {
  182 |     await page.getByRole('button', { name: 'Open profile' }).click();
  183 |     await expect(page).toHaveURL(/\/profile$/);
  184 |   });
  185 |
  186 |   test('does not show a streak badge, XP, or a fluency score', async ({ page }) => {
  187 |     await expect(page.getByText(/day streak/i)).toHaveCount(0);
  188 |     await expect(page.getByText(/study today to keep it/i)).toHaveCount(0);
  189 |     await expect(page.getByText(/\bXP\b/)).toHaveCount(0);
  190 |     await expect(page.getByText(/fluency/i)).toHaveCount(0);
  191 |   });
  192 |
  193 |   test('a placeholder holds the hand-off row while the story is found', async ({ page }) => {
  194 |     // Slow the stories fetch down: the row must be held by a same-sized
  195 |     // skeleton rather than popping in and shifting the page.
  196 |     await page.route('**/rest/v1/stories**', async (route) => {
  197 |       await new Promise(resolve => setTimeout(resolve, 1500));
  198 |       await route.fallback();
  199 |     });
  200 |     await page.goto('/');
  201 |     const skeleton = page.locator('[data-home-stage] [aria-busy="true"]');
  202 |     await expect(skeleton).toBeVisible();
  203 |     await expect(home.storyHandoff).toBeVisible();
  204 |     await expect(skeleton).toHaveCount(0);
  205 |   });
  206 |
  207 |   test('the hero opens Study while cards are due', async ({ page }) => {
  208 |     await home.heroAction.click();
  209 |     const study = new StudyPage(page);
  210 |     await expect(study.showAnswer).toBeVisible();
  211 |   });
  212 |
  213 |   test('fits a small phone without horizontal overflow', async ({ page }) => {
  214 |     await page.setViewportSize({ width: 320, height: 568 });
  215 |     await home.goto();
  216 |     await expect(home.hero).toBeVisible();
  217 |     for (const label of ['New', 'Learning', 'Review']) {
  218 |       await expect(home.hero.getByText(new RegExp('^\\d+\\s*' + label + '$'))).toBeVisible();
  219 |     }
  220 |     const overflow = await page.evaluate(() => ({
  221 |       scroll: document.documentElement.scrollWidth,
  222 |       client: document.documentElement.clientWidth,
  223 |     }));
  224 |     expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
  225 |   });
  226 |
  227 |   test('keeps retired Cards and More deep links compatible', async ({ page }) => {
  228 |     await page.goto('/cards');
  229 |     await expect(page).toHaveURL(/\/study$/);
  230 |     await expect(new StudyPage(page).showAnswer).toBeVisible();
  231 |     await page.goBack();
  232 |     await expect(page).toHaveURL(/\/$/);
  233 |     await expect(page).not.toHaveURL(/\/cards$/);
  234 |     await page.goto('/more');
  235 |     await expect(page).toHaveURL(/\/profile$/);
  236 |     const account = page.getByRole('navigation', { name: 'Account' });
  237 |     await expect(account).toBeVisible();
  238 |     await account.getByRole('button', { name: 'Settings' }).click();
  239 |     await expect(page).toHaveURL(/\/settings$/);
  240 |   });
  241 |
  242 |   test('returns from a completed Study session with fresh Home availability', async ({ page }) => {
  243 |     test.setTimeout(90000);
  244 |     await home.heroAction.click();
  245 |     const study = new StudyPage(page);
  246 |     const backHome = page.getByRole('button', { name: 'Back home' });
  247 |     for (let graded = 0; graded < 40; graded += 1) {
  248 |       const next = await Promise.race([
  249 |         backHome.waitFor({ state: 'visible' }).then(() => 'done'),
  250 |         study.showAnswer.waitFor({ state: 'visible' }).then(() => 'card'),
  251 |       ]);
  252 |       if (next === 'done') break;
  253 |       await study.reveal();
  254 |       await study.gradeGood.click();
  255 |     }
  256 |     await expect(backHome).toBeVisible();
  257 |     await backHome.click();
  258 |     await expect(page).toHaveURL(/\/$/);
  259 |     await expect(page.locator('[data-home-stage]')).toHaveAttribute('data-home-stage', 'story');
  260 |     // The hero has retargeted: the queue is clear and the one action is
```