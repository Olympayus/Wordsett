import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { FIELD_LABEL_STYLE, LABEL_ON_THEME, BAND_LABEL_COLUMN, BAND_LABEL_GAP } from './labelStyle'

describe('字段标签（v0.7.6 C1 两档）', () => {
  it('白面标签：C1 一档小字 / 半粗 / 0.1em / 标签墨', () => {
    expect(FIELD_LABEL_STYLE).toEqual({
      fontFamily: 'var(--font-sans)',
      fontSize: '10.5px',
      fontWeight: 600,
      letterSpacing: '0.1em',
      color: 'var(--color-label)',
    })
  })

  it('主题底标签：同款字形，只把墨换成次级文字色', () => {
    expect(LABEL_ON_THEME).toEqual({ ...FIELD_LABEL_STYLE, color: 'var(--color-text-secondary)' })
  })

  it('头带标签列与间距收到 44 / 8，两页共用', () => {
    expect(BAND_LABEL_COLUMN).toBe(44)
    expect(BAND_LABEL_GAP).toBe(8)
    // 三处都钉，而不只是「文件里出现过这个标识符」：只查 toMatch(/BAND_LABEL_COLUMN/) 时，
    // 把 span 改回字面量 width: '62px'、只在注释里留个名字，守卫照样绿——这个坑
    // layout.test.ts:72-73 已经踩过并写明（「把 import 与模板串都摘掉、只留注释时，
    // 一条宽松的 toContain 是绿的」）。故照 layout.test.ts:75-76 的写法，import 与使用点
    // 各查一条，两页都过不去才算数。
    for (const f of ['../components/word/PhoneticArea.tsx', '../components/search/WordTitleExtras.tsx'] as const) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      expect(src, `${f} 必须 import BAND_LABEL_COLUMN`).toMatch(/import\s*\{[^}]*BAND_LABEL_COLUMN[^}]*\}\s*from\s*'[^']*labelStyle'/)
      expect(src, `${f} 的标签宽度必须取常量（不是字面量）`).toMatch(/width:\s*`\$\{BAND_LABEL_COLUMN\}px`/)
      expect(src, `${f} 的行距必须取常量`).toMatch(/gap:\s*BAND_LABEL_GAP/)
    }
  })
})
