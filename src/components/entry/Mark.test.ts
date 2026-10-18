import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { MARK_DOT_SIZE, MARK_DASH_WIDTH, MARK_DASH_HEIGHT } from './Mark'

// 源码级守卫（沿用本仓既有做法，如 WordWorkbench.test.ts 的 LEAF_FORM_GUARD_ALLOWLIST、
// sidebar.test.ts 读 WordList.tsx）：vitest 只收 *.test.ts、environment: node，
// 没有组件测试 harness，故把「不再写字形」这类回归钉在源码形状上。
describe('画出的标记（v0.7.4 决定九）', () => {
  it('尺寸用 em，跟随字号', () => {
    expect(MARK_DOT_SIZE).toBe('0.33em')
    expect(MARK_DASH_WIDTH).toBe('0.8em')
    expect(MARK_DASH_HEIGHT).toBe('0.13em')
  })

  it('三处调用点都用同一个组件，不再写字形', () => {
    // ① 同目录的 LeafFlow（单位前的 `·`）。
    const leaf = readFileSync(new URL('./LeafFlow.tsx', import.meta.url), 'utf8')
    expect(leaf).toMatch(/from '\.\/Mark'/)
    // 反面：旧的三级色字形 `·` 必须消失——钉的是**渲染形状**（`aria-hidden>·</span>`），
    // 不是「文件里出现过 `·`」（注释里还会提到它）。
    expect(leaf).not.toMatch(/aria-hidden>·<\/span>/)
    // 正面：颜色是**数据**（`it.markColor` 由调用页给），LeafFlow 仍是哑组件。
    expect(leaf).toMatch(/<DotMark color=\{it\.markColor\} \/>/)
    expect(leaf).not.toMatch(/onClick|onDoubleClick/)

    // ②③ 另外两处跨目录调用点（工作区例句行、返回页 example 分支）。
    for (const f of ['../word/WordWorkbench.tsx', '../search/DictDetailCard.tsx'] as const) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      expect(src, f).toMatch(/from '\.\.\/entry\/Mark'/)
      // 反面：旧的字形破折号 span 必须消失。`–` 在无关文案里也出现，故钉渲染形状而不是字符本身。
      expect(src, f).not.toMatch(/marginRight: '8px' \}\}>–<\/span>/)
    }
  })

  it('工作区：标记颜色按编者模式门控，普通模式恒三级色', () => {
    const wb = readFileSync(new URL('../word/WordWorkbench.tsx', import.meta.url), 'utf8')
    // 状态→token 的映射只有一份，且只认那三个来源色 token（不新增色值）。
    expect(wb).toMatch(/const MARK_COLOR: Record<Exclude<FieldState, 'none'>, string>/)
    expect(wb).toMatch(/original: 'var\(--color-weave-original\)'/)
    expect(wb).toMatch(/edited: 'var\(--color-weave-edited\)'/)
    expect(wb).toMatch(/personal: 'var\(--color-weave-personal\)'/)
    // 单位的小点：编者模式取**该单位自己的**来源态，普通模式一律三级色。
    expect(wb).toMatch(/markColor:\s*editorMode\s*\?\s*MARK_COLOR\[unitState\(ch, childInheritedUser\)\]/)
    // 例句的横杠：取该行的 rowState，'none' 时三级色。
    expect(wb).toMatch(/<DashMark color=\{rowState === 'none'/)
  })

  it('返回页：没有编者模式，标记恒三级色', () => {
    const dict = readFileSync(new URL('../search/DictDetailCard.tsx', import.meta.url), 'utf8')
    expect(dict).toMatch(/<DashMark color="var\(--ink-3\)" \/>/)
    expect(dict).toMatch(/markColor: 'var\(--ink-3\)'/)
    // 返回页不参与编辑，不引 workbench 的编辑器状态。
    expect(dict).not.toMatch(/editorMode|unitState/)
  })
})
