import { describe, it, expect } from 'vitest'
import { posDisplay, buildWordnetFields, stripGlossExamples } from './wordnetParse'

describe('posDisplay', () => {
  it('n/v/a/s/r 显示映射', () => {
    expect(posDisplay('n')).toBe('n.')
    expect(posDisplay('v')).toBe('v.')
    expect(posDisplay('a')).toBe('adj.')
    expect(posDisplay('s')).toBe('adj.')
    expect(posDisplay('r')).toBe('adv.')
  })
})

describe('buildWordnetFields', () => {
  it('同词性 synset 并入同一父；近义词/例句各自挂在对应释义下', () => {
    const fields = buildWordnetFields('run', [
      { pos: 'n', definition: 'a score in baseball', words: 'run\nscore', examples: 'He hit a run.\nThey scored.' },
      { pos: 'n', definition: 'a regular trip', words: 'trip' },
      { pos: 'v', definition: 'to move fast', words: 'run' },
    ])
    const pos = fields.filter(f => f.key === 'part_of_speech')
    expect(pos.map(p => p.value)).toEqual(['n.', 'v.'])

    // 词性下只有释义；近义词/例句不再直属词性，而归到各自释义下
    const defs = pos[0].children!.filter(c => c.key === 'english_definition')
    expect(defs).toHaveLength(2)

    const def1 = defs[0]
    expect(def1.value).toBe('a score in baseball')
    expect(def1.children!.map(c => c.key)).toEqual(['example_sentence', 'synonyms'])
    const ex1 = def1.children!.find(c => c.key === 'example_sentence')!
    expect(ex1.children!.map(e => e.value)).toEqual(['He hit a run.', 'They scored.'])
    const syn1 = def1.children!.find(c => c.key === 'synonyms')!
    expect(syn1.children!.map(s => s.value)).toEqual(['score']) // 排除词条自身

    const def2 = defs[1]
    expect(def2.value).toBe('a regular trip')
    expect(def2.children!.map(c => c.key)).toEqual(['synonyms'])
    const syn2 = def2.children!.find(c => c.key === 'synonyms')!
    expect(syn2.children!.map(s => s.value)).toEqual(['trip'])
  })
  it('无近义词/例句时释义为叶子（不产生容器）', () => {
    const fields = buildWordnetFields('cat', [{ pos: 'n', definition: 'a small animal' }])
    const pos = fields[0]
    expect(pos.children!.map(c => c.key)).toEqual(['english_definition'])
    expect(pos.children![0].children).toBeUndefined()
  })
  it('无释义但有近义词时兜底挂词性下，不产生游离节点', () => {
    const fields = buildWordnetFields('x', [{ pos: 'n', definition: '', words: 'x\nalt' }])
    const pos = fields[0]
    const syn = pos.children!.find(c => c.key === 'synonyms')!
    expect(syn.children!.map(s => s.value)).toEqual(['alt'])
  })
})

describe('stripGlossExamples', () => {
  it('剔除尾部一个或多个「; 引号例句」段', () => {
    expect(stripGlossExamples('capable of arousing and holding the attention; "a fascinating story"; "films should be entertaining"'))
      .toBe('capable of arousing and holding the attention')
  })
  it('无例句时原文不变', () => {
    expect(stripGlossExamples('agreeably diverting')).toBe('agreeably diverting')
  })
  it('例句夹在分号释义之间时只剔除引号部分', () => {
    expect(stripGlossExamples('providing enjoyment; pleasantly entertaining; "an amusing speaker"; "a diverting story"'))
      .toBe('providing enjoyment; pleasantly entertaining')
  })
})
