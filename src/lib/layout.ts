/**
 * 词条页（工作区与搜索返回页）共用的版式常量（v0.7.2）。
 *
 * 这两页的内容列宽度、居中与内边距先前是**逐字相同的裸字面量**（`720px` / `24px 16px 48px`），
 * 抄了两份；导航条与控件的 26/22 也是散落的数字。收在这里之后，改一处就是改两页。
 */

/**
 * 内容列的左右内边距（px）。数值仍是两页共用的那一个 24。
 *
 * **v0.7.2 二轮起只喂内容列**（`ENTRY_COLUMN_PADDING`）：两页导航条的 sticky wrapper 原先也
 * 借这一份垫左右内边距，把那道画在导航条自己盒内的 borderBottom 一起内缩了 24px ——
 * 分割线因此左右各短一截、顶不到屏幕边缘。wrapper 改为通栏不垫（内容由导航条自身
 * `WorkbenchNavBar.tsx` 的 14px 内边距撑）。值本身未动，导出保留：内容列与
 * `DictDetailCard.tsx` 的算式注释仍在引用它。
 */
export const ENTRY_COLUMN_PADDING_X = 24

/** 内容列的内边距。顶部留白现在由通栏导航条自己占（32px），故这里从 0 起。 */
export const ENTRY_COLUMN_PADDING = `0 ${ENTRY_COLUMN_PADDING_X}px 40px`

/** 头带（含页签条）铺满的宽度。**正文度量也取它**（v0.7.2 修复 3 起）——见下一行。 */
export const ENTRY_BAND_WIDTH = 900

/** 义项正文的度量。中文一行 40 字上下，宽窗下不跟着放大。
 *
 * **v0.7.2 修复 3 起已无消费点**（`layout.test.ts` 仍钉着 `ENTRY_MEASURE < ENTRY_BAND_WIDTH`，
 * 故常量按本仓「token 名永不删」的约定保留）。两页的正文度量已统一到 `ENTRY_BAND_WIDTH`：
 * 返回页要正文右缘与头带 / 页签条齐平（列的内容宽 852 = 900 − 2×24 本就小于 900），
 * 工作区随之跟进——同一套原语两个页面不能各持一个正文度量。这里留档的是旧设计意图
 * （「宽窗不放大正文，留给头带的字段行」），判它作废的依据是 controller 2026-10-15 的裁定。
 * 若将来又要「正文比头带窄」，改的是 `SenseFlow` 的 `measure` 默认值与两个调用点，
 * **不是**把这个常量接回去。 */
export const ENTRY_MEASURE = 660

/** 通栏导航条高度 */
export const NAV_HEIGHT = 32

/** 导航条里控件的高度（按钮、图标键逐像素等高，右端才不会看着歪） */
export const NAV_CONTROL_HEIGHT = 22

/** 头带里字段行之间的行距（词根 → 词根之后的字段行 …）。两页共用，先前是散在五处的裸 7px。
 *
 * **v0.7.3 尾段起已无消费点**：头带末行改由 `ENTRY_BAND_FOOT_GAP` 统一给上间距——工作区的词根行进
 * `EntryBand` 的 `footLeft`（自己不持 `marginTop`），返回页 `WordTitleExtras` 的词根行也改取
 * `ENTRY_BAND_FOOT_GAP`。常量按本仓「token 名永不删」的约定保留并留档（同 `ENTRY_MEASURE`）：
 * 若将来头带里再出现「音标 / 词根之后的字段行」，上间距取的就是本值。 */
export const ENTRY_ROW_GAP = 7

/** 词头行 → 音标行的行距（v0.7.2 由 7 提到 14，v0.7.3 再提到 24）：用户要求「音标离标题更远、
 * 离页签条更近」——草案 4「音标离标题再远一点」＋ 用户定稿的三个候选里取中值 24。 */
export const ENTRY_PHONETIC_GAP = 24

// 音标行 → 词根行（末行上间距）。v0.7.4：16 → 8，与音标行的 24 合成 32——「音标与词根的行间距再小一点」（草稿第 13 条）。两页都引用此常量，值只在这里改。
export const ENTRY_BAND_FOOT_GAP = 8

/** 正文行的行高与上下内边距（v0.7.4 决定七 7.4，用户选「收一档」）。
 *  先前是 FlowRow / LeafFlow 里各自的裸字面量（1.75 / 4px）。收进本文件后，
 *  「普通与编者模式共用同一组值」这条不变量才守得住——两态一旦各写一份，
 *  切模式就会改变密度，那是本版要根除的跳动之一。 */
export const ROW_LINE_HEIGHT = 1.6
export const ROW_PADDING_Y = 3

/** 页签条（条面）的内边距（v0.7.3 尾段 §4.1）——**D18 的落点**。
 *
 * 左右 24px 与内容列左缘（`ENTRY_COLUMN_PADDING_X` 的 24px）是同一条线，故条面本身仍与正文左缘齐平。
 * 两页（工作区 `TabBar` / 返回页 `DictDetailPanel`）共用这一份：改一处就是改两页。 */
export const TAB_STRIP_PADDING = '4px 24px 0'

/** 页签（单个页签）的内边距（v0.7.3 尾段 §4.1）。
 *
 * 首个页签自身 14px —— 条面的 24px 加这 14px，两页的页签文字都落在 38px 上。
 * 左右对称（14/14），故 `padding` 与 `paddingX` 同值，只此一份。
 *
 * v0.7.4 决定七 7.1：编者模式曾用 '7px 26px 7px 14px' 给删页签的 × 预留 12px，每枚页签因此宽 12px、三枚整排 +36px，越过 900px 内容列后被压窄、条面长高、下方正文整体下移（用户报的「打开编者模式整体压缩、跳跃」）。× 改为落进本来就有的 14px 右内边距里，两态共用同一个值。 */
export const TAB_ITEM_PADDING_X = '7px 14px'

/** 设置页「双向链接」两个统计列表的固定高度（v0.7.5 任务 7，取 240）。
 *
 * 两个列表**等高并排、各自独立滚动**：高度写死而不是交给内容，页面的高度才不随
 * 链接条数增长（链接是词条内容的一部分，可能成百上千条）。窄窗下两列换行堆叠，
 * 高度仍取本值——两个列表在任何断点下都保持等高。 */
export const LINK_LIST_HEIGHT = 240
