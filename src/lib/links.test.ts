import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseLinks, stripLinks, linkTargets, validateLinks, linkableField, normalizeLinkTarget, linkErrorText, aggregateBacklinks } from './links'

describe('parseLinks', () => {
  it('把两种标记切成 link 段，其余是 text 段', () => {
    expect(parseLinks('见 [[forsake]] 与 {{abandon}} 的对比')).toEqual([
      { kind: 'text', text: '见 ' },
      { kind: 'link', text: 'forsake', target: 'forsake', linkKind: 'library' },
      { kind: 'text', text: ' 与 ' },
      { kind: 'link', text: 'abandon', target: 'abandon', linkKind: 'dict' },
      { kind: 'text', text: ' 的对比' },
    ])
  })

  it('目标里的前后空格被去掉，词面显示去空格后的形态', () => {
    expect(parseLinks('[[ Forsake ]]')[0]).toEqual({ kind: 'link', text: 'Forsake', target: 'Forsake', linkKind: 'library' })
  })

  it('残缺标记（只有开头）整段当普通文本', () => {
    expect(parseLinks('见 [[forsake')).toEqual([{ kind: 'text', text: '见 [[forsake' }])
  })

  it('空目标不产生 link 段', () => {
    expect(parseLinks('[[]]')).toEqual([{ kind: 'text', text: '[[]]' }])
  })

  it('同一段里的多个标记各自成段', () => {
    expect(parseLinks('[[a]][[b]]').filter(s => s.kind === 'link')).toHaveLength(2)
  })

  it('纯文本没有 link 段', () => {
    expect(parseLinks('hello')).toEqual([{ kind: 'text', text: 'hello' }])
  })
})

describe('stripLinks', () => {
  it('去掉标记只留词面', () => {
    expect(stripLinks('见 [[forsake]] 与 {{abandon}}')).toBe('见 forsake 与 abandon')
  })
  it('残缺标记原样保留', () => {
    expect(stripLinks('见 [[forsake')).toBe('见 [[forsake')
  })
})

describe('linkTargets', () => {
  it('返回每个标记一次，重复出现的标记按次计', () => {
    expect(linkTargets('[[a]] {{b}} [[a]]')).toEqual([
      { target: 'a', kind: 'library' }, { target: 'b', kind: 'dict' }, { target: 'a', kind: 'library' },
    ])
  })
  it('无标记返回空数组', () => { expect(linkTargets('hello')).toEqual([]) })
})

describe('validateLinks', () => {
  const inLib = (l: string) => ['forsake', 'abandon'].includes(normalizeLinkTarget(l))
  it('全部合法时无错误', () => {
    expect(validateLinks('[[forsake]] 与 {{nonexistent-dict-word}}', inLib)).toEqual([])
  })
  it('残缺标记报 unclosed', () => {
    expect(validateLinks('见 [[forsake', inLib)).toEqual([{ code: 'unclosed' }])
  })
  it('空目标报 empty-target', () => {
    expect(validateLinks('[[]]', inLib)).toEqual([{ code: 'empty-target' }])
  })
  it('[[ ]] 目标不在库报 not-in-library', () => {
    expect(validateLinks('[[unknown]]', inLib)).toEqual([{ code: 'not-in-library', target: 'unknown' }])
  })
  it('{{ }} 目标不在库**不**报错（词典词允许）', () => {
    expect(validateLinks('{{unknown}}', inLib)).toEqual([])
  })
  it('大小写与空格不影响判定', () => {
    expect(validateLinks('[[ FORSAKE ]]', inLib)).toEqual([])
  })
})

describe('linkableField', () => {
  it('内容字段可链接', () => { expect(linkableField('synonym_discrimination')).toBe(true) })
  it('结构字段不可链接', () => {
    for (const k of ['part_of_speech', 'phonetic', 'word_root', 'initial_familiarity']) {
      expect(linkableField(k)).toBe(false)
    }
  })
})

describe('linkErrorText', () => {
  it('不在库的目标按名字列出来', () => {
    const t = linkErrorText([{ code: 'not-in-library', target: 'unknown' }])
    expect(t).toContain('unknown')
    expect(t).toContain('{{')
  })
  it('残缺标记与空目标各有各的句子', () => {
    expect(linkErrorText([{ code: 'unclosed' }])).toContain(']]')
    expect(linkErrorText([{ code: 'empty-target' }])).toContain('空')
  })
  it('多条错误合成一段文本，不重复标题', () => {
    const t = linkErrorText([{ code: 'unclosed' }, { code: 'not-in-library', target: 'a' }, { code: 'not-in-library', target: 'b' }])
    expect(t).toContain('a')
    expect(t).toContain('b')
  })
})

describe('aggregateBacklinks', () => {
  const rows = [
    { sourceWordId: 'w1', sourceLemma: 'abandon', fieldName: '近义词辨析' },
    { sourceWordId: 'w1', sourceLemma: 'abandon', fieldName: '近义词辨析' },   // 同词同字段两次
    { sourceWordId: 'w1', sourceLemma: 'abandon', fieldName: '补充' },
    { sourceWordId: 'w2', sourceLemma: 'desert', fieldName: '近义词辨析' },
  ]

  it('按「来源词 × 字段」聚合，同格两次计数为 2', () => {
    expect(aggregateBacklinks(rows, 'forsake')).toEqual([
      { sourceWordId: 'w1', sourceLemma: 'abandon', fieldName: '近义词辨析', count: 2 },
      { sourceWordId: 'w1', sourceLemma: 'abandon', fieldName: '补充', count: 1 },
      { sourceWordId: 'w2', sourceLemma: 'desert', fieldName: '近义词辨析', count: 1 },
    ])
  })
  it('无来源返回空数组', () => { expect(aggregateBacklinks([], 'forsake')).toEqual([]) })
})

describe('接入形状', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('工作区的值渲染都走 LinkedText', () => {
    expect(read('src/components/word/WordWorkbench.tsx')).toContain('LinkedText')
  })
  it('结构字段不渲染链接：linkableField 是唯一判据出处', () => {
    expect(read('src/components/entry/LinkedText.tsx')).toContain('linkableField')
  })
})
