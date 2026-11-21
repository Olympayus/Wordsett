# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **当前状态（v0.8.0）**：开发分支 `v0.8.0`，代码侧已提交、尚未合并到 `main`（本地 merge 与 push 由用户亲自执行）。本版是 **iOS / iPad 移植**：零 schema 改动（`SCHEMA_VERSION` 维持 7），四处版本号在发行时按 `release-workflow` 统一升到 0.8.0；开发期 `latest.json` 刻意不动。设计与计划在 `docs/superpowers/`（本地文件、不入 git）。
> **待完成的外部步骤**：`gen/apple` 尚未生成入库（需推送后手动跑 `ios.yml`，下载 `wordsett-gen-apple` artifact）；`TtsBridge.swift` 与状态栏桥尚未实现；iPhone 13 Pro 真机十项验收未执行；iPad 全部待设备验证；IPA 包体未测量。
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
