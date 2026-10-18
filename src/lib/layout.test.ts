import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ENTRY_BAND_FOOT_GAP,
  ENTRY_BAND_WIDTH,
  ENTRY_MEASURE,
  ENTRY_PHONETIC_GAP,
  NAV_CONTROL_HEIGHT,
  NAV_HEIGHT,
  ROW_LINE_HEIGHT,
  ROW_PADDING_Y,
  TAB_STRIP_PADDING,
  TAB_ITEM_PADDING_X,
} from './layout'

describe('词条页共享版式常量（v0.7.2）', () => {
  // 断言照旧严格（数值与符号都不松），改的只是它的**读法**：v0.7.2 修复 3 起两页的正文度量都取
  // ENTRY_BAND_WIDTH，ENTRY_MEASURE 已无消费点（常量按「token 名永不删」保留、layout.ts 注明）。
  // 这条钉住的不再是「两页正文停在 660」，而是这个常量与列宽的历史关系仍然成立——
  // 谁把它接回正文，都要先看懂它为什么窄于整列。
  it('ENTRY_MEASURE 曾窄于头带（旧正文度量的历史关系仍成立，尽管它现已无消费点）', () => {
    expect(ENTRY_MEASURE).toBeLessThan(ENTRY_BAND_WIDTH)
  })

  it('导航条与控件高度成对（控件必须比条矮，否则条会撑着变高）', () => {
    expect(NAV_CONTROL_HEIGHT).toBeLessThan(NAV_HEIGHT)
    expect(NAV_HEIGHT).toBe(32)
  })

  // 页签条与页签的内边距先前是两页各自的裸字面量（工作区 '4px 24px 0' + '7px 20px' /
  // '7px 26px 7px 20px'，返回页 '4px 0 0' + '7px 18px'），条面左缘与页签文字左缘都对不齐。
  // 收进本文件后两页共用一份：条 24px 对齐内容列左缘，首个页签自身 14px，两页的页签文字都落在 38px。
  it('页签内边距两态同值（v0.7.4 决定七 7.1：编者模式不再为 × 多留 12px）', () => {
    expect(TAB_STRIP_PADDING).toBe('4px 24px 0')
    expect(TAB_ITEM_PADDING_X).toBe('7px 14px')
    expect(readFileSync(new URL('./layout.ts', import.meta.url), 'utf8')).not.toMatch(/TAB_ITEM_PADDING_X_EDITOR/)
  })
})

describe('正文行密度（v0.7.4 决定七 7.4：收一档）', () => {
  it('行高 1.6、行上下内边距 3px，两页共用', () => {
    expect(ROW_LINE_HEIGHT).toBe(1.6)
    expect(ROW_PADDING_Y).toBe(3)
  })
})

describe('正文行原语都引用这两个常量', () => {
  it('FlowRow 与 LeafFlow', () => {
    for (const f of ['../components/entry/FlowRow.tsx', '../components/entry/LeafFlow.tsx'] as const) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      expect(src, f).toMatch(/import\s*\{[^}]*ROW_LINE_HEIGHT[^}]*ROW_PADDING_Y[^}]*\}\s*from\s*'[^']*layout'/)
      expect(src, f).toMatch(/lineHeight:\s*ROW_LINE_HEIGHT/)
      expect(src, f).toMatch(/padding:\s*`\$\{ROW_PADDING_Y\}px 0 \$\{ROW_PADDING_Y\}px 11px`/)
    }
  })
})

// 「音标 → 词根」的距离 v0.7.3 尾段起在两页都是 ENTRY_BAND_FOOT_GAP（8）：工作区的词根行进
// EntryBand 的 footLeft（与末行右簇并成一行，那行的上间距由头带给），返回页不传 bottomRight、
// 末行合并对它不可见，故由 WordTitleExtras 自己给同一个值。两处**各写一份**迟早会漂（差 9px 就会
// 看出两页不是同一套版式），故按本仓既有做法（WordWorkbench.test.ts 的源码形状守卫、
// sidebar.test.ts 读 WordList.tsx 的常量引用）把「两页都引用这个常量」钉在源码形状上。
//
// 放在本文件而不是 WordWorkbench.test.ts：那条不变量的**值**住在 layout.ts，且它管的是「头带末行
// 的间距只有一个出处」——与本文件其余断言同属「版式常量只有一份出处」这一类；WordWorkbench.test.ts
// 的源码守卫管的是工作区**自己**的渲染形状（行尾簇 / leafForm / AddMenu），跨页共享常量的引用归这里。
describe('两页的头带末行间距都取 ENTRY_BAND_FOOT_GAP（v0.7.3 尾段）', () => {
  it('EntryBand（工作区词根行）与 WordTitleExtras（返回页词根行）都引用 ENTRY_BAND_FOOT_GAP', () => {
    const band = readFileSync(new URL('../components/entry/EntryBand.tsx', import.meta.url), 'utf8')
    const extras = readFileSync(new URL('../components/search/WordTitleExtras.tsx', import.meta.url), 'utf8')
    // 正面：两个文件都必须**引用**这个常量（import 与 marginTop 两处都在）。
    // 只查「注释里出现过」是不够的——实测过：把 import 与模板串都摘掉、只留注释时，
    // 一条宽松的 toContain 是绿的；这里两处都查，那种回归才过不去。
    for (const [name, src] of [['EntryBand', band], ['WordTitleExtras', extras]] as const) {
      expect(src, `${name} 必须 import ENTRY_BAND_FOOT_GAP`).toMatch(/import\s*\{[^}]*ENTRY_BAND_FOOT_GAP[^}]*\}\s*from\s*'[^']*layout'/)
      expect(src, `${name} 必须用 ENTRY_BAND_FOOT_GAP 给词根行上间距`).toMatch(/marginTop:\s*`\$\{ENTRY_BAND_FOOT_GAP\}px`/)
    }
  })

  it('音标 → 词根 = 24 + 8 = 32px（v0.7.4 决定七 7.4）', () => {
    expect(ENTRY_PHONETIC_GAP + ENTRY_BAND_FOOT_GAP).toBe(32)
  })
})
