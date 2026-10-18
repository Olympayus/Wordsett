import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { rowSourceState } from './WordWorkbench'
import type { FieldValue } from '../../types/field'

// 造一个只够 fieldState() 读的 FieldValue（source / edited 两个字段）
const fvOf = (source: 'ecdict' | 'wordnet' | 'user', edited = false) =>
  ({ source, edited } as unknown as FieldValue)

// v0.7.2 起 fieldPaneLeftBar 已被 SourceBar 取代，但它钉住的不变量原样保留：
//   来源态只在编者模式现形；词性窗格永远不出条。
// v0.7.3：四态——「有没有条」不再由 original 兼任（original 现在**有**一条中性色条），
//   普通模式与词性窗格改返回 'none'（不出条）。
// 取色判据抽成 rowSourceState 纯函数（与两个原语同判据），故这里照旧直接断言它。
describe('rowSourceState（v0.7.3：四态；编者模式下原始值也出条）', () => {
  it('普通模式：一律 none——不出条，不再是 original（original 现在是「有一条中性色条」）', () => {
    expect(rowSourceState(false, false, fvOf('user'))).toBe('none')
    expect(rowSourceState(false, false, fvOf('ecdict', true))).toBe('none')
    expect(rowSourceState(false, true, fvOf('user'))).toBe('none')
  })

  it('编者模式：个人新增字段现形为 personal', () => {
    expect(rowSourceState(true, false, fvOf('user'))).toBe('personal')
  })

  it('编者模式：改过的词典字段现形为 edited（编辑优先于来源）', () => {
    expect(rowSourceState(true, false, fvOf('ecdict', true))).toBe('edited')
  })

  it('编者模式：未改动的词典字段是 original——它现在**有**一条中性色条', () => {
    expect(rowSourceState(true, false, fvOf('ecdict'))).toBe('original')
  })

  it('词性窗格任何模式下都是 none——它不参与来源三态', () => {
    expect(rowSourceState(true, true, fvOf('user'))).toBe('none')
    expect(rowSourceState(true, true, fvOf('ecdict', true))).toBe('none')
  })
})

