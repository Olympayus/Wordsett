import { describe, it, expect } from 'vitest'
import { posDisplay, buildWordnetFields, stripGlossExamples, splitGlossLines, splitGlossParts } from './wordnetParse'

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
  it('definition 内嵌引号例句时剥离，例句由 examples 列承载为 example_sentence', () => {
    const fields = buildWordnetFields('fear', [
      { pos: 'v', definition: 'be afraid or scared of; be frightened of; "I fear the winters in Moscow"; "We should not fear the Communists!"', examples: 'I fear the winters in Moscow\nWe should not fear the Communists!' },
    ])
    const def = fields[0].children!.find(c => c.key === 'english_definition')!
    expect(def.value).toBe('be afraid or scared of; be frightened of')
    const ex = def.children!.find(c => c.key === 'example_sentence')!
    expect(ex.children!.map(e => e.value)).toEqual(['I fear the winters in Moscow', 'We should not fear the Communists!'])
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

describe('splitGlossLines', () => {
  it('按分号拆成一句一行（释义 + 引号例句各自成行）', () => {
    expect(splitGlossLines('capable of arousing and holding the attention; "a fascinating story"; "films should be entertaining"'))
      .toEqual(['capable of arousing and holding the attention', '"a fascinating story"', '"films should be entertaining"'])
  })
  it('无分号时单行', () => {
    expect(splitGlossLines('agreeably diverting')).toEqual(['agreeably diverting'])
  })
})

describe('splitGlossParts', () => {
  it('释义在顶部、例句带引号各归各位', () => {
    expect(splitGlossParts('capable of arousing and holding the attention; "a fascinating story"; "films should be entertaining"'))
      .toEqual({
        definition: 'capable of arousing and holding the attention',
        examples: ['"a fascinating story"', '"films should be entertaining"'],
      })
  })
  it('例句内含分号不拆开，且多段未加引号的释义都并入 definition', () => {
    // 真实 wordnet.db gloss：朴素 split(';') 会把引号内分号当分隔符、把释义尾段误判为例句
    expect(splitGlossParts('a tangible and visible entity; an entity that can cast a shadow; "it was full of rackets, balls and other objects"'))
      .toEqual({
        definition: 'a tangible and visible entity; an entity that can cast a shadow',
        examples: ['"it was full of rackets, balls and other objects"'],
      })
  })
  it('引号内分号原样保留在例句内', () => {
    expect(splitGlossParts('a remark; "he said; then he left"'))
      .toEqual({ definition: 'a remark', examples: ['"he said; then he left"'] })
  })
  it('无分号、无例句时全文为 definition', () => {
    expect(splitGlossParts('agreeably diverting')).toEqual({ definition: 'agreeably diverting', examples: [] })
  })
  it('空串 / 纯空白不抛错', () => {
    expect(splitGlossParts('')).toEqual({ definition: '', examples: [] })
    expect(splitGlossParts('   ')).toEqual({ definition: '', examples: [] })
  })
  it('尾随分号与连续分号产生的空段被忽略', () => {
    expect(splitGlossParts('a score in baseball;')).toEqual({ definition: 'a score in baseball', examples: [] })
    expect(splitGlossParts('a score in baseball;;  ;')).toEqual({ definition: 'a score in baseball', examples: [] })
  })
  it('只有空引号 `""` 时不产生空例句', () => {
    expect(splitGlossParts('a remark; ""')).toEqual({ definition: 'a remark', examples: [] })
  })
  it('整条 gloss 就是一个引号例句（无 definition 正文）', () => {
    expect(splitGlossParts('"a fascinating story"')).toEqual({ definition: '', examples: ['"a fascinating story"'] })
  })
  it('释义在例句之后（WordNet 偶有该形态）仍各归各位', () => {
    expect(splitGlossParts('"a fascinating story"; agreeable')).toEqual({ definition: 'agreeable', examples: ['"a fascinating story"'] })
  })
})
