# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **Status: v0.6.4** — 已发布。v0.6.4 更新清单（初始熟悉度接通链路 · 复习细节修复）：**初始熟悉度升为词条级内置字段**（`initial_familiarity`，displayOrder 23），原卡级列废弃（`review_cards.initial_familiarity` 保留在建表语句里只为新老库结构一致，代码不读不写；老库残留列无害，不做 DROP COLUMN——本仓无一次性迁移机制，为一个从无写入方的死列引入机制是负收益）。DB schema 进位 v4→5，但这是**书签不是迁移**：本版只新增一个内置字段，字段种子走 `seedFieldDefinitionsSQL()` 的 `INSERT OR IGNORE`、每次启动无条件执行，不进位功能完全等价；进位只为让「本版动过 schema」在 `pragma_user_version` 上留痕。**不要**因为看到进位就去找迁移代码。取数侧 `getWordReviewOverlay` 改锚 `words`（原锚 `review_cards`，而卡片只由 `registerAllWords()` 在打开复习模块时惰性创建，收录时不建卡 spec D3）——锚错表导致每个刚收录的词都不在结果里、chip 一律落回档 1；写入侧收录面板（`FamiliarityChoice`）与卡片级「＋ 添加此词典」两处都写，**仅词不在库时写**（在库词走 `if (!wordWasInLibrary)` 守卫，否则会把用户当初选的「眼熟」静默覆写成「完全陌生」）；两处写完都 `loadOverlay()` 刷新（fire-and-forget，刻意不挂进 `wordStore` 以免两个 store 重新耦合），所以选完「眼熟」到工作台**无需重启**即显档 2。首评三键按初始熟悉度预填**视觉默认态**（高亮但不抢焦点，Tab 不落在被高亮的那颗上）。词条卡新增**记忆强度 chip**（仅词条卡词头右侧，6 档色板 `MASTERY_COLORS` 为唯一出处，`MASTERY_BLOCKS = 5` 决定色块数）——记忆强度由 5 档改为 6 档，`getStats` 的分桶循环必须传**原始 stability** 而非已算好的 mastery（传后者会让每个词都落进档 1 且完全静默），分布图坐标轴端点改由 `MASTERY_TIER_NAMES[0]/[5]` 派生（原先硬编码的旧 5 档词汇在 6 段色带下 index 错位，正是本版要消灭的图表/chip 词汇漂移）。**顽固词徽标**（`LeechBadge`，词表行尾 + 词条卡头部，`--color-leech #A8554E`，`isLeech` 阈值 ≤ 0 视为关；词表右侧胶囊簇原被 `{categories.length > 0 && ...}` 门控，徽标放进去则无分类的顽固词永远显不出，故拓宽为 `categories.length > 0 || isLeechRow`）。**英文释义题由唯一「揭示型」改为键入型**（`inputKindFor` 五模板全枚举，`typedTarget` 派生自它且返回 `undefined` 而非空串，`autoGrades` 只排除 recall 与 english_def——英释义**不自动判分**，逐字母标红后直接出三键）。**「跳过」误判修复**：此前由空串反推（跳过与未作答都是 `input === ''`），改为显式标记 `skipped`；`isSkipped` 入参收窄为 `{ skipped?: boolean }`、`answerDisplay` 委托之，两处判据不重复。`CheckBox` 全局 22px → 18px（内块与圆角同比例）。不改调度与计分（FSRS 参数、`rateCard` 事务、`rating >= 3` 口径一律未动）。

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
