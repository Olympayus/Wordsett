# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **Status: v0.7.0** — 待发布（分支 `v0.7.0`，18 个提交待合并）。v0.7.0 更新清单（托盘常驻 · 单实例 · 配置文件 · TTS 音色 · 平台权限）：**关窗不再退出，进程常驻托盘**——新增 `tray.rs`（`tray-icon` feature + 平台 `#![cfg(all(desktop, not(debug_assertions)))]` 单实例插件，仅 release 生效以免挡住 `tauri dev`），`CloseRequested` 分流由纯函数 `close_action(close_dialog_seen, close_to_tray)` 判定（首次一律 `Ask`，`prevent_close()` + emit `close-requested`，前端双按钮弹窗两个按钮**都是肯定动作**，故 `confirm()` 的布尔返回值映射为 `true`=最小化到托盘 / `false`=直接退出，且**必须** `dismissable: false`——遮罩点击会 resolve(false) 即等于退出）；退出只能走托盘菜单。**托盘数字是菜单行与 tooltip，不是图标角标**（Windows 无角标 API，`tiny-skia` 整条舍去），`badge_text`/`tooltip_text`/`should_update`/`shows_due_row` 皆为纯函数便于单测；数据源是 `DueBadge` 无条件上报的同一个 `n`（**刻意不受标题栏徽标开关门控**，否则关掉徽标会连托盘数字一起停更）。**`config.rs` 的 `shortcuts.json`** 承载「Rust 需同步读取」的配置（两个开关 + `tts.voice`/`tts.rate`）——判据是 localStorage 读不到；不变量两条：**未知键必须保留**（只深合并已知叶子）、**先落盘再更新缓存**（写失败则缓存停在旧值）；`set_patch` 持**一把** `CACHE` 锁跨越读-合并-写-更新（分两把会丢更新），锁序 `CACHE`→`CONFIG_PATH` 与 `init` 一致；损坏文件备份为 `.bak` 并回落默认值、**第二次损坏不覆盖第一次的备份**。**设置改完必须 `sync_tray`**，否则两个开关要重启才生效（`setConfig` 本身不碰托盘），且不能与写盘并行。**TTS 音色可选**（Windows SAPI 枚举英文音色，`VoiceInfo{name, language}`），`speak` 签名加 `voice`；`APPLIED_VOICE`/`PROBE_VOICE` 两个 static 拆开——选 `null`（「系统默认」）要**真的恢复探测选中的音色**而非保持引擎现状，纯函数 `voice_target(want, applied, probe)` 判定；`sapi_token_id` 查不到就**报错**而非静默换音色。**macOS 平台权限分区**（`platform.rs`，`AXIsProcessTrusted` + 辅助功能深链）。`SCHEMA_VERSION` 维持 6，**无任何表结构变化，升级无损**；复习调度与计分、侧边栏、词典页一律未动。

> **上一版**：v0.6.5（复习卡换代 · 侧栏批量与四视图）：**`review_cards` 从「一词一卡」改为「词 × 题型」**——`template` 列 + `UNIQUE(word_id, template)`，`SCHEMA_VERSION` 5→6，形状守卫检测到旧形状即**丢弃并重建**这三张复习表（**不写迁移**，词库 `words`/`field_values`/`categories` 一个不动；这是本版唯一的有损步骤）。注册改为一词 × 一可用题型各建一张卡（多行 `INSERT OR IGNORE` 合批，**不是**每卡一次 `execute`——SQLite 变量上限 32766，逐卡行喂占位符会让大词库的 overlay 与直方图**静默全空**）。运行时题型选择器整套删除（`pickTemplate` / `last_template` 三处写入 / `getCardMeta` / `setLastTemplate` 及两个词级内容闸门），题型改由卡承载，可出题性由新增的**卡级** `cardPresentable` 判定；听辨题受 TTS 门控经 `allowListen` 透传到**两个**调用点（`getWordReviewOverlay` 与 `getStrategyCounts`），漏一个就会让 chip 与今日计数分家。组卷改「每词每轮至多一张卡 + 新词额度按词算」。**词级记忆强度取最弱一环**（`MIN(stability)`，且只算仍可出题的卡；`MAX(lapses)` **刻意不过滤**——Leech 是历史维度），`weakestStability` 由此首次有生产消费方；overlay / 直方图 / 薄弱词三处聚合读**共用同一份折叠**（`foldWordReadings`），掩码查询必须按**去重后的词 id** 喂占位符。侧栏**选择模式与批量条**（逐行勾选、Shift 范围选、全选 / 清空；批量加入分类 / 从分类移除 / 删除，选择集运算抽成 `lib/selection.ts` 纯函数；工具条两行化，收起态不再裁功能）；侧栏顶部**四个固定智能视图**（完整词库 / 复习到期 / 本周新增 / 顽固词）+ 设置页逐项开关（`persist` version 7→8 带 `migrateSettings`，**注意升版的真正理由是不升版时 `migrate` 不跑**，而 zustand 默认 merge 不会把缺键变成 `undefined`）。词典返回页：熟悉度三键移进导航条、删掉底部收录区、两个「添加」各拆成主按钮 + 「＋」分类下拉（**本版唯一新能力：词已在库也能直接归类**）。分类管理页的批量加入 / 移出（加入方向候选**排除已在该分类的词**）。下拉浮层统一为 `position: fixed` + 锚点元素 + 纯函数 `popoverPosition` 落位（旧 `absolute` + `position: relative` 空壳会被词条卡的 `overflow: hidden` 整块裁掉，且那个 `minWidth: 220` 空壳正是「＋ 没右对齐」的成因）。`CheckBox` 内块改用盒内阴影绘制、控件内不再有第二个布局盒子（布局盒子会被按设备像素取整，非整数缩放下色块偏向一侧）。不改 FSRS 参数、`rateCard` 事务与计分口径。

