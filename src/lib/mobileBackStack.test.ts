import { it, describe, expect } from 'vitest'
import { backAction, backLayers, type BackLayerInput } from './mobileBackStack'

it('按优先级逐层关闭', () => {
  expect(backAction(['sheet', 'drawer'])).toEqual({ type: 'closeSheet' })
  expect(backAction(['edit', 'drawer'])).toEqual({ type: 'cancelEdit' })
  expect(backAction(['drawer'])).toEqual({ type: 'closeDrawer' })
  expect(backAction(['dict', 'search'])).toEqual({ type: 'closeDict' })
  expect(backAction(['search'])).toEqual({ type: 'closeSearch' })
})
it('设置子页优先于模块退栈', () => {
  expect(backAction(['settings-sub'])).toEqual({ type: 'closeSettingsSub' })
  expect(backAction(['settings-sub', 'module'])).toEqual({ type: 'closeSettingsSub' })
  expect(backAction(['module'])).toEqual({ type: 'popModule' })
})
it('复习会话是一层，不能直接退出应用', () => {
  expect(backAction(['review'])).toEqual({ type: 'leaveReview' })
  expect(backAction(['review', 'settings-sub'])).toEqual({ type: 'leaveReview' })
})
it('没有层时退出', () => expect(backAction([])).toEqual({ type: 'exit' }))

describe('backLayers（层集合的组装判据）', () => {
  const base: BackLayerInput = {
    module: 'workbench', view: 'workbench', dictWord: null,
    editing: false, drawerOpen: false, settingsSection: null, canBack: false, reviewLive: false,
  }

  it('词条页：编辑 → 抽屉 → 词条导航，按优先级从高到低', () => {
    expect(backLayers({ ...base, editing: true, drawerOpen: true, canBack: true }))
      .toEqual(['edit', 'drawer', 'module'])
  })

  it('储藏库与工作台同一套层（只切视图、不切模块）', () => {
    expect(backLayers({ ...base, module: 'archive', drawerOpen: true })).toEqual(['drawer'])
  })

  it('详情态：详情吃掉词条导航，抽屉仍在上', () => {
    expect(backLayers({ ...base, view: 'dict', dictWord: 'apple', drawerOpen: true, canBack: true }))
      .toEqual(['drawer', 'dict'])
  })

  it('详情只出现在词条页与搜索：设置模块带着 detail 状态不算', () => {
    expect(backLayers({ ...base, module: 'settings', view: 'dict', dictWord: 'apple' })).toEqual([])
  })

  it('搜索模块：详情优先于搜索列表', () => {
    expect(backLayers({ ...base, module: 'search', view: 'dict', dictWord: 'apple' }))
      .toEqual(['dict'])
    expect(backLayers({ ...base, module: 'search' })).toEqual(['search'])
  })

  it('复习只在会话进行中算一层（概览 / 结算不算）', () => {
    expect(backLayers({ ...base, module: 'review', reviewLive: true })).toEqual(['review'])
    expect(backLayers({ ...base, module: 'review', reviewLive: false })).toEqual([])
  })

  it('设置子页只在真的进了子页时算一层', () => {
    expect(backLayers({ ...base, module: 'settings', settingsSection: 'general' }))
      .toEqual(['settings-sub'])
    expect(backLayers({ ...base, module: 'settings' })).toEqual([])
  })
})
