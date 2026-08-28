import { describe, it, expect } from 'vitest'
import { buildTitleMetaInputs, wordRootItemText } from './titleStrip'

const meta = {
  phonetic: "'hʊd",
  wordRoots: [
    { class: 'root', root: 'hom', meaning: 'man, human', origin: 'Latin' },
    { class: 'suffix', root: '-less', meaning: 'without', origin: '' },
  ],
}

describe('wordRootItemText', () => {
  it('格式化词条文本', () => {
    expect(wordRootItemText(meta.wordRoots[0])).toBe('root「hom」= man, human（Latin）')
    expect(wordRootItemText(meta.wordRoots[1])).toBe('suffix「-less」= without')
  })
})

describe('buildTitleMetaInputs', () => {
  it('音标 + 词根都勾选：根容器在前、子项带 parentTempId 引用', () => {
    const out = buildTitleMetaInputs(meta, { phonetic: true, wordRoot: true })
    expect(out[0]).toEqual({ key: 'phonetic', value: "'hʊd", source: 'ecdict', tempId: 'ecdict:title-phonetic' })
    const container = out.find(i => i.key === 'word_root')
    expect(container).toMatchObject({ key: 'word_root', value: '', source: 'ecdict', tempId: 'ecdict:title-root' })
    const items = out.filter(i => i.key === 'word_root_item')
    expect(items).toHaveLength(2)
    for (const it of items) expect(it.parentTempId).toBe('ecdict:title-root')
    expect(items[0].value).toBe('root「hom」= man, human（Latin）')
  })
  it('只勾音标：无词根容器', () => {
    const out = buildTitleMetaInputs(meta, { phonetic: true, wordRoot: false })
    expect(out.map(i => i.key)).toEqual(['phonetic'])
  })
  it('音标缺失或未勾选 / 词根为空数组时不产出对应项', () => {
    expect(buildTitleMetaInputs({ phonetic: null, wordRoots: [] }, { phonetic: true, wordRoot: true })).toEqual([])
  })
})