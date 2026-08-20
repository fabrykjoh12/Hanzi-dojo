// A representative CURRENT-LEVEL story library for visual review and visual
// tests — the shape the real HSK 2 library has (see the live-data survey in
// the Stories redesign): several multi-chapter series first, then a couple of
// standalone short reads, a few practice scenarios, a passed HSK 1 level, and
// an HSK 3 teaser. Real production titles and REAL production cover art
// (tests/fixtures/covers, served by mockSupabase's storage branch via the
// image_path slug).
//
// This is deliberately NOT wired into the shared TABLE_FIXTURES: dozens of
// specs pin counts, the featured pick, and lock states to the small default
// library. Serve it per-test with serveStoryLibrary(page).
//
// The canonical learner state (LIBRARY_READS / LIBRARY_UNLOCKS):
//   生日快要到了  ch 1 read, ch 2 NOT unlocked   → series with a locked next chapter
//   一只跑得很快的兔子 ch 1–2 read, ch 3 unlocked, most recent → the Continue card
//   没有人的地方  untouched                       → unstarted series
//   The Inkbound  3 manhua episodes, untouched   → manhua series
//   今天唱歌 (HSK 1) fully read; the rest of HSK 1 unread

const cover = (slug) => 'stories/' + slug + '/cover.webp'

function story({ id, level, n, title, content, slug, presentation = 'paced', panels = null, summary = null }) {
  return {
    id, language: 'chinese', system: 'hsk', level, tier: 1, story_number: n,
    title, is_published: true, presentation, has_audio: false,
    image_path: cover(slug), english_summary: summary,
    english_content: summary, content, panels,
  }
}

const ink = (label, title) => ({ meta: { series: 'Hanzi Dojo: The Inkbound', episode_label: label, episode_title: title } })

