mod config;
mod dictionaries;
mod orientation;
mod platform;
// 全局热键的纯逻辑（v0.7.9 划词收录）：校验 / 平台默认值 / 改键回滚。
// **无条件编译**——宿主机 `cargo test` 要能跑这些纯函数；真实注册与抓取流水线
// 在 Task 6 接入，那一段会整段 `#[cfg(desktop)]`，Android 构建碰不到插件。
mod shortcut;
// 划词收录（v0.7.9）：选区清洗 / 模式判定 / 抓取结果契约与 5 条诊断日志（Task 2）。
// 纯逻辑、不碰平台 API，但整条流水线只服务桌面全局热键（手机没有这个概念），
// 故与 `tray` 一样按 desktop 门控——Android 构建里不存在这两个模块，
// 命令表也因此不必改（Task 6 才接命令，且只进桌面那一份）。
#[cfg(desktop)]
mod grab;
#[cfg(desktop)]
mod selection;
// 状态栏 / 手势条图标跟随应用主题（v0.7.8 Task 9）。非 Android 端命令为空操作，
// 但模块本身永远参与编译（宿主机 `cargo test` 要能跑 `should_use_light_icons`）。
mod system_bars;
// 托盘是桌面专属：`tauri::tray` / `tauri::menu` 在 Tauri 里就是 `#[cfg(all(desktop, …))]`，
// Android 上这两个模块根本不存在（tauri-2.11.5 src/lib.rs:102-114），整模块必须一起门掉，
// 否则手机端 `cargo build` 在 `use tauri::tray::…` 处直接失败。
// 手机外壳用 `destroy()` 退出，不走「关窗 → 最小化到托盘」那条分流。
#[cfg(desktop)]
mod tray;
// TTS 桥的 JSON 解析（Task 13）。**永远参与编译**：安卓专属的 `tts_android.rs` 在宿主机上
// 编不到，解析若跟着它一起 cfg 掉，这条跨语言契约在本环境就一条测试都跑不了。
mod tts_bridge;
// TTS 按平台换实现：桌面用系统引擎（Windows SAPI5 回退 / macOS 原生），Android 走
// Kotlin 桥 + Rust 轮询，其余手机平台（iOS）仍是占位。纯换模块而不动命令表——
// 三个 `.rs` 导出同名命令与同名数据结构，`generate_handler!` 的两份列表因此逐字相同。
// 手机为什么编不了 `tts`：它的 Android 后端要 `rs/tts/Bridge` 与 `ndk_context` 初始化，
// 本仓库锁定的 tao 0.35 两样都没有，`Tts::default()` 会 panic 并 abort 进程
// （前端在所有平台启动时都会探测一次 TTS）。
#[cfg(not(mobile))]
mod tts_player;
#[cfg(all(mobile, target_os = "android"))]
#[path = "tts_android.rs"]
mod tts_player;
#[cfg(all(mobile, not(target_os = "android")))]
#[path = "tts_stub.rs"]
mod tts_player;

#[cfg(desktop)]
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;
#[cfg(desktop)]
use tauri::Emitter;
#[cfg(desktop)]
use tray::{close_action, CloseAction};
use tts_player::{list_english_voices, speak, tts_english_voice_available};

/// 退出旁路：`quit_app` 置位后才允许进程真正退出（v0.7.8 Task 8）。
///
/// 用户发起的退出（托盘「退出」、Cmd+Q、关窗分流里的「直接退出」）一律先 emit
/// `quit-requested`，由前端过一遍未保存确认（editGuard）再回调 `quit_app`。
/// 没有这个旁路，`quit_app` 里的 `app.exit(0)` 会再次命中下面的 `ExitRequested`
/// 拦截，变成「确认 → 退出被拦 → 再确认」的死循环。
#[cfg(desktop)]
static QUIT_BYPASS: AtomicBool = AtomicBool::new(false);

