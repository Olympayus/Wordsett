/** 键入题归一：去首尾空白、转小写、折叠内部连续空白。 */
export function normalizeTyped(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** 提交后的归一比对（填空 / 听辨判红绿用）。 */
export function compareTyped(input: string, target: string): boolean {
  const a = normalizeTyped(input)
  const b = normalizeTyped(target)
  return a.length > 0 && a === b
}

/**
 * 逐字母比对：第 i 位是否与目标一致（逐字母即错即标红用）。
 * 两侧均按码点对齐比较；调用方需自行保证 input 已 trim（本函数不做归一），
 * 返回数组与 input 按码点位置一一对应。
 */
export function letterMatches(input: string, target: string): boolean[] {
  const a = input.toLowerCase()
  const b = target.toLowerCase()
  const bs = Array.from(b)
  return Array.from(a, (ch, i) => ch === bs[i])
}
