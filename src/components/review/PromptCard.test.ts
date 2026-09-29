import { describe, it, expect } from 'vitest'
import { inputKindFor, typedTarget, autoGrades } from './PromptCard'

describe('inputKindFor', () => {
  it('五个模板的作答形态', () => {
    expect(inputKindFor('recognize')).toBe('choice')
    expect(inputKindFor('cloze')).toBe('typed')
    expect(inputKindFor('recall')).toBe('typed')
    expect(inputKindFor('listen')).toBe('typed')
    expect(inputKindFor('english_def')).toBe('typed')   // v0.6.4：不再是 reveal
  })
})

describe('typedTarget', () => {
  const dto = (template: any) => ({ template, answer: { lemma: 'deliberate' } } as any)

  it('键入型题目的比对目标都是答案里的单词', () => {
    expect(typedTarget(dto('cloze'))).toBe('deliberate')
    expect(typedTarget(dto('recall'))).toBe('deliberate')
    expect(typedTarget(dto('listen'))).toBe('deliberate')
    expect(typedTarget(dto('english_def'))).toBe('deliberate')
  })

  it('非键入型没有比对目标', () => {
    expect(typedTarget(dto('recognize'))).toBeUndefined()
  })

  it('取不到 lemma 时返回 undefined 而不是空串（Review Focus 1）', () => {
    // 空串会让逐字母标红把**每个**字符标红，用户看到满屏红字，像是题目坏了。
    // 返回 undefined 时 AnswerInput 不启用标红。
    expect(typedTarget({ template: 'english_def', answer: {} } as any)).toBeUndefined()
    expect(typedTarget({ template: 'english_def', answer: { lemma: '' } } as any)).toBeUndefined()
  })
})

describe('autoGrades', () => {
  it('中译英与英文释义题不自动判分', () => {
    expect(autoGrades('recall')).toBe(false)
    expect(autoGrades('english_def')).toBe(false)
  })

  it('填空与听辨自动判分', () => {
    expect(autoGrades('cloze')).toBe(true)
    expect(autoGrades('listen')).toBe(true)
  })
})
