import { describe, it, expect } from 'vitest'
import { buildEcdictFields, parseExchangeItems } from './ecdictParse'

describe('buildEcdictFields', () => {
  it('observe：两个词性父，各自挂中文释义', () => {
    const fields = buildEcdictFields({
      word: 'observe',
      translation: 'vt. 觉察到, 遵守, 注意到, 庆祝\\nvi. 注意, 评论',
      definition: null, phonetic: '/əbˈzɜːv/', exchange: null,
    })
    expect(fields[0]).toEqual({ key: 'phonetic', value: '/əbˈzɜːv/' })
    const pos = fields.filter(f => f.key === 'part_of_speech')
    expect(pos).toHaveLength(2)
    expect(pos[0].value).toBe('vt.')
    expect(pos[0].children!.map(c => c.value)).toEqual(['觉察到', '遵守', '注意到', '庆祝'])
    expect(pos[1].value).toBe('vi.')
    expect(pos[1].children!.map(c => c.value)).toEqual(['注意', '评论'])
  })
  it('run：丢弃 word的 注释行，[域]行入补充', () => {
    const fields = buildEcdictFields({
      word: 'run',
      translation: 'n. 跑, 赛跑\\nvi. 跑\\nrun的过去式和过去分词\\n[计] 运行',
      definition: null, phonetic: 'rʌn', exchange: null,
    })
    const pos = fields.filter(f => f.key === 'part_of_speech')
    expect(pos).toHaveLength(2)
    const supp = fields.find(f => f.key === 'supplementary')
    expect(supp?.children?.map(c => c.value)).toEqual(['[计] 运行'])
  })
  it('run（补充+词形变化齐备）：模板序 supplementary 先于 exchange', () => {
    const fields = buildEcdictFields({
      word: 'run',
      translation: 'n. 跑, 赛跑\\nvi. 跑\\n[计] 运行',
      definition: null, phonetic: 'rʌn', exchange: 'p:ran/i:running',
    })
    const keys = fields.map(f => f.key)
    const suppIdx = keys.indexOf('supplementary')
    const exchIdx = keys.indexOf('exchange')
    expect(suppIdx).toBeGreaterThanOrEqual(0)
    expect(exchIdx).toBeGreaterThanOrEqual(0)
    expect(suppIdx).toBeLessThan(exchIdx)
  })
  it('英文释义按行首词性挂到同词性父，中文在前', () => {
    const fields = buildEcdictFields({
      word: 'run',
      translation: 'n. 跑',
      definition: 'n a score in baseball\\nn a regular trip',   // 真实数据释义行为无点码
      phonetic: null, exchange: null,
    })
    const pos = fields.find(f => f.key === 'part_of_speech')
    expect(pos?.value).toBe('n.')   // n（无点）与 n.（有点）归并为一个词性父
    expect(pos?.children?.map(c => c.key)).toEqual(['chinese_definition', 'english_definition', 'english_definition'])
  })
  it('中英释义同一词性合并：翻译行带点(n.)与释义行无点(n)归并', () => {
    const fields = buildEcdictFields({
      word: 'dread',
      translation: 'n. 恐惧\\nv. 害怕',
      definition: 'n fearful expectation\\nv be afraid of',
      phonetic: null, exchange: null,
    })
    const pos = fields.filter(f => f.key === 'part_of_speech')
    expect(pos.map(p => p.value)).toEqual(['n.', 'v.'])
    expect(pos[0].children!.map(c => c.key)).toEqual(['chinese_definition', 'english_definition'])
    expect(pos[1].children!.map(c => c.key)).toEqual(['chinese_definition', 'english_definition'])
  })
  it('s 形容词卫星码归一为 adj.（与 wordnet 一致）', () => {
    const fields = buildEcdictFields({
      word: 'dread',
      translation: 'a. 可怕的',
      definition: 's causing fear',
      phonetic: null, exchange: null,
    })
    const pos = fields.filter(f => f.key === 'part_of_speech')
    expect(pos).toHaveLength(1)
    expect(pos[0].value).toBe('adj.')
    expect(pos[0].children!.map(c => c.key)).toEqual(['chinese_definition', 'english_definition'])
  })
  it('exchange 标签修正（spec §5.3 全前缀）：p/i/d→时态、3/s/f→人称/复数、r/t/b/z→级、0/1 过滤', () => {
    const items = parseExchangeItems('p:ran/i:running/d:run/0:run/1:d/3:runs/s:runs/f:aces/r:better/t:best/b:balder/z:baldest')
    expect(items).toEqual([
      { label: '过去式', value: 'ran' },
      { label: '现在分词', value: 'running' },
      { label: '过去分词', value: 'run' },
      { label: '第三人称单数', value: 'runs' },
      { label: '复数', value: 'runs' },
      { label: '复数', value: 'aces' },
      { label: '比较级', value: 'better' },
      { label: '最高级', value: 'best' },
      { label: '比较级', value: 'balder' },
      { label: '最高级', value: 'baldest' },
    ])
  })
  it('a. → adj. 归一化（形容词词性）', () => {
    const fields = buildEcdictFields({
      word: 'happy',
      translation: 'a. 快乐的\\na. 幸福的',
      definition: null, phonetic: '/ˈhæpi/', exchange: null,
    })
    const pos = fields.filter(f => f.key === 'part_of_speech')
    expect(pos).toHaveLength(1)
    expect(pos[0].value).toBe('adj.')
    expect(pos[0].children!.map(c => c.value)).toEqual(['快乐的', '幸福的'])
  })
  it('yuppy：全角括号内的半角逗号不拆（一条释义）', () => {
    const fields = buildEcdictFields({
      word: 'yuppy',
      translation: 'n. 雅皮士（特指肆意挥霍, 追赶时髦的年轻人）',
      definition: null, phonetic: null, exchange: null,
    })
    const pos = fields.find(f => f.key === 'part_of_speech')
    expect(pos?.children?.map(c => c.value)).toEqual(['雅皮士（特指肆意挥霍, 追赶时髦的年轻人）'])
  })
  it('普通多义项仍按逗号拆', () => {
    const fields = buildEcdictFields({
      word: 'cap', translation: 'n. 罩, 风帽, 布质面罩', definition: null, phonetic: null, exchange: null,
    })
    const pos = fields.find(f => f.key === 'part_of_speech')
    expect(pos?.children?.map(c => c.value)).toEqual(['罩', '风帽', '布质面罩'])
  })
  it('括号不配对兜底：括号内逗号不拆', () => {
    const fields = buildEcdictFields({
      word: 'x', translation: 'n. 罩（风帽, 帆布罩', definition: null, phonetic: null, exchange: null,
    })
    const pos = fields.find(f => f.key === 'part_of_speech')
    expect(pos?.children?.map(c => c.value)).toEqual(['罩（风帽, 帆布罩'])
  })
})