/// 前端确认过未保存修改后，真正退出应用（v0.7.8 Task 8）。
///
/// **先置旁路再 `exit`，顺序不可反**：反了这次退出会被 `ExitRequested` 拦下。
/// 只注册在桌面命令表——手机退出走 `orientation::exit_app`（Activity.finish），
/// 既没有托盘也没有 Cmd+Q。
#[cfg(desktop)]
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    QUIT_BYPASS.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // 单实例必须**最先**注册：插件要抢在其它插件之前接管第二个实例的 argv。
    //
    // 只在 release 构建里注册。`tauri dev` 改 Rust 代码会杀掉旧进程再起新的，
    // 旧的若还没退出，新进程会被这条插件判定为「第二个实例」而立刻退出——
    // 表现是热重载看起来坏了，实际是单实例在正常工作。dev 下不注册，
    // 这条路径的验收放到 release 安装包上做（spec §7 风险 5）。
    #[cfg(all(desktop, not(debug_assertions)))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        show_main_window(app);
    }));

    let builder = builder
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        // 启动期同步读一次 shortcuts.json。app_config_dir 的解析方式与 open_data_dir
        // 保持一致（tauri-plugin-sql 也用同一个目录）。
        .setup(|app| {
            use tauri::path::BaseDirectory;
            let dir = app
                .path()
                .resolve("", BaseDirectory::AppConfig)
                .map_err(|e| e.to_string())?;
            config::init(&dir);

            // 托盘只在桌面存在（见文件头 `mod tray` 的注释）。手机上没有托盘，
            // 也就没有「关窗 → 最小化到托盘」这条分流可言。
            #[cfg(desktop)]
            {
                app.manage(tray::TrayState::default());
                // 托盘建立失败不该拦住启动：常驻开关强制视为关，前端会显示提示条。
                if config::bool_at(&config::get(), "window.close_to_tray", true) {
                    if let Err(e) = tray::init(app.handle()) {
                        eprintln!("[tray] 托盘建立失败，本次不常驻：{e}");
                        let _ = config::set_patch(serde_json::json!({
                            "window": { "close_to_tray": false }
                        }));
                    }
                }
            }
            Ok(())
        });

    // 关窗分流只服务「常驻托盘」：手机外壳用 `destroy()` 退出（`mobileBackButton.ts`），
    // 根本不走 CloseRequested；在这条路径上挂一个「隐藏窗口」的处理只会把应用藏没。
    #[cfg(desktop)]
    let builder = builder.on_window_event(|window, event| {
        if window.label() != "main" {
            return;
        }
        let tauri::WindowEvent::CloseRequested { api, .. } = event else { return };

        let cfg = config::get();
        let action = close_action(
            config::bool_at(&cfg, "window.close_dialog_seen", false),
            config::bool_at(&cfg, "window.close_to_tray", true),
        );

        // 三条去向都要 prevent_close：Ask 要让窗口活到前端弹完窗，
        // Hide 要的是「藏起来」不是「关掉」，Exit 要先让前端确认未保存修改、
        // 再由 `quit_app` 真正退出（放行 close 也会退出，但那条路会再触发一次
        // CloseRequested，绕一圈）。
        api.prevent_close();
        match action {
            CloseAction::Ask => { let _ = window.emit("close-requested", ()); }
            CloseAction::Hide => hide_main_window(window.app_handle()),
            CloseAction::Exit => { let _ = window.emit("quit-requested", ()); }
        }
    });

    // 命令表按平台分两份：托盘那三条命令在 Android 上既没有模块也没有调用点
    // （`update_tray_badge` 被 `useDueCount` 的 UA 判据挡掉），不能出现在手机端的
    // `generate_handler!` 里——`tray` 模块在手机上根本不存在。
    // **加/删命令时两份都要改**；桌面那份是超集。
    // 词典落盘命令：Android 首启必需。桌面 resources 就地直读、永远命中，
    // marker 不成立时复制会因源缺失而返回 Err，不改变桌面行为。
    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![dict_resource_path, dictionaries::ensure_dictionaries, open_data_dir, open_external_url, fsrs_next, speak, list_english_voices, tts_english_voice_available, config::get_config, config::set_config, platform::accessibility_status, platform::open_accessibility_settings, tray::update_tray_badge, tray::resolve_close_request, tray::sync_tray, orientation::set_screen_orientation, orientation::exit_app, system_bars::set_system_bars_theme, quit_app]);
    #[cfg(not(desktop))]
    let builder = builder.invoke_handler(tauri::generate_handler![dict_resource_path, dictionaries::ensure_dictionaries, open_data_dir, open_external_url, fsrs_next, speak, list_english_voices, tts_english_voice_available, config::get_config, config::set_config, platform::accessibility_status, platform::open_accessibility_settings, orientation::set_screen_orientation, orientation::exit_app, system_bars::set_system_bars_theme]);

    builder.build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // 退出请求拦截（v0.7.8 Task 8）：托盘「退出」、Cmd+Q 与关窗分流里的
            // 「直接退出」最终都会走到这里（或先 emit 同一事件）。未置旁路时一律拦下，
            // 交给前端过一遍未保存确认；前端确认后调 `quit_app`，那里会先置旁路再 exit。
            // 手机上没有这条分流（`#[cfg(desktop)]`）：退出走 `exit_app` 的 Activity.finish。
            #[cfg(desktop)]
            if let tauri::RunEvent::ExitRequested { api, code, .. } = &event {
                // 更新器重启（`RESTART_EXIT_CODE`）不是用户发起的退出：放行，不弹未保存确认
                //（v0.7.8 最终评审——否则重启瞬间会闪一次「有未保存的修改」）。
                if *code == Some(tauri::RESTART_EXIT_CODE) {
                    return;
                }
                if !QUIT_BYPASS.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    let _ = app.emit("quit-requested", ());
                }
            }

            // macOS：hide 之后点 Dock 图标 / Cmd+Tab 要能唤回主窗（00 §5）。
            // Reopen 是 macOS 专属变体（tauri/src/app.rs:279），故整臂按 target 门掉。
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_main_window(app);
            }

            // 手机端：上面两条桌面分支都被 cfg 掉，两个参数在这里显式丢弃。
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}

