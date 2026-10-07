# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **Status: v0.8.0** —— 待发布（分支 `v0.7.1`，14 个提交待合并；四处版本号已升到 0.8.0，只差打包与上架）。v0.8.0 更新清单（词典合并 · 侧栏喇叭 · 三项修复）：**词典返回页只剩一张卡**——`searchService.lookupWord` 返回**合并后的字段树**（`DictionaryField.source` 由 `lib/dictMerge.mergeSources` 盖、两个 parser 不写），同词性合流复用 `mergeEntryFields`（两侧 `POS_DISPLAY` 早已对齐），**逐字重复的英文释义只留 WordNet 那条**（判等走 `normalizeEnglishDef`：剥引号例句段/词性前缀/括号补充/标点后比较，**不做模糊匹配**）；**`dictionaries` 开关与设置页「词典」分区删除**，persist **8→9** 且 `migrateSettings` 显式剔除该键（zustand 的 merge 从不删键，只有 migrate 能删）；卡片不再自带添加按钮，**「合并添加 · N 项」只留导航条一个**，与熟悉度三键同行；**卡片头右侧的整卡折叠三角删除**（整卡折叠态一并删净，折叠只剩词性组维度），「全部收起/展开」独占右端；来源从卡片表头降为行尾 `·ec` / `·wn` 小标记；**「＋ 选择分类后添加」经 `addWord/ensureWord` 的 `skipDefaultCategory` 不再额外落默认分类**（默认分类在 `addWord` 内部就已写库，故开关必须在 `ensureWord` 之前决定）；今日复习**空态判据改为 `getOverview().deliverable`**（`todayQueue` 过完额度与卡级闸门后的长度），`total` 仍是到期积压、**不得**再接到空态上（新卡没有 `due_at`，走不到 `getStrategyCounts` 的到期集）；侧栏展开态行 1 加发音喇叭（`SpeakButton`，size 14）：外层 span **吞掉 click/keydown 且不转交**行 `onClick`——与 CheckBox 那层「吞掉再转交」相反，点喇叭不得切换当前词条；**零 Rust 改动、零 schema 改动、词典库不重建**。

> **上一版**：v0.7.0（托盘常驻 · 单实例 · 配置文件 · TTS 音色 · 平台权限）：**关窗不再退出，进程常驻托盘**——新增 `tray.rs`（`tray-icon` feature + 平台 `#![cfg(all(desktop, not(debug_assertions)))]` 单实例插件，仅 release 生效以免挡住 `tauri dev`），`CloseRequested` 分流由纯函数 `close_action(close_dialog_seen, close_to_tray)` 判定（首次一律 `Ask`，`prevent_close()` + emit `close-requested`，前端双按钮弹窗两个按钮**都是肯定动作**，故 `confirm()` 的布尔返回值映射为 `true`=最小化到托盘 / `false`=直接退出，且**必须** `dismissable: false`——遮罩点击会 resolve(false) 即等于退出）；退出只能走托盘菜单。**托盘数字是菜单行与 tooltip，不是图标角标**（Windows 无角标 API，`tiny-skia` 整条舍去），`badge_text`/`tooltip_text`/`should_update`/`shows_due_row` 皆为纯函数便于单测；数据源是 `DueBadge` 无条件上报的同一个 `n`（**刻意不受标题栏徽标开关门控**，否则关掉徽标会连托盘数字一起停更）。**`config.rs` 的 `shortcuts.json`** 承载「Rust 需同步读取」的配置（两个开关 + `tts.voice`/`tts.rate`）——判据是 localStorage 读不到；不变量两条：**未知键必须保留**（只深合并已知叶子）、**先落盘再更新缓存**（写失败则缓存停在旧值）；`set_patch` 持**一把** `CACHE` 锁跨越读-合并-写-更新（分两把会丢更新），锁序 `CACHE`→`CONFIG_PATH` 与 `init` 一致；损坏文件备份为 `.bak` 并回落默认值、**第二次损坏不覆盖第一次的备份**。**设置改完必须 `sync_tray`**，否则两个开关要重启才生效（`setConfig` 本身不碰托盘），且不能与写盘并行。**TTS 音色可选**（Windows SAPI 枚举英文音色，`VoiceInfo{name, language}`），`speak` 签名加 `voice`；`APPLIED_VOICE`/`PROBE_VOICE` 两个 static 拆开——选 `null`（「系统默认」）要**真的恢复探测选中的音色**而非保持引擎现状，纯函数 `voice_target(want, applied, probe)` 判定；`sapi_token_id` 查不到就**报错**而非静默换音色。**macOS 平台权限分区**（`platform.rs`，`AXIsProcessTrusted` + 辅助功能深链）。`SCHEMA_VERSION` 维持 6，**无任何表结构变化，升级无损**；复习调度与计分、侧边栏、词典页一律未动。

