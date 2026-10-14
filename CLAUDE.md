# Wordsett

Personal vocabulary knowledge management desktop app.
Tauri 2 + React + TypeScript + SQLite.

> **Status: v0.7.2** —— 开发分支 `v0.7.2`，**尚未合并到 `main`**（本地 merge 与 push 由用户亲自执行）；三处版本号（`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`）已升到 0.7.2，**`latest.json` 刻意不动**——它不是版本号的**输入**，是发布时由 `scripts/write-latest-json.mjs` 读 `package.json` 的 version 拼出下载 URL、再读已签安装产物的**真实签名**生成的**输出**，停在 0.7.1 是正确的（它描述**上一次已发布**版本；手工改 version 会造出三处自相矛盾的清单，改 url 更会让已装用户的更新器去下一个尚不存在的产物）。v0.7.2 更新清单（设计语言底座 · 复习三项修复 · 两页重设计）：**五档面与新墨**——`src/styles/tokens.css` 是全站唯一颜色出处（无 `@theme`）：`--color-chrome` / `--color-surface-sunken` / `--color-canvas` / `--color-surface` / `--color-surface-raised` / `--color-surface-hover`，七档收敛成五档、靠明度分层不靠投影；二级/三级文字压深（`#57514A` / `#767064`）；**全站只剩 `--shadow-overlay` 一个阴影（只给浮层）**，`--shadow-soft` / `--shadow-raised` 名字保留但消费点已全部摘除（`tokens.test.ts` 钉住这两个名字不得删）；动效只剩一档——`background-color` / `color` 90ms `linear`（`--duration-*` 全并到 90ms、`--ease-*` 全并到 `linear`，删掉 250/400ms 与 out-back 缓动、按压位移与缩放）。**字体三族随包**（`src/styles/fonts.css`，都是 OFL、见 `public/fonts/OFL.txt`）：Literata（`--font-serif`）/ IBM Plex Sans（`--font-sans`）/ Noto Sans SC（中文，可变字体 `font-weight: 100 900`）；每个 `@font-face` 的 `src` 都以 `local()` 打头（装了同名字体的机器吃系统的）、带 `font-display: swap`；实测体积拉丁 131.3 KB、中文 7,780,420 B（7.42 MiB）；**`--font-mono` 保留为 token 但装饰性消费已终止**（`.stat-num` 由等宽改 `--font-sans` + `font-variant-numeric: tabular-nums`，35 个调用点零改动），等宽只留给真正的代码/路径。**复习三项修复**：①「正确答案」取值抽成纯函数 `correctAnswerText(card)`（认读题取 `answer.translation`、其余四题取 `answer.lemma`，各带兜底）；②**客观正误在提交时落进记账**——`AnsweredEntry.correct?: boolean | null`，`answerCurrent(rating, input, skipped, correct)` 由 `ReviewArena.handleRate` 传本次判分结论；**`correct` 是正误的唯一来源、`rating` 只管排期，两者刻意解耦**（`roundSummary` / `templateAccuracy` 的正确率分母改成「有客观结论的条数」`judgedCount`，**跳过与取不到判分目标落 `null`、不进分母**）；③**五种题型一律有客观结论**——`autoGrades` 改为「键入型即判分」（`inputKindFor === 'typed'`），**中译英 / 英文释义也判**（这**推翻** v0.6.4 的「中译英 / 英文释义不判分」；旧路径拿 `rating >= 3` 反推正误，会把「答对但选了模糊」显示成错）；键入型一律对 `typedTarget`（`answer.lemma`）走 `compareTyped`，取不到目标（lemma 空）返回 `null` 显示「—」**绝不退化成「错」**。复盘块 `ResultBlock` 改三栏（你的作答 / 正确答案 / 正误，`grid-template-columns: repeat(3, minmax(0, 1fr))`——`minmax(0,1fr)` 不可省，否则长中文释义会把格子顶宽、整页横向溢出）；结算明细表改六列（单词 / 题型 / 你的作答 / 正确答案 / 正误 / 记忆评分），正误列读 `entry.correct` 不再由 `rating` 反推；控制台的历史指标 `correctCount` **改名「记得率」**（读的是 `review_logs.rating`，日志没有客观结论列、判不出对错，故量的是记忆程度 `rating >= 3`；结算页那个「正确率」才是客观正误，两者刻意分开）；用户可见文案「小结」一律改「结算」（队尾按钮「查看结算」、回看态同名）。**侧栏更密、顽固词挪到行首右上角**：`SIDEBAR_ROW_HEIGHT` 76 → **49**（设计稿的 44 到不了——扣掉内边距 12 与行距 2 只剩 34 摊给两行文字，取 §7 逃生舱的近中值 49；**虚拟列表的估算高度必须引用这个常量**，否则滚动条与 `scrollToIndex` 吸附位置会漂），行 2 字号与分类胶囊一并收小，hover 的 `translateX(2px)` 位移删除（动效只剩底色）；`LeechBadge` 加 `compact` 形态（行 1 右端一个 6px 砖红方块、`marginLeft:auto`），与行 2 的分类胶囊不再抢位置。**三处通栏导航条**统一成 32px（`NAV_HEIGHT`）、控件 22px（`NAV_CONTROL_HEIGHT`），常量收进 `src/lib/layout.ts`（同文件还有 `ENTRY_COLUMN_PADDING` / `ENTRY_BAND_WIDTH` 900 / `ENTRY_MEASURE` 660）。**五个展示单元收进 `src/components/entry/`**：`EntryBand` / `SenseFlow` / `FlowRow` / `SourceMark`（含 `SourceBar` 左条）/ `RowActions`——工作区与搜索返回页共用 `EntryBand` / `SenseFlow` / `FlowRow`；`SourceMark` 方点与 `RowActions` 行尾簇是工作区私有（返回页保留行尾 `·ec` / `·wn` 文字标与勾选框）。**增删收敛成行尾操作簇**：`＋` 加到本行所在容器、`⋯` 菜单为「编辑 / 添加同级 / 删除」（普通与编者同一套，先前编者模式单露红桶），子类型的选择落在 `＋` 打开的 `AddMenu`（页级含「新建标签页 / 词根 / 音标」，行级只含该容器可加的子类型）；页级添加是正文流末尾一个中性按钮。**蓝色收窄三条规则**：蓝＝状态（选中 / 激活 / 当前 / 焦点 / 落点 / 正在编辑）；蓝不做按钮底、不做通用「可点」提示（可点靠位置与文案）；蓝不做内容数据标记。**两条不变量**：① `AnsweredEntry.correct`（在 `handleRate` 落账）是正误的唯一来源，`rating` 只管排期，二者不得互相折算；② **行尾操作簇必须常驻占位、只用 `opacity` 显隐，绝不可条件渲染**（控件进出 DOM 会让该行可用宽度骤减、值文本重新折行、鼠标在行间上下移动时来回弹——这是 v0.5.2 修 hover 折行抖动时定下的做法，`WordWorkbench.test.ts` 用源码形状守卫钉住）。**零 Rust 改动、零 schema 改动**（`SCHEMA_VERSION` 维持 6；`AnsweredEntry.correct` 是内存态、store 不持久化），词典库不重建。**待验证（本版尚未做）**：全应用视觉过一遍、规格 §10 的 13 条人工验收、安装包体积与首屏字体解码测量、700 字重是否随包（当前只随包 400/500/600，`--weight-bold` 的消费点会落到合成粗体或最近一档）。