/// 返回词典库绝对路径（剥离 Windows `\\?\` 动词前缀后）。
/// 生产：resources 就地直读（resource_dir = exe 所在目录）。
/// dev：resources 未注入 target/debug，回退 app_config_dir（由 build:dictionaries 填充）。
/// Android：APK 里的 resources 不是普通文件、sqlite 打不开，故首启先落盘到
/// app_data_dir 并由 `ensure_dictionaries` 填好，这里优先返回那份副本。
#[tauri::command]
fn dict_resource_path(app: tauri::AppHandle, name: String) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        return dictionaries::android_dict_path(&app, &name);
    }

    #[cfg(not(target_os = "android"))]
    {
        use tauri::path::BaseDirectory;

        let resource_dir = match app.path().resource_dir() {
            Ok(d) => d,
            Err(e) => return Err(e.to_string()),
        };
        let resource = resource_dir.join(&name);
        if resource.exists() {
            return Ok(to_loadable_path(&resource));
        }
        app.path()
            .resolve(&name, BaseDirectory::AppConfig)
            .map(|p| to_loadable_path(&p))
            .map_err(|e| e.to_string())
    }
}

/// 把路径转为可被 sqlx 解析的形态：剥离 Windows 扩展长度（动词）前缀 `\\?\`。
/// 若不剥离，`sqlite:\\?\E:\...` 中 `\\?\` 的 `?` 会被 sqlx 当作连接串查询参数分隔符，
/// 路径被从中截断而解析失败（报「unknown query parameter」）。
fn to_loadable_path(path: &std::path::Path) -> String {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        if let Some(unc) = rest.strip_prefix(r"UNC\") {
            format!(r"\\{unc}")
        } else {
            rest.to_string()
        }
    } else {
        s.into_owned()
    }
}

/// 显示并聚焦主窗。
///
/// 幂等：窗口已可见时重复调用只多做一次 set_focus，不报错。
/// `unminimize` 要在 `show` **之前**——最小化的窗口只 `show` 不会还原，
/// 看起来像「点了没反应」（Review Focus 5）。
///
/// 只编译在桌面：调用点（单实例、macOS Reopen、关窗到托盘）全是桌面路径。
#[cfg(desktop)]
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.emit("main-window-shown", ());
    }
}

