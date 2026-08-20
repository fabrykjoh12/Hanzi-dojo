import { describe, it, expect } from 'vitest'
import { groupIntoArcs, leadingChapterNumber, stripLeadingNumber, SAGA_CONTINUATIONS } from './storyArcs'

const s = (id, title) => ({ id, title })

describe('leadingChapterNumber', () => {
  it('reads an ASCII leading number followed by a separator', () => {
    expect(leadingChapterNumber('1. The Cat')).toBe(1)
    expect(leadingChapterNumber('12、xxx')).toBe(12)
    expect(leadingChapterNumber('3：始まり')).toBe(3)
  })
  it('reads a fullwidth leading number', () => {
    expect(leadingChapterNumber('２．つづき')).toBe(2)
  })
  it('does not mistake content digits for a chapter number', () => {
    expect(leadingChapterNumber('2024年の冬')).toBe(null) // digit run not followed by a separator
    expect(leadingChapterNumber('3つの願い')).toBe(null)
    expect(leadingChapterNumber('三日 あとです')).toBe(null) // no leading ASCII/fullwidth digit
    expect(leadingChapterNumber('')).toBe(null)
  })
})

describe('stripLeadingNumber', () => {
  it('removes the chapter marker and trims', () => {
    expect(stripLeadingNumber('1. The Cat')).toBe('The Cat')
    expect(stripLeadingNumber('2、三日 あとです')).toBe('三日 あとです')
  })
  it('leaves an unnumbered title untouched', () => {
    expect(stripLeadingNumber('三日 あとです')).toBe('三日 あとです')
  })
})

describe('groupIntoArcs', () => {
  it('keeps a single ascending run as one arc', () => {
    const arcs = groupIntoArcs([s('a', '1. Cat'), s('b', '2. Cat'), s('c', '3. Cat')])
    expect(arcs).toHaveLength(1)
    expect(arcs[0].parts.map(p => p.id)).toEqual(['a', 'b', 'c'])
    expect(arcs[0].title).toBe('Cat')
    expect(arcs[0].numbered).toBe(true)
  })
  it('splits into a new arc when the chapter number resets to 1', () => {
    const arcs = groupIntoArcs([
      s('a', '1. Missing Cat'), s('b', '2. Missing Cat'),
      s('c', '1. Snow Day'), s('d', '2. Snow Day'), s('e', '3. Snow Day'),
    ])
    expect(arcs).toHaveLength(2)
    expect(arcs[0].title).toBe('Missing Cat')
    expect(arcs[0].parts).toHaveLength(2)
    expect(arcs[1].title).toBe('Snow Day')
    expect(arcs[1].parts).toHaveLength(3)
  })
  it('splits when numbering moves backwards even if not to 1', () => {
    const arcs = groupIntoArcs([s('a', '2. A'), s('b', '3. A'), s('c', '2. B')])
    expect(arcs).toHaveLength(2)
    expect(arcs[1].parts.map(p => p.id)).toEqual(['c'])
  })
  it('groups unnumbered stories into a single arc marked not-numbered', () => {
    const arcs = groupIntoArcs([s('a', '公园里的下午'), s('b', '下雨天'), s('c', '老朋友')])
    expect(arcs).toHaveLength(1)
    expect(arcs[0].numbered).toBe(false)
    expect(arcs[0].parts).toHaveLength(3)
  })
  it('is safe on empty/garbage input', () => {
    expect(groupIntoArcs([])).toEqual([])
    expect(groupIntoArcs(null)).toEqual([])
  })
})