// 源码级守卫（沿用本仓既有做法，如 sidebar.test.ts 读 WordList.tsx 的断言、review.test.ts 的形状守卫）：
// 无组件测试 harness（vitest 只收 *.test.ts、environment: node），故把「改回条件渲染」这类回归钉在源码形状上。
describe('工作区改用原语（源码级守卫）', () => {
  const src = readFileSync(new URL('./WordWorkbench.tsx', import.meta.url), 'utf8')

  it('行尾簇常驻占位：RowActions 只由 visible 属性控显隐，绝不被 && / ? 条件渲染', () => {
    // 正面：必须挂 visible 属性（opacity 的驱动），而不是别的开关。
    expect(src).toMatch(/<RowActions\s+visible=/)
    // 反面：任何 `x && <RowActions` / `x ? <RowActions`（含改名后的变量、含括号）都不得出现——
    // 这是 v0.5.2 hover 折行抖动的回归形态。比只钉两个字面拼写（hovered / showsButtons）宽得多。
    // 例外：LeafFlow 的 `end` 槽（`end: hoveredId === ch.id ? <RowActions …> : undefined`）是
    // **绝对定位、不进排版流**的，条件渲染不会引起折行抖动（设计稿 §3.2 明确允许）。
    // 故这里排除 `end:` 那一处，其余任何条件渲染形态仍视为回归。
    expect(src).not.toMatch(/&&\s*\(?\s*<RowActions/)
    // 去掉 end: 那一处之后，不应再有 `? <RowActions` 形态
    const withoutEndSlot = src.replace(/end:\s*hoveredId\s*===\s*ch\.id\s*\?\s*\(?\s*<RowActions/, '')
    expect(withoutEndSlot).not.toMatch(/\?\s*\(?\s*<RowActions/)
  })

  it('旧的卡片左条与三态徽章已删净（FIELD_LEFT_COLOR / fieldPaneLeftBar）', () => {
    expect(src).not.toMatch(/FIELD_LEFT_COLOR/)
    // 注释里可以提到它「取代了谁」，但不得再有它的定义 / 调用
    expect(src).not.toMatch(/function fieldPaneLeftBar/)
    expect(src).not.toMatch(/fieldPaneLeftBar\s*\(/)
  })

  it('字段行走 FlowRow，来源态经 state 传给左条（方点已退场）', () => {
    // 不是「<FlowRow 出现过」这种存在性断言：钉的是接线本身——FlowRow 收到 no + rowState。
    expect(src).toMatch(/<FlowRow\s+no=\{no\}\s+state=\{rowState\}/)
    // v0.7.3：行尾那枚 6px 方点整个退场，SourceMark 不再有调用点
    expect(src).not.toMatch(/<SourceMark/)
  })

  it('RowActions 按 editorMode 分流两套形态', () => {
    expect(src).toMatch(/<RowActions\s+visible=/)
    expect(src).toMatch(/mode=\{editorMode \? 'edit' : 'view'\}/)
  })

  it('leechCount 按 isLeech(overlay.maxLapses, leechThreshold) 门控，不直接传 maxLapses', () => {
    expect(src).toMatch(/isLeech\(overlay\.maxLapses, leechThreshold\)/)
    expect(src).not.toMatch(/leechCount=\{overlay\.maxLapses\}/)
  })

  it('页级「＋ 添加」与行级「＋」共用 AddMenu；容器内虚线圆钮已删', () => {
    expect(src).toMatch(/<AddMenu/)
    expect(src).not.toMatch(/addChildControl/)
  })

  it('单位的行尾槽不进排版流、且不挂 ＋（v0.7.3 尾段 §3.4、D17）', () => {
    const leaf = readFileSync(new URL('../entry/LeafFlow.tsx', import.meta.url), 'utf8')
    expect(leaf).toMatch(/position: 'absolute'/)
    const at = src.indexOf('end: hoveredId === ch.id')
    expect(at, '工作区要按单位挂行尾槽').toBeGreaterThan(-1)
    expect(src.slice(at, at + 400), '单位上不设 ＋').not.toMatch(/onAdd/)
    // FIX 1.4：hover 必须由单位 span 上的 onEnter/onLeave 驱动（而不是条件 wrapper），
    // 否则操作簇永远不出现。钉住这条接线，防止静默回归。
    expect(leaf).toMatch(/onMouseEnter=\{it\.onEnter\}/)
    expect(leaf).toMatch(/onMouseLeave=\{it\.onLeave\}/)
    expect(src).toMatch(/onEnter: \(\) => onHover\(ch\.id\)/)
  })

  it('流式单位复用行内编辑模板：双击（普通）/ 单击（编者）进编辑，编辑中就地上输入框', () => {
    // 单位在 d4b1bf9（短条目改流式多列）之后不再走 FieldCard，行内编辑那套整条丢了：
    // 既没有双击 / 单击触发器，也没有编辑态的输入框——⋯ 菜单里的「编辑」设了 editingId
    // 之后无处渲染，同样点不出东西。这里钉住「单位复用了同一个模板」这件事。
    expect(src).toMatch(/<EditableValue/)
    expect(src).toMatch(/editingId === ch\.id/)
    // 编辑中的单位必须自带 `data-field-edit`：点外关闭按这个属性放行，
    // 而单位编辑时容器那张 FieldCard 的 `editingId === fv.id` 为假、不会带它。
    const unitEdit = src.indexOf('editingId === ch.id')
    expect(unitEdit, '工作区要有单位的编辑态').toBeGreaterThan(-1)
    expect(src.slice(unitEdit, unitEdit + 500), '编辑中的单位要让点外关闭认得出').toMatch(/data-field-edit/)
    // LeafFlow 保持哑组件：它两页共用，点击行为必须由调用方给（返回页不可编辑）。
    const leaf = readFileSync(new URL('../entry/LeafFlow.tsx', import.meta.url), 'utf8')
    expect(leaf).not.toMatch(/onClick|onDoubleClick/)
    // 返回页不参与编辑：它的 LeafFlow 只给 content。
    const dict = readFileSync(new URL('../search/DictDetailCard.tsx', import.meta.url), 'utf8')
    expect(dict).not.toMatch(/<EditableValue|onDoubleClick/)
  })
})

// 「这个字段长什么样」的判断只允许有一个出处（lib/fieldKind.ts）：
// 两页都问 leafForm，不得再各写一遍裸 key 判断。
//
// 扫描口径：不逐条枚举（枚举必然漏掉没写进名单的键），而是**正面钉住 leafForm 的调用点**
// + **反面清点两页全部 `key ===/' !==` 比较**，凡命中者必须逐条出现在下方 allow-list 里并注明
// 理由。allow-list 之外的任何裸 key 比较（含 switch 回归成 node.field.key、含藏在 filter /
// sourceMark / rowLabel 之类的分支里）都会让本守卫失败——这正是它该抓的。
//
// 例外白名单（逐条对应行号；这些比较问的是「显示设置映射 / 标签文字 / 窗格身份 / 增删可行性 /
// 布局分流」，不问「渲染成什么形状」，故不在 leafForm 的辖区内）：
//   WordWorkbench.tsx:160-165 childLabelOverride——按父/子键决定**标签文字**（「中文释义(n)」），渲染壳仍归 leafForm
//   WordWorkbench.tsx:219,220,228 isPosPane / isGroupPane / isPhonetic——**窗格身份**，非渲染形状
//   WordWorkbench.tsx:252,253 zhCount / enCount——数中/英条数给窗格头的计数
// 行号是**当前 HEAD 的行号**：任何上方插入都会让本守卫失败，需连同 allow-list 一起改
//（v0.7.3 尾段 §3.4 给 FieldCard 加 `unitMenuItems` 时就整体下移了 9 行；
//  修补单位行内编辑时插入 `renderUnitContent` 又让下面那组下移 35 行；
//  v0.7.4 Task 1 删掉 `childItems` 三行，这一组再下移 3 行；
//  v0.7.4 Task 10 给 FieldCard 补色条分段入参，整组再下移 17 行）。
//   WordWorkbench.tsx:768 空标签校验——**数据校验**，不是渲染分支
//   WordWorkbench.tsx:817/826/830/873/886/1229 容器路由（CONTAINER_FIELD_KEYS / ALLOWED_CHILD_KEYS
//     与 word_root / word_root_item / synonym_discrimination_group / part_of_speech / phonetic
//     等键的判定）——**增删可行性**（能不能加、加在哪、加完要不要进编辑态），不是渲染
//   WordWorkbench.tsx:1078 页级菜单「音标」——按 key 找定义再添加，**布局分流**
//   DictDetailCard.tsx:83-84 keyAllowed——displayFields 可见性映射（只查「显不显示」，不问「长什么样」）
//   DictDetailCard.tsx:94-97 filter——可见性过滤与空容器丢弃（95 的 phonetic 同理，只问显不显示）
//   DictDetailCard.tsx:193 sourceMark——哪几枚行尾来源标
//   DictDetailCard.tsx:248 plain 壳内的「标签: 值」拆写——问的是哪副渲染壳，不是哪副叶子形状（见该处行内注释）
//   DictDetailCard.tsx:345 isPos——run-in 头形态
const LEAF_FORM_GUARD_ALLOWLIST: [file: string, lines: number[], why: string][] = [
  ['WordWorkbench.tsx', [160, 161, 162, 165, 219, 220, 228, 252, 253, 768, 817, 826, 830, 873, 886, 1078, 1229], '标签文字 / 窗格身份 / 计数 / 校验 / 容器路由 / 布局分流（不问渲染形状）'],
  ['DictDetailCard.tsx', [83, 84, 94, 95, 97, 193, 248, 345], '可见性映射与过滤 / 来源标 / 渲染壳内拆写 / run-in 头'],
]

// 取出文件里全部「某字段键 ===/' !== '某键字面量'」的行（命中 .key 直比与 childKey(…) 等值两类）
const keyComparisons = (s: string): { line: number; text: string }[] =>
  s.split('\n').flatMap((text, i) => (/\w+\.key\s*(?:!==|===)\s*'[a-z_]+'|childKey\([^)]*\)\s*(?:!==|===)\s*'[a-z_]+'/.test(text) ? [{ line: i + 1, text }] : []))

describe('两页共用 leafForm（v0.7.3 尾段 §1.3）', () => {
  it('两个页面都问 leafForm，不得再各写一遍 key 判断（v0.7.3 尾段 §1.3）', () => {
    const files: [string, string][] = [
      ['WordWorkbench.tsx', readFileSync(new URL('./WordWorkbench.tsx', import.meta.url), 'utf8')],
      ['DictDetailCard.tsx', readFileSync(new URL('../search/DictDetailCard.tsx', import.meta.url), 'utf8')],
    ]
    for (const [name, source] of files) {
      expect(source, `${name} 必须经 leafForm 问形状`).toMatch(/leafForm\((?:def|node\.field|node)\.key\)/)
      const hits = keyComparisons(source)
      const covered = new Set(LEAF_FORM_GUARD_ALLOWLIST.filter(([n]) => n === name).flatMap(([, ls]) => ls))
      const uncovered = hits.filter(h => !covered.has(h.line))
      expect(
        uncovered.map(h => `${name}:${h.line} ${h.text.trim()}`),
        `${name} 存在 allow-list 之外的裸 key 判断（「哪个键长什么样」只能问 leafForm）`,
      ).toEqual([])
    }
  })
})