/// 隐藏主窗并通知前端补刷一次托盘数字。
///
/// 补刷的必要性：窗口一旦不可见，webview 的 60s 轮询可能被系统节流，
/// 数字会停在隐藏前那一刻。show / hide 两个方向都发同一个事件，前端收到即重算。
///
/// 只编译在桌面：唯一调用点是「关窗到托盘」（手机端没有托盘，见文件头 `mod tray`）。
#[cfg(desktop)]
fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
        let _ = w.emit("main-window-shown", ());
    }
}

/// 在系统文件管理器中打开本地数据目录并选中 wordsett.db（v0.5.3 §4.2）。
/// 数据库由 tauri-plugin-sql 以 `sqlite:wordsett.db` 相对标识创建：
/// 该插件（wrapper.rs）取 app_config_dir 后拼上标识剩余部分，故此处解析同一目录以保持一致。
#[tauri::command]
fn open_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::path::BaseDirectory;
    use tauri_plugin_opener::OpenerExt;

    let db = app
        .path()
        .resolve("wordsett.db", BaseDirectory::AppConfig)
        .map_err(|e| e.to_string())?;

    if !db.exists() {
        return Err(format!("数据文件不存在：{}", db.display()));
    }

    app.opener()
        .reveal_item_in_dir(&db)
        .map_err(|e| e.to_string())
}

/// `open_external_url` 的白名单判据（v0.7.8 最终评审）：只放行 GitHub 的 https 链接。
///
/// 前缀必须带结尾斜杠：`https://github.com.evil/` 在 `https://github.com` 处就分叉，
/// 去掉斜杠会把仿冒域名一起放进来。抽成纯函数便于单测。
fn is_github_url(url: &str) -> bool {
    url.starts_with("https://github.com/")
}

/// 用系统浏览器打开外部链接（v0.7.8 手机 / 平板更新）。
///
/// **只放行 GitHub 链接**：这条命令的用途是让用户去 Releases 下载新版 APK，不是通用跳板；
/// 白名单写死在这里，前端不做第二份校验（判定只留一处）。`open_url` 在桌面与 Android 上
/// 都可用（插件已在 `run()` 里注册），失败信息原样回传，由调用方决定怎么提示。
#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    if !is_github_url(&url) {
        return Err("仅允许打开 GitHub 链接".to_string());
    }

    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// FSRS 计算结果的一档：下一记忆状态与下次复习间隔（天）。
/// **字段名是前端契约，不可变**（前端按 camelCase 解析：intervalDays / stability / difficulty）。
/// Tauri 只对命令**参数**做 camelCase 映射，返回值原样经过 serde，故此处显式声明线上格式；
/// 漂移会让前端读到 undefined 并静默写入 NaN（`fsrs_next_serializes_camel_case_fields` 钉住它）。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NextState {
    stability: f32,
    difficulty: f32,
    interval_days: i64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsrsNextResult {
    again: NextState,
    hard: NextState,
    good: NextState,
    easy: NextState,
}

/// FSRS 纯计算：给定当前记忆状态与间隔天数，返回 Again / Hard / Good / Easy 四档的
/// 下一状态与间隔（天）。无 IO——取数与落库都在前端 reviewService。
/// `stability` / `difficulty` 均为 Some 时视为已复习过的卡片；任一为 None 视为首评。
/// `elapsed_days` 为距上次复习的天数（首评为 0），会实质影响结果。
/// `retention` 为期望记忆保留率，省略时取 0.9。
#[tauri::command]
fn fsrs_next(
    stability: Option<f32>,
    difficulty: Option<f32>,
    elapsed_days: u32,
    retention: Option<f32>,
) -> Result<FsrsNextResult, String> {
    use fsrs::{MemoryState, FSRS};

    let fsrs = FSRS::default();
    let state = match (stability, difficulty) {
        (Some(s), Some(d)) => Some(MemoryState {
            stability: s,
            difficulty: d,
        }),
        _ => None,
    };

    // 一次调用即得四档结果。
    let next = fsrs
        .next_states(state, retention.unwrap_or(0.9), elapsed_days)
        .map_err(|e| e.to_string())?;

    let to_next = |item: fsrs::ItemState| NextState {
        stability: item.memory.stability,
        difficulty: item.memory.difficulty,
        interval_days: item.interval.max(1.0).floor() as i64,
    };

    Ok(FsrsNextResult {
        again: to_next(next.again),
        hard: to_next(next.hard),
        good: to_next(next.good),
        easy: to_next(next.easy),
    })
}

