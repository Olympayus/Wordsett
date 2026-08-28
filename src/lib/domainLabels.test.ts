import { it, expect } from 'vitest'
import { domainLabel } from './domainLabels'

it('命中常见领域返回中文标签', () => {
  expect(domainLabel('biology')).toBe('生物')
  expect(domainLabel('physics')).toBe('物理')
  expect(domainLabel('United Kingdom')).toBe('英国')
})
it('未命中回退英文原词，大小写不敏感命中', () => {
  expect(domainLabel('BiolOgy')).toBe('生物')
  expect(domainLabel('some-obscure-dom')).toBe('some-obscure-dom')
})