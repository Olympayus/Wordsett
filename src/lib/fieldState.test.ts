import { describe, it, expect } from 'vitest'
import { fieldState, FIELD_STATE_BG } from './fieldState'
import type { FieldValue } from '../types/field'

// 只喂 fieldState 用到的两个字段，其余用断言式转换补足
const fv = (source: string, edited: boolean) => ({ source, edited }) as unknown as FieldValue

describe('fieldState 字段来源三态（v0.5.2 §3）', () => {
  it('词典来源且未编辑 → original', () => {
    expect(fieldState(fv('ecdict', false))).toBe('original')
    expect(fieldState(fv('wordnet', false))).toBe('original')
  })

  it('用户新增 → personal', () => {
    expect(fieldState(fv('user', false))).toBe('personal')
  })

  it('已编辑优先于来源：即使是词典来源也判为 edited', () => {
    expect(fieldState(fv('ecdict', true))).toBe('edited')
  })

  it('用户新增后又编辑 → edited（编辑优先）', () => {
    expect(fieldState(fv('user', true))).toBe('edited')
  })
})

describe('FIELD_STATE_BG 三态底色', () => {
  it('三态齐备且都指向主题变量', () => {
    expect(Object.keys(FIELD_STATE_BG).sort()).toEqual(['edited', 'original', 'personal'])
    for (const v of Object.values(FIELD_STATE_BG)) expect(v).toMatch(/^var\(--color-/)
  })

  it('三态底色互不相同（否则三态不可区分）', () => {
    const values = Object.values(FIELD_STATE_BG)
    expect(new Set(values).size).toBe(values.length)
  })
})
