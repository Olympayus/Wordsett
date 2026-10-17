import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { rowSourceState } from './WordWorkbench'
import type { FieldValue } from '../../types/field'

// 造一个只够 fieldState() 读的 FieldValue（source / edited 两个字段）
const fvOf = (source: 'ecdict' | 'wordnet' | 'user', edited = false) =>
  ({ source, edited } as unknown as FieldValue)

// v0.7.2 起 fieldPaneLeftBar 已被 SourceBar 取代，但它钉住的不变量原样保留：
//   来源态只在编者模式现形；词性窗格永远不出条。
// v0.7.3：四态——「有没有条」不再由 original 兼任（original 现在**有**一条中性色条），
//   普通模式与词性窗格改返回 'none'（不出条）。
// 取色判据抽成 rowSourceState 纯函数（与两个原语同判据），故这里照旧直接断言它。
describe('rowSourceState（v0.7.3：四态；编者模式下原始值也出条）', () => {
  it('普通模式：一律 none——不出条，不再是 original（original 现在是「有一条中性色条」）', () => {
    expect(rowSourceState(false, false, fvOf('user'))).toBe('none')
    expect(rowSourceState(false, false, fvOf('ecdict', true))).toBe('none')
    expect(rowSourceState(false, true, fvOf('user'))).toBe('none')
  })

  it('编者模式：个人新增字段现形为 personal', () => {
    expect(rowSourceState(true, false, fvOf('user'))).toBe('personal')
  })

  it('编者模式：改过的词典字段现形为 edited（编辑优先于来源）', () => {
    expect(rowSourceState(true, false, fvOf('ecdict', true))).toBe('edited')
  })

  it('编者模式：未改动的词典字段是 original——它现在**有**一条中性色条', () => {
    expect(rowSourceState(true, false, fvOf('ecdict'))).toBe('original')
  })

  it('词性窗格任何模式下都是 none——它不参与来源三态', () => {
    expect(rowSourceState(true, true, fvOf('user'))).toBe('none')
    expect(rowSourceState(true, true, fvOf('ecdict', true))).toBe('none')
  })
})

// 源码级守卫（沿用本仓既有做法，如 sidebar.test.ts 读 WordList.tsx 的断言、review.test.ts 的形状守卫）：
// 无组件测试 harness（vitest 只收 *.test.ts、environment: node），故把「改回条件渲染」这类回归钉在源码形状上。
describe('工作区改用原语（源码级守卫）', () => {
  const src = readFileSync(new URL('./WordWorkbench.tsx', import.meta.url), 'utf8')

  it('行尾簇常驻占位：RowActions 只由 visible 属性控显隐，绝不被 && / ? 条件渲染', () => {
    // 正面：必须挂 visible 属性（opacity 的驱动），而不是别的开关。
    expect(src).toMatch(/<RowActions\s+visible=/)
    // 反面：任何 `x && <RowActions` / `x ? <RowActions`（含改名后的变量、含括号）都不得出现——
    // 这是 v0.5.2 hover 折行抖动的回归形态。比只钉两个字面拼写（hovered / showsButtons）宽得多。
    expect(src).not.toMatch(/&&\s*\(?\s*<RowActions/)
    expect(src).not.toMatch(/\?\s*\(?\s*<RowActions/)
  })

  it('旧的卡片左条与三态徽章已删净（FIELD_LEFT_COLOR / fieldPaneLeftBar）', () => {
    expect(src).not.toMatch(/FIELD_LEFT_COLOR/)
    // 注释里可以提到它「取代了谁」，但不得再有它的定义 / 调用
    expect(src).not.toMatch(/function fieldPaneLeftBar/)
    expect(src).not.toMatch(/fieldPaneLeftBar\s*\(/)
  })

  it('字段行走 FlowRow，来源态经 state 传给左条（方点已退场）', () => {
    // 不是「<FlowRow 出现过」这种存在性断言：钉的是接线本身——FlowRow 收到 no + rowState。
    expect(src).toMatch(/<FlowRow\s+no=\{no\}\s+state=\{rowState\}/)
    // v0.7.3：行尾那枚 6px 方点整个退场，SourceMark 不再有调用点
    expect(src).not.toMatch(/<SourceMark/)
  })

  it('RowActions 按 editorMode 分流两套形态', () => {
    expect(src).toMatch(/<RowActions\s+visible=/)
    expect(src).toMatch(/mode=\{editorMode \? 'edit' : 'view'\}/)
  })

  it('leechCount 按 isLeech(overlay.maxLapses, leechThreshold) 门控，不直接传 maxLapses', () => {
    expect(src).toMatch(/isLeech\(overlay\.maxLapses, leechThreshold\)/)
    expect(src).not.toMatch(/leechCount=\{overlay\.maxLapses\}/)
  })

  it('页级「＋ 添加」与行级「＋」共用 AddMenu；容器内虚线圆钮已删', () => {
    expect(src).toMatch(/<AddMenu/)
    expect(src).not.toMatch(/addChildControl/)
  })
})
