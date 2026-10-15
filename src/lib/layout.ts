/**
 * 词条页（工作区与搜索返回页）共用的版式常量（v0.7.2）。
 *
 * 这两页的内容列宽度、居中与内边距先前是**逐字相同的裸字面量**（`720px` / `24px 16px 48px`），
 * 抄了两份；导航条与控件的 26/22 也是散落的数字。收在这里之后，改一处就是改两页。
 */

/** 内容列的左右内边距（px）。导航条通栏后（v0.7.2）自己也取这一份，才能与下方内容列左右对齐。 */
export const ENTRY_COLUMN_PADDING_X = 24

/** 内容列的内边距。顶部留白现在由通栏导航条自己占（32px），故这里从 0 起。 */
export const ENTRY_COLUMN_PADDING = `0 ${ENTRY_COLUMN_PADDING_X}px 40px`

/** 词条头带（含页签条）铺满的宽度；正文度量停在 ENTRY_MEASURE。 */
export const ENTRY_BAND_WIDTH = 900

/** 义项正文的度量。中文一行 40 字上下，宽窗下不跟着放大。 */
export const ENTRY_MEASURE = 660

/** 通栏导航条高度 */
export const NAV_HEIGHT = 32

/** 导航条里控件的高度（按钮、图标键逐像素等高，右端才不会看着歪） */
export const NAV_CONTROL_HEIGHT = 22
