import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore, DEFAULT_TITLE_INFO, DEFAULT_REVIEW, migrateSettings, type TitleInfoKey } from './settingsStore'
import { visibleSmartViews } from '../lib/smartViews'

const DEFAULT = {
  displayFields: {
    phonetic: true, part_of_speech: true, chinese_definition: true,
    english_definition: true, example: true, exchange: true, synonyms: true,
    derivatives: true,
  },
  dictionaries: { ecdict: true, wordnet: true },
  sidebarMode: 'alphabet',
}

describe('settingsStore（规格 §7）', () => {
  beforeEach(() => {
    useSettingsStore.setState(JSON.parse(JSON.stringify(DEFAULT)))
  })

  it('默认值：字段开关全开（含词源相关词）、词典开关全开、字母模式、抽屉关闭', () => {
    const s = useSettingsStore.getState()
    expect(s.sidebarMode).toBe('alphabet')
    expect(Object.values(s.displayFields).every(Boolean)).toBe(true)
    expect(s.displayFields.derivatives).toBe(true)
    expect(s.dictionaries.ecdict).toBe(true)
    expect(s.dictionaries.wordnet).toBe(true)
  })

  it('setDictionary 切换单词典开关', () => {
    useSettingsStore.getState().setDictionary('wordnet', false)
    const s = useSettingsStore.getState()
    expect(s.dictionaries.wordnet).toBe(false)
    expect(s.dictionaries.ecdict).toBe(true)
    useSettingsStore.getState().setDictionary('ecdict', false)
    expect(useSettingsStore.getState().dictionaries.ecdict).toBe(false)
  })

  it('setDisplayField 只改单个字段', () => {
    useSettingsStore.getState().setDisplayField('phonetic', false)
    const s = useSettingsStore.getState()
    expect(s.displayFields.phonetic).toBe(false)
    expect(s.displayFields.chinese_definition).toBe(true)
  })

  it('setSidebarMode 切换模式', () => {
    useSettingsStore.getState().setSidebarMode('category')
    expect(useSettingsStore.getState().sidebarMode).toBe('category')
  })

  it('持久化：修改写入 localStorage，且不含瞬时字段', () => {
    useSettingsStore.getState().setSidebarMode('category')
    useSettingsStore.getState().setDisplayField('phonetic', false)
    const raw = localStorage.getItem('wordsett-settings')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.state.sidebarMode).toBe('category')
    expect(parsed.state.displayFields.phonetic).toBe(false)
    expect(Object.keys(parsed.state).sort()).toEqual(
      ['dictionaries', 'displayFields', 'review', 'sidebarMode', 'smartViews', 'titleInfo']
    )
  })

  it('恢复：localStorage v1 数据 rehydrate 并迁移（剔除 etymology、补齐 synonyms、派生词与词典开关默认开）', async () => {
    localStorage.setItem('wordsett-settings', JSON.stringify({
      state: {
        displayFields: { phonetic: false, part_of_speech: true, chinese_definition: true, english_definition: true, example: true, exchange: true, etymology: true },
        sidebarMode: 'category',
      },
      version: 1,
    }))
    await useSettingsStore.persist.rehydrate()
    const s = useSettingsStore.getState()
    expect(s.sidebarMode).toBe('category')
    expect(s.displayFields.phonetic).toBe(false)
    expect(s.displayFields.synonyms).toBe(true)
    expect(s.displayFields.derivatives).toBe(true)
    expect(s.dictionaries.ecdict).toBe(true)
    expect(s.dictionaries.wordnet).toBe(true)
    expect('etymology' in s.displayFields).toBe(false)
  })
})

const TITLE_KEYS: TitleInfoKey[] = ['showBadges', 'showPhonetic', 'showWordRoot', 'showCollinsStars', 'showDomainCategory', 'showDomainRegion', 'showDomainUsage']

it('titleInfo 默认全 true', () => {
  const t = useSettingsStore.getState().titleInfo
  for (const k of TITLE_KEYS) expect(t[k]).toBe(true)
})

it('setTitleInfo 写入并持久化到 wordsett-settings / titleInfo', () => {
  useSettingsStore.getState().setTitleInfo('showPhonetic', false)
  const raw = localStorage.getItem('wordsett-settings')
  const parsed = JSON.parse(raw!)
  expect(parsed.state.titleInfo.showPhonetic).toBe(false)
})

it('迁移：v3 无 titleInfo 的旧数据补齐默认 true 并升 version 4', async () => {
  localStorage.setItem('wordsett-settings', JSON.stringify({
    state: { sidebarMode: 'category' },
    version: 3,
  }))
  await useSettingsStore.persist.rehydrate()
  const s = useSettingsStore.getState()
  expect(s.sidebarMode).toBe('category')
  for (const k of TITLE_KEYS) expect(s.titleInfo[k]).toBe(true)
})

