import { describe, it, expect } from 'vitest'
import { isLeafFlow } from './leafFlow'
import { LEAF_FLOW_CONTAINER_KEYS } from './fieldKind'

describe('isLeafFlow（v0.7.4：判据只认容器 key）', () => {
  it('六个列举容器都进多列，单条也进', () => {
    // 精确钉住规格（决定一 / spec:44）的六个**容器** key。若只从 `CONTAINER_KIND` 派生后
    // 再遍历它，加一个 `'list'` 键会悄悄通过——这条断言是防那个的。
    expect([...LEAF_FLOW_CONTAINER_KEYS].sort()).toEqual(
      ['derivatives', 'exchange', 'phrase', 'supplementary', 'synonyms', 'word_root'],
    )
    for (const k of LEAF_FLOW_CONTAINER_KEYS) expect(isLeafFlow(k), k).toBe(true)
  })

  it('例句容器恒逐行', () => {
    expect(isLeafFlow('example_sentence')).toBe(false)
  })

  it('表外一律逐行：辨析组、词性、用户自建字段', () => {
    expect(isLeafFlow('synonym_discrimination_group')).toBe(false)
    expect(isLeafFlow('part_of_speech')).toBe(false)
    expect(isLeafFlow(undefined)).toBe(false)
    expect(isLeafFlow('my_custom_field')).toBe(false)
  })

  it('判据不读内容：名字里带 example 的字段不因「像例句」而被排除', () => {
    expect(LEAF_FLOW_CONTAINER_KEYS).not.toContain('example_sentence')
  })
})
