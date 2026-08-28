# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **Status: v0.4.4** — 开发中。v0.4.4 更新清单：中文搜索排序引入 ECDICT 词频（collins/frq）与「独立义项匹配」优先级 —— 查询词作为完整释义匹配（后随分隔符或结尾）优先于复合词前缀，常用词在前；SQL 内先按常用度预排并放宽 LIMIT 至 300，避免常用词被插入序截断丢掉；语义网络「相似词（相近但不同）」组每个相似 synset 簇下方常驻显示该簇释义，悬停显示完整 gloss 的应用内浮窗（一句一行，替代浏览器原生 tooltip），胶囊按内容宽度渲染、多词簇可换行；已在个人词库的词在搜索建议下拉与语义网络中显示「✓ 已收录」标记；词典详情卡片词性分组换词时默认全部展开。

---

## 快速开始 Quick Start

```bash
cd /e/Workspace/Projects/Wordsett
npm install
npm run build:dictionaries  # build local dictionary DBs (ecdict.db / wordnet.db) — gitignored, required on fresh clone
npm run tauri dev
```

## 常用脚本 Scripts

| 命令 | 作用 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 类型检查（`tsc -b`）+ 前端构建 |
| `npm run tauri dev` | 启动 Tauri 桌面应用（开发模式，热更新） |
| `npm run tauri build` | 打包发布版安装包 |
| `npm test` | 单元测试（Vitest） |
| `npm run lint` | 代码检查（oxlint） |
| `npm run build:dictionaries` | 构建本地词典库（`ecdict.db` / `wordnet.db`） |

## 开发约定 Conventions

### 行尾统一 Line Endings

仓库内文本文件一律 LF（`.gitattributes` 的 `* text=auto` 自动规范化，`add` 时自动转换）；不要手动改行尾、不要提交 CRLF 文件。二进制扩展名（png / ico / exe 等）已在 `.gitattributes` 声明，不参与规范化。

### 添加内置字段 Adding a New Built-in Field

1. 在 `src/types/field.ts` 的 `FieldKey` 联合类型中加入新键；
2. 加入 `BUILTIN_FIELDS` 常量；
3. 在 `src/db/schema.ts` 添加种子 INSERT。

---

## 版本发布工作流 Release Workflow

> 用途：每次**更新软件后**（改代码 → 重打安装包 → 上架）的固定流程。新代理接手后续版本时照此执行。
> **git 边界**：add / commit 可自行执行；**本地 merge、push 与 `gh release`（公开发布）必须由用户亲自执行**。

### 第 1 步 · 开发与验证

1. 从 `main` 切出功能分支 `vX.Y.Z`（本仓库惯例：直接开版本分支，如 `git checkout -b v0.4.0`）；
2. 开发完成后 `npm test` / `npm run lint` / `npm run build` 全绿；
3. 本地合并回 `main`：`git checkout main && git merge vX.Y.Z`（分叉时会产生 merge commit，可能有冲突需解决）。

### 第 2 步 · 同步版本号

**切分支时同步**：创建版本分支（`git checkout -b vX.Y.Z`）后立即升到新版本，开发期间构建 / 关于页即显示新版本号。

四处必须一致：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.lock`（`name = "app"` 条目）。

硬性要求：发布构建（第 4 步）前，四处版本号必须等于即将发布的版本。

### 第 3 步 · 同步文档

- `CLAUDE.md` 顶部 `Status:` 行：更新版本号与进度；
- `README.md`：徽章 `version-<v>`、安装表文件名；若功能/截图变化则同步「特色 / 截图」段；
- 内置字段计数：若 `BUILTIN_FIELDS` 增减，同步 README / CLAUDE.md 的「19 个内置字段」；
- 词典集变化：更新 `src-tauri/tauri.conf.json` 的 `resources` 白名单。

### 第 4 步 · 重新打包安装包

> **签名要求（v0.3.4+ 自更新）**：每次打包都会为更新产物签名，构建前需先设置签名密钥环境变量（私钥为加密的 rsign 密钥，需密码）：
>
> ```bash
> export TAURI_SIGNING_PRIVATE_KEY="$(cat Wordsett.key)"
> export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<密钥密码>"
> ```
> PowerShell 终端：`$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content Wordsett.key -Raw).Trim()` + `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<密钥密码>"`（bash `export` 在 PowerShell 不可用）。
>
> 私钥 `Wordsett.key` 与公钥 `Wordsett.key.pub` 不入 git（见 .gitignore）；公钥已内嵌 `src-tauri/tauri.conf.json` 的 `updater.pubkey`。忘记密码需重新生成密钥对并同步更新 pubkey。

