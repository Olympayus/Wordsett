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
  // 故加 review 字段必须升 version，否则 v0.6.2 写盘的对象 rehydrate 后该字段是 undefined。
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
    // persist——导出了却没人引用的话这条照样绿。接线由下面两条 rehydrate 用例负责。
    const migrated = migrateSettings({ review: DEFAULT_REVIEW, smartViews: undefined })
    expect(migrated.smartViews).toEqual({ all: true, due: true, weekNew: true, leech: true })
  })

  it('残缺的 smartViews 存档（只有两个键）迁移后缺的键被默认补齐、已有的键保留', () => {
    // 这一条是「必须升 version」的真实理由：残缺对象合并进来时缺键会保留**当前**值，
    // 用户关掉的视图就静默地重新打开了。migrate 的默认铺底是唯一的补齐点。
    const migrated = migrateSettings({ review: DEFAULT_REVIEW, smartViews: { all: true, due: false } })
    expect(migrated.smartViews).toEqual({ all: true, due: false, weekNew: true, leech: true })
  })

  it('persist 的 version 是 8 —— 旧存档（7）据此触发 migrate', async () => {
    // 上面两条直接调 migrate 的用例**完全绕过** version，因此没有任何东西钉住这个数字。
    // 把它回退成 7 全仓依然绿，而 v7 存档从此不再走 migrate。
    // 自行播种（不依赖前面的用例是否写过 localStorage），单独跑也得绿。
    localStorage.setItem('wordsett-settings', JSON.stringify({
      state: { sidebarMode: 'alphabet' },
      version: 7,
    }))
    await useSettingsStore.persist.rehydrate()
    expect(JSON.parse(localStorage.getItem('wordsett-settings')!).version).toBe(8)
  })

  it('真实 rehydrate 一份 version 7 且无 smartViews 的旧存档 → 四个视图全开（端到端）', async () => {
    // 走真实 persist.rehydrate 而不是直接调 migrate：只有这条能证明
    // 「migrate 挂在 persist 上」且「version 确实不相等因而 migrate 真的跑了」。
    // migrate 若被摘掉、或 version 被回退，这条会红，上面两条则仍然绿。
    localStorage.setItem('wordsett-settings', JSON.stringify({
      state: { sidebarMode: 'alphabet', review: DEFAULT_REVIEW },
      version: 7,
    }))
    await useSettingsStore.persist.rehydrate()
    expect(useSettingsStore.getState().smartViews).toEqual({ all: true, due: true, weekNew: true, leech: true })
    expect(visibleSmartViews(useSettingsStore.getState().smartViews)).toEqual(['all', 'due', 'weekNew', 'leech'])
  })

  it('真实 rehydrate 一份 version 7 且 smartViews 残缺的旧存档 → 缺键被补齐（端到端）', async () => {
    localStorage.setItem('wordsett-settings', JSON.stringify({
      state: { smartViews: { all: true, due: false } },
      version: 7,
    }))
    await useSettingsStore.persist.rehydrate()
    expect(useSettingsStore.getState().smartViews).toEqual({ all: true, due: false, weekNew: true, leech: true })
  })

  it('迁移后写盘的 version 升到 8', async () => {
    localStorage.setItem('wordsett-settings', JSON.stringify({
      state: { sidebarMode: 'alphabet' },
      version: 7,
    }))
    await useSettingsStore.persist.rehydrate()
    expect(JSON.parse(localStorage.getItem('wordsett-settings')!).version).toBe(8)
  })
})