> **更早**：v0.6.4（初始熟悉度接通链路 · 复习细节修复）：**初始熟悉度升为词条级内置字段**（`initial_familiarity`，displayOrder 23），原卡级列废弃（`review_cards.initial_familiarity` 保留在建表语句里只为新老库结构一致，代码不读不写；老库残留列无害，不做 DROP COLUMN——本仓无一次性迁移机制，为一个从无写入方的死列引入机制是负收益）。DB schema 进位 v4→5，但这是**书签不是迁移**：本版只新增一个内置字段，字段种子走 `seedFieldDefinitionsSQL()` 的 `INSERT OR IGNORE`、每次启动无条件执行，不进位功能完全等价；进位只为让「本版动过 schema」在 `pragma_user_version` 上留痕。**不要**因为看到进位就去找迁移代码。取数侧 `getWordReviewOverlay` 改锚 `words`（原锚 `review_cards`，而卡片只由 `registerAllWords()` 在打开复习模块时惰性创建，收录时不建卡 spec D3）——锚错表导致每个刚收录的词都不在结果里、chip 一律落回档 1；写入侧收录面板（`FamiliarityChoice`）与卡片级「＋ 添加此词典」两处都写，**仅词不在库时写**（在库词走 `if (!wordWasInLibrary)` 守卫，否则会把用户当初选的「眼熟」静默覆写成「完全陌生」）；两处写完都 `loadOverlay()` 刷新（fire-and-forget，刻意不挂进 `wordStore` 以免两个 store 重新耦合），所以选完「眼熟」到工作台**无需重启**即显档 2。首评三键按初始熟悉度预填**视觉默认态**（高亮但不抢焦点，Tab 不落在被高亮的那颗上）。词条卡新增**记忆强度 chip**（仅词条卡词头右侧，6 档色板 `MASTERY_COLORS` 为唯一出处，`MASTERY_BLOCKS = 5` 决定色块数）——记忆强度由 5 档改为 6 档，`getStats` 的分桶循环必须传**原始 stability** 而非已算好的 mastery（传后者会让每个词都落进档 1 且完全静默），分布图坐标轴端点改由 `MASTERY_TIER_NAMES[0]/[5]` 派生（原先硬编码的旧 5 档词汇在 6 段色带下 index 错位，正是本版要消灭的图表/chip 词汇漂移）。**顽固词徽标**（`LeechBadge`，词表行尾 + 词条卡头部，`--color-leech #A8554E`，`isLeech` 阈值 ≤ 0 视为关；词表右侧胶囊簇原被 `{categories.length > 0 && ...}` 门控，徽标放进去则无分类的顽固词永远显不出，故拓宽为 `categories.length > 0 || isLeechRow`）。**英文释义题由唯一「揭示型」改为键入型**（`inputKindFor` 五模板全枚举，`typedTarget` 派生自它且返回 `undefined` 而非空串，`autoGrades` 只排除 recall 与 english_def——英释义**不自动判分**，逐字母标红后直接出三键）。**「跳过」误判修复**：此前由空串反推（跳过与未作答都是 `input === ''`），改为显式标记 `skipped`；`isSkipped` 入参收窄为 `{ skipped?: boolean }`、`answerDisplay` 委托之，两处判据不重复。`CheckBox` 全局 22px → 18px（内块与圆角同比例）。不改调度与计分（FSRS 参数、`rateCard` 事务、`rating >= 3` 口径一律未动）。

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
