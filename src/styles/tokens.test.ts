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
    ]) expect(value(n), n).toBeTruthy()
  })
})