```bash
npm run tauri build          # 完整打包（MSI + NSIS）
npm run tauri build -- --bundles nsis   # 网络受限时只打 NSIS（MSI 需联网下载 WiX，可能失败）
```

产物：`src-tauri/target/release/bundle/nsis/Wordsett_<version>_x64-setup.exe`（Windows 用户主用此安装包）。

> 注意：`tauri.conf.json` 改动需**完全重启** `npm run tauri dev` 才生效（热更新不读配置）。

### 第 5 步 · 生成更新清单 + 发布 GitHub Release（用户执行）

1. 生成 `latest.json`（自更新 endpoint 读取，必须含签名）：
   ```bash
   node scripts/write-latest-json.mjs   # 按已构建产物生成平台条目（Windows 必有）
   # 手工填写 latest.json 的 notes 字段
   git add latest.json && git commit -m "chore: update latest.json for v<version>"
   ```
2. 发布（全部单行命令）：
   ```bash
   git push origin main
   git tag v<version> && git push origin refs/tags/v<version>
   gh release create v<version> "src-tauri/target/release/bundle/nsis/Wordsett_<version>_x64-setup.exe" "src-tauri/target/release/bundle/nsis/Wordsett_<version>_x64-setup.exe.sig" --title "Wordsett v<version>" --notes-file <changelog>
   ```

### 第 5b 步 · macOS 发布（Mac 上执行）

1. Mac 上 `TAURI_SIGNING_PRIVATE_KEY="$(cat Wordsett.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<密码> npm run tauri build`；
2. 核对 `bundle/dmg/Wordsett_<v>_aarch64.dmg.sig` / `Wordsett_<v>_x64.dmg.sig` 命名与 `write-latest-json.mjs` 的假设一致（不一致则调整脚本模式匹配）；
3. Mac 上 `node scripts/write-latest-json.mjs` 重新生成 latest.json（含 darwin 条目）并 commit；
4. Apple 代码签名 + 公证 dmg（Gatekeeper）；
5. 上传 dmg 到 GitHub Release；
6. macOS 真机验证应用内更新（装旧版 → 检查更新 → 升级成功、数据保留）。

### 第 6 步 · 收尾

- 确认 README 的版本徽章、安装表文件名与 Release 实际产物一致；
- 可选：删除已合并的本地分支 `git branch -d vX.Y.Z`（若其尚未合入 `origin/vX.Y.Z`，`-d` 会拒绝，需 `-D` 强制删除——前提是内容已在 `origin/main` 上确认无丢失）。

### 发布常见坑（速查）

- **打包签名**：命令见第 4 步；私钥 `Wordsett.key`，配对公钥 `750F2CC78F7AF104`。
- **push 标签**：分支与标签同名时用 `git push origin tag vX.Y.Z`（或 `git push origin refs/tags/vX.Y.Z`）。
- **gh release**：changelog 先写文件再 `--notes-file` 引用；`.exe` 与 `.exe.sig` 分条上传。

---

## 备注 Notes

- `docs/` 状态更新随各版本任务进行，属一次性工作，**不入**发布清单。
- README 面向用户（安装/使用/卸载），开发者细节（构建、打包、发布）以本文件为准。
