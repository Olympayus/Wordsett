// src/lib/libraryCodec.test.ts
import { describe, it, expect } from 'vitest'
import {
  encodeLibrary, decodeLibrary, planImport,
  type LibrarySnapshot,
} from './libraryCodec'

const word = (id: string, updatedAt = 100) => ({
  id, lemma: `w-${id}`, normalizedLemma: `w-${id}`, language: 'en',
  createdAt: 50, updatedAt,
})

const empty: LibrarySnapshot = {
  words: [], fieldDefinitions: [], fieldValues: [], categories: [], wordCategories: [],
}

describe('encodeLibrary / decodeLibrary', () => {
  it('round-trips a snapshot losslessly', () => {
    const snap: LibrarySnapshot = {
      words: [word('a')],
      fieldDefinitions: [{ id: 'fd1', name: '自定义', key: 'custom_1', fieldType: 'text', displayOrder: 99, createdAt: 1 }],
      fieldValues: [{ id: 'fv1', wordId: 'a', fieldId: 'f_chinese_definition', value: '跟踪', source: 'ecdict', edited: false, originalValue: null, displayOrder: 1, parentId: null, createdAt: 1, updatedAt: 2 }],
      categories: [{ id: 'c1', name: 'GRE', color: '#c17b5c', description: null, isDefault: true, createdAt: 1, updatedAt: 2 }],
      wordCategories: [{ wordId: 'a', categoryId: 'c1' }],
    }
    const decoded = decodeLibrary(encodeLibrary(snap, '0.4.2'))
    expect(decoded).toEqual(snap)
  })
  it('rejects unknown formatVersion', () => {
    const bad = JSON.stringify({ formatVersion: 999, words: [] })
    expect(() => decodeLibrary(bad)).toThrow(/formatVersion/i)
  })
  it('导入不带 location 的老快照时一律落 workspace', () => {
    const snap = decodeLibrary(JSON.stringify({ formatVersion: 1, words: [{ id: 'w', lemma: 'a', normalizedLemma: 'a', language: 'en', createdAt: 1, updatedAt: 1 }] }))
    expect(snap.words[0].location ?? 'workspace').toBe('workspace')
  })
  it('round-trips location through encode / decode', () => {
    const snap: LibrarySnapshot = { ...empty, words: [{ ...word('a'), location: 'archive' }] }
    expect(decodeLibrary(encodeLibrary(snap, '0.7.5')).words[0].location).toBe('archive')
  })
})

describe('planImport', () => {
  it('counts new and updated words by id and updatedAt', () => {
    const existing: LibrarySnapshot = {
      ...empty,
      words: [word('a', 100), word('b', 100)],
    }
    const incoming: LibrarySnapshot = {
      ...empty,
      words: [word('a', 200), word('c', 50)], // a: 更新；b: 不在 incoming；c: 新增
    }
    const plan = planImport(existing, incoming)
    expect(plan.newWords).toBe(1)
    expect(plan.updatedWords).toBe(1)
  })
  it('skips incoming rows older than existing', () => {
    const existing: LibrarySnapshot = { ...empty, words: [word('a', 200)] }
    const incoming: LibrarySnapshot = { ...empty, words: [word('a', 100)] }
    const plan = planImport(existing, incoming)
    expect(plan.updatedWords).toBe(0)
    expect(plan.skipped).toBe(1)
  })
  it('counts field values and word categories', () => {
    const fv = (id: string) => ({ id, wordId: 'a', fieldId: 'f_x', value: 'v', source: 'user', edited: false, originalValue: null, displayOrder: 0, parentId: null, createdAt: 1, updatedAt: 2 })
    const plan = planImport(
      { ...empty, fieldValues: [fv('old')] },
      { ...empty, fieldValues: [fv('new1'), fv('old')] },
    )
    expect(plan.newFieldValues).toBe(1)
    const wcPlan = planImport(
      { ...empty, wordCategories: [{ wordId: 'a', categoryId: 'c1' }] },
      { ...empty, wordCategories: [{ wordId: 'a', categoryId: 'c1' }, { wordId: 'b', categoryId: 'c1' }] },
    )
    expect(wcPlan.newWordCategories).toBe(1)
  })
})
