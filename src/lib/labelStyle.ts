/**
 * 字段标签的字形与头带标签列（v0.7.6 C1 两档）。
 *
 * C1 是「小标题」这一档：比正文小一号（10.5px）、半粗（600）、字距拉开到 0.1em。
 * 它靠松字距而不是更大的字号或更重的字重来显眼——标签是结构提示，不该和值抢注意力；
 * 0.1em 的疏排也让「音标」「词根」「中文释义(n)」这类短标签在视觉上自成一档。
 *
 * 两档只差墨色：白面（surface）上的标签取暖灰 `--color-label`（#7E6F5E / 深色 #B3A691），
 * 主题色面（chrome / raised / sunken / canvas）上没有白面可依托，改用次级文字色，
 * 于是同一套字形出 `FIELD_LABEL_STYLE` 与 `LABEL_ON_THEME` 两份。
 *
 * 头带里的「音标」「词根」两枚标签（v0.7.4 起）取的也是这套字形，共享标签列 44px
 * （列宽 −18、行距 10 → 8，标签因此离自己的值更近）。
 *
 * 历史备注（不要误动）：
 *   1. `PhoneticArea` 的标签 span 与返回页 `WordTitleExtras` 的 `LABEL_COL` 取
 *      `BAND_LABEL_COLUMN` / `BAND_LABEL_GAP`；
 *   2. `WordWorkbench` 的 `LABEL_COLUMN_WIDTH`——**那是工作区正文行的标签列宽，
 *      是另一个量，不动**（正文行的字号分两级：一级 `--text-sm`、次级 `--text-xs`，
 *      换成写死一档的共享常量会把所有子级标签悄悄抬一档）。
 */

import type { CSSProperties } from 'react'

/** C1 白面标签：一档小字 / 半粗 / 字距 0.1em / 暖灰标签墨。 */
export const FIELD_LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: '10.5px',
  fontWeight: 600,
  letterSpacing: '0.1em',
  color: 'var(--color-label)',
}

/** 主题色面（chrome / raised / sunken / canvas）上的同款标签。 */
export const LABEL_ON_THEME: CSSProperties = { ...FIELD_LABEL_STYLE, color: 'var(--color-text-secondary)' }

/** 头带字段行的标签列宽（px）：62 → 44。 */
export const BAND_LABEL_COLUMN = 44

/** 头带字段行的标签 ↔ 值行距（px）：10 → 8。 */
export const BAND_LABEL_GAP = 8
