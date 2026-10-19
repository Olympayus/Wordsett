/**
 * 量宽模块（v0.7.4 任务 14）——实现与它的测试同住本文件。
 *
 * 为什么测试不放在 measureText.test.ts：本仓的惯例是源码文件自己就是测试文件（tokens 的实现
 * 与断言同在 tokens.test.ts，fonts 同理），所以模块即便带测试也叫 .ts；而 vitest.config.ts 的
 * include 只收 src 下的 .test.ts。两条同时成立，就只能让测试住进不带 .test 的模块文件里。
 *
 * 模块里唯一那点 JSX 由 `React.createElement` 承担——本仓「视觉一律走内联 style」这条约定
 * 本来就绕开了 JSX 的编译期糖，故文件可以保持 `.ts`（`.tsx` 只是多一个编译期步骤）。
 */

import { describe, it, expect } from 'vitest'
import { createElement, type CSSProperties, type ReactNode } from 'react'
import { editKeyDown } from '../components/word/WordWorkbench'
import type { FieldDefinition } from '../types/field'

/**
 * 就地编辑的输入框起宽（v0.7.4 任务 14）：**量被替换那段内容的渲染宽度**，从它起、随输入增长。
 *
 * 消费点三处——工作区的值格 / 流式单位 / 词性标签 / 辨析组标题（`WordWorkbench.tsx` 的
 * `MeasuredInput`）与头带的音标 chip（`PhoneticArea.tsx` 的 `ChipBody`）。两侧原先各抄了一份
 * 同样的实现，这里收成一处。
 *
 * 三件事各有讲究：
 *
 * ① **必须绝对定位**（`position: absolute; visibility: hidden`），不能 `display: 'none'`——后者量不到
 *    任何尺寸。绝对定位同时把探针**移出排版流**：否则编辑前后会长出一枚与被替换内容等宽的盒子，
 *    而「进编辑零位移」正是本版要的东西（在流式多列里它还会把后继单位挤到下一列）。
 *
 * ② **量的是 border-box**（`getBoundingClientRect().width`），且**探针要带上与被测输入框逐字相同的
 *    横向 padding 与 border**。Tailwind preflight 让 `box-sizing: border-box` 全站生效，而
 *    `getBoundingClientRect().width` 量的是**内容**宽度——只量文字的话，输入框的内容盒会比文字窄出
 *    「左右 padding + 左右 border」那么多（本仓的输入框是 `1px` 边 + `px-3` 的 12px 内边距，
 *    即 **26px**），被替换的文字当场被裁掉。故 `MEASURE_INPUT_CLASS` 与输入框的 `className`
 *    是**同一个字符串**，`MEASURE_STYLE` 的 border 与输入框的 border 是**同一行字**：两侧不可能
 *    各自漂移（写成两份数值的话，只改一边就是 26px 的偏差，而这是纯算式、不会有人报错）。
 *
 * ③ `MEASURE_MIN_WIDTH` 兜底：新增字段的值是空串时宽度会是 0，输入框塌成一条线。
 *
 * 只用于**单行**字段（`fieldType !== 'multiline'`）：多行的正文本来就可能折行，「原文字宽度」
 * 没有定义，textarea 照旧 `w-full`（且它的包含块必须是有确定宽度的块级盒子，否则 `width:100%`
 * 落进循环定义）。
 */

/**
 * 输入框样式的**唯一出处**：横向 padding 与 border 必须与消费点给输入框的那一份逐字相同。
 *
 * 走 Tailwind 工具类（`px-3` ＝ 左右 12px）而不是 `padding: '0 12px'`：**类名就是唯一出处**——
 * 输入框的 `className` 里写着 `px-3`，探针照抄同一个类名。
 *
 * `borderRadius` 用**数字 4**（不写 `'4px'`）：Tailwind 的 `rounded` 类本身就是 `border-radius: 4px`，
 * 而 `style` 上的内联 `border-radius` 优先于类，故内联写 `4` 与类里的 `4px` 是同一个值。
 * 这样「类名即出处」这条才成立，也不会出现两处各写一份圆角。
 */
export const MEASURE_INPUT_CLASS = 'px-3 rounded text-sm'

/** 探针相对正文额外需要的一切（`font` / `color` 仍由调用处按该行给）。 */
export const MEASURE_STYLE: CSSProperties = {
  position: 'absolute', visibility: 'hidden', whiteSpace: 'pre', margin: 0,
  border: '1px solid var(--color-brand)', borderRadius: 4,
}

/** 宽度下限：空值时不塌成 0 宽。 */
export const MEASURE_MIN_WIDTH = '4em'

type ReactNativeEventLike = { isComposing: boolean }