describe('第N话 chapter markers', () => {
  // A manhua episode announces its chapter the Chinese way. Before this was
  // understood, 第一话 read as "no number", so the episode did not start an arc
  // — it was appended to whatever season came before it in story_number order,
  // and vanished as an extra chapter inside someone else's series card.
  it('reads a Chinese-numeral chapter marker', () => {
    expect(leadingChapterNumber('第一话 · 我是新学生')).toBe(1)
    expect(leadingChapterNumber('第二话 · 墨')).toBe(2)
    expect(leadingChapterNumber('第十话 x')).toBe(10)
    expect(leadingChapterNumber('第十二章 x')).toBe(12)
    expect(leadingChapterNumber('第二十话 x')).toBe(20)
    expect(leadingChapterNumber('第二十一回 x')).toBe(21)
  })

  it('reads digits inside the same form', () => {
    expect(leadingChapterNumber('第10话 x')).toBe(10)
    expect(leadingChapterNumber('第３章 x')).toBe(3)
  })

  it('strips the marker for the arc title', () => {
    expect(stripLeadingNumber('第一话 · 我是新学生')).toBe('我是新学生')
    expect(stripLeadingNumber('第10章：开始')).toBe('开始')
  })

  it('is not fooled by ordinary prose that starts with 第', () => {
    // No unit character, so no marker…
    expect(leadingChapterNumber('第一个朋友')).toBeNull()
    // …and a unit that runs straight into more words is a sentence, not a label.
    expect(leadingChapterNumber('第一话说得很好')).toBeNull()
    expect(leadingChapterNumber('第话 x')).toBeNull()
    expect(stripLeadingNumber('第一个朋友')).toBe('第一个朋友')
  })

  it('starts its own arc instead of joining the season before it', () => {
    const arcs = groupIntoArcs([
      { id: 'a', title: '1. 下雪了' },
      { id: 'b', title: '2. 和朋友玩' },
      { id: 'c', title: '第一话 · 我是新学生' },
    ])
    expect(arcs).toHaveLength(2)
    expect(arcs[0].parts.map(p => p.id)).toEqual(['a', 'b'])
    expect(arcs[1].parts.map(p => p.id)).toEqual(['c'])
    expect(arcs[1].title).toBe('我是新学生')
  })

  it('keeps a multi-episode manhua season together', () => {
    const arcs = groupIntoArcs([
      { id: 'e1', title: '第一话 · 我是新学生' },
      { id: 'e2', title: '第二话 · 墨' },
      { id: 'e3', title: '第三话 · 夜' },
    ])
    expect(arcs).toHaveLength(1)
    expect(arcs[0].parts).toHaveLength(3)
    expect(arcs[0].numbered).toBe(true)
  })
})

// ── Cross-level sagas (regression, real library titles) ─────────────────────
// Two prose sagas number chapters continuously across levels (1–6 at HSK 1,
// 7–12 at HSK 2, 13–18 at HSK 3). Before the SAGA_CONTINUATIONS registry the
// per-level derivation swallowed each continuation run into whatever arc
// preceded it in story_number order. These specs are the real per-level title
// sequences (narrative stories only, reading order) from the live library.

const titles = (list) => list.map((title, i) => ({ id: 'r' + i, title }))
const partition = (arcs) => arcs.map(a => a.title + ':' + a.parts.length)