> **上一版**：v0.7.1（词典合并 · 侧栏喇叭 · 三项修复；**已于 2026-10-07 发布，Windows NSIS + macOS**，误升成 0.8.0 的那批作废）：**词典返回页只剩一张卡**——`searchService.lookupWord` 返回**合并后的字段树**（`DictionaryField.source` 由 `lib/dictMerge.mergeSources` 盖、两个 parser 不写），同词性合流复用 `mergeEntryFields`（两侧 `POS_DISPLAY` 早已对齐），**逐字重复的英文释义只留 WordNet 那条**（判等走 `normalizeEnglishDef`：剥引号例句段/词性前缀/括号补充/标点后比较，**不做模糊匹配**）；**`dictionaries` 开关与设置页「词典」分区删除**，persist **8→9** 且 `migrateSettings` 显式剔除该键（zustand 的 merge 从不删键，只有 migrate 能删）；卡片不再自带添加按钮，**「合并添加 · N 项」只留导航条一个**，与熟悉度三键同行；**卡片头右侧的整卡折叠三角删除**（整卡折叠态一并删净，折叠只剩词性组维度），「全部收起/展开」独占右端；来源从卡片表头降为行尾 `·ec` / `·wn` 小标记；**「＋ 选择分类后添加」经 `addWord/ensureWord` 的 `skipDefaultCategory` 不再额外落默认分类**（默认分类在 `addWord` 内部就已写库，故开关必须在 `ensureWord` 之前决定）；今日复习**空态判据改为 `getOverview().deliverable`**（`todayQueue` 过完额度与卡级闸门后的长度），`total` 仍是到期积压、**不得**再接到空态上（新卡没有 `due_at`，走不到 `getStrategyCounts` 的到期集）；侧栏展开态行 1 加发音喇叭（`SpeakButton`，size 14）：外层 span **吞掉 click/keydown 且不转交**行 `onClick`——与 CheckBox 那层「吞掉再转交」相反，点喇叭不得切换当前词条；**零 Rust 改动、零 schema 改动、词典库不重建**。

