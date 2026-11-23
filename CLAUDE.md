# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **当前状态（v0.8.0 已发布）**：2026-11-24 发布 tag `v0.8.0`（macOS run 45223060573 / iOS run 45223060493）。Release 资产：Windows `Wordsett_0.8.0_x64-setup.exe` + `.sig`、macOS `Wordsett_0.8.0_aarch64.dmg`、Android `Wordsett_0.8.0_android-universal.apk`、iOS `Wordsett.ipa`（124.3 MB，未签名）；`latest.json` 为 0.8.0（仅 `windows-x86_64` 条目，与往版一致）。本版是 **iOS / iPad 移植**，零 schema 改动（`SCHEMA_VERSION` 维持 7）。iPhone 13 Pro 真机十项验收已通过（用户确认）；**iPad 未设备验证**（布局由 Android 平板模拟器覆盖）。`ios.yml` 的 `workflow_dispatch` 现已在 `main` 上可用；调试构建用带连字符的 tag（如 `v0.8.0-ios4`）触发，`release.yml` 与 Release 挂载对其跳过。
> **生成工程**：`gen/android` / `gen/apple` 重新生成后的人工恢复清单见 `release-workflow` 技能。
> **版本历史**：逐版本变更记录见 `git log`、GitHub Releases 与 `docs/`，本文件不再保留。

> **编码前置要求**：任何编码 / 调试 / 重构 / 评审 / 修改仓库的操作前，先调用 `coding-principle` 技能（工作区根 `Project\.claude\skills\coding-principle`）。

---

## 快速开始 Quick Start

```bash
cd /e/Workspace/Project/Wordsett
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

> 完整发布流程已迁移为技能：**release-workflow**（`.claude/skills/release-workflow/SKILL.md`，本地文件）。发布时调用该技能，按其步骤执行。
> **git 边界**：add / commit 可自行执行；**本地 merge、push 与 `gh release`（公开发布）必须由用户亲自执行**。
> 桌面端与移动端版本号保持一致，仅双端均增加新功能或改进旧功能时提升版本号

---

## 备注 Notes

- `docs/` 状态更新随各版本任务进行，属一次性工作，**不入**发布清单。
- README 面向用户（安装/使用/卸载），开发者细节（构建、打包、发布）以本文件为准。
