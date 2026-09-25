# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **Status: v0.6.0** — 开发中。v0.6.0 更新清单（间隔复习模块 · FSRS 智能排程）：新增独立的「复习」模块，词库里的每个词自动成为一张复习卡，按 FSRS 算法排定下次到期时间。三种策略——今日复习（到期 + 新词额度，计分）、薄弱词专项（连错 ≥ 阈值 ∪ 近 7 天答错）、自由练习（自选分类/范围，不计分）；五种题型（认读/填空/中译英/英释义/听辨）按词条已有字段自动选取，缺字段自动跳过；键入题逐字母标红比对，评分后展示完整词条与下次到期；切换策略不丢进度（切回即续）；复习统计以只读模式接入既有统计页；新增复习设置区（目标记忆保持率、新词额度、每日上限、连错阈值）；DB schema 升至 v4（review_cards / review_states / review_logs）。复习模块右栏为白底、音标紧跟单词标题。

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
