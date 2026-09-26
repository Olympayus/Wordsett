# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **Status: v0.6.2** — 开发中。v0.6.2 更新清单（TTS 双后端 · 复习交互打磨）：TTS 改为双后端，WinRT（`SpeechSynthesizer`）优先、拿不到英文音色则回退 SAPI5，两条后端共用一套探测判据并以 `VoiceProbe` 回报可用性、所用后端与音色名（听辨题闸门据此 fail-closed 放行）；填空题的例句 / 释义 / 词性三者沿 `parent_id` 上溯对位（不再用 `display_order` 近似），词性以括号入句、释义另起小字行置于题面下方；复习控制台的数字改为报做题进度（已答数）与正确率，与顶部导航栏的「第 n / N 题」（光标位置）刻意分开；答题中加入离开守卫，点做题区之外的控件弹确认窗、确认后结束本轮（此行为取代 v0.6 spec §2.4 的「切走即续」）；复习概览改四宫格（图表放大统一并在卡面补上数值），本轮小结改三段式（上＝统计、中＝图表、下＝逐题明细，答错的词清单并入明细表的「正误」列）；自由练习的「某个分类」页改称「分类强化」并支持多选勾选，分类信息与词数直接在右侧概览区展示；方块按钮按所在容器底色分画布套 / 白底套两套配色（白底套整体浅一阶）。DB schema 未变（仍为 v4）。

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