#[cfg(test)]
mod tests {
    use super::{fsrs_next, is_github_url, to_loadable_path};
    use std::path::Path;

    #[test]
    fn github_url_whitelist_is_exact_host() {
        assert!(is_github_url("https://github.com/x/y"));
        // 仿冒域名 / 明文 http / 其它站点一律拒绝
        assert!(!is_github_url("https://github.com.evil/"));
        assert!(!is_github_url("http://github.com/"));
        assert!(!is_github_url("https://example.com/"));
    }

    #[test]
    fn strips_verbatim_drive_prefix() {
        assert_eq!(
            to_loadable_path(Path::new(r"\\?\E:\Workspace\Wordsett\wordnet.db")),
            r"E:\Workspace\Wordsett\wordnet.db"
        );
    }

    #[test]
    fn leaves_normal_path_unchanged() {
        assert_eq!(
            to_loadable_path(Path::new(r"E:\Workspace\Wordsett\wordnet.db")),
            r"E:\Workspace\Wordsett\wordnet.db"
        );
    }

    #[test]
    fn strips_verbatim_unc_prefix() {
        assert_eq!(
            to_loadable_path(Path::new(r"\\?\UNC\server\share\wordnet.db")),
            r"\\server\share\wordnet.db"
        );
    }

    #[test]
    fn fsrs_next_returns_four_ratings_with_positive_intervals() {
        let out = fsrs_next(None, None, 3, None).expect("first review should succeed");
        for s in [&out.again, &out.hard, &out.good, &out.easy] {
            assert!(
                s.stability > 0.0,
                "stability must be positive, got {}",
                s.stability
            );
            assert!(
                (1.0..=10.0).contains(&s.difficulty),
                "difficulty out of range: {}",
                s.difficulty
            );
            assert!(s.interval_days >= 1, "interval must be at least 1 day");
        }

        // 评分越高，间隔不应更短
        assert!(out.good.interval_days >= out.hard.interval_days);
        assert!(out.easy.interval_days >= out.good.interval_days);
    }

    #[test]
    fn fsrs_next_accepts_existing_state() {
        let out =
            fsrs_next(Some(12.0), Some(5.0), 1, None).expect("review with state should succeed");
        assert!(out.again.interval_days >= 1);
    }

    /// 跨语言契约：前端读 `intervalDays` / `stability` / `difficulty`。
    /// 这条测试钉住线上格式，防止有人把 `rename_all` 删掉而前端静默写入 NaN。
    #[test]
    fn fsrs_next_serializes_camel_case_fields() {
        let out = fsrs_next(None, None, 0, None).expect("first review should succeed");
        let v = serde_json::to_value(&out).expect("FsrsNextResult 必须可序列化");

        for key in ["again", "hard", "good", "easy"] {
            let s = &v[key];
            assert!(s["intervalDays"].is_i64(), "{key}.intervalDays 缺失或非整数：{s}");
            assert!(
                s["intervalDays"].as_i64().unwrap() >= 1,
                "{key}.intervalDays 必须 ≥ 1：{s}"
            );
            assert!(s["stability"].is_number(), "{key}.stability 缺失或非数值：{s}");
            assert!(s["difficulty"].is_number(), "{key}.difficulty 缺失或非数值：{s}");
            assert!(
                s.get("interval_days").is_none(),
                "{key} 仍带 snake_case 字段，前端会读到 undefined：{s}"
            );
        }
    }
}