export const STORY_LIBRARY = [
  // ── HSK 2 · series ────────────────────────────────────────────────────────
  story({ id: 'lib-shengri-1', level: 2, n: 1, title: '1. 生日快要到了', slug: 'shengri', summary: 'A birthday is coming.', content: '妈妈的生日快要到了。\n小明：我们去商店吧！\n朋友：好，我们一起去。' }),
  story({ id: 'lib-shengri-2', level: 2, n: 2, title: '2. 生日快乐', slug: 'shengri', content: '今天天气很好。\n妈妈很喜欢花。\n我们去公园。' }),
  story({ id: 'lib-shengri-3', level: 2, n: 3, title: '3. 一起运动', slug: 'shengri', content: '我们去公园运动。\n天气很好。' }),
  story({ id: 'lib-shengri-4', level: 2, n: 4, title: '4. 脚疼了', slug: 'shengri', content: '小明的脚疼了。\n朋友：你坐一下吧。' }),
  story({ id: 'lib-shengri-5', level: 2, n: 5, title: '5. 快乐的生日', slug: 'shengri', content: '晚上我们回家。\n妈妈：这是最快乐的生日。' }),

  story({ id: 'lib-tuzi-1', level: 2, n: 6, title: '1. 一只跑得很快的兔子', slug: 'tuzi', summary: 'A very fast rabbit.', content: '田里有一只兔子。\n它跑得很快。\n农民看着它。' }),
  story({ id: 'lib-tuzi-2', level: 2, n: 7, title: '2. 第二天', slug: 'tuzi', content: '第二天农民又来了。\n兔子不在田里。' }),
  story({ id: 'lib-tuzi-3', level: 2, n: 8, title: '3. 一天一天', slug: 'tuzi3', content: '今天天气很好。\n我们去公园。\n学生们看兔子。' }),
  story({ id: 'lib-tuzi-4', level: 2, n: 9, title: '4. 田怎么了', slug: 'tuzi', content: '朋友问：你的田怎么了？\n农民不说话。' }),
  story({ id: 'lib-tuzi-5', level: 2, n: 10, title: '5. 农民回到田里', slug: 'tuzi', content: '农民回到田里工作。\n兔子没有再来。' }),

  story({ id: 'lib-feng-1', level: 2, n: 11, title: '1. 没有人的地方', slug: 'fengcheng', summary: 'A place with no people.', content: '今天风族的人走到山下。\n那边有一口井，很大。' }),
  story({ id: 'lib-feng-2', level: 2, n: 12, title: '2. 一口井', slug: 'fengcheng', content: '井里有水。\n风族的人很高兴。' }),
  story({ id: 'lib-feng-3', level: 2, n: 13, title: '3. 风族不住下', slug: 'fengcheng', content: '风族的人不想住下。\n他们要走。' }),
  story({ id: 'lib-feng-4', level: 2, n: 14, title: '4. 种下去', slug: 'fengcheng', content: '一个人把东西种下去。\n他说：我们等等看。' }),
  story({ id: 'lib-feng-5', level: 2, n: 15, title: '5. 白天和晚上', slug: 'fengcheng', content: '白天他们工作。\n晚上他们看星星。' }),

  story({ id: 'lib-ink-1', level: 2, n: 16, title: '第一话 · 我是新学生', slug: 'ink1', presentation: 'manhua', panels: ink('第一话', '我是新学生'), summary: 'You arrive at the dojo.', content: '今天老师来学校。\n天气很好。\n我是新学生。' }),
  story({ id: 'lib-ink-2', level: 2, n: 17, title: '第二话 · 字会说话', slug: 'ink2', presentation: 'manhua', panels: ink('第二话', '字会说话'), content: '这个字会说话吗？\n老师：你听。' }),
  story({ id: 'lib-ink-3', level: 2, n: 18, title: '第三话 · 夜里的字', slug: 'ink3', presentation: 'manhua', panels: ink('第三话', '夜里的字'), content: '夜里没有人。\n字在纸上走。' }),

  // ── HSK 2 · short reads ───────────────────────────────────────────────────
  story({ id: 'lib-moban', level: 2, n: 19, title: '《末班车》', slug: 'moban', presentation: 'manhua', panels: { meta: { story_kind: 'standalone' } }, summary: 'The last train.', content: '现在是晚上十一点。\n他跑到公园那边的车站。\n很晚了。' }),

  // ── HSK 2 · practice ──────────────────────────────────────────────────────
  story({ id: 'lib-zhoumo', level: 2, n: 20, title: '周末做什么', slug: 'zhoumo', presentation: 'chat', content: '小明：周末你做什么？\n朋友：我去公园。\n小明：我们一起去吧。' }),
  story({ id: 'lib-dongwuyuan', level: 2, n: 21, title: '在动物园', slug: 'dongwuyuan', presentation: 'scene', content: '🐼 动物园里有很多人。\n🐘 你看，它在喝水。\n😊 我们很高兴。' }),
  story({ id: 'lib-dianying', level: 2, n: 22, title: '周末的电影', slug: 'dianying', presentation: 'chat', content: '朋友：这个电影好看吗？\n小明：很好看！' }),

  // ── HSK 1 · a passed level ────────────────────────────────────────────────
  story({ id: 'lib-changge-1', level: 1, n: 1, title: '1. 今天唱歌', slug: 'changge', summary: 'Singing today.', content: '今天天气很好。\n我们唱歌。' }),
  story({ id: 'lib-changge-2', level: 1, n: 2, title: '2. 上班和上学', slug: 'changge', content: '爸爸上班。\n我上学。' }),
  story({ id: 'lib-changge-3', level: 1, n: 3, title: '3. 商店寻宝记', slug: 'changge', content: '我们去商店。\n商店很大。' }),
  story({ id: 'lib-changge-4', level: 1, n: 4, title: '4. 李明唱歌', slug: 'changge', content: '李明唱歌。\n大家听。' }),
  story({ id: 'lib-changge-5', level: 1, n: 5, title: '5. 找歌的书', slug: 'changge', content: '我找一本书。\n书里有歌。' }),
  story({ id: 'lib-changge-6', level: 1, n: 6, title: '6. 我们的歌', slug: 'changge', content: '我们一起唱歌。\n这是我们的歌。' }),
  story({ id: 'lib-damao-1', level: 1, n: 7, title: '1. 大毛不见了', slug: 'damao', summary: 'The cat is missing.', content: '大毛回来。\n今天我们去公园找它。\n天气很好。' }),
  story({ id: 'lib-damao-2', level: 1, n: 8, title: '2. 学校里', slug: 'damao', content: '学校里没有大毛。\n我们再找。' }),
  story({ id: 'lib-damao-3', level: 1, n: 9, title: '3. 商店', slug: 'damao', content: '商店里也没有。\n天晚了。' }),
  story({ id: 'lib-damao-4', level: 1, n: 10, title: '4. 下雨了', slug: 'damao', content: '下雨了。\n我们回家。' }),
  story({ id: 'lib-damao-5', level: 1, n: 11, title: '5. 大毛回来了', slug: 'damao', content: '门口有猫。\n大毛回来了！' }),
  story({ id: 'lib-yikuaiqian', level: 1, n: 12, title: '《一块钱》', slug: 'yikuaiqian', presentation: 'manhua', panels: { meta: { story_kind: 'standalone' } }, summary: 'One kuai.', content: '他有九块钱。\n面条儿十块钱。\n他想：今天很难。' }),

  // ── HSK 3 · the road ahead (served content-free by the teaser query) ──────
  story({ id: 'lib-huijia', level: 3, n: 1, title: '回家的路', slug: 'huijia', summary: 'The road home.', content: '回家的路很长。' }),
  story({ id: 'lib-shuigang-1', level: 3, n: 2, title: '1. 院子里的大水缸', slug: 'shuigang', summary: 'The big water vat.', content: '院子里有一个大水缸。' }),
  story({ id: 'lib-taiman-1', level: 3, n: 3, title: '1. 长得太慢了', slug: 'taiman', summary: 'Growing too slowly.', content: '苗长得太慢了。' }),
]

