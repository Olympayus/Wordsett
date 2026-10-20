import { describe, it, expect } from 'vitest'
import { stripWindow } from './mobileWordStrip'

describe('stripWindow', () => {
  it('空列表', () => expect(stripWindow([], 0, 5)).toEqual({ items: [], start: 0, total: 0 }))
  it('中间项居中', () => expect(stripWindow(['a','b','c','d','e'], 2, 3)).toEqual({ items: ['b','c','d'], start: 1, total: 5 }))
  it('末尾不越界', () => expect(stripWindow(['a','b','c','d','e'], 4, 3)).toEqual({ items: ['c','d','e'], start: 2, total: 5 }))
  it('开头不越界', () => expect(stripWindow(['a','b','c'], 0, 5)).toEqual({ items: ['a','b','c'], start: 0, total: 3 }))
})
