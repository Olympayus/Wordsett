import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { rowSourceState } from './WordWorkbench'
import type { FieldValue } from '../../types/field'

// 造一个只够 fieldState() 读的 FieldValue（source / edited 两个字段）
const fvOf = (source: 'ecdict' | 'wordnet' | 'user', edited = false) =>
  ({ source, edited } as unknown as FieldValue)

// v0.7.2 起 fieldPaneLeftBar 已被 SourceMark / SourceBar 取代，但它钉住的不变量原样保留：
//   来源三态只在编者模式现形；词性窗格永远中性；original 无色。
// 取色判据抽成 rowSourceState 纯函数（与两个原语同判据），故这里照旧直接断言它。
describe('rowSourceState（v0.7.2 §8.2：来源三态只在编者模式现形，词性窗格永远中性）', () => {
  it('普通模式：一律 original——编者视角的信息不在普通模式现形', () => {
    expect(rowSourceState(false, false, fvOf('user'))).toBe('original')
    expect(rowSourceState(false, false, fvOf('ecdict', true))).toBe('original')
    expect(rowSourceState(false, true, fvOf('user'))).toBe('original')
  })

  it('编者模式：个人新增字段现形为 personal', () => {
    expect(rowSourceState(true, false, fvOf('user'))).toBe('personal')
  })

  it('编者模式：改过的词典字段现形为 edited（编辑优先于来源）', () => {
    expect(rowSourceState(true, false, fvOf('ecdict', true))).toBe('edited')
  })

  it('编者模式：未改动的词典字段仍是 original（无色）', () => {
    expect(rowSourceState(true, false, fvOf('ecdict'))).toBe('original')
  })

  it('词性窗格在任何模式下都是 original——它不参与来源三态', () => {
    expect(rowSourceState(true, true, fvOf('user'))).toBe('original')
    expect(rowSourceState(true, true, fvOf('ecdict', true))).toBe('original')
  })
})

// 源码级守卫（沿用本仓既有做法，如 sidebar.test.ts 读 WordList.tsx 的断言、review.test.ts 的形状守卫）：
// 无组件测试 harness（vitest 只收 *.test.ts、environment: node），故把「改回条件渲染」这类回归钉在源码形状上。
describe('工作区改用原语（源码级守卫）', () => {
  const src = readFileSync(new URL('./WordWorkbench.tsx', import.meta.url), 'utf8')

  it('行尾簇常驻占位：RowActions 始终存在，只由 opacity 控显隐（不得条件渲染）', () => {
    expect(src).toMatch(/RowActions/)
    expect(src).not.toMatch(/\{hovered && <RowActions/)          // brief §Step 4 的原始判据
    expect(src).not.toMatch(/showsButtons\s*&&\s*<RowActions/)   // 也不得换名后条件渲染
  })

  it('旧的卡片左条与三态徽章已删净（FIELD_LEFT_COLOR / fieldPaneLeftBar）', () => {
    expect(src).not.toMatch(/FIELD_LEFT_COLOR/)
    // 注释里可以提到它「取代了谁」，但不得再有它的定义 / 调用
    expect(src).not.toMatch(/function fieldPaneLeftBar/)
    expect(src).not.toMatch(/fieldPaneLeftBar\s*\(/)
  })

  it('字段行走 FlowRow + SourceMark 原语', () => {
    expect(src).toMatch(/<FlowRow/)
    expect(src).toMatch(/<SourceMark/)
  })

  it('leechCount 按 isLeech(overlay.maxLapses, leechThreshold) 门控，不直接传 maxLapses', () => {
    expect(src).toMatch(/isLeech\(overlay\.maxLapses, leechThreshold\)/)
    expect(src).not.toMatch(/leechCount=\{overlay\.maxLapses\}/)
  })

  it('来源三态经 rowSourceState 门控（与两个原语同判据，不在别处再写一份）', () => {
    expect(src).toMatch(/rowSourceState\(/)
  })

  it('页级「＋ 添加」与行级「＋」共用 AddMenu；容器内虚线圆钮已删', () => {
    expect(src).toMatch(/<AddMenu/)
    expect(src).not.toMatch(/addChildControl/)
  })
})
