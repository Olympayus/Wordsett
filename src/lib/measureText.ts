/**
 * 就地编辑的输入框起宽（v0.7.4 任务 14）：**量被替换那段内容的渲染宽度**，从它起、随输入增长。
 *
 * 消费点三处——工作区的值格 / 流式单位 / 词性标签 / 辨析组标题（`WordWorkbench.tsx` 的
 * `MeasuredInput`）与头带的音标 chip（`PhoneticArea.tsx` 的 `ChipBody`）。两侧原先各抄了一份
 * 同样的实现，这里收成一处。测试在 `measureText.test.ts`（本仓惯例：模块与测试分文件）。
 *
 * 四件事各有讲究：
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
 *    **`MEASURE_INPUT_CLASS` 与 `MEASURE_STYLE` 只服务「`px-3`＋`rounded`」那一套输入框**（值格 /
 *    单位 / 词性标签 / 辨析组标题）。音标 chip 的输入框是另一副配方（`1px 6px` 内边距、4px 圆角），
 *    它在 `PhoneticArea.tsx` 里用**同一组常量**（`INPUT_PADDING` + `MEASURE_STYLE` 的 border）交给
 *    探针与输入框两侧——把常量按各自输入框的配方写在同一处，比在 lib 里再养一份「第二套类名」要好。
 *
 * ③ **类名里必须带 `py-1.5`**：宽度之外，高度也是「零位移」的一部分。编辑框从 ~33.5px 掉到
 *    ~21.5px 的话，进编辑那一刻整行会上下错动——那比宽度差几像素更显眼。
 *
 * ④ `MEASURE_MIN_WIDTH` 兜底：新增字段的值是空串时宽度会是 0，输入框塌成一条线。
 */

import { createElement, type CSSProperties, type ReactNode } from 'react'

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
export const MEASURE_INPUT_CLASS = 'px-3 py-1.5 rounded text-sm'

/** 探针相对正文额外需要的一切（`font` / `color` 仍由调用处按该行给）。 */
export const MEASURE_STYLE: CSSProperties = {
  position: 'absolute', visibility: 'hidden', whiteSpace: 'pre', margin: 0,
  border: '1px solid var(--color-brand)', borderRadius: 4,
}

/** 宽度下限：空值时不塌成 0 宽。 */
export const MEASURE_MIN_WIDTH = '4em'

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
