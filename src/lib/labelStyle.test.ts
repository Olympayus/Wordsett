import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { FIELD_LABEL_STYLE, BAND_LABEL_COLUMN, BAND_LABEL_GAP } from './labelStyle'

describe('字段标签（v0.7.4 决定七 7.3）', () => {
  it('字形取「中文释义(n)」那一套：粗体 / 一档小字 / 次级墨 / 字距 0.5', () => {
    expect(FIELD_LABEL_STYLE).toEqual({
      fontSize: 'var(--text-sm)', fontWeight: 700, letterSpacing: '0.5px',
      color: 'var(--color-text-secondary)',
    })
  })

  it('头带标签列与间距收到 44 / 8，两页共用', () => {
    expect(BAND_LABEL_COLUMN).toBe(44)
    expect(BAND_LABEL_GAP).toBe(8)
    for (const f of ['../components/word/PhoneticArea.tsx', '../components/search/WordTitleExtras.tsx'] as const) {
      expect(readFileSync(new URL(f, import.meta.url), 'utf8'), f).toMatch(/BAND_LABEL_COLUMN/)
    }
  })
})
