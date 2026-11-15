import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('./WordList.tsx', import.meta.url), 'utf8')
describe('WordList 平板长按（v0.7.8）', () => {
  it('touch prop 存在，长按判据含 touch', () => {
    expect(src).toMatch(/touch\?: boolean/)
    expect(src).toMatch(/chrome === 'drawer' \|\| touch/)
  })
})
