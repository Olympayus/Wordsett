import { describe, it, expect } from 'vitest'
import { insertBefore, dropY, reorderSiblingIds } from './dragReorder'

// 例句项 / 近义词项的真实几何（WordWorkbench.tsx FieldCard）：
// 卡片 padding 6px×2 + 行高 24px（行内垃圾桶按钮 24px 撑起行高）= 36px；相邻卡片间距 2px。
const ITEM_H = 36
const GAP = 2
// 拖动手柄 14px 高、在行内垂直居中 → 指针按下点 ≈ 卡片中线（卡片顶 + 18px）
const GRAB_OFFSET = 18

const rect = (top: number, height = ITEM_H) => ({ top, height })

describe('insertBefore 落点判定（v0.5.3 任务 4）', () => {
  const target = rect(138)

  it('落点在目标卡片上半 → 插到目标之前', () => {
    expect(insertBefore(target.top, target)).toBe(true)
    expect(insertBefore(target.top + target.height / 2 - 1, target)).toBe(true)
  })

  it('落点在目标卡片下半（含中线）→ 插到目标之后', () => {
    expect(insertBefore(target.top + target.height / 2, target)).toBe(false)
    expect(insertBefore(target.top + target.height - 1, target)).toBe(false)
    expect(insertBefore(target.top + target.height, target)).toBe(false)
  })

  it('高卡片（释义 / 词性）同样以中线为界', () => {
    const tall = rect(200, 240)
    expect(insertBefore(200 + 119, tall)).toBe(true)
    expect(insertBefore(200 + 120, tall)).toBe(false)
  })
})

describe('矮行（例句 / 近义词项）向下换位 —— 本缺陷的回归守卫', () => {
  const item2 = rect(100 + ITEM_H + GAP) // 138

  // 旧判据：以「拖动卡片顶边」与目标中线比较。拖动卡片不跟随指针（组件只做 scale +
  // 插入线反馈），其顶边 = 指针 − 抓取偏移，等价于「指针须越过目标中线 + 抓取偏移」。
  const oldInsertBefore = (pointerY: number, target: { top: number; height: number }) =>
    pointerY - GRAB_OFFSET < target.top + target.height / 2

  it('指针落在目标矩形内（底边除外）时旧判据恒为 before → 向下拖动恒为空操作', () => {
    const pointerYs = [138, 145, 152, 156, 162, 173]
    expect(pointerYs.every(y => oldInsertBefore(y, item2))).toBe(true)
    // 新判据在目标下半给出 after → 交换才会真正发生
    expect(pointerYs.map(y => insertBefore(y, item2))).toEqual([true, true, true, false, false, false])
  })

  it('把第一项拖到第二项下半：同级顺序互换', () => {
    expect(reorderSiblingIds(['item1', 'item2'], 'item1', 'item2', false)).toEqual(['item2', 'item1'])
  })
})

describe('reorderSiblingIds 同级重排', () => {
  const ids = ['a', 'b', 'c']

  it('向下：插到目标之后', () => {
    expect(reorderSiblingIds(ids, 'a', 'b', false)).toEqual(['b', 'a', 'c'])
    expect(reorderSiblingIds(ids, 'a', 'c', false)).toEqual(['b', 'c', 'a'])
  })

  it('向上：插到目标之前', () => {
    expect(reorderSiblingIds(ids, 'c', 'b', true)).toEqual(['a', 'c', 'b'])
    expect(reorderSiblingIds(ids, 'c', 'a', true)).toEqual(['c', 'a', 'b'])
  })

  it('两项列表：上下两个方向都能互换', () => {
    expect(reorderSiblingIds(['x', 'y'], 'x', 'y', false)).toEqual(['y', 'x'])
    expect(reorderSiblingIds(['x', 'y'], 'y', 'x', true)).toEqual(['y', 'x'])
  })

  it('落点等于自身当前位置 → 顺序不变（仍返回合法顺序）', () => {
    expect(reorderSiblingIds(ids, 'a', 'b', true)).toEqual(['a', 'b', 'c'])
  })

  it('落点是自身 / 目标或拖动项不在同级集合内 → null（调用方据此放弃写入）', () => {
    expect(reorderSiblingIds(ids, 'a', 'a', false)).toBeNull()
    expect(reorderSiblingIds(ids, 'a', 'zzz', false)).toBeNull()
    expect(reorderSiblingIds(ids, 'zzz', 'b', false)).toBeNull()
    expect(reorderSiblingIds([], 'a', 'b', false)).toBeNull()
  })

  it('不修改入参数组', () => {
    const input = ['a', 'b', 'c']
    reorderSiblingIds(input, 'a', 'b', false)
    expect(input).toEqual(['a', 'b', 'c'])
  })
})

describe('dropY 落点纵坐标', () => {
  it('指针激活：pointerdown 的 clientY + 拖动位移', () => {
    expect(dropY({ clientY: 200 } as unknown as Event, 30, 999)).toBe(230)
  })

  it('键盘激活（无 clientY）：退回拖动卡片中线', () => {
    expect(dropY({} as unknown as Event, 30, 500)).toBe(500)
    expect(dropY(null, 30, 500)).toBe(500)
    expect(dropY(undefined, 30, 500)).toBe(500)
  })
})
