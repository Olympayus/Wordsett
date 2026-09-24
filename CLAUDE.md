# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **Status: v0.5.3** — 开发中。v0.5.3 更新清单（缺陷修复 · 辨析数据链 · 搜索页与设置页改版）：近义词辨析组按词条规则自动提取组标题并以卡片隔开渲染（不再套「近义词辨析组」外层）；搜索返回页复用词条导航条（← → 前进后退、编者模式、合并添加），单词标题字号与工作区一致、柯林斯星级与标题同行、领域标签下行右对齐；语义网络胶囊浮层补回释义与例句（引号感知分段）；设置页方块按钮统一为圆角方形（编辑 / 合并添加并入同一组件）、关于与数据分区改版、新增「本地数据存储位置 · 浏览」打开数据目录、音标与词根开关移入词典返回词条区顶部、删除失效的音标开关、Logo 与活动栏图标对齐；修复音标 / 词根编辑态鼠标拖选即退出、释义下近义词与例句拖动换位无效、侧栏筛选与结果不一致。

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
