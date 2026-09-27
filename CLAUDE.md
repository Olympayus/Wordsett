# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **Status: v0.6.3** — 开发中。v0.6.3 更新清单（复习模块打磨 · 出题缺陷修复）：出题判据收口——掩码层（SQL）改为要求字段值非空、内容层要求例句含目标词，两层取交集，例句取不到的词条不再拿到填空题（修掉 `detrimental` / `finding` 一类「有例句行但句子里没有该词」的废题），概览的承诺张数也过同一道闸门（承诺数＝组卷数）；中译英题的释义与词性改为同源（都取第一个义项，新增 `CardContent.firstSensePos`），`matchedPos` / `partOfSpeech` 维持「跟例句走」的语义，填空仍用它——两个 pos 字段刻意不合并；复习区统计数字统一到 `.stat-num`（控制台两态、图表卡底、分类强化行），不新建组件；控制台两态重排（空闲态「今日」移到右上角、衬线深暖棕，新词 / 薄弱词上行；做题态「本次范畴」改「范围」、新增「题型」行、末行改「正确数 / 正确率」，保留「已答 n / N」与进度条）；题面上方新增「题型 / 跳过」行（跳过从题面块内上移，五种题型共用一套），`TEMPLATE_LABEL` 从 `roundStats.ts` 迁到 `scopeLabel.ts` 成为题型中文名的唯一出处；题面区的词性改为紧跟释义（或认读音标）的衬线斜体括号，结果区的完整词条快照不动；认读题面的词性此前是死分支（读的是 `prompt` 上不存在的字段），随本版在 `recognize` 的 `prompt` 上补上该字段而生效；结果区：揭示型题（英释义）不再渲染「你的作答」行、三颗评分键改用 `SquareButton`（新增 `grow` 与 `aria-keyshortcuts`）、删「下次到期」块（它报的是评分后的排期，却渲染在评分键之前）与小结的「用时」行、错误文案统一走 `correctnessLabel`（「错误」不再写「不正确」）；结果区改两栏——宽 ≥1100px 时左栏＝作答＋三键＋下一题、右栏＝完整词条，窄屏单栏且完整词条置底，内容区上限同时 960→1100（断点与上限同数，由 `RESULT_BREAKPOINT` 派生）；选择题改四宫格，任一选项换行时整组回落 1×4（按容器实际像素高度判定，用 `ResizeObserver` 触发、进入 2 列后再复核一次；`CHOICE_LINE_HEIGHT` 由按钮自身盒模型推出，两行高度为 13×1.7＋16＋2）；统计图四张加衬线标题与右上角期间小字、卡底补充文字的数字包 `.stat-num`、每图加底部基线与左右端点刻度（时间轴刻度取数据实际覆盖范围并截成 `MM-DD`），四宫格加 624px 宽度上限，删掉图表上方与左控制台重复的那行文字；新组件三枚——`CheckBox`（22×22 圆角方块，选中为填入色块、不画对勾，`role="checkbox"` 落在 `<button>` 上；替换全仓 5 处原生 checkbox，分类强化行传分类色，裸 button 仍是 labelable 元素故点分类名照旧可切换）、`DueBadge`（标题栏 logo 右侧的 26px chip，`count === 0` 不渲染，两档配色字号一致，点开为窗口并带「去复习」；入口接会话守卫，不再自行 reset 会话；活动栏角标删除，取数只剩一处）、`SpeakButton`（工作台词条标题 / 认读题面 / 词典详情页三处，复用 `invoke('speak')`，不接听辨题的音色探针门控——那个门控管的是出不出听辨题，点了没声即系统没装英文音色，静默降级不弹错不写 console）；薄弱词的判定说明从正文收进 i 说明窗，`Tooltip` 补上点击 / 聚焦 / Esc（既有 5 个调用点仍只挂悬停，行为不变），全库随机页加「词库共 n 词」；自由练习的数量框、复习设置的四个数字框、侧边栏模式选择圈的描边加深一档（三处必须同步，否则悬停移开会掉回浅档），顶栏搜索框不动，词典来源色由两种色相改为基础字色（`SOURCE_ACCENTS` 表换成 `sourceAccent()` 函数，三处调用点——卡左侧竖条、来源徽标底色、「＋ 添加此词典」按钮文字——一并接线；徽标上的文字色本来就是硬编码白，不经过此函数）；设置新增「标题栏显示待复习数量」开关（`showDueBadge`，默认开），持久化 version 6→7（新字段必须触发迁移，否则旧存档读出来是 `undefined`、chip 永久不显示）。不改调度与计分（FSRS 参数、`rateCard` 事务、`rating >= 3` 口径一律未动）。DB schema 未变（仍为 v4）。

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
