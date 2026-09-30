import { describe, it, expect } from 'vitest'
import { checkboxAppearance, checkboxPaint, CHECKBOX_SIZE, CHECKBOX_INNER, CHECKBOX_RING } from './CheckBox'

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

describe('checkboxPaint（v0.6.5 修订：内块是画出来的，控件里没有第二个盒子）', () => {
  const blue = 'var(--color-brand)'
  const SURFACE = 'var(--color-surface)'

  // 这一组钉的是本次修的那个偏心：内块曾经是 10×10 的子盒子，布局盒子会被浏览器按
  // 设备像素取整，非整数缩放下左右两边各取各的整，1.5px 的留白被这一个像素吃掉一半，
  // 看上去就是色块偏向一侧。现在内块 = 元素自己的 background，位置由外框的盒子决定。
  it('选中：内块就是元素底色，中心区域没有任何独立盒子可以偏离外框', () => {
    const p = checkboxPaint({ checked: true, hover: false, color: blue })
    expect(p.background).toBe(blue)
    // 最上层是描边（与外框同色），第二层把 3px 以内涂回底色 → 中心 10px 露出上面的 background
    expect(p.boxShadow).toBe(`inset 0 0 0 ${CHECKBOX_RING}px ${blue}, inset 0 0 0 3px ${SURFACE}`)
  })

  it('未选：空心——底色是底，只有一圈描边色', () => {
    const p = checkboxPaint({ checked: false, hover: false, color: blue })
    expect(p.background).toBe(SURFACE)
    expect(p.boxShadow).toBe(`inset 0 0 0 ${CHECKBOX_RING}px var(--color-border-strong), inset 0 0 0 3px ${SURFACE}`)
  })

  it('悬停不预演填入：底色与选中态仍然不同', () => {
    const hovered = checkboxPaint({ checked: false, hover: true, color: blue })
    expect(hovered.background).toBe(SURFACE)
    expect(hovered.boxShadow).toContain(`inset 0 0 0 ${CHECKBOX_RING}px var(--color-text-tertiary)`)
  })

  it('禁用且选中：仍然只留一圈描边，不出现内块', () => {
    const p = checkboxPaint({ checked: true, hover: false, disabled: true, color: blue })
    expect(p.background).toBe(SURFACE)
    expect(p.boxShadow).toBe(`inset 0 0 0 ${CHECKBOX_RING}px ${blue}, inset 0 0 0 3px ${SURFACE}`)
  })

  it('两态阴影层数一致——层数不同的过渡不插值，勾选会「啪」地跳一下', () => {
    const on = checkboxPaint({ checked: true, hover: false, color: blue }).boxShadow
    const off = checkboxPaint({ checked: false, hover: false, color: blue }).boxShadow
    expect(on.split('inset').length).toBe(3)
    expect(off.split('inset').length).toBe(3)
  })
})

describe('CheckBox 几何常量（v0.6.5）', () => {
  it('尺寸缩到 16px', () => {
    expect(CHECKBOX_SIZE).toBe(16)
    expect(CHECKBOX_INNER).toBe(10)
  })

  it('留白必须是整数——v0.6.4 的不居中就是小数留白造成的', () => {
    // 18/12 的留白是 (18−12)/2 = 3px，看着对；但当时描边是真 border，
    // 内容盒被压成 15px，(15−12)/2 = 1.5px 落在非整数网格上，四边取整不一致。
    // 这条不变式管的是这件事：外框减内块必须是偶数。
    expect((CHECKBOX_SIZE - CHECKBOX_INNER) % 2).toBe(0)
    expect((CHECKBOX_SIZE - CHECKBOX_INNER) / 2).toBe(3)
  })

  it('描边必须窄于内缩——否则留白那一圈被描边盖满，内块与外框之间就没有缝了', () => {
    expect(CHECKBOX_RING).toBeLessThan((CHECKBOX_SIZE - CHECKBOX_INNER) / 2)
  })
})
