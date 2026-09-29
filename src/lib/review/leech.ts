/**
 * 顽固词（Leech）判定与文案（v0.6.4；出题依据 01 §3.6 / 03 §3.2）。
 *
 * **严格口径**：只认 `lapses ≥ 阈值`。薄弱词专项页用的是
 * 「`lapses ≥ 阈值` ∪ 近 7 天 rating=1」的宽口径——两者刻意不同，别合并：
 * 徽标是「这个词反复栽跟头」的长期标记，用宽口径会让近 7 天偶尔错一次的词也挂上，
 * 一屏全是徽标时它就失去了指示作用。
 *
 * 阈值 0 视为「关掉」而不是「全部命中」——设置页允许调到 0，
 * 若按 `lapses >= 0` 判，整库每个词都会挂徽标。
 */
export function isLeech(maxLapses: number, threshold: number): boolean {
  if (threshold <= 0) return false
  return maxLapses >= threshold
}

export function leechTooltip(maxLapses: number): string {
  return `连错 ${maxLapses} 次`
}