/** 只带 `fieldType` 的假定义：editKeyDown 只读这一个字段。 */
const fieldType = (t: 'text' | 'multiline') => t as FieldDefinition['fieldType']

describe('editKeyDown（v0.7.4 任务 14 的键盘契约）', () => {
  const run = (t: 'text' | 'multiline', key: string, opts?: { composing?: boolean; shiftKey?: boolean }) => {
    const saved: string[] = []
    const cancelled: string[] = []
    const prevented: string[] = []
    const e = {
      key,
      nativeEvent: { isComposing: opts?.composing ?? false } as unknown as ReactNativeEventLike,
      shiftKey: opts?.shiftKey ?? false,
      preventDefault: () => prevented.push('prevented'),
    }
    editKeyDown(fieldType(t), () => saved.push('save'), () => cancelled.push('cancel'))(e)
    return { saved, cancelled, prevented }
  }

  it('单行：Enter 保存（并拦掉默认行为）', () => {
    const r = run('text', 'Enter')
    expect(r.saved).toEqual(['save'])
    expect(r.cancelled).toEqual([])
    expect(r.prevented).toEqual(['prevented'])
  })

  it('多行：Enter 保存；Shift+Enter 只换行、不保存', () => {
    expect(run('multiline', 'Enter').saved).toEqual(['save'])
    const shift = run('multiline', 'Enter', { shiftKey: true })
    expect(shift.saved).toEqual([])
    expect(shift.cancelled).toEqual([])
    expect(shift.prevented).toEqual([])
  })

  it('Esc 一律取消（两种字段形态都一样）', () => {
    for (const t of ['text', 'multiline'] as const) {
      const r = run(t, 'Escape')
      expect(r.cancelled).toEqual(['cancel'])
      expect(r.saved).toEqual([])
    }
  })

  it('输入法上屏的那一下 Enter 什么都不做（isComposing 守卫）', () => {
    for (const t of ['text', 'multiline'] as const) {
      const r = run(t, 'Enter', { composing: true })
      expect(r.saved).toEqual([])
      expect(r.cancelled).toEqual([])
      expect(r.prevented).toEqual([])
    }
  })

  it('输入法组合中的 Esc 同样不取消', () => {
    const r = run('text', 'Escape', { composing: true })
    expect(r.cancelled).toEqual([])
  })

  it('其余按键（字母、空格）不触发任何动作', () => {
    const r = run('text', ' ')
    expect(r.saved).toEqual([])
    expect(r.cancelled).toEqual([])
    expect(r.prevented).toEqual([])
  })
})

describe('measureTextWidth / measureMarkSlot（v0.7.4 任务 14 的量宽契约）', () => {
  it('量的是 border-box 宽（调用方原样写进 input 的 style.width）', () => {
    const el = { getBoundingClientRect: () => ({ width: 137.4 }) } as unknown as HTMLElement
    expect(measureTextWidth(el)).toBe(138)   // 向上取整：宁可宽 1px，不可裁字
  })

  it('量不到（未挂载 / 隐藏）时返回 0，让调用方回落 minWidth', () => {
    expect(measureTextWidth(null)).toBe(0)
    const hidden = { getBoundingClientRect: () => ({ width: 0 }) } as unknown as HTMLElement
    expect(measureTextWidth(hidden)).toBe(0)
  })

  it('探针样式与宽度下限是同一份常量，两侧不可能漂移', () => {
    expect(MEASURE_STYLE.position).toBe('absolute')      // 不能用 display:none（量不到）
    expect(MEASURE_STYLE.visibility).toBe('hidden')
    expect(MEASURE_INPUT_CLASS).toContain('px-3')        // 与输入框 className 里的 px-3 同一个类
    expect(MEASURE_STYLE.border).toBe('1px solid var(--color-brand)')
    expect(MEASURE_MIN_WIDTH).toBe('4em')
  })
})

/**
 * 量出的输入框宽度（px）＝ 探针的 border-box 宽 ＝ 被替换内容完整占的那一段。
 * 返回 `0` 表示量不到（尚未挂载 / 容器不可见）——调用处据此不设 `width`，回落到 `minWidth`。
 */
export function measureTextWidth(el: HTMLElement | null): number {
  if (!el) return 0
  const w = el.getBoundingClientRect().width
  return Number.isFinite(w) ? Math.ceil(w) : 0
}

/** 探针里、被替换文字**之前**那部分的内容（例句的行首 `–`＋8px 右间距）。
 *  做成元素而不是一段数字：数字要调用处自己把 `0.8em` 乘上字号，漏乘一次整行就往左跳；
 *  放同一枚 span，探针与真实行只可能一致。标记本体仍由调用处画（`DashMark`）。 */
export function measureMarkSlot(children: ReactNode) {
  return createElement('span', { style: { marginRight: '8px' } }, children)
}