> **更早**：v0.7.0（托盘常驻 · 单实例 · 配置文件 · TTS 音色 · 平台权限）：**关窗不再退出，进程常驻托盘**——新增 `tray.rs`（`tray-icon` feature + 平台 `#![cfg(all(desktop, not(debug_assertions)))]` 单实例插件，仅 release 生效以免挡住 `tauri dev`），`CloseRequested` 分流由纯函数 `close_action(close_dialog_seen, close_to_tray)` 判定（首次一律 `Ask`，`prevent_close()` + emit `close-requested`，前端双按钮弹窗两个按钮**都是肯定动作**，故 `confirm()` 的布尔返回值映射为 `true`=最小化到托盘 / `false`=直接退出，且**必须** `dismissable: false`——遮罩点击会 resolve(false) 即等于退出）；退出只能走托盘菜单。**托盘数字是菜单行与 tooltip，不是图标角标**（Windows 无角标 API，`tiny-skia` 整条舍去），`badge_text`/`tooltip_text`/`should_update`/`shows_due_row` 皆为纯函数便于单测；数据源是 `DueBadge` 无条件上报的同一个 `n`（**刻意不受标题栏徽标开关门控**，否则关掉徽标会连托盘数字一起停更）。**`config.rs` 的 `shortcuts.json`** 承载「Rust 需同步读取」的配置（两个开关 + `tts.voice`/`tts.rate`）——判据是 localStorage 读不到；不变量两条：**未知键必须保留**（只深合并已知叶子）、**先落盘再更新缓存**（写失败则缓存停在旧值）；`set_patch` 持**一把** `CACHE` 锁跨越读-合并-写-更新（分两把会丢更新），锁序 `CACHE`→`CONFIG_PATH` 与 `init` 一致；损坏文件备份为 `.bak` 并回落默认值、**第二次损坏不覆盖第一次的备份**。**设置改完必须 `sync_tray`**，否则两个开关要重启才生效（`setConfig` 本身不碰托盘），且不能与写盘并行。**TTS 音色可选**（Windows SAPI 枚举英文音色，`VoiceInfo{name, language}`），`speak` 签名加 `voice`；`APPLIED_VOICE`/`PROBE_VOICE` 两个 static 拆开——选 `null`（「系统默认」）要**真的恢复探测选中的音色**而非保持引擎现状，纯函数 `voice_target(want, applied, probe)` 判定；`sapi_token_id` 查不到就**报错**而非静默换音色。**macOS 平台权限分区**（`platform.rs`，`AXIsProcessTrusted` + 辅助功能深链）。`SCHEMA_VERSION` 维持 6，**无任何表结构变化，升级无损**；复习调度与计分、侧边栏、词典页一律未动。

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
