import { describe, it, expect } from 'vitest'
import { toolbarSlots } from './SidebarToolbar'

describe('toolbarSlots（v0.6.5 §4.1：收起态不再裁剪功能）', () => {
  it('展开态、非选择模式：多选 / 模式切换 / 收起 / 筛选框俱全', () => {
    const s = toolbarSlots({ collapsed: false, selectMode: false })
    expect(s).toEqual({ selectToggle: true, modeToggle: true, collapseToggle: true, filterInput: true })
  })

  it('收起态同样俱全——功能不再按 collapsed 关掉', () => {
    const s = toolbarSlots({ collapsed: true, selectMode: false })
    expect(s).toEqual({ selectToggle: true, modeToggle: true, collapseToggle: true, filterInput: true })
  })

  it('选择模式下第一行换成选择控件：多选钮与模式钮让位，筛选框保留', () => {
    const s = toolbarSlots({ collapsed: false, selectMode: true })
    expect(s).toEqual({ selectToggle: false, modeToggle: false, collapseToggle: true, filterInput: true })
  })

  it('收起态的选择模式：收起钮仍在（换行后照旧可用）', () => {
    expect(toolbarSlots({ collapsed: true, selectMode: true }).collapseToggle).toBe(true)
  })
})