> **更早**：v0.6.5（复习卡换代 · 侧栏批量与四视图）：**`review_cards` 从「一词一卡」改为「词 × 题型」**——`template` 列 + `UNIQUE(word_id, template)`，`SCHEMA_VERSION` 5→6，形状守卫检测到旧形状即**丢弃并重建**这三张复习表（**不写迁移**，词库 `words`/`field_values`/`categories` 一个不动；这是本版唯一的有损步骤）。注册改为一词 × 一可用题型各建一张卡（多行 `INSERT OR IGNORE` 合批，**不是**每卡一次 `execute`——SQLite 变量上限 32766，逐卡行喂占位符会让大词库的 overlay 与直方图**静默全空**）。运行时题型选择器整套删除（`pickTemplate` / `last_template` 三处写入 / `getCardMeta` / `setLastTemplate` 及两个词级内容闸门），题型改由卡承载，可出题性由新增的**卡级** `cardPresentable` 判定；听辨题受 TTS 门控经 `allowListen` 透传到**两个**调用点（`getWordReviewOverlay` 与 `getStrategyCounts`），漏一个就会让 chip 与今日计数分家。组卷改「每词每轮至多一张卡 + 新词额度按词算」。**词级记忆强度取最弱一环**（`MIN(stability)`，且只算仍可出题的卡；`MAX(lapses)` **刻意不过滤**——Leech 是历史维度），`weakestStability` 由此首次有生产消费方；overlay / 直方图 / 薄弱词三处聚合读**共用同一份折叠**（`foldWordReadings`），掩码查询必须按**去重后的词 id** 喂占位符。侧栏**选择模式与批量条**（逐行勾选、Shift 范围选、全选 / 清空；批量加入分类 / 从分类移除 / 删除，选择集运算抽成 `lib/selection.ts` 纯函数；工具条两行化，收起态不再裁功能）；侧栏顶部**四个固定智能视图**（完整词库 / 复习到期 / 本周新增 / 顽固词）+ 设置页逐项开关（`persist` version 7→8 带 `migrateSettings`，**注意升版的真正理由是不升版时 `migrate` 不跑**，而 zustand 默认 merge 不会把缺键变成 `undefined`）。词典返回页：熟悉度三键移进导航条、删掉底部收录区、两个「添加」各拆成主按钮 + 「＋」分类下拉（**本版唯一新能力：词已在库也能直接归类**）。分类管理页的批量加入 / 移出（加入方向候选**排除已在该分类的词**）。下拉浮层统一为 `position: fixed` + 锚点元素 + 纯函数 `popoverPosition` 落位（旧 `absolute` + `position: relative` 空壳会被词条卡的 `overflow: hidden` 整块裁掉，且那个 `minWidth: 220` 空壳正是「＋ 没右对齐」的成因）。`CheckBox` 内块改用盒内阴影绘制、控件内不再有第二个布局盒子（布局盒子会被按设备像素取整，非整数缩放下色块偏向一侧）。不改 FSRS 参数、`rateCard` 事务与计分口径。

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
