import { describe, it, expect } from 'vitest'
import { checkboxAppearance } from './CheckBox'

describe('checkboxAppearance（v0.6.3 条目 14）', () => {
  const blue = 'var(--color-brand)'

  it('未选：空心，没有内块', () => {
    const a = checkboxAppearance({ checked: false, hover: false, color: blue })
    expect(a.fill).toBeNull()
    expect(a.border).toBe('var(--color-border-strong)')
  })

  it('悬停只压深描边、不预演填入', () => {
    const a = checkboxAppearance({ checked: false, hover: true, color: blue })
    // 这两条是本条最容易改坏的地方：悬停一旦预演填入，悬停与选中就分不出来了
    expect(a.fill).toBeNull()
    expect(a.border).toBe('var(--color-text-tertiary)')
  })

  it('选中：描边与内块同色', () => {
    const a = checkboxAppearance({ checked: true, hover: false, color: blue })
    expect(a.fill).toBe(blue)
    expect(a.border).toBe(blue)
  })

  it('选中时悬停不改色（悬停不该把选中态压浅）', () => {
    const a = checkboxAppearance({ checked: true, hover: true, color: blue })
    expect(a.fill).toBe(blue)
    expect(a.border).toBe(blue)
  })

  it('分类色透传：描边与内块都取它', () => {
    const cat = 'var(--color-cat-5)'
    const a = checkboxAppearance({ checked: true, hover: false, color: cat })
    expect(a.border).toBe(cat)
    expect(a.fill).toBe(cat)
  })

  it('禁用优先：任何态下都不给内块（整体降透明度由组件负责）', () => {
    expect(checkboxAppearance({ checked: true, hover: true, disabled: true, color: blue }).fill).toBeNull()
    expect(checkboxAppearance({ checked: true, hover: false, disabled: true, color: blue }).fill).toBeNull()
  })
})
