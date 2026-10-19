import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { MARK_DOT_SIZE, MARK_DASH_WIDTH, markDashHeight } from './Mark'

// 源码级守卫（沿用本仓既有做法，如 WordWorkbench.test.ts 的 LEAF_FORM_GUARD_ALLOWLIST、
// sidebar.test.ts 读 WordList.tsx）：vitest 只收 *.test.ts、environment: node，
// 没有组件测试 harness，故把「不再写字形」这类回归钉在源码形状上。
describe('画出的标记（v0.7.4 决定九）', () => {
  it('点尺寸用 em；横杠厚度按整数设备像素取整', () => {
    expect(MARK_DOT_SIZE).toBe('0.33em')
    expect(MARK_DASH_WIDTH).toBe('0.8em')
    // 2 CSS px 在 125% 缩放下是 2.5 设备像素，边缘被抗锯齿摊成 2/3 个像素（用户实测：
    // 100% 正常、125% 固定地几个粗几个细）。高度取整到整数设备像素后，每种缩放下厚度固定。
    expect(markDashHeight(1)).toBe('2px')      // 2 设备 px
    expect(markDashHeight(1.25)).toBe('2.4px') // 3 设备 px
    expect(markDashHeight(1.5)).toBe('2px')    // 3 设备 px
    expect(markDashHeight(2)).toBe('2px')      // 4 设备 px
    expect(markDashHeight(Number.NaN)).toBe('2px')
  })

  it('横杠用 SVG + crispEdges，边缘吸附到设备像素', () => {
    const src = readFileSync(new URL('./Mark.tsx', import.meta.url), 'utf8')
    expect(src).toMatch(/shapeRendering="crispEdges"/)
    expect(src).toMatch(/devicePixelRatio/)
  })

  it('四处调用点都用同一个组件，不再写字形', () => {
    // ① 同目录的 LeafFlow（单位前的 `·`）。
    const leaf = readFileSync(new URL('./LeafFlow.tsx', import.meta.url), 'utf8')
    expect(leaf).toMatch(/from '\.\/Mark'/)
    // 反面：旧的三级色字形 `·` 必须消失——钉的是**渲染形状**（`aria-hidden>·</span>`），
    // 不是「文件里出现过 `·`」（注释里还会提到它）。
    expect(leaf).not.toMatch(/aria-hidden>·<\/span>/)
    // 正面：颜色是**数据**（`it.markColor` 由调用页给），LeafFlow 仍是哑组件。
    expect(leaf).toMatch(/<DotMark color=\{it\.markColor\} \/>/)
    expect(leaf).not.toMatch(/onClick|onDoubleClick/)

    // ②③④ 另外三处跨目录调用点（工作区例句行、返回页 example 分支、拖拽副本）。
    for (const f of ['../word/WordWorkbench.tsx', '../search/DictDetailCard.tsx', '../word/DragGhost.tsx'] as const) {
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
    // 例句的横杠：与单位小点同一判据——**按词自己着色**，取该单位自己的 `unitState`
    // （不是所在容器的聚合态 `rowState`）；普通模式恒三级色。
    expect(wb).toMatch(/<DashMark color=\{editorMode \? MARK_COLOR\[unitState\(fv, inheritedUser\)\] : 'var\(--ink-3\)'\}/)
    expect(wb).not.toMatch(/<DashMark color=\{rowState/)
  })

  it('返回页：没有编者模式，标记恒三级色', () => {
    const dict = readFileSync(new URL('../search/DictDetailCard.tsx', import.meta.url), 'utf8')
    expect(dict).toMatch(/<DashMark color="var\(--ink-3\)" \/>/)
    expect(dict).toMatch(/markColor: 'var\(--ink-3\)'/)
    // 返回页不参与编辑，不引 workbench 的编辑器状态。
    expect(dict).not.toMatch(/editorMode|unitState/)
  })
})
