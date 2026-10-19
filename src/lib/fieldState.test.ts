import { describe, it, expect } from 'vitest'
import { fieldState, FIELD_STATE_BG, unitState, containerState } from './fieldState'
import type { FieldValue } from '../types/field'

// 只喂 fieldState 用到的两个字段，其余用断言式转换补足
const fv = (source: string, edited: boolean) => ({ source, edited }) as unknown as FieldValue

describe('fieldState 字段来源三态（v0.5.2 §3；fieldState 本身仍只出三态，无 none）', () => {
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

describe('FIELD_STATE_BG 四态底色（v0.7.3：加 none）', () => {
  it('四态齐备；除 none（不出条，透明）外都指向主题变量', () => {
    expect(Object.keys(FIELD_STATE_BG).sort()).toEqual(['edited', 'none', 'original', 'personal'])
    // 'none' 是「不出条」，没有对应的可见底色，故取 transparent；其余三态都必须是主题变量。
    for (const [k, v] of Object.entries(FIELD_STATE_BG)) {
      if (k === 'none') expect(v).toBe('transparent')
      else expect(v).toMatch(/^var\(--color-/)
    }
  })

  it('三个可见态底色互不相同（否则三态不可区分）', () => {
    const values = ['original', 'edited', 'personal'].map(k => FIELD_STATE_BG[k as 'original' | 'edited' | 'personal'])
    expect(new Set(values).size).toBe(values.length)
  })
})

const node = (p: Partial<FieldValue>): FieldValue => ({
  id: 'x', wordId: 'w', fieldId: 'f', value: 'v', source: 'ecdict', edited: false,
  originalValue: null, displayOrder: 0, parentId: null, createdAt: 0, updatedAt: 0, ...p,
})
const withKids = (p: Partial<FieldValue>, kids: Partial<FieldValue>[]) =>
  node({ ...p, children: kids.map(node) })

describe('来源状态（v0.7.4 决定九）', () => {
  it('单位：词典未改 → 默认；改过 → 被编辑；自己加的 → 用户创建', () => {
    expect(unitState(node({}), false)).toBe('original')
    expect(unitState(node({ edited: true }), false)).toBe('edited')
    expect(unitState(node({ source: 'user' }), false)).toBe('personal')
  })

  it('单位：在用户建的容器里，一律用户创建（继承优先于节点自身）', () => {
    expect(unitState(node({ edited: true }), true)).toBe('personal')
    expect(unitState(node({ source: 'ecdict' }), true)).toBe('personal')
  })

  it('容器：自己建的 → 用户创建', () => {
    expect(containerState(withKids({ source: 'user' }, [{}]), false)).toBe('personal')
  })

  it('容器：词典自带、子树里有人动过 → 被编辑', () => {
    expect(containerState(withKids({}, [{}, { edited: true }]), false)).toBe('edited')
    expect(containerState(withKids({}, [{}, { source: 'user' }]), false)).toBe('edited')
    expect(containerState(withKids({}, [{}, withKids({}, [{ edited: true }])]), false)).toBe('edited')
  })

  it('容器：词典自带且子树干净 → 默认', () => {
    expect(containerState(withKids({}, [{}, {}]), false)).toBe('original')
  })

  it('容器：自己的值被改过（子树干净甚至没有子级）→ 被编辑', () => {
    expect(containerState(node({ edited: true }), false)).toBe('edited')
  })

  it('容器：词典自带、没有子级且自身干净 → 默认', () => {
    expect(containerState(node({}), false)).toBe('original')
  })

  it('容器：在用户建的容器里 → 一律用户创建', () => {
    expect(containerState(withKids({}, [{ edited: true }]), true)).toBe('personal')
  })
})
