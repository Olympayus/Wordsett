import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const value = (name: string) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()

describe('tokens.css', () => {
  it('五档面各就各位', () => {
    expect(value('--color-chrome')).toBe('#EEECE5')
    expect(value('--color-surface-sunken')).toBe('#F5F3ED')
    expect(value('--color-canvas')).toBe('#F9F8F5')
    expect(value('--color-surface')).toBe('#FFFFFF')
    expect(value('--color-surface-raised')).toBe('#F3F1EA')
    expect(value('--color-surface-hover')).toBe('#F0F1EE')
  })

  it('墨压深到可读', () => {
    expect(value('--color-text-primary')).toBe('#1C1814')
    expect(value('--color-text-secondary')).toBe('#57514A')
    expect(value('--color-text-tertiary')).toBe('#767064')
  })

  it('动效只有一档（background-color / color 90ms linear）', () => {
    expect(value('--duration-fast')).toBe('90ms')
    expect(value('--duration-instant')).toBe('90ms')
    expect(value('--ease-smooth')).toBe('linear')
  })

  it('圆角刻度不动（4 / 6 / 8 / 12 / full）', () => {
    expect(value('--radius-sm')).toBe('4px')
    expect(value('--radius-md')).toBe('6px')
    expect(value('--radius-lg')).toBe('8px')
    expect(value('--radius-xl')).toBe('12px')
    expect(value('--radius-full')).toBe('9999px')
  })

  it('记忆强度六阶：六个 token 名齐全，六值为互异 hex（色名互异 ≠ 色值互异）', () => {
    // MASTERY_COLORS 收进 var(--m-mastery-N) 后，masteryScale.test.ts 里
    // 「Set(MASTERY_COLORS).size === 6」只证明六个**变量名**不同，证不了六个**墨色**不同。
    // 真正的唯一性守卫落在这里：直接读 tokens.css，六名齐全且六值互异。
    const inks = Array.from({ length: 6 }, (_, n) => value(`--m-mastery-${n}`))
    for (const [n, ink] of inks.entries()) expect(ink, `--m-mastery-${n}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(new Set(inks).size).toBe(6)
  })

  it('token 名一个不少（Tailwind v4 同名叠写靠声明顺序，删名会静默回落）', () => {
    for (const n of [
      '--color-brand', '--color-brand-soft', '--color-brand-softer', '--color-accent',
      '--color-pos', '--color-border', '--color-border-strong',
      '--color-success', '--color-warning', '--color-danger', '--color-leech',
      '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-full',
      '--text-xs', '--text-sm', '--text-base', '--text-lg', '--space-4',
      '--shadow-soft', '--shadow-raised', '--shadow-overlay',
      '--z-sticky', '--z-overlay',
      '--ink-1', '--ink-2', '--ink-3',
    ]) expect(value(n), n).toBeTruthy()
  })

  it('墨阶是相对别名，深色块不得给它们写第二份值（v0.7.3 尾段 §1.6）', () => {
    expect(value('--ink-1')).toBe('var(--color-text-primary)')
    expect(value('--ink-2')).toBe('var(--color-text-secondary)')
    expect(value('--ink-3')).toBe('var(--color-text-tertiary)')
    expect(darkValue('--ink-1')).toBeUndefined()
    expect(darkValue('--ink-2')).toBeUndefined()
    expect(darkValue('--ink-3')).toBeUndefined()
  })
})

// 深色块要单独取：value() 取的是整个文件里的第一个匹配，深色块在文件末尾，
// 所以必须先把块切出来再取值。
const darkBlock = css.match(/\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
const darkValue = (name: string) => darkBlock.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()

describe('tokens.css 的深色块（v0.7.3）', () => {
  it('块存在', () => {
    expect(darkBlock.length).toBeGreaterThan(200)
  })

  it('五档面在深色下逐值钉死（浅色那份一个都没动）', () => {
    expect(darkValue('--color-chrome')).toBe('#191919')
    expect(darkValue('--color-surface-sunken')).toBe('#1E1E1E')
    expect(darkValue('--color-canvas')).toBe('#232323')
    expect(darkValue('--color-surface')).toBe('#2A2A2A')
    expect(darkValue('--color-surface-raised')).toBe('#202020')
    expect(darkValue('--color-surface-hover')).toBe('#272727')
  })

  it('深色墨：一级降下来、三级反向提上去', () => {
    expect(darkValue('--color-text-primary')).toBe('#D6D6D6')
    expect(darkValue('--color-text-secondary')).toBe('#A4A4A4')
    expect(darkValue('--color-text-tertiary')).toBe('#8E8E8E')
  })

  it('深色语义色四个都校准过（不得等于浅色值）', () => {
    expect(darkValue('--color-brand')).toBe('#7FA5DA')
    expect(darkValue('--color-accent')).toBe('#D99667')
    expect(darkValue('--color-danger')).toBe('#D9736E')
    expect(darkValue('--color-leech')).toBe('#D97A70')
    expect(darkValue('--color-brand')).not.toBe(value('--color-brand'))
  })

  it('深色记忆强度六阶齐全且六值互异', () => {
    const inks = Array.from({ length: 6 }, (_, n) => darkValue(`--m-mastery-${n}`))
    for (const [n, ink] of inks.entries()) expect(ink, `dark --m-mastery-${n}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(new Set(inks).size).toBe(6)
  })

  it('发丝边 token 两个主题下都在', () => {
    expect(value('--color-hairline')).toBe('rgba(0, 0, 0, 0.16)')
    expect(darkValue('--color-hairline')).toBe('rgba(255, 255, 255, 0.14)')
  })

  it('color-scheme 两个主题块各写一次（v0.7.3 尾段 §6）', () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/)
    expect(darkValue('color-scheme')).toBe('dark')
  })
})

