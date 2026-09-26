# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **Status: v0.6.1** — 开发中。v0.6.1 更新清单（复习模块打磨 · 听辨题型上线）：复习策略收敛为「今日复习 / 自由练习」两项（薄弱词专项并入自由练习的范围选项），自由练习支持按分类 / 薄弱词 / 今日 / 随机四种范围；复习页新增导航栏与返回上轮状态、跳过按钮、迷你控制台（题型中文名 / 正确率 / 题型构成）、概览三图（熟知度分布 / 到期日历 / 近 14 天趋势）与本轮小结（未作答卡片计入总分母）；新增 TTS 依赖与 speak / 英文语音探测命令，听辨题型经运行时闸门控制（fail-closed，探测到英文语音才放行）；填空题改为只取含目标词的例句，挖空旁注明「在句中意为 xxx」，无匹配例句则该词不下发填空题；方块按钮配色重调（中性底 + 生效态浅品牌蓝，hover 阶差达 2 L* 以上，AA 对比度达标）。DB schema 未变（仍为 v4）。

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
