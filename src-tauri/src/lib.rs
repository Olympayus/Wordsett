mod config;
mod platform;
mod tts_player;

use tauri::Manager;
use tts_player::{speak, tts_english_voice_available};

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

    builder
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![dict_resource_path, open_data_dir, fsrs_next, speak, tts_english_voice_available, config::get_config, config::set_config, platform::accessibility_status, platform::open_accessibility_settings])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 返回词典库绝对路径（剥离 Windows `\\?\` 动词前缀后）。
/// 生产：resources 就地直读（resource_dir = exe 所在目录）。
/// dev：resources 未注入 target/debug，回退 app_config_dir（由 build:dictionaries 填充）。
#[tauri::command]
fn dict_resource_path(app: tauri::AppHandle, name: String) -> Result<String, String> {
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
/// 幂等：窗口已可见时重复调用只做一次 set_focus，不报错。`unminimize` 要在
/// `show` **之前**——最小化的窗口只 `show` 不会还原，看起来像「点了没反应」。
// Task 5 的托盘菜单与 macOS `RunEvent::Reopen` 接管这个函数后删掉此属性。
#[allow(dead_code)]
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
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
    use super::{fsrs_next, to_loadable_path};
    use std::path::Path;

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