describe('cross-level saga grouping', () => {
  it('HSK 1 — the base runs stay intact, nothing over-splits', () => {
    const arcs = groupIntoArcs(titles([
      '1. 不见了的苹果',
      '1. 今天唱歌', '2. 上班和上学', '3. 商店寻宝记', '4. 李明唱歌', '5. 找歌的书', '6. 我们的歌',
      '1. 新的地方', '2. 明天去新地方', '3. 发现秘密的书',
      '1. 大毛不见了', '2. 学校里', '3. 商店', '4. 下雨了', '5. 大毛回来了',
      '1. 下雪了', '2. 和朋友玩', '3. 回家', '4. 妈妈做饭', '5. 晚上',
      '1. 妈妈很忙', '2. 小红家的鸡蛋', '3. 我一个人做饭', '4. 二十块钱', '5. 六点，七点，八点', '6. 六点，星期六',
      '1. 椅子上没有猫', '2. 椅子上的人', '3. 大毛不吃东西', '4. 下雪的星期日', '5. 四号房间', '6. 您叫什么名字',
      '1. 第七个人', '2. 一天七个', '3. 海上都是海', '4. 阿水不喝水', '5. 我们去一个岛', '6. 少了四个',
      '1. 八个人，我第八', '2. 六点', '3. 二十四', '4. 小明的二十分钟', '5. 你会跑多快', '6. 明天早上七点',
    ]))
    expect(partition(arcs)).toEqual([
      '不见了的苹果:1', '今天唱歌:6', '新的地方:3', '大毛不见了:5', '下雪了:5',
      '妈妈很忙:6', '椅子上没有猫:6', '第七个人:6', '八个人，我第八:6',
    ])
  })

  it('HSK 2 — the 7–12 runs split from their neighbours and take their saga titles', () => {
    const arcs = groupIntoArcs(titles([
      '1. 生日快要到了', '2. 生日快乐', '3. 一起运动', '4. 脚疼了', '5. 快乐的生日',
      '1. 最大的是谁', '2. 天说的话', '3. 云彩走了', '4. 风过不去的东西', '5. 最大的就在家里',
      // 守株待兔 ends at 5; the sea saga continues at 7 right after it.
      '1. 一只跑得很快的兔子', '2. 第二天', '3. 一天一天', '4. 田怎么了', '5. 农民回到田里',
      '7. 我跟着他', '8. 出去七个，回来六个', '9. 你为什么在这个船上', '10. 这个水不是我的', '11. 十九个', '12. 岛',
      // The dog arc ends at 6; the school saga's 7 is NUMERICALLY contiguous —
      // only identity, not numbers, can split these.
      '1. 一只狗', '2. 四点到五点', '3. 它有主人', '4. 我们跟着它', '5. 六楼的爷爷', '6. 明天四点',
      '7. 十九和十八', '8. 疼', '9. 两个星期', '10. 二十三', '11. 老师的一句话', '12. 十八和十八',
      '1. 没有人的地方', '2. 一口井', '3. 风族不住下', '4. 种下去', '5. 白天和晚上', '6. 火族来了',
      '7. 这是谁的城', '8. 阿山会什么', '9. 山那边的人', '10. 一个也不走', '11. 一个晚上', '12. 城的名字',
    ]))
    expect(partition(arcs)).toEqual([
      '生日快要到了:5', '最大的是谁:5',
      '一只跑得很快的兔子:5', '第七个人:6',
      '一只狗:6', '八个人，我第八:6',
      // A legitimate single-level 1–12 series stays ONE series.
      '没有人的地方:12',
    ])
  })

  it('HSK 3 — the 13–18 runs split and continue their sagas', () => {
    const arcs = groupIntoArcs(titles([
      '回家的路', '坚持',
      '1. 院子里的大水缸', '2. 上去看一看', '3. 水里面', '4. 司马光没有跑', '5. 水出来了',
      '1. 长得太慢了', '2. 一个办法', '3. 一天的工作', '4. 儿子往田里跑', '5. 第二天早上',
      '1. 田里的田螺', '2. 桌子上的饭', '3. 每天都是这样', '4. 他没有去田里', '5. 你没有吃我',
      '13. 上岛', '14. 没有人说不', '15. 一千天', '16. 我等了三年', '17. 第一天我就知道了', '18. 八个人',
      '1. 老王的眼镜', '2. 第一个客人', '3. 这条街都知道了', '4. 我写错了', '5. 最后一天', '6. 那个字',
      '13. 一个学校两个人', '14. 六天', '15. 星期六', '16. 十六分', '17. 前十四分钟', '18. 十六分五十',
    ]))
    expect(partition(arcs)).toEqual([
      '回家的路:2',
      '院子里的大水缸:5', '长得太慢了:5',
      '田里的田螺:5', '第七个人:6',
      '老王的眼镜:6', '八个人，我第八:6',
    ])
  })

  it('every registry entry names a continuation start above chapter 1', () => {
    for (const start of Object.keys(SAGA_CONTINUATIONS)) {
      expect(leadingChapterNumber(start)).toBe(null) // stripped titles carry no number
      expect(SAGA_CONTINUATIONS[start].length).toBeGreaterThan(0)
    }
  })

  it('a registered title without a leading chapter number does not split anything', () => {
    // The registry only fires on a numbered continuation start — a plain title
    // that happens to collide stays inside whatever arc it belongs to.
    const arcs = groupIntoArcs(titles(['1. 别的故事', '上岛']))
    expect(arcs).toHaveLength(1)
    expect(arcs[0].parts).toHaveLength(2)
  })
})
