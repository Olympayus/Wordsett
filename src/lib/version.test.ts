import { describe, it, expect } from 'vitest'
import { parseVersion, compareVersions, isNewer, parseLatestManifest } from './version'

describe('parseVersion', () => {
  it('接受 a.b.c 与 a.b，缺失段补 0', () => {
    expect(parseVersion('0.7.8')).toEqual([0, 7, 8])
    expect(parseVersion('1.2')).toEqual([1, 2, 0])
  })
  it('拒绝非数字与空串', () => {
    expect(parseVersion('0.7.8-beta')).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion('v0.7.8')).toBeNull()
  })
})

describe('compareVersions / isNewer', () => {
  it('逐段比较', () => {
    expect(compareVersions('0.7.9', '0.7.8')).toBe(1)
    expect(compareVersions('0.7.8', '0.7.8')).toBe(0)
    // 计划稿此处写作 -1，与规格 §6.2「数字段逐段比较」及同组前两条断言矛盾，按语义修正为 1。
    expect(compareVersions('0.8.0', '0.7.9')).toBe(1)
  })
  it('解析失败返回 null，且 isNewer 不把失败当成新版本', () => {
    expect(compareVersions('bad', '0.7.8')).toBeNull()
    expect(isNewer('bad', '0.7.8')).toBe(false)
  })
  it('远端更高才是新版本', () => {
    expect(isNewer('0.7.9', '0.7.8')).toBe(true)
    expect(isNewer('0.7.8', '0.7.8')).toBe(false)
  })
})

describe('parseLatestManifest', () => {
  it('读出 version', () => {
    expect(parseLatestManifest('{"version":"0.7.9"}')).toEqual({ version: '0.7.9' })
  })
  it('坏 JSON / 缺字段 / 非字符串版本一律 null', () => {
    expect(parseLatestManifest('not json')).toBeNull()
    expect(parseLatestManifest('{}')).toBeNull()
    expect(parseLatestManifest('{"version":1}')).toBeNull()
  })
})
