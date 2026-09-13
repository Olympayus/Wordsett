# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **Status: v0.5.2** — 开发中。v0.5.2 更新清单（界面改版）：新增左下活动栏（工作台 / 设置），设置从右侧抽屉升为同窗口独立页，顶栏齿轮移除；新增词条导航条（浏览器式 ← → 前进后退走访问轨迹、编者 pill、删除词条，「+ 新增标签页」并入标签条）；字段区降噪——hover 字符抖动根因修复（行内控件不再占用正文宽度）、取消固定标签列（各层统一 72px）、缩进一次封顶、去掉子项连接横线、⋯ 与垃圾桶移到行右端与多行容器角落、正文起点左移；词根每行一条 + 音标词根合并元信息区；「添加 xx」在普通与编者模式均 hover 现形（普通模式为加号按钮）；编者模式音标 / 词根按来源三态上色；顶部搜索框不再侵入展开侧栏；统计数字格式统一（中文: 2 · 英文: 3）；设置页说明弹窗不再溢出窗口下缘；模块切换保留词表滚动位置与编辑器状态、Ctrl+F 跟随当前模块、删除词条后自动切到相邻词条。

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
