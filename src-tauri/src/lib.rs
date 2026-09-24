use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![dict_resource_path, open_data_dir])
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

#[cfg(test)]
mod tests {
    use super::to_loadable_path;
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
}
