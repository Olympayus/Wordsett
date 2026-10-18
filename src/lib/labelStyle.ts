/**
 * 字段标签的字形与头带标签列（v0.7.4 决定七 7.3）。
 *
 * 头带里的「音标」「词根」两枚标签此前用的是自己一套字形——11.5px、常规字重、三级墨——
 * 而正文的「中文释义(n)」是粗体、一档小字、次级墨、字距 0.5px，两处看着不像一家。
 * 本次把头带那两枚标签统一到释义标签那一套，并把共享标签列从 62px 收到 44px
 * （列宽 −18、行距 10 → 8，标签因此离自己的值更近）。
 *
 * 这三份值此前散在三处，评审 Minor M-1 曾把它们手工对齐过一次（两页曾一为
 * 12px/700/次级、一为 11.5px/三级，看着不是一列）：
 *   1. `PhoneticArea` 的标签 span（62px / 11.5px / 常规字重 / 三级墨 / padding-top 2）；
 *   2. 返回页 `WordTitleExtras` 的 `LABEL_COL`；
 *   3. `WordWorkbench` 的 `LABEL_COLUMN_WIDTH = 72`——**那是工作区正文行的标签列宽，
 *      是另一个量，不动**（正文行的字号分两级：一级 `--text-sm`、次级 `--text-xs`，
 *      换成写死 `--text-sm` 的共享常量会把所有子级标签悄悄抬一档）。
 * `FIELD_LABEL_STYLE` 就是工作区一级正文标签原有的字形，故头带取它即「取「中文释义(n)」那一套」，
 * 工作区那边不需要任何改动。
 */

import type { CSSProperties } from 'react'

/** 字段标签字形：与工作区一级正文标签（「中文释义(n）」）逐项相同——粗体 / 一档小字 / 次级墨 / 字距 0.5px。 */
export const FIELD_LABEL_STYLE: CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 700,
  letterSpacing: '0.5px',
  color: 'var(--color-text-secondary)',
}

/** 头带字段行的标签列宽（px）：62 → 44。 */
export const BAND_LABEL_COLUMN = 44

/** 头带字段行的标签 ↔ 值行距（px）：10 → 8。 */
export const BAND_LABEL_GAP = 8
