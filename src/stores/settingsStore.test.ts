import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from './settingsStore'

const DEFAULT = {
  settingsOpen: false,
  displayFields: {
    phonetic: true, part_of_speech: true, chinese_definition: true,
    english_definition: true, example: true, exchange: true, synonyms: true,
    derivatives: true,
  },
  dictionaries: { ecdict: true, wordnet: true },
  onlineDictEnabled: false,
  onlineSources: { oxford: true, longman: true, collins: true, merriam: true },
  sidebarMode: 'alphabet',
}

describe('settingsStore（规格 §7）', () => {
  beforeEach(() => {
    useSettingsStore.setState(JSON.parse(JSON.stringify(DEFAULT)))
  })

  it('默认值：字段开关全开（含词源相关词）、词典开关全开、在线词典关闭、字母模式、抽屉关闭', () => {
    const s = useSettingsStore.getState()
    expect(s.settingsOpen).toBe(false)
    expect(s.onlineDictEnabled).toBe(false)
    expect(s.sidebarMode).toBe('alphabet')
    expect(Object.values(s.displayFields).every(Boolean)).toBe(true)
    expect(s.displayFields.derivatives).toBe(true)
    expect(s.dictionaries.ecdict).toBe(true)
    expect(s.dictionaries.wordnet).toBe(true)
    expect(Object.values(s.onlineSources).every(Boolean)).toBe(true)
  })

  it('setDictionary 切换单词典开关', () => {
    useSettingsStore.getState().setDictionary('wordnet', false)
    const s = useSettingsStore.getState()
    expect(s.dictionaries.wordnet).toBe(false)
    expect(s.dictionaries.ecdict).toBe(true)
    useSettingsStore.getState().setDictionary('ecdict', false)
    expect(useSettingsStore.getState().dictionaries.ecdict).toBe(false)
  })

  it('openSettings/closeSettings 切换抽屉', () => {
    useSettingsStore.getState().openSettings()
    expect(useSettingsStore.getState().settingsOpen).toBe(true)
    useSettingsStore.getState().closeSettings()
    expect(useSettingsStore.getState().settingsOpen).toBe(false)
  })

  it('setDisplayField 只改单个字段', () => {
    useSettingsStore.getState().setDisplayField('phonetic', false)
    const s = useSettingsStore.getState()
    expect(s.displayFields.phonetic).toBe(false)
    expect(s.displayFields.chinese_definition).toBe(true)
  })

  it('setOnlineDictEnabled 与 setOnlineSource', () => {
    useSettingsStore.getState().setOnlineDictEnabled(true)
    useSettingsStore.getState().setOnlineSource('collins', false)
    const s = useSettingsStore.getState()
    expect(s.onlineDictEnabled).toBe(true)
    expect(s.onlineSources.collins).toBe(false)
    expect(s.onlineSources.oxford).toBe(true)
  })

  it('setSidebarMode 切换模式', () => {
    useSettingsStore.getState().setSidebarMode('category')
    expect(useSettingsStore.getState().sidebarMode).toBe('category')
  })

  it('持久化：修改写入 localStorage，且不含瞬时字段 settingsOpen', () => {
    useSettingsStore.getState().setSidebarMode('category')
    useSettingsStore.getState().setDisplayField('phonetic', false)
    const raw = localStorage.getItem('wordsett-settings')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.state.sidebarMode).toBe('category')
    expect(parsed.state.displayFields.phonetic).toBe(false)
    expect(parsed.state.settingsOpen).toBeUndefined()
  })

  it('恢复：localStorage v1 数据 rehydrate 并迁移（剔除 etymology、补齐 synonyms、派生词与词典开关默认开）', async () => {
    localStorage.setItem('wordsett-settings', JSON.stringify({
      state: {
        displayFields: { phonetic: false, part_of_speech: true, chinese_definition: true, english_definition: true, example: true, exchange: true, etymology: true },
        onlineDictEnabled: true, onlineSources: { oxford: true, longman: true, collins: true, merriam: true },
        sidebarMode: 'category',
      },
      version: 1,
    }))
    await useSettingsStore.persist.rehydrate()
    const s = useSettingsStore.getState()
    expect(s.sidebarMode).toBe('category')
    expect(s.onlineDictEnabled).toBe(true)
    expect(s.displayFields.phonetic).toBe(false)
    expect(s.displayFields.synonyms).toBe(true)
    expect(s.displayFields.derivatives).toBe(true)
    expect(s.dictionaries.ecdict).toBe(true)
    expect(s.dictionaries.wordnet).toBe(true)
    expect('etymology' in s.displayFields).toBe(false)
  })
})
