import { describe, it, expect } from 'vitest'
import { formatPhonetic, selectWordRootItems } from './phonetic'
import type { FieldValue } from '../types/field'

describe('formatPhonetic 音标斜杠', () => {
  it('无斜杠值两侧加斜杠', () => {
    expect(formatPhonetic('bru:')).toBe('/bru:/')
  })

  it('已含斜杠不重复加', () => {
    expect(formatPhonetic('/bruː/')).toBe('/bruː/')
  })

  it('去掉首尾空白', () => {
    expect(formatPhonetic('  bru:  ')).toBe('/bru:/')
  })

  it('selectWordRootItems：把各容器的子项按键序打平，保留非空项', () => {
    const containers = [
      { id: 'c1', value: '', children: [{ id: 'i1', value: 'chron-' }, { id: 'i2', value: '' }] },
      { id: 'c2', value: '', children: [{ id: 'i3', value: 'log-' }] },
    ] as unknown as FieldValue[]
    const out = selectWordRootItems(containers, null, false)
    expect(out.map(v => v.id)).toEqual(['i1', 'i3'])
  })

  it('selectWordRootItems：编者模式下空项也保留；正在编辑的空项保留', () => {
    const containers = [
      { id: 'c1', value: '', children: [{ id: 'i1', value: '' }, { id: 'i2', value: ' ' }] },
    ] as unknown as FieldValue[]
    expect(selectWordRootItems(containers, null, true).map(v => v.id)).toEqual(['i1', 'i2'])
    expect(selectWordRootItems(containers, 'i1', false).map(v => v.id)).toEqual(['i1'])
    expect(selectWordRootItems(containers, null, false)).toEqual([])
  })

  it('selectWordRootItems：无子项的容器不产出任何项', () => {
    const containers = [
      { id: 'c1', value: '', children: [] },
      { id: 'c2', value: 'x' },
    ] as unknown as FieldValue[]
    expect(selectWordRootItems(containers, null, true)).toEqual([])
  })
})
