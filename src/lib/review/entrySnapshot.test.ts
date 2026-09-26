import { describe, it, expect } from 'vitest'
import { buildPosTree, type SnapshotRow } from './entrySnapshot'

const row = (
  id: string, key: string, value: string, parentId: string | null, displayOrder: number,
): SnapshotRow => ({ id, key, value, parentId, displayOrder })

describe('buildPosTree（v0.6.2 条目 12）', () => {
  it('按词性父分组，中英释义各归其位', () => {
    const tree = buildPosTree([
      row('p1', 'part_of_speech', 'v.', null, 0),
      row('zh1', 'chinese_definition', '散布，扩散', 'p1', 1),
      row('en1', 'english_definition', 'to spread', 'p1', 2),
      row('p2', 'part_of_speech', 'adj.', null, 3),
      row('zh2', 'chinese_definition', '弥漫的', 'p2', 4),
    ])
    expect(tree).toHaveLength(2)
    expect(tree[0]).toMatchObject({
      pos: 'v.',
      definitions: { zh: [{ text: '散布，扩散' }], en: [{ text: 'to spread' }] },
    })
    expect(tree[0].definitions.zh[0].examples).toEqual([])
    expect(tree[0].definitions.en[0].examples).toEqual([])
    expect(tree[1]).toMatchObject({ pos: 'adj.', definitions: { zh: [{ text: '弥漫的' }], en: [] } })
  })

  it('词性按 display_order 排序', () => {
    const tree = buildPosTree([
      row('p2', 'part_of_speech', 'adj.', null, 9),
      row('p1', 'part_of_speech', 'v.', null, 1),
    ])
    expect(tree.map(g => g.pos)).toEqual(['v.', 'adj.'])
  })

  it('例句挂在本条释义下，不串到兄弟释义（复刻工作台「词性」树）', () => {
    const tree = buildPosTree([
      row('p1', 'part_of_speech', 'v.', null, 0),
      row('en1', 'english_definition', 'to spread', 'p1', 1),
      row('en2', 'english_definition', 'to diffuse', 'p1', 2),
      row('zh1', 'chinese_definition', '散布', 'p1', 3),
      row('s1', 'example_sentence', '', 'en1', 4),
      row('e1', 'example', 'The soldiers fanned out.', 's1', 5),
      row('s2', 'example_sentence', '', 'en2', 6),
      row('e2', 'example', 'Smoke spread through the room.', 's2', 7),
    ])
    expect(tree[0].definitions.en.map(d => ({ text: d.text, examples: d.examples }))).toEqual([
      { text: 'to spread', examples: ['The soldiers fanned out.'] },
      { text: 'to diffuse', examples: ['Smoke spread through the room.'] },
    ])
    // 中文释义本身没挂例句：留空数组而非借用兄弟释义的
    expect(tree[0].definitions.zh.map(d => ({ text: d.text, examples: d.examples }))).toEqual([
      { text: '散布', examples: [] },
    ])
  })

  it('一条释义挂多条例句时按 display_order 依次排列，空例句不入列', () => {
    const tree = buildPosTree([
      row('p1', 'part_of_speech', 'v.', null, 0),
      row('en1', 'english_definition', 'to spread', 'p1', 1),
      row('s2', 'example_sentence', '', 'en1', 4),
      row('e2', 'example', 'Smoke spread.', 's2', 5),
      row('s1', 'example_sentence', '', 'en1', 2),
      row('e0', 'example', '', 's1', 3),
      row('e1', 'example', 'The soldiers fanned out.', 's1', 6),
    ])
    expect(tree[0].definitions.en[0].examples).toEqual(['The soldiers fanned out.', 'Smoke spread.'])
  })

  it('无容器：example 直接挂英释义下（mergeFields 允许的形状）也入列，且不串兄弟', () => {
    const tree = buildPosTree([
      row('p1', 'part_of_speech', 'v.', null, 0),
      row('en1', 'english_definition', 'to spread', 'p1', 1),
      row('en2', 'english_definition', 'to diffuse', 'p1', 2),
      row('e1', 'example', 'The soldiers fanned out.', 'en1', 3),
    ])
    expect(tree[0].definitions.en.map(d => ({ text: d.text, examples: d.examples }))).toEqual([
      { text: 'to spread', examples: ['The soldiers fanned out.'] },
      { text: 'to diffuse', examples: [] },
    ])
    // 没有中间释义可挂，落词性层
    expect(tree[0].examples).toEqual([])
  })

  it('无中间释义：例句直接挂词性下时进词性层，不混进任何释义', () => {
    const tree = buildPosTree([
      row('p1', 'part_of_speech', 'v.', null, 0),
      row('zh1', 'chinese_definition', '散布', 'p1', 1),
      row('s1', 'example_sentence', '', 'p1', 2),
      row('e1', 'example', 'The soldiers fanned out.', 's1', 3),
      row('e2', 'example', 'They spread out slowly.', 'p1', 4),
      row('e0', 'example', '', 'p1', 5),
    ])
    expect(tree[0].examples).toEqual(['The soldiers fanned out.', 'They spread out slowly.'])
    expect(tree[0].definitions.zh.map(d => d.examples)).toEqual([[]])
    expect(tree[0].definitions.en).toEqual([])
  })

  it('短语 / 词形变化 / 词源 / 辨析四个标签页的根不进树', () => {
    const tree = buildPosTree([
      row('p1', 'part_of_speech', 'v.', null, 0),
      row('ph', 'phrase', '', null, 1),
      row('ex2', 'exchange', '', null, 2),
      row('dv', 'derivatives', '', null, 3),
      row('sd', 'synonym_discrimination', '', null, 4),
    ])
    expect(tree).toHaveLength(1)
  })

  it('空值释义不入列（不给一个空行）', () => {
    const tree = buildPosTree([
      row('p1', 'part_of_speech', 'v.', null, 0),
      row('zh0', 'chinese_definition', '', 'p1', 1),
      row('zh1', 'chinese_definition', '有效', 'p1', 2),
    ])
    expect(tree[0].definitions.zh.map(d => d.text)).toEqual(['有效'])
  })

  it('没有词性父时返回空数组（调用方走占位文案）', () => {
    expect(buildPosTree([row('zh', 'chinese_definition', '光', null, 0)])).toEqual([])
  })

  it('空输入返回空数组', () => {
    expect(buildPosTree([])).toEqual([])
  })
})
