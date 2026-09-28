# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **Status: v0.6.3** — 开发中。v0.6.3 更新清单（复习模块打磨 · 出题缺陷修复）：出题判据收口——掩码层（SQL）改为要求字段值非空、内容层要求例句含目标词，两层取交集，例句取不到的词条不再拿到填空题（修掉 `detrimental` / `finding` 一类「有例句行但句子里没有该词」的废题），概览的承诺张数也过同一道闸门（承诺数＝组卷数）；中译英题的释义与词性改为同源（都取第一个义项，新增 `CardContent.firstSensePos`），`matchedPos` / `partOfSpeech` 维持「跟例句走」的语义，填空仍用它——两个 pos 字段刻意不合并；复习区统计数字统一到 `.stat-num`（控制台两态、图表卡底、分类强化行），不新建组件；控制台两态重排（空闲态「今日」移到右上角、衬线深暖棕，新词 / 薄弱词上行；做题态「本次范畴」改「范围」、新增「题型」行、末行改「正确数 / 正确率」，保留「已答 n / N」与进度条）；题面上方新增「题型 / 跳过」行（跳过从题面块内上移，五种题型共用一套），`TEMPLATE_LABEL` 从 `roundStats.ts` 迁到 `scopeLabel.ts` 成为题型中文名的唯一出处；题面区的词性改为紧跟释义（或认读音标）的衬线斜体括号，结果区的完整词条快照不动；认读题面的词性此前是死分支（读的是 `prompt` 上不存在的字段），随本版在 `recognize` 的 `prompt` 上补上该字段而生效；结果区：揭示型题（英释义）不再渲染「你的作答」行、三颗评分键改用 `SquareButton`（`aria-keyshortcuts`；`minWidth` 覆盖见下半段）、删「下次到期」块（它报的是评分后的排期，却渲染在评分键之前）与小结的「用时」行、错误文案统一走 `correctnessLabel`（「错误」不再写「不正确」）；选择题改四宫格，任一选项换行时整组回落 1×4（按容器实际像素高度判定，用 `ResizeObserver` 触发、进入 2 列后再复核一次；`CHOICE_LINE_HEIGHT` 由按钮自身盒模型推出，两行高度为 13×1.7＋16＋2）；统计图四张加衬线标题与右上角期间小字、卡底补充文字的数字包 `.stat-num`、每图加底部基线与左右端点刻度（时间轴刻度取数据实际覆盖范围并截成 `MM-DD`），四宫格加 624px 宽度上限，删掉图表上方与左控制台重复的那行文字；新组件三枚——`CheckBox`（22×22 圆角方块，选中为填入色块、不画对勾，`role="checkbox"` 落在 `<button>` 上；替换全仓 5 处原生 checkbox，分类强化行传分类色，裸 button 仍是 labelable 元素故点分类名照旧可切换）、`DueBadge`（标题栏 logo 右侧的 26px chip，`count === 0` 不渲染，两档配色字号一致，点开为窗口并带「去复习」；入口接会话守卫，不再自行 reset 会话；活动栏角标删除，取数只剩一处）、`SpeakButton`（工作台词条标题 / 认读题面 / 词典详情页三处，复用 `invoke('speak')`，不接听辨题的音色探针门控——那个门控管的是出不出听辨题，点了没声即系统没装英文音色，静默降级不弹错不写 console）；薄弱词的判定说明从正文收进 i 说明窗，`Tooltip` 补上点击 / 聚焦 / Esc（既有 5 个调用点仍只挂悬停，行为不变），全库随机页加「词库共 n 词」；自由练习的数量框、复习设置的四个数字框、侧边栏模式选择圈的描边加深一档（三处必须同步，否则悬停移开会掉回浅档），顶栏搜索框不动，词典来源色由两种色相改为基础字色（`SOURCE_ACCENTS` 表换成 `sourceAccent()` 函数，三处调用点——卡左侧竖条、来源徽标底色、「＋ 添加此词典」按钮文字——一并接线；徽标上的文字色本来就是硬编码白，不经过此函数）；设置新增「标题栏显示待复习数量」开关（`showDueBadge`，默认开），持久化 version 6→7（新字段必须触发迁移，否则旧存档读出来是 `undefined`、chip 永久不显示）；二次打磨——**整个答题页两栏**：两栏网格从结果区提到 ReviewArena，左栏＝题型/跳过 + 题面 + 作答行 + 三键 + 下一题，右栏＝完整词条，**由 revealed 门控**、揭示那一刻起**从页面顶端就开始**（漏这道门就是泄题：中译英 / 英释义 / 听辨的目标词会提前印在题面旁边）于是题面区——它占着从进度条到结果区之间的整段——右半边一直是空的，词条被压在它下面，看上去就是「完整词条上方有大片空白」）。两栏**等分**、各占内容区的一半（`minmax(0, 1fr) minmax(0, 1fr)`）：左侧即便没占满那一半也占满它（「如果左侧仍有空间则占满左 1/2」），不是「按内容、右侧吃余量」——后者在宽窗口下会在左侧留下一条空白带。视口断点 1100 只管**下限**，窄于它走单列、完整词条置底（DOM 顺序＝左栏在前、词条在后）。`ResultBlock` 随之只管左栏内部（作答行 + children），`snapshot` / `onIntrinsicWidth` 两个 prop 一并去掉。导航条与进度条留在两栏**之外**、仍在整页顶端横跨（它是全局的队列位置，分栏会把「第 n / N」缩到左半边）；外层 gap 由 24 收到 16，题面与结果之间改由左栏自己的 gap-6 隔开，24px 会在两者之间多留一道空档。左栏内三处也收窄：三键整行退成 inline-flex（约 220px，`SquareButton` 的 `grow` prop 换成 `minWidth`——grow 改的是上限、等分擑满，收窄要改的是下限）、键入题答案框改 `width: auto` + `size={20}` + `whiteSpace: pre`（约 150px，包裹层退成 inline-block 否则在 flex-col 里被 stretch 擑满）、选择题格**逐颗**限宽 250px（2×2 时每颗实得约 271px 不触发，1×4 时 550px 被限住）、题面块 560 → 550 与其余对齐同一条右边界。`READING_WIDTH` 一并撤销，两处宽度上限由 `RESULT_HALF_WIDTH` 取代。以及早前的四项——趋势卡标题删掉与卡头右上角 `periodFor('trend')` 重复的期间前缀（「近 14 天 · 复习量 / 正确率」→「复习量 / 正确率」，斜杠两侧空格照旧），③分类强化行在勾选框与分类名之间补一颗 10px 分类色圆点（与设置 → 分类管理那行同规格；设置那一处本来就有，故只改了分类强化），④「待复习」口径收紧——不再走本轮组卷的队列长度（会被设置的「队列上限」截断），改读掩码层的到期集 `getStrategyCounts().today`：只数到期熟词，与队列上限、与两道内容闸门都无关，控制台空闲态与标题栏 chip 仍读同一个数（`getTodayDeliverableCount` 随之删除，`getOverview().newCount`「新词: n」仍走本轮队列并仍过两道闸门、不从 total 派生）。取舍要有意识地接受：积压超过队列上限时做完整轮这个数不会归零（剩下的留到下一轮），且「今天只有新词可学」时 chip 不显示。不改调度与计分（FSRS 参数、`rateCard` 事务、`rating >= 3` 口径一律未动）。DB schema 未变（仍为 v4）。

