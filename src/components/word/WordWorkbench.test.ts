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

  it('字段标签走进 C1（FIELD_LABEL_STYLE）：一级 / 二级不再分字号', () => {
    // 标签字形只有一份出处，工作区行标签直接展开常量（v0.7.6 Task 2 扩围）：
    // 层级由缩进与固定 72px 标签列承担，不再靠两级字号。
    expect(src).toMatch(/import\s*\{[^}]*\bFIELD_LABEL_STYLE\b[^}]*\}\s*from\s*'[^']*labelStyle'/)
    expect(src).toMatch(/\.\.\.FIELD_LABEL_STYLE/)
    expect(src).not.toMatch(/fontSize:\s*isLevel1/)
    expect(src).not.toMatch(/letterSpacing:\s*'0\.5px'/)
    // 编辑框与标签同字形（进编辑不位移）：字体字段逐个取自常量，不另写一套字面量
    expect(src).toMatch(/fontFamily:\s*FIELD_LABEL_STYLE\.fontFamily/)
    expect(src).toMatch(/fontSize:\s*FIELD_LABEL_STYLE\.fontSize/)
    expect(src).toMatch(/fontWeight:\s*FIELD_LABEL_STYLE\.fontWeight/)
    expect(src).toMatch(/letterSpacing:\s*FIELD_LABEL_STYLE\.letterSpacing/)
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

  it('编者模式不改文字颜色（修复轮：开关模式中文深浅不得变化）', () => {
    // v0.7.2 的 `editorMode && state === 'original' ? 次级墨 : 主墨` 已移除：
    // 用户实测「打开编者模式中文变浅、看起来行距被压紧」。值格恒主色。
    expect(src).not.toMatch(/editorMode\s*&&\s*state\s*===\s*'original'/)
  })

  it('多列块左缘对齐容器标题文字（FlowRow 11 + 手柄槽 10 + gap 4）', () => {
    expect(src).toMatch(/const LEAF_FLOW_INSET = 11 \+ GUTTER_WIDTH \+ GUTTER_GAP/)
    expect(src).toMatch(/<LeafFlow[\s\S]{0,400}?inset=\{LEAF_FLOW_INSET\}/)
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
//   WordWorkbench.tsx:179-184 childLabelOverride——按父/子键决定**标签文字**（「中文释义(n)」），渲染壳仍归 leafForm
//   WordWorkbench.tsx:239,240,248 isPosPane / isGroupPane / isPhonetic——**窗格身份**，非渲染形状
//   WordWorkbench.tsx:255 isDefinition——**段身份**（这条行是不是分段的根），判的是「色条怎么分段」而非渲染形状
//   WordWorkbench.tsx:274,275 zhCount / enCount——数中/英条数给窗格头的计数
// 行号是**当前 HEAD 的行号**：任何上方插入都会让本守卫失败，需连同 allow-list 一起改
//（v0.7.3 尾段 §3.4 给 FieldCard 加 `unitMenuItems` 时就整体下移了 9 行；
//  修补单位行内编辑时插入 `renderUnitContent` 又让下面那组下移 35 行；
//  v0.7.4 Task 1 删掉 `childItems` 三行，这一组再下移 3 行；
//  v0.7.4 Task 10 给 FieldCard 补色条分段入参，整组再下移 17 行；
//  v0.7.4 Task 11 在 FieldCard 上方加模块级 `MARK_COLOR` 取色表（16 行），整组再下移 17 行；
//  v0.7.4 Task 12 给单位加 id 与 drag 手势（LeafFlow 调用 +10 行）、新增 activeDragId state（+3 行），
//  下方整组再下移；handleDragStart / End / Cancel 的改动在其后，只影响更下面的那几条）。
//  v0.7.4 Task 13 行级菜单只删不加：128 删一行、193 增一行（两者相抵，239-275 那一组**不动**），
//  菜单条目改成条件展开再 +2 行；`handleAddSibling` 连同其尾随空行整个删掉（-13 行）。
//  净效果：容器路由那组（原 858/867/871/914）下移 2 行，其后的 927 随函数一并删除、
//  1124/1275 反上移 12 行。
//   WordWorkbench.tsx:813 空标签校验——**数据校验**，不是渲染分支
//   WordWorkbench.tsx:860/869/873/916/1263 容器路由（CONTAINER_FIELD_KEYS / ALLOWED_CHILD_KEYS
//     与 word_root / word_root_item / synonym_discrimination_group / part_of_speech / phonetic
//     等键的判定）——**增删可行性**（能不能加、加在哪、加完要不要进编辑态），不是渲染
//   WordWorkbench.tsx:1112 页级菜单「音标」——按 key 找定义再添加，**布局分流**
//  v0.7.4 Task 14 编辑态搬到导航条：四处行内「保存 / 取消」删净（−12 行）、四处 wrapper 的
//  `gap` 去掉（−4 行），新增模块级 MeasuredInput / editKeyDown（+44 行），净 +28 行：239-275 那一组
//  下移到 303-339，容器路由那组（原 860/869/873/916）下移到 937/946/950/993，其后的 1112/1263
//  下移到 1189/1348。
//  Task 14 修复轮 2（评审五项）：量宽机制整体抽进 lib/measureText.ts（本文件 −20 行）、B/C 两处改走
//  量宽（净 0 行）、例句编辑态补回行首 `DashMark`（+16 行）、值格那处补上漏掉的右括号（0 行），
//  净 −4 行：303-339 那一组上移到 289-325，容器路由那组（937/946/950/993）上移到 933/942/985，
//  其后的 1189/1348 上移到 1185/1344。
//  Task 14 修复轮 3（零位移两处收口）：例句编辑态的行首 `DashMark` 与被替换那一行同为 14px
//  （新增模块级 `EXAMPLE_EDIT_FONT_SIZE` 作唯一出处，wrapper 与输入框 `font` 两处同取，+5 行），
//  该行内注释补两行说明「标记按 em 取值，量与画必须同字号」（+2 行），并改掉一行既有的
//  wrapper 属性（净 0 行）：275-311 那一组下移到 280-316，容器路由那组（923/932/936/979）
//  下移到 930/939/943/986，其后的 1175/1334 下移到 1182/1341。
//  v0.7.4 Task 15 返回页左缘 / 小标题 / 勾选重写 DictDetailCard.tsx（INSET 常量、叶子键表、
//  三态勾选、容器标题带横线、renderRows 增 inset 参数）：本文件四处命中行重算为
//  102 / 193 / 256 / 384；原 allow-list 里的 86 / 87 / 97 / 99 是更早版本遗留的空条目
//  （那几行本就不匹配守卫的裸比较正则），本次按新树重算一并清掉。
//  v0.7.4 Task 16 拖拽副本：DragOverlay / DragGhost 两行 import（+2）、draggingStyle 注释改写
//  并把 scale 换成 opacity/background（+3）、落点线加左端圆点（+9）；dragGhost 的解析插在
//  `return (` 之前，只影响更下游的 1341 那一条（+16）。本文件十二处命中行重算为
//  282 / 283 / 291 / 298 / 317 / 318 / 944 / 953 / 957 / 1000 / 1196 / 1371。
//  v0.7.4 全分支修复轮（Task 17 之后）：A-2 的例句注释 +1、activeDragId 的 ctx 注释 +1（落在
//  283 之上），下方 activeDragId state 注释再 +1；DictDetailCard 的第二处子级间距注释 +1
//  （384 → 385）、C-2 头勾选框条件 +2（在 isPos 之后）。本文件十二处命中行重算为
//  283 / 284 / 292 / 299 / 318 / 319 / 946 / 955 / 959 / 1002 / 1199 / 1374。
//  行号全部由守卫失败输出回填，未手算。
//  v0.7.4 修复轮 2（用户实测四项）：删掉编者模式的文字染色（−1 行）、LeafFlow 补左缘
//  `LEAF_FLOW_INSET`（常量 +9 行、调用点 +3 行），本文件十二处命中行重算为
//  292 / 293 / 301 / 307 / 328 / 329 / 962 / 971 / 975 / 1018 / 1215 / 1390。
//  v0.7.4 修复轮 3（行高取整）：值格加 `lineHeight: '21px'` 与两行注释（+3 行），
//  上方那组不动，下游六处重算为 965 / 974 / 978 / 1021 / 1218 / 1393；
//  DictDetailCard 的例句分支加一行注释，两处下游命中为 257 / 386。
//   DictDetailCard.tsx:102 filter 里的 phonetic——可见性过滤（只问「显不显示」，不问「长什么样」）
//   DictDetailCard.tsx:193 sourceMark——哪几枚行尾来源标
//   DictDetailCard.tsx:256 plain 壳内的「标签: 值」拆写——问的是哪副渲染壳，不是哪副叶子形状（见该处行内注释）
//   DictDetailCard.tsx:385 isPos——run-in 头形态
//  v0.7.5 Task 2（保存时校验链接）：顶部两行 import（+2）与 handleSave 里的十行校验块（+10）
//  使本文件命中行重算为 294 / 295 / 303 / 309 / 330 / 331 / 977 / 986 / 990 / 1033 / 1230 / 1405
//  （前半 +2、后半 +12；行号同样由守卫失败输出回填）。
//  v0.7.5 Task 3（阅读态链接渲染）：`LinkedText` import（+1）、FieldCardCtx 增加
//  isInLibrary / onJump 及其注释（+4）、单位正文换 `LinkedText`（+2）、三处值格换
//  `LinkedText`（+6）、主组件 cardCtx 补两个字段及注释（+5），命中行重算为
//  299 / 300 / 308 / 314 / 335 / 336 / 989 / 998 / 1002 / 1045 / 1248 / 1423。
//  v0.7.5 Task 4（链接点击跳转）：`useLinkJump` import（+1）、主组件取 hook（+2）、
//  cardCtx 的空实现换成 hook 返回值（±0），命中行重算为
//  300 / 301 / 309 / 315 / 336 / 337 / 992 / 1001 / 1005 / 1048 / 1251 / 1426。
//  v0.7.5 Task 6（反链脚注）：`BacklinksFootnote` import（+1）；挂载点在 FieldCard 之后，
//  不影响下面这组命中行。命中行重算为
//  301 / 302 / 310 / 316 / 337 / 338 / 993 / 1002 / 1006 / 1049 / 1252 / 1427。
//  v0.7.5 Task 11（移入 / 移回）：`archiveMove` import（+1）、主组件加 handleMoveWord（+9）、
//  导航条传 location / onMoveWord（+4），命中行重算为
//  302 / 303 / 311 / 317 / 338 / 339 / 1004 / 1013 / 1017 / 1060 / 1263 / 1441。
//  v0.7.5 最终修复波：handleSave 校验块移到早退之后（±0 行数）、熟悉度回落 +5 行、
//  dragGhost 注释 +1、SenseFlow 调用点注释 +3，最后两处命中行重算为 1263 / 1449。
//  Task 4（手机外壳）：主组件加 `interface Props` 与 `chrome` 入参（+13 行）——组件签名变化，
//  但**渲染分支是纯新增**（`chrome === 'desktop' &&` 包住原有的导航条块，净 +1 行，其余逐字未动）。
//  上半六处（299-339）落在新增 Props 之上，下移 13 行仍是原值；下游六处下移 14 行，
//  重算为 1015 / 1024 / 1028 / 1071 / 1274 / 1464（行号由守卫失败输出回填，未手算）。
//  Task 5（手机顶栏 / 底栏 / 词条条）：组件改 `forwardRef`（Props 之后 +6 行，见文件头
//  `WordWorkbenchHandle`）、`useImperativeHandle` 交保存 / 取消（+10 行）、编辑态上报 effect
//  （+10 行）、删除确认文案改走 `lib/wordActions`（±0）、`saveEdit` / `cancelEdit` 两个稳定
//  引用（+2），全部落在原下半六处命中行**之上**。同轮另有 `lastEditReport` 去重 ref（+4，
//  落在 `handleAddField` 之前）——它不改变下面这组命中行里的**哪些行**命中，只让整体下移。
//  最终重算为
//  303 / 304 / 312 / 318 / 339 / 340 / 1062 / 1070 / 1079 / 1083 / 1126 / 1329 / 1520
//  （行号由守卫失败输出回填，未手算）。
//  Task 5 修复轮（评审 1 Critical）：把 `useImperativeHandle` 的闭包换成 `handleSaveRef`
//  （+12 行，落在 `handleAddField` 之前），它之后的三处命中行再下移 12、另三处下移 10
//  （`1083` 被新增的 12 行顶掉、不再是命中行），最终重算为
//  303 / 304 / 312 / 318 / 339 / 340 / 1062 / 1070 / 1080 / 1089 / 1093 / 1136 / 1339 / 1530
//  （同样由守卫失败输出回填）。
//  最终评审修复（编辑态卸载上报 +9 行，落在 `handleAddField` 之前）：下半六处命中行整体下移，
//  两处旧的 1089 / 1093 已不再命中，重算为
//  1087 / 1096 / 1100 / 1143 / 1346 / 1537（由守卫失败输出回填）。
//  手机端打磨（本轮）：内容列拆成上下两段、页签条带在手机外壳下移出内容列——
//  拆列注释由 1 行扩成 3 行（+2），落在尾段命中行之上。
//  #310 修复（本轮）：`useRef` / `useImperativeHandle` 两个 hook 提到空态早退之前
//  （净 +3 行），下段六处命中行整体下移 3，重算为
//  1090 / 1099 / 1103 / 1146 / 1349 / 1542（由守卫失败输出回填）。
//  v0.7.6 Task 2（工作区标签改取 FIELD_LABEL_STYLE）：import +1、删 `isLevel1` −1（落在首段命中行
//  之后）、编辑框 font 展开 +5、两处注释各 +1——首段 hits 净 +1，下段各自 +5 / +6，重算为
//  304 / 305 / 312 / 318 / 339 / 340 / 1095 / 1104 / 1108 / 1151 / 1354 / 1548（由守卫失败输出回填）。
//  v0.7.7 Task 4（手机行尾簇 + editorMode 收窄）：顶部三个 import（+3）、`TOUCH_HIT_OFFSET`
//  常量与 RowMenu 注释 / touch prop（+9）、`FieldCardCtx.touch`（+3）、FieldCard 解构补 touch（0）、
//  行尾簇判据三行（+5），共 +20 落在首段命中行之上；中段另有 RowMenu 覆盖层（+5）、`touch` 解构
//  （0）、groupHead 条件渲染（+2），使下半六处再 +10（合计 +30 附近）。十二处命中行重算为
//  324 / 325 / 332 / 338 / 359 / 360 / 1125 / 1134 / 1138 / 1181 / 1386 / 1580
//  （行号由守卫失败输出回填，未手算）。
//  v0.7.7 Task 5（长按正文 → 行级底部表）：顶部三个 import（+3）、`SHEET_TARGET_STYLE` 常量
//  （+15）、RowMenu 的 `onOpen` 与注释（+9）、`FieldCardCtx` 两个字段（+4）、FieldCard 的长按
//  hook 与 click 闸门（+26）、`isSheetTarget`（+3）、三处展开 `longPressProps`（+7）、行体 div
//  的高亮（+3）、`sheet` state（+4）、`handleToggleAddMenu` / `openRowSheet`（+28）、
//  `handleSheetPick`（+13）、底部表 JSX（+13）。前段命中行整体下移；**新增两处**裸 key 判断
//  （`openRowSheet` 里喂给 `rowSheetItems` 的 isPosPane / isGroupPane，属「编辑 / 添加子项」
//  可行性判据，与桌面 `menuItems` 同源）。十四处命中行重算为
//  379 / 380 / 390 / 396 / 417 / 418 / 1126 / 1127 / 1225 / 1234 / 1238 / 1281 / 1504 / 1698
//  （行号由守卫失败输出回填，未手算）。
//  Task 5 review Important 1（顶层非词性容器标题补长按）：groupHead 的普通标题 span 由单行
//  展开成带注释与 `longPressProps` 的块（+9 行，落在首段命中行之后），下游八处整体下移 9。
//  十四处命中行重算为
//  379 / 380 / 390 / 396 / 417 / 418 / 1135 / 1136 / 1234 / 1243 / 1247 / 1290 / 1513 / 1707
//  （由守卫失败输出回填；原 1225 那一处恰好落进既有条目 1234，仍逐条对齐）。
//  v0.7.7 Task 6（触摸拖拽 · 行级）：三个 dnd-kit import（+3）、`GRIP_HEIGHT` / `GROUP_HEAD_GAP`
//  两个常量（+4）落在首段命中行之上（+7）；主组件的传感器三行 + 注释（+17）、grip 命中层与
//  `onPointerDown` 拦截（+31）、DndContext 的 sensors 注释与 prop（+3）、`handleDragStart`
//  的震动（+3）、cardCtx 换用 `touch`（±0）落在下半段之上（+62）。十四处命中行重算为
//  386 / 387 / 397 / 403 / 424 / 425 / 1197 / 1198 / 1296 / 1305 / 1309 / 1352 / 1578 / 1772
//  （行号由守卫失败输出回填，未手算）。
//  v0.7.7 Task 7（单位级拖拽 + `·` / `–` 拆分）：`UnitActivation` 组件与注释（+32，落在首段
//  命中行之上）把首段六处整体下移 38（其中 import 变化 ±0）；例句 `–` 激活点（+17）落在
//  `openRowSheet` 的两处裸 key 判断之上，该组两处再 +46（合计 +63）；`openUnitSheet`（+16）、
//  单位 content 包 `UnitActivation`（+5）、cardCtx 接线（+1）落在下段之上（合计 +79 / +80）。
//  十四处命中行重算为
//  424 / 425 / 435 / 441 / 462 / 463 / 1260 / 1261 / 1375 / 1384 / 1388 / 1431 / 1658 / 1852
//  （行号由守卫失败输出回填，未手算）。
//  v0.7.7 Task 10（分类命中区）：头带右簇的两个尺寸常量与注释（+8，落在首段命中行之上）；
//  「＋」按钮的 `position: relative` 与覆盖层（+7，落在末处命中行之上）。前十三处 +8、
//  末一处 +15，重算为
//  432 / 433 / 443 / 449 / 470 / 471 / 1268 / 1269 / 1383 / 1392 / 1396 / 1439 / 1666 / 1867
//  （行号由守卫失败输出回填，未手算）。
//  v0.7.7 final fix（分类状态收口 + 添加菜单 grid 表）：`sheet` state 换成 MobileSheetState
//  （+13 行，落在首段命中行之上）、`openAddChildSheet`（+25）与 `handleSheetPick` 重写（+24）、
//  页级 `pageAddSheetItems` 接线（+14）——下段整体下移，且 `handleSheetPick` 新增一处
//  `x.key === 'phonetic'`（与桌面 AddMenu 的「添加音标」同源）。十四处命中行重算为
//  448 / 449 / 459 / 465 / 486 / 487 / 1285 / 1286 / 1429 / 1438 / 1442 / 1485 / 1648 / 1739 / 1956
//  （行号由守卫失败输出回填，未手算；原十四处变十五处）。
//  v0.7.8 Task 4（平板触摸语义）：`Props` 新增 `touch?: boolean` 与注释（+6 行）、
//  `touch` 的推导改 `touchProp ?? chrome === 'mobile'` 并补两行注释（+2 行），共 +8，
//  全部落在首段命中行之后；下半九处命中行重算为
//  1293 / 1294 / 1437 / 1446 / 1450 / 1493 / 1656 / 1747 / 1964（由守卫失败输出回填）。
const LEAF_FORM_GUARD_ALLOWLIST: [file: string, lines: number[], why: string][] = [
  ['WordWorkbench.tsx', [448, 449, 459, 465, 486, 487, 1293, 1294, 1437, 1446, 1450, 1493, 1656, 1747, 1964], '标签文字 / 窗格身份 / 段身份 / 计数 / 校验 / 容器路由 / 表条目可行性 / 添加项路由 / 布局分流（不问渲染形状）'],
  ['DictDetailCard.tsx', [102, 193, 257, 386], '可见性过滤 / 来源标 / 渲染壳内拆写 / run-in 头'],
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

// React #310（2026-11-11 真机复现）：`WordWorkbench` 的空态早退
// `if (!selectedWord) return <EmptyState/>` 一度把 `useRef` / `useImperativeHandle` 挡在后面——
// 空态渲染少两个 hook、选中词后 hook 数变多，React 直接抛 "Rendered more hooks than during
// the previous render"，手机端表现为整页「出了点问题」。hook 的位置必须与渲染分支无关，
// 这条守卫钉住「早退在所有 hook 之后」。
// v0.7.7 Task 4 源码级守卫（spec §3.2 / §3.8）：手机单击不进编辑（四处入口），
// 而双击在手机上不受 editorMode 影响。桌面侧仍由 editorMode 门控。
describe('手机编辑手势（v0.7.7 Task 4 源码级守卫）', () => {
  const src = readFileSync(new URL('./WordWorkbench.tsx', import.meta.url), 'utf8')
  const editableValue = readFileSync(new URL('../entry/EditableValue.tsx', import.meta.url), 'utf8')

  it('单击进编辑的四处入口都带 !touch 门（字段值 / 词性标签各一，辨析组标题一）', () => {
    // 字段值与词性标签的形态完全相同（`editorMode && onStartEdit(fv)`），共两处；
    // 辨析组标题的判据是 `isGroupPane && !isEditing`（它本来就没有 editorMode 门），共一处。
    // 计数按真实代码写死：漏改任何一处都会让这条失败。
    expect(src.match(/!touch && editorMode && onStartEdit\(fv\)/g) ?? []).toHaveLength(2)
    expect(src.match(/!touch && isGroupPane && !isEditing/g) ?? []).toHaveLength(1)
  })

  it('流式单位（EditableValue）：单击受 !touch 门控，双击由 touch 旁路 editorMode', () => {
    expect(editableValue.match(/!touch &&/g) ?? []).toHaveLength(1)
    expect(editableValue).toMatch(/onDoubleClick=\{\(\) => \(touch \|\| !editorMode\) && onStartEdit\(\)\}/)
  })
})

// 平板触摸语义（v0.7.8）：`touch` 与外壳形态解耦——平板沿用桌面三栏（`chrome='desktop'`），
// 但触摸分支（长按 / 双击 / 行尾簇 / 拖拽传感器）必须生效。源码级守卫钉住「独立 prop、
// 默认仍由 chrome 推出」这一条接线，避免以后又把它写回 `chrome === 'mobile'`。
describe('平板触摸语义（v0.7.8）', () => {
  const src = readFileSync(new URL('./WordWorkbench.tsx', import.meta.url), 'utf8')
  it('touch 是独立 prop，默认仍由 chrome 推出', () => {
    expect(src).toMatch(/touch\?: boolean/)
    expect(src).toMatch(/const touch = touchProp \?\? chrome === 'mobile'/)
  })
})

describe('hook 顺序（React #310 守卫）', () => {
  it('空态早退必须在全部 hook 之后', () => {
    const src = readFileSync(new URL('./WordWorkbench.tsx', import.meta.url), 'utf8')
    const lines = src.split('\n')
    // 只认代码行：注释里会提到 hook 名字（比如解释这条守卫的地方），不能算调用
    const isCode = (l: string) => {
      const t = l.trim()
      return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    }
    // `use[A-Z]…(` / `use[A-Z]…<` —— `useWordStore.getState()` 这类 store 读法不匹配（后面是 `.`）
    const hookRe = /\buse[A-Z][A-Za-z0-9_]*\s*[<(]/
    const lastHookLine = lines.reduce((acc, l, i) => (isCode(l) && hookRe.test(l) ? i + 1 : acc), 0)
    const earlyReturnLine = lines.findIndex(l => /^\s{2}if \(!selectedWord\)/.test(l)) + 1
    expect(earlyReturnLine).toBeGreaterThan(0)
    expect(earlyReturnLine, `WordWorkbench.tsx:${lastHookLine} 处仍有 hook 落在空态早退之后`)
      .toBeGreaterThan(lastHookLine)
  })
})
