/**
 * 结果区的版式常量与列数规则（v0.6.3 条目 16；v0.6.3 打磨：左栏封顶、词条吃余量）。
 *
 * 抽成独立模块而不是写在 ResultBlock 里：断点同时被 ReviewArena（内容区上限）与
 * ResultBlock（列数）消费，放在组件里会让 ReviewArena 反向 import 一个渲染组件。
 */

/**
 * 作答栏的阅读宽度（px）＝作答行 / 三键 / 下一题这一栏的宽度上限。
 *
 * 一个数管两处（原名 NARROW_READING_WIDTH，只剩窄屏一处在用之后名字就不再成立）：
 * 窄屏时它是作答行的 maxWidth（词条在下方，作答行不该铺满 960）；
 * 宽屏时它是网格左轨的增长上限（见 resultGridColumns）。
 * 两处同一个数是刻意的——它们描述的是同一件事「作答这一栏该多宽」，
 * 拆成两个值就会在用户拖窗口时各走各的、在断点两侧跳一下。
 */
export const READING_WIDTH = 560

/**
 * 两栏断点。与内容区上限**取同一个数**——两处不同值会出现「窗口够宽了但内容区还是 960」的二义。
 *
 * 算式（Tailwind preflight 是 border-box，内容区 p-8 = 32px/边，故内容盒比 maxWidth 窄 64）：
 * 宽屏模板 `minmax(0, 560px) minmax(268px, 1fr)`——左轨封顶 560px、右轨吃余量。
 * 1100px 上限 → 内容盒 1036 → 左轨顶到 560 后余下 1036 − 22(gap) − 560 = 454 全归右轨。
 *
 * 左轨用**上限**而不是定宽：断点量的是**视口**（ReviewArena 的 useNarrowResults），
 * 窄侧边栏配置下会出现「视口刚过线、主区却不到 850px（560 + 22 + 268）」的一段，
 * 定宽左轨在那一段会横向溢出；`minmax(0, 560px)` 的零下限让它照常收缩，多出来的宽度一律归右轨。
 *
 * 1100 不能跟着左轨封顶一起调低：它同时是内容区上限（RESULT_CONTENT_WIDTH），
 * 调低等于把右栏的上限一起调低，与「给词条腾空间」的目的相反。
 */
export const RESULT_BREAKPOINT = 1100

/** 宽屏下内容区的 maxWidth（px）。由断点派生，写死字符串会与断点悄悄分家。 */
export const RESULT_CONTENT_WIDTH = `${RESULT_BREAKPOINT}px`

/**
 * 窄屏下内容区的 maxWidth（px）。值不变（960），只是给它一个名字：先前组件里是裸的
 * `'960px'` 字面量，与这里的 `RESULT_CONTENT_WIDTH` 各写各的——两个上限分居两处，
 * 改一个另一个不会跟着动，而它们描述的是同一条内容区规则。
 * 窄屏比宽屏窄是刻意的：单列下整行更长，正文行宽要收着读。
 */
export const NARROW_CONTENT_WIDTH = '960px'

/**
 * 结果区网格的列定义。窄屏单列＝「完整词条置底」：DOM 顺序就是作答在前、词条在后，
 * 单列时天然从上往下排，不需要 order 调整。
 *
 * 宽屏两轨（v0.6.3 打磨，原为 `minmax(0, 1fr) 268px`）：
 *   左轨 `minmax(0, 560px)`——零下限让它被压到内容宽以下（否则长释义会把网格顶破），
 *   上限 560px 让作答行与三键不再随窗口无限拉长。这两条缺一不可：只有下限会溢出，
 *   只有上限会让长内容顶破网格。
 *   右轨 `minmax(268px, 1fr)`——吃掉左轨封顶后的全部余量，同时保住 268px 的下限
 *   （词条太窄时例句会碎成一列单词）。
 * 右轨由定宽改成弹性，正是本次「完整词条快照要有更充足的空间」的落点：
 * 1100px 上限下右栏 268 → 454px。
 * 窄屏只有一轨，同样是 minmax(0, 1fr)——此时左轨要装作答与三键。
 */
export function resultGridColumns(narrow: boolean): string {
  return narrow ? 'minmax(0, 1fr)' : `minmax(0, ${READING_WIDTH}px) minmax(268px, 1fr)`
}