it('showCollinsStars 默认开启（v0.5.3 §3.3）', () => {
  expect(DEFAULT_TITLE_INFO.showCollinsStars).toBe(true)
})

it('迁移：v4 旧数据（v0.5.2 实际写盘形态，titleInfo 无 showCollinsStars）补齐默认开启并保留旧键（v0.5.3 §3.3）', async () => {
  // v0.5.2 发布态写盘形态：version 4，titleInfo 仅 6 个旧键，刻意 true/false 混合以观察合并方向
  const legacyTitleInfo = {
    showBadges: false, showPhonetic: true, showWordRoot: false,
    showDomainCategory: true, showDomainRegion: false, showDomainUsage: true,
  }
  expect('showCollinsStars' in legacyTitleInfo).toBe(false)
  localStorage.setItem('wordsett-settings', JSON.stringify({
    state: { sidebarMode: 'category', titleInfo: legacyTitleInfo },
    version: 4,
  }))
  await useSettingsStore.persist.rehydrate()
  const s = useSettingsStore.getState()
  expect(s.titleInfo.showCollinsStars).toBe(true)
  for (const [k, v] of Object.entries(legacyTitleInfo)) {
    expect(s.titleInfo[k as TitleInfoKey]).toBe(v)
  }
})

it('旧设置无 showCollinsStars 键时经 migrate 合并默认开启，且保留旧键（v0.5.3 §3.3）', async () => {
  const legacyTitleInfo = {
    showBadges: false, showPhonetic: true, showWordRoot: false,
    showDomainCategory: false, showDomainRegion: true, showDomainUsage: false,
  }
  expect('showCollinsStars' in legacyTitleInfo).toBe(false)
  localStorage.setItem('wordsett-settings', JSON.stringify({
    state: { sidebarMode: 'category', titleInfo: legacyTitleInfo },
    version: 3,
  }))
  await useSettingsStore.persist.rehydrate()
  const s = useSettingsStore.getState()
  expect(s.titleInfo.showCollinsStars).toBe(true)
  for (const [k, v] of Object.entries(legacyTitleInfo)) {
    expect(s.titleInfo[k as TitleInfoKey]).toBe(v)
  }
})

describe('settingsStore 复习分区', () => {
  it('默认值：保留率 0.9 / 阈值 4 / 新词 10 / 上限 30 / 逐字母开 / 标题栏待复习 chip 开', () => {
    expect(DEFAULT_REVIEW).toEqual({
      retention: 0.9, leechThreshold: 4, newCardQuota: 10, queueLimit: 30,
      letterHighlight: true, showDueBadge: true,
    })
  })

  it('showDueBadge 默认开，且能被 setReview 关掉（v0.6.3 条目 5）', () => {
    useSettingsStore.setState({ review: DEFAULT_REVIEW })
    const s = useSettingsStore.getState()
    expect(s.review.showDueBadge).toBe(true)
    s.setReview('showDueBadge', false)
    expect(useSettingsStore.getState().review.showDueBadge).toBe(false)
  })

  it('setReview 只改指定键', () => {
    useSettingsStore.getState().setReview('newCardQuota', 5)
    expect(useSettingsStore.getState().review.newCardQuota).toBe(5)
    expect(useSettingsStore.getState().review.queueLimit).toBe(30)
    useSettingsStore.getState().setReview('newCardQuota', 10)
  })

  // persist 的 migrate 只在「存档 version ≠ 本处 version」时才跑（zustand persist 的守卫），
  // 故加 review 字段必须升 version。
  // 注意**不是**「存档缺该字段 → rehydrate 后是 undefined」：默认 merge 是
  // { ...currentState, ...persistedState }，存档铺在当前 state 之上，压根没有这个键时
  // 它不覆盖、默认值原样留着。真正出事的是**残缺的 review 对象**——正是下面这个
  // v0.6.2 的五键 legacyReview：migrate 的 `...DEFAULT_REVIEW` 是唯一给 showDueBadge
  // 补上 true 的地方，不升 version 它就只剩「当前值」，原先关掉过该开关的用户会在迁移
  // 后看到它被重新打开（保留当前值正是让关着的仍关着，丢的只是那个从未存在过的键）。
  it('迁移：v0.6.2 写盘的 review（无 showDueBadge）补齐默认开启并保留旧键（v0.6.3 条目 5）', async () => {
    const legacyReview = {
      retention: 0.85, leechThreshold: 6, newCardQuota: 20, queueLimit: 40, letterHighlight: false,
    }
    expect('showDueBadge' in legacyReview).toBe(false)
    localStorage.setItem('wordsett-settings', JSON.stringify({
      state: { sidebarMode: 'alphabet', review: legacyReview },
      version: 6,
    }))
    await useSettingsStore.persist.rehydrate()
    const s = useSettingsStore.getState()
    expect(s.review.showDueBadge).toBe(true)
    for (const [k, v] of Object.entries(legacyReview)) {
      expect(s.review[k as keyof typeof legacyReview]).toBe(v)
    }
  })
})