// The canonical learner state described in the header.
export const LIBRARY_READS = [
  { story_id: 'lib-changge-1', read_at: '2026-07-01T10:00:00.000Z' },
  { story_id: 'lib-changge-2', read_at: '2026-07-02T10:00:00.000Z' },
  { story_id: 'lib-changge-3', read_at: '2026-07-03T10:00:00.000Z' },
  { story_id: 'lib-changge-4', read_at: '2026-07-04T10:00:00.000Z' },
  { story_id: 'lib-changge-5', read_at: '2026-07-05T10:00:00.000Z' },
  { story_id: 'lib-changge-6', read_at: '2026-07-06T10:00:00.000Z' },
  { story_id: 'lib-shengri-1', read_at: '2026-08-14T10:00:00.000Z' },
  { story_id: 'lib-tuzi-1', read_at: '2026-08-17T10:00:00.000Z' },
  { story_id: 'lib-tuzi-2', read_at: '2026-08-19T10:00:00.000Z' },
]
export const LIBRARY_UNLOCKS = [
  { story_id: 'lib-tuzi-2' },
  { story_id: 'lib-tuzi-3' },
]

const JSONH = { 'access-control-allow-origin': '*', 'content-type': 'application/json' }

// Serve the library (GET only; honors the shelf's two level filters the same
// way the shared mock does) plus the canonical reads/unlocks. Pass overrides
// to stage a different learner state.
export async function serveStoryLibrary(page, { stories = STORY_LIBRARY, reads = LIBRARY_READS, unlocks = LIBRARY_UNLOCKS } = {}) {
  await page.route('**/rest/v1/stories**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const url = new URL(route.request().url())
    let rows = stories
    const lf = url.searchParams.get('level')
    if (lf && lf.startsWith('eq.')) rows = rows.filter(r => r.level === Number(lf.slice(3)))
    else if (lf && lf.startsWith('lte.')) rows = rows.filter(r => r.level <= Number(lf.slice(4)))
    return route.fulfill({ status: 200, headers: JSONH, body: JSON.stringify(rows) })
  })
  await page.route('**/rest/v1/story_reads**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({ status: 200, headers: JSONH, body: JSON.stringify(reads) })
  })
  await page.route('**/rest/v1/story_unlocks**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({ status: 200, headers: JSONH, body: JSON.stringify(unlocks) })
  })
}
