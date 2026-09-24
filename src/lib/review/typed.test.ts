import { describe, it, expect } from 'vitest'
import { normalizeTyped, compareTyped, letterMatches } from './typed'

describe('review/typed', () => {
  it('normalizeTyped 忽略大小写与首尾空白，折叠内部空白', () => {
    expect(normalizeTyped('  Take  Off ')).toBe('take off')
    expect(normalizeTyped('a\t b\n c')).toBe('a b c')
  })

  it('compareTyped 归一后相等即判对', () => {
    expect(compareTyped('  Ephemeral ', 'ephemeral')).toBe(true)
    expect(compareTyped('take  off', 'take off')).toBe(true)
    expect(compareTyped('ephemeral', 'ephemerally')).toBe(false)
    expect(compareTyped('', 'ephemeral')).toBe(false)
  })

  it('letterMatches 逐位比对，长度不同时超出部分不匹配', () => {
    expect(letterMatches('cat', 'car')).toEqual([true, true, false])
    expect(letterMatches('ca', 'car')).toEqual([true, true])
    expect(letterMatches('cats', 'car')).toEqual([true, true, false, false])
  })

  it('letterMatches 忽略大小写', () => {
    expect(letterMatches('CAT', 'cat')).toEqual([true, true, true])
  })

  it('letterMatches 空输入返回空数组，不抛错', () => {
    expect(letterMatches('', 'car')).toEqual([])
    expect(letterMatches('car', '')).toEqual([false, false, false])
  })

  it('letterMatches 非 BMP 字符按码点对齐，不错位', () => {
    expect(letterMatches('a😀b', 'a😀b')).toEqual([true, true, true])
    expect(letterMatches('😀', '😀')).toEqual([true])
  })
})
