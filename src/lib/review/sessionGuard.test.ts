import { describe, it, expect } from 'vitest'
import {
  parseIntent, clickStaysInArena, leaveMessage, decisionFor,
  GUARD_ATTR, ARENA_ATTR, type GuardTarget,
} from './sessionGuard'

/**
 * 本套件跑在 node 环境（`vitest.config.ts` 的 `environment: 'node'`），没有 document。
 * 守卫的 DOM 面向只用到三个成员（closest / getAttribute / contains），所以这里用纯对象
 * 搭一棵假的元素树来代替 Element——真 DOM 元素天然满足 GuardTarget，断言与浏览器里同义。
 */
interface Fake extends GuardTarget {
  tag: string
  attrs: Record<string, string>
  children: Fake[]
  parent: Fake | null
}

/** 造一个假元素。`kids` 自动挂上 parent，故调用处不必再手工回填父链。 */
function node(tag: string, attrs: Record<string, string> = {}, kids: Fake[] = []): Fake {
  const n: Fake = {
    tag, attrs, children: kids, parent: null,
    /** 支持 `tag`、`[attr]`、`[attr="v"]` 三种选择器，沿 parent 上溯（含自身）。 */
    closest(selector: string): GuardTarget | null {
      const body = selector.slice(1, -1)
      const eq = body.indexOf('=')
      const attr = eq < 0 ? body : body.slice(0, eq)
      const value = eq < 0 ? null : body.slice(eq + 1)
      for (let m: Fake | null = n; m; m = m.parent) {
        const has = Object.prototype.hasOwnProperty.call(m.attrs, attr)
        if (value === null ? has : has && m.attrs[attr] === value) return m
      }
      return null
    },
    getAttribute(name: string): string | null {
      return n.attrs[name] ?? null
    },
    contains(other: GuardTarget | null): boolean {
      for (let m: Fake | null = other as Fake | null; m; m = m.parent) if (m === n) return true
      return false
    },
  }
  kids.forEach(k => { k.parent = n })
  return n
}

const button = (attrs: Record<string, string> = {}, kids: Fake[] = []) => node('button', attrs, kids)

describe('parseIntent', () => {
  it('从标记元素读出模块意图', () => {
    expect(parseIntent(button({ [GUARD_ATTR]: 'module:settings' })))
      .toEqual({ kind: 'module', value: 'settings' })
  })

  it('从标记元素读出策略意图', () => {
    expect(parseIntent(button({ [GUARD_ATTR]: 'strategy:free' })))
      .toEqual({ kind: 'strategy', value: 'free' })
  })

  it('标记在容器上时，点它的子元素也算（图标按钮的 svg 在里层）', () => {
    const svg = node('svg', {}, [node('path')])
    const host = button({ [GUARD_ATTR]: 'module:workbench' }, [svg])
    const inner = svg.children[0]
    expect(host.contains(inner)).toBe(true)
    expect(parseIntent(inner)).toEqual({ kind: 'module', value: 'workbench' })
  })

  it('没有标记返回 null', () => {
    expect(parseIntent(button())).toBeNull()
  })

  it('未知意图返回 null（不把拼错的值当成命令执行）', () => {
    expect(parseIntent(button({ [GUARD_ATTR]: 'module:' }))).toBeNull()
    expect(parseIntent(button({ [GUARD_ATTR]: 'bogus:x' }))).toBeNull()
  })

  it('策略意图只接受 today / free', () => {
    expect(parseIntent(button({ [GUARD_ATTR]: 'strategy:nope' }))).toBeNull()
  })
})

describe('clickStaysInArena', () => {
  it('做题区内的点击放行', () => {
    const arena = node('div', { [ARENA_ATTR]: '' }, [button({ id: 'b' })])
    expect(clickStaysInArena(arena.children[0], arena)).toBe(true)
  })

  it('做题区外的点击拦下', () => {
    const arena = node('div', { [ARENA_ATTR]: '' }, [button()])
    const out = button({ id: 'out' })
    expect(clickStaysInArena(out, arena)).toBe(false)
  })

  it('没有 arena 时一律拦下（忙态判据没跑，宁可拦错也不要静默放行）', () => {
    expect(clickStaysInArena(button({ id: 'out' }), null)).toBe(false)
  })

  it('非元素目标（例如点击文本节点）按区外处理', () => {
    expect(clickStaysInArena(null, node('div'))).toBe(false)
  })
})

describe('leaveMessage', () => {
  it('已答与剩余之和等于队列长度', () => {
    const m = leaveMessage(3, 7)
    expect(m.message).toContain('已答的 3 道题')
    expect(m.message).toContain('剩余 7 题')
  })

  it('放弃仅一支作答也不出现负数（Review Focus 5 的口径：不乱算）', () => {
    expect(leaveMessage(0, 10).message).toContain('剩余 10 题')
    expect(leaveMessage(10, 0).message).toContain('剩余 0 题')
  })
})

describe('decisionFor（Review Focus 5：不该拦的不拦、该拦的拦）', () => {
  const intent = { kind: 'module', value: 'settings' } as const

  it('没有会话进行时一律放行 —— 守卫必须彻底惰性', () => {
    // 这条是「不误伤」的那一半：会话没在进行时点任何地方都不该弹窗、更不该改状态。
    // 它同时也是「取消不推进」的护栏——守卫生效的场合越少，误改状态的机会越少。
    expect(decisionFor(false, false, intent)).toBe('allow')
    expect(decisionFor(false, true, null)).toBe('allow')
    expect(decisionFor(false, false, null)).toBe('allow')
  })

  it('会话进行中，做题区内的点击放行', () => {
    expect(decisionFor(true, true, null)).toBe('allow')
    expect(decisionFor(true, true, intent)).toBe('allow')
  })

  it('会话进行中，区外但无意图标记的点击忽略 —— 不弹窗', () => {
    // 正文文本、卡片背景这类点击没有意图，弹窗只会烦人。忽略 ≠ 放行：
    // 不 preventDefault 也不 stopPropagation，让原本的行为照常发生。
    expect(decisionFor(true, false, null)).toBe('ignore')
  })

  it('会话进行中，区外且有意图标记 —— 弹确认窗', () => {
    expect(decisionFor(true, false, intent)).toBe('confirm')
  })
})
