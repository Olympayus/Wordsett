import { describe, it, expect } from 'vitest'
import { MOBILE_TABS, tabActive } from './mobileTabs'

describe('mobileTabs', () => {
  it('五格顺序固定', () => {
    expect(MOBILE_TABS.map(t => t.key)).toEqual(['workbench', 'archive', 'search', 'review', 'settings'])
  })
  it('search 模块只点亮搜索', () => {
    expect(tabActive('search', 'search')).toBe(true)
    expect(tabActive('workbench', 'search')).toBe(false)
  })
})
