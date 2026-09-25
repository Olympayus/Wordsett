import { describe, it, expect } from 'vitest'
import {
  pickTemplate, templateAccuracy, usableTemplates, TEMPLATE_DIFFICULTY, FIELD_KEY_GROUPS,
} from './template'
import type { Template, TemplateLog } from './template'

const log = (template: Template, rating: number): TemplateLog => ({ template, rating })

describe('review/template', () => {
  it('例句字段组含两个同义 key', () => {
    expect(FIELD_KEY_GROUPS.example).toEqual(expect.arrayContaining(['example_sentence', 'example']))
  })

  it('难度序覆盖五题型，且从易到难（听辨列于末位）', () => {
    expect(TEMPLATE_DIFFICULTY).toEqual(['recognize', 'cloze', 'recall', 'english_def', 'listen'])
  })

  it('usableTemplates 按掩码筛出可用模板', () => {
    const t = usableTemplates({ translation: true, definition: false, example: true, phonetic: false })
    expect(t).toEqual(['recognize', 'cloze', 'recall'])
  })

  it('usableTemplates 缺省不放行 listen：音标字段齐全也不出听辨（运行时门控未开）', () => {
    const t = usableTemplates({ translation: true, definition: true, example: true, phonetic: true })
    expect(t).toEqual(['recognize', 'cloze', 'recall', 'english_def'])
    expect(t).not.toContain('listen')
  })

  it('templateAccuracy 只统计最近 10 次，正确率为 rating ≥ 3 的占比', () => {
    const logs = [log('recall', 1), log('recall', 3), log('recall', 3), log('recall', 4)]
    expect(templateAccuracy(logs, 'recall')).toBeCloseTo(0.75, 6)
    expect(templateAccuracy(logs, 'cloze')).toBeNull()
  })

  it('templateAccuracy 超过 10 次时只取最近 10 条', () => {
    const logs = [
      ...Array.from({ length: 10 }, () => log('recall', 1)),
      ...Array.from({ length: 10 }, () => log('recall', 3)),
    ]
    expect(templateAccuracy(logs, 'recall')).toBe(1)
  })

  it('新词（无日志）按难度序取最易的可用模板', () => {
    expect(pickTemplate(['cloze', 'listen'], [], null)).toBe('cloze')
    expect(pickTemplate(['listen', 'english_def'], [], null)).toBe('english_def')
  })

  it('未测过的模板优先于已测过的（探索先于利用）', () => {
    const logs = [log('recognize', 1), log('recognize', 1)]  // 认读很差
    // 填空未测过 → 先探索填空，而不是立刻回去刷最弱的认读
    expect(pickTemplate(['recognize', 'cloze'], logs, 'recognize')).toBe('cloze')
  })

  it('全部测过后取正确率最低者', () => {
    const logs = [
      log('recognize', 4), log('recognize', 4),
      log('cloze', 1), log('cloze', 1),
    ]
    expect(pickTemplate(['recognize', 'cloze'], logs, 'recognize')).toBe('cloze')
  })

  it('正确率并列时避开上次出过的模板', () => {
    const logs = [log('recognize', 1), log('cloze', 1)]
    expect(pickTemplate(['recognize', 'cloze'], logs, 'recognize')).toBe('cloze')
    expect(pickTemplate(['recognize', 'cloze'], logs, 'cloze')).toBe('recognize')
  })

  it('无可用模板返回 null', () => {
    expect(pickTemplate([], [], null)).toBeNull()
  })
})

describe('usableTemplates 的听辨门控', () => {
  const fullMask = { translation: true, definition: true, example: true, phonetic: true }

  it('allowListen 缺省时听辨不在结果里', () => {
    expect(usableTemplates(fullMask)).not.toContain('listen')
  })

  it('allowListen=false 时听辨不在结果里', () => {
    expect(usableTemplates(fullMask, { allowListen: false })).not.toContain('listen')
  })

  it('allowListen=true 且音标可用时听辨在结果里', () => {
    expect(usableTemplates(fullMask, { allowListen: true })).toContain('listen')
  })

  it('allowListen=true 但音标缺失时听辨仍不在结果里', () => {
    const mask = { ...fullMask, phonetic: false }
    expect(usableTemplates(mask, { allowListen: true })).not.toContain('listen')
  })

  it('listen 排在难度序末位（从易到难：认读 → 填空 → 中译英 → 英文释义题 → 听辨）', () => {
    expect(TEMPLATE_DIFFICULTY).toEqual(['recognize', 'cloze', 'recall', 'english_def', 'listen'])
  })
})
