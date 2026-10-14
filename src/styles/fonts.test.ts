import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./fonts.css', import.meta.url), 'utf8')
const publicDir = new URL('../../public/fonts/', import.meta.url)

describe('fonts.css', () => {
  it('三个家族的 @font-face 都在，且每个都以 local() 打头', () => {
    for (const family of ['Literata', 'IBM Plex Sans', 'Noto Sans SC']) {
      expect(css).toContain(`font-family: '${family}'`)
    }
    // local() 必须排在 url() 之前：装了同名字体的机器直接用系统的
    for (const block of css.split('@font-face').slice(1)) {
      const src = block.slice(block.indexOf('src:'), block.indexOf(';', block.indexOf('src:')))
      expect(src.indexOf('local(')).toBeGreaterThan(-1)
      expect(src.indexOf('local(')).toBeLessThan(src.indexOf('url('))
    }
  })

  it('声明里引用的字体文件都真的在 public/fonts/ 下', () => {
    const refs = [...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map(m => m[1])
    expect(refs.length).toBeGreaterThan(0)
    for (const r of refs) {
      const name = r.replace(/^\/fonts\//, '')
      expect(existsSync(new URL(name, publicDir)), name).toBe(true)
    }
  })

  it('中文字体是可变字体且声明了 wght 轴范围', () => {
    const scBlock = css.split('@font-face').find(b => b.includes("'Noto Sans SC'")) ?? ''
    expect(scBlock).toContain('font-weight: 100 900')
  })
})