describe('smartViews 存档迁移（v0.6.5）', () => {
  it('旧存档（version 7、无 smartViews）迁移后四个视图默认全开', () => {
    // 直接调 migrate：只钉住**合并逻辑本身**（缺键回默认）。它验不出 migrate 有没有挂进
    // persist——导出了却没人引用的话这条照样绿。接线由下面那条**残缺存档**的 rehydrate 用例负责。
    const migrated = migrateSettings({ review: DEFAULT_REVIEW, smartViews: undefined })
    expect(migrated.smartViews).toEqual({ all: true, due: true, weekNew: true, leech: true })
  })

  it('残缺的 smartViews 存档（只有两个键）迁移后缺的键被默认补齐、已有的键保留', () => {
    // 这一条是「必须升 version」的真实理由：残缺对象合并进来时缺键会保留**当前**值，
    // 用户关掉的视图就静默地重新打开了。migrate 的默认铺底是唯一的补齐点。
    const migrated = migrateSettings({ review: DEFAULT_REVIEW, smartViews: { all: true, due: false } })
    expect(migrated.smartViews).toEqual({ all: true, due: false, weekNew: true, leech: true })
  })

  it('persist 的 version 是 8 —— 旧存档（7）据此触发 migrate，迁移后写盘升到 8', async () => {
    // 本文件里直接调 migrate 的用例**完全绕过** version，因此没有任何东西钉住这个数字：
    // 把它回退成 7 全仓依然绿，v7 存档从此不再走 migrate。这条把两件事合在一起验：
    // migrate 之后存档里那个字面量就是 8（改本处 version 会红），且 8 也**写回了** localStorage
    //（不写回则版本号每次启动都要重算一遍）。两种断言共享同一次播种与 rehydrate，
    // 刻意不拆成两条——拆开就是同一个测试写两遍，虚增一条覆盖。
    // 自行播种（不依赖前面的用例是否写过 localStorage），单独跑也得绿。
    localStorage.setItem('wordsett-settings', JSON.stringify({
      state: { sidebarMode: 'alphabet' },
      version: 7,
    }))
    expect(JSON.parse(localStorage.getItem('wordsett-settings')!).version).toBe(7)
    await useSettingsStore.persist.rehydrate()
    expect(JSON.parse(localStorage.getItem('wordsett-settings')!).version).toBe(8)
  })

  it('真实 rehydrate 一份 version 7 且无 smartViews 的旧存档 → 四个视图全开', async () => {
    // 对照用例：存档里**压根没有** smartViews 这个键时，走不走 migrate 结果都是全开——
    // 缺键由 store 自己的 DEFAULT_SMART_VIEWS 兜着（默认 merge 把存档铺在当前 state 之上，
    // 不存在的键不覆盖）。所以本条**观察不到 migrate 的接线**：把 migrate 从 persist 上摘掉、
    // 或把 version 回退成 7，这两种变异下本条都还是绿的（把 `...DEFAULT_SMART_VIEWS`
    // 那道默认铺底也一并删掉，它才会红——那属于「合并逻辑」而非「接线」，由本文件里
    // 直接调 migrate 的用例负责）。留它是作为「旧存档最常见的那份形状不炸、不丢视图」
    // 的无脑回归，以及与下一条的显式对照——真正钉住接线的是**残缺**存档那条。
    localStorage.setItem('wordsett-settings', JSON.stringify({
      state: { sidebarMode: 'alphabet', review: DEFAULT_REVIEW },
      version: 7,
    }))
    await useSettingsStore.persist.rehydrate()
    expect(useSettingsStore.getState().smartViews).toEqual({ all: true, due: true, weekNew: true, leech: true })
    expect(visibleSmartViews(useSettingsStore.getState().smartViews)).toEqual(['all', 'due', 'weekNew', 'leech'])
  })

  it('真实 rehydrate 一份 version 7 且 smartViews 残缺的旧存档 → 缺键被补齐（钉住 migrate 的接线）', async () => {
    // 端到端层里**有牙齿**的两条是本条与下面那条（都是残缺形状，且都要靠 rehydrate
    // 才观察得到）：残缺对象合并进来时，缺的键保留的是**当前**值
    // （可能已被用户关掉）。migrate 把默认铺在存档之下、给缺键补上 true/默认，
    // 而它只在 version 不相等时才被调用。因此 migrate 若被摘掉、或 version 被回退成 7，
    // 本条与下一条都会红；上一条「无 smartViews 键」那种形状则两种情况下都绿。
    localStorage.setItem('wordsett-settings', JSON.stringify({
      state: { smartViews: { all: true, due: false } },
      version: 7,
    }))
    await useSettingsStore.persist.rehydrate()
    expect(useSettingsStore.getState().smartViews).toEqual({ all: true, due: false, weekNew: true, leech: true })
  })
})