describe('来源两色的色值（v0.7.4 决定九：色相对调）', () => {
  it('浅色：被编辑橙、用户创建蓝', () => {
    expect(value('--color-weave-edited')).toBe('#C17A4E')
    expect(value('--color-weave-personal')).toBe('#4A6FA5')
  })

  it('深色：同一对色相按深底取值', () => {
    expect(darkValue('--color-weave-edited')).toBe('#D99667')
    expect(darkValue('--color-weave-personal')).toBe('#7FA5DA')
  })

  it('对调只动这两色，中性 original 不变', () => {
    expect(value('--color-weave-original')).toBe('#BAB4AA')
    expect(darkValue('--color-weave-original')).toBe('#575757')
  })
})

describe('分类色板 16 色（Task 16：8 → 16）', () => {
  it('浅色块 16 个 token 名齐全、16 值为互异 hex，且落在既有明度带内（L* 45–60）', () => {
    const cats = Array.from({ length: 16 }, (_, n) => value(`--color-cat-${n + 1}`))
    for (const [n, c] of cats.entries()) expect(c, `--color-cat-${n + 1}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(new Set(cats).size).toBe(16)
    // 选中态是白字压在分类色上：太浅白字就看不见，故 L* 不得高于 60；
    // 与既有 8 色同带（既有 L* 46.4–57.9），新增 8 色必须落进 45–60。
    const lstar = (hex: string) => {
      const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
      const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16)))
      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
      return Y > 216 / 24389 ? 116 * Y ** (1 / 3) - 16 : Y * 24389 / 27
    }
    for (const [n, c] of cats.entries()) {
      const L = lstar(c!)
      expect(L, `--color-cat-${n + 1} L*`).toBeGreaterThanOrEqual(45)
      expect(L, `--color-cat-${n + 1} L*`).toBeLessThanOrEqual(60)
    }
  })

  it('深色块同样 16 个 token 名齐全、16 值为互异 hex，且相对浅色同族抬亮（ΔL* 8–22）', () => {
    const lstar = (hex: string) => {
      const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
      const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16)))
      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
      return Y > 216 / 24389 ? 116 * Y ** (1 / 3) - 16 : Y * 24389 / 27
    }
    const lightCats = Array.from({ length: 16 }, (_, n) => value(`--color-cat-${n + 1}`))
    const darkCats = Array.from({ length: 16 }, (_, n) => darkValue(`--color-cat-${n + 1}`))
    for (const [n, c] of darkCats.entries()) expect(c, `dark --color-cat-${n + 1}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(new Set(darkCats).size).toBe(16)
    // 既有 8 色的抬亮幅度 +9.8 ~ +20.5，新增 8 色必须落进同一区间
    for (const [n] of darkCats.entries()) {
      const d = lstar(darkCats[n]!) - lstar(lightCats[n]!)
      expect(d, `dark ΔL* --color-cat-${n + 1}`).toBeGreaterThanOrEqual(8)
      expect(d, `dark ΔL* --color-cat-${n + 1}`).toBeLessThanOrEqual(22)
    }
  })

  it('既有 8 色逐值钉死（新增 8 色不得顶替旧值）', () => {
    const lightExpected = ['#7A7368', '#6B8E7F', '#4A6FA5', '#8B6A8B', '#C17A4E', '#B85450', '#5A7A8C', '#8B7355']
    const darkExpected = ['#9A938A', '#86B39D', '#7FA5DA', '#B58AB5', '#D99667', '#D9736E', '#82A8BB', '#B79A78']
    for (let n = 1; n <= 8; n++) {
      expect(value(`--color-cat-${n}`), `light cat-${n}`).toBe(lightExpected[n - 1])
      expect(darkValue(`--color-cat-${n}`), `dark cat-${n}`).toBe(darkExpected[n - 1])
    }
  })
})