> **编码前置要求**：任何编码 / 调试 / 重构 / 评审 / 修改仓库的操作前，先调用 `coding-principle` 技能（工作区根 `Projects\.claude\skills\coding-principle`

---

## 快速开始 Quick Start

```bash
cd /e/Workspace/Projects/Wordsett
npm install
npm run build:dictionaries  # build local dictionary DBs (ecdict.db / wordnet.db) — gitignored, required on fresh clone
npm run tauri dev
```

## 开发约定 Conventions

### 行尾统一 Line Endings

仓库内文本文件一律 LF（`.gitattributes` 的 `* text=auto` 自动规范化，`add` 时自动转换）；不要手动改行尾、不要提交 CRLF 文件。二进制扩展名（png / ico / exe 等）已在 `.gitattributes` 声明，不参与规范化。

### 添加内置字段 Adding a New Built-in Field

1. 在 `src/types/field.ts` 的 `FieldKey` 联合类型中加入新键；
2. 加入 `BUILTIN_FIELDS` 常量；
3. 在 `src/db/schema.ts` 添加种子 INSERT。

---

## 版本发布 Release

> 完整发布流程（版本号、签名打包、GitHub Release、macOS、常见坑）已迁移为技能：**release-workflow**（`.claude/skills/release-workflow/SKILL.md`，本地文件）。发布时调用该技能，按其步骤执行。
> **git 边界**：add / commit 可自行执行；**本地 merge、push 与 `gh release`（公开发布）必须由用户亲自执行**。

---

## 备注 Notes

- `docs/` 状态更新随各版本任务进行，属一次性工作，**不入**发布清单。
- README 面向用户（安装/使用/卸载），开发者细节（构建、打包、发布）以本文件为准。
