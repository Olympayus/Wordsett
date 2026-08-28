import { it, expect } from 'vitest'
import { RELATED_LABEL } from './wordnetRelations'

it('既有关系映射保持', () => {
  expect(RELATED_LABEL['@']).toBe('hypernyms')
  expect(RELATED_LABEL['~i']).toBe('hyponyms')
  expect(RELATED_LABEL['%s']).toBe('partWhole')
  expect(RELATED_LABEL['!']).toBe('antonyms')
})

it('新增 5 个关系映射', () => {
  expect(RELATED_LABEL['*']).toBe('entailments')
  expect(RELATED_LABEL['>']).toBe('causes')
  expect(RELATED_LABEL['\\']).toBe('pertainyms')
  expect(RELATED_LABEL['=']).toBe('attributes')
  expect(RELATED_LABEL['$']).toBe('verbGroups')
})