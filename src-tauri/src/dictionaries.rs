//! 词典首启落盘（Android 手机外壳，Task 3）。
//!
//! 背景：桌面把 `ecdict.db` / `wordnet.db` 作为 tauri **resources** 随包，运行时
//! `resource_dir()` 就地直读。Android 上这两个文件在 APK 里、`resource_dir()` 指到的
//! 路径不是普通文件，sqlite 打不开，故首启把它们复制到 `{app_data_dir}/dictionaries/`
//! 下再读。`dict_resource_path` 在 Android 上据此优先返回落盘副本。
//!
//! 两条不变量：
//! 1. **marker 只在内容完全匹配时视为有效**——marker 记的是两个源文件的**字节大小**，
//!    与源不一致就重拷。marker 缺失 / 内容不符一律走复制路径，绝不把半份拷贝当就绪。
//! 2. **复制失败不写 marker**——任一步失败直接返回 `Err`，target 保持上一版（或不存在），
//!    且不谎报 ready。这样重试不会因为一个坏 marker 而永久跳过复制。

use std::path::{Path, PathBuf};

use serde::Serialize;

/// 随包词典清单，顺序固定（marker 串按这个顺序拼）。
const DICTIONARIES: [&str; 2] = ["ecdict.db", "wordnet.db"];

/// marker 文件名：`{app_data_dir}/dictionaries/.ready`。
const MARKER_FILE: &str = ".ready";

/// 词典落盘结果。**字段名是前端契约，不可变**（前端按 camelCase 读
/// `ready` / `copied` / `target`；三者都是单词，serde 默认即同名，无需 rename）。
#[derive(Debug, Serialize)]
pub struct DictionaryStatus {
    /// 词典是否已就绪（marker 命中即视为就绪，本次不需要再拷）。
    pub ready: bool,
    /// 本次调用是否真的执行了复制。
    pub copied: bool,
    /// 落盘目录的绝对路径。
    pub target: String,
}

/// marker 内容是否与期望的完全一致。
///
/// 期望串的形状是 `ecdict:{size}|wordnet:{size}`（各源文件的字节大小）。
/// `None` 与任何期望串都不匹配——没有 marker 就是没有 marker。
pub fn marker_matches(marker: Option<&str>, expected: &str) -> bool {
    marker.is_some_and(|m| m == expected)
}

/// 该读哪一份词典：Android 优先数据目录里的落盘副本，桌面直接读 resources。
///
/// `data_copy` 为 `Some` 即表示那份副本存在（判据是文件存在，不是 marker）。
/// 生产消费点只有 `android_dict_path`（同样 Android only），桌面恒走 resources。
#[cfg(target_os = "android")]
pub fn preferable_dict_path(
    is_android: bool,
    data_copy: Option<PathBuf>,
    resource: PathBuf,
) -> PathBuf {
    if is_android {
        data_copy.unwrap_or(resource)
    } else {
        resource
    }
}

/// 源文件（bundle resources）的解析：`resource_dir().join(name)`。
fn source_path(resource_dir: &Path, name: &str) -> PathBuf {
    resource_dir.join(name)
}

/// 期望 marker 串：按 `DICTIONARIES` 顺序取各源文件字节大小拼成
/// `ecdict:99008512|wordnet:40898560`。任一源取不到大小时返回 `Err`——
/// 源文件不在就别假装就绪。
fn expected_marker(resource_dir: &Path) -> Result<String, String> {
    let mut parts = Vec::with_capacity(DICTIONARIES.len());
    for name in DICTIONARIES {
        // marker 记的是**词典名**（去掉 `.db`）与字节大小，形状 `ecdict:99008512`。
        let stem = name.trim_end_matches(".db");
        let size = std::fs::metadata(source_path(resource_dir, name))
            .map_err(|e| format!("词典源文件不可读（{name}）：{e}"))?
            .len();
        parts.push(format!("{stem}:{size}"));
    }
    Ok(parts.join("|"))
}

/// 复制单个文件：先复制到同目录的临时名、成功后再 `rename` 覆盖目标。
///
/// `rename` 在同一文件系统上是原子的，中途失败只会留下 `{name}.db.part`，
/// 不会留下一个「看起来完整」的目标——目标要么是上一版、要么是这一版的完整内容。
fn copy_file(from: &Path, to: &Path) -> Result<(), String> {
    let tmp = to.with_extension("db.part");
    std::fs::copy(from, &tmp).map_err(|e| format!("读取或写入失败：{e}"))?;
    std::fs::rename(&tmp, to).map_err(|e| format!("落盘失败：{e}"))?;
    Ok(())
}

/// 首启落盘：把两份词典从 resources 复制到 `{app_data_dir}/dictionaries/`。
///
/// marker 命中则原样返回 `{ready: true, copied: false}`；否则逐个复制，
/// **全部成功后**才写 marker，返回 `{ready: true, copied: true}`。
/// 任一步失败返回 `Err(错误文案)`，此时不写 marker、也不谎报 ready。
async fn ensure_dictionaries_impl(app: &tauri::AppHandle) -> Result<DictionaryStatus, String> {
    use tauri::Manager;

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let target_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("dictionaries");
    std::fs::create_dir_all(&target_dir).map_err(|e| format!("词典目录建立失败：{e}"))?;

    let expected = expected_marker(&resource_dir)?;
    let marker_path = target_dir.join(MARKER_FILE);
    // marker 缺失 / 不可读一律当「没就绪」处理，落到下面的复制路径。
    let marker = std::fs::read_to_string(&marker_path).ok();

    if marker_matches(marker.as_deref(), &expected) {
        return Ok(DictionaryStatus {
            ready: true,
            copied: false,
            target: target_dir.to_string_lossy().into_owned(),
        });
    }

    for name in DICTIONARIES {
        let from = source_path(&resource_dir, name);
        // 源缺失时立刻失败：不要拷出半份再写 marker。
        if !from.exists() {
            return Err(format!("词典源文件缺失：{}", from.display()));
        }
        copy_file(&from, &target_dir.join(name)).map_err(|e| format!("词典复制失败（{name}）：{e}"))?;
    }

    // 复制全部成功后才写 marker。marker 自身写失败不视为致命（下次会重拷一遍），
    // 但内容永远只在拷贝成功之后出现——这条顺序就是不变量 2 的实现。
    let _ = std::fs::write(&marker_path, &expected);

    Ok(DictionaryStatus {
        ready: true,
        copied: true,
        target: target_dir.to_string_lossy().into_owned(),
    })
}

/// 命令入口，注册见 lib.rs 的 `generate_handler!`。
#[tauri::command]
pub async fn ensure_dictionaries(app: tauri::AppHandle) -> Result<DictionaryStatus, String> {
    ensure_dictionaries_impl(&app).await
}

/// Android 上 `dict_resource_path` 的解析：数据目录副本优先，resources 兜底。
///
/// 桌面（以及 Android 上首启还没跑过、副本尚不存在时）仍走 lib.rs 里原来的
/// resources-then-AppConfig 逻辑。
#[cfg(target_os = "android")]
pub fn android_dict_path(app: &tauri::AppHandle, name: &str) -> Result<String, String> {
    use tauri::Manager;

    let resource = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join(name);
    let data_copy = {
        let p = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("dictionaries")
            .join(name);
        if p.exists() {
            Some(p)
        } else {
            None
        }
    };
    Ok(super::to_loadable_path(&preferable_dict_path(
        true, data_copy, resource,
    )))
}

#[cfg(test)]
mod tests {
    use super::marker_matches;

    /// 跨语言契约：前端按 camelCase 读 `ready` / `copied` / `target`。
    /// 三个字段都是单词、serde 默认即同名，这条钉住没人手痒去加 `rename_all` 之外的东西。
    #[test]
    fn status_serializes_plain_field_names() {
        let s = super::DictionaryStatus {
            ready: true,
            copied: false,
            target: "/data/dictionaries".to_string(),
        };
        let v = serde_json::to_value(&s).expect("必须可序列化");
        assert_eq!(v["ready"], serde_json::json!(true));
        assert_eq!(v["copied"], serde_json::json!(false));
        assert_eq!(v["target"], serde_json::json!("/data/dictionaries"));
    }

    #[test]
    fn marker_only_matches_identical_version() {
        assert!(
            marker_matches(
                Some("ecdict:99008512|wordnet:40898560"),
                "ecdict:99008512|wordnet:40898560"
            )
        );
        assert!(!marker_matches(Some("old"), "new"));
        assert!(!marker_matches(None, "new"));
    }

    /// 生产消费点在 `android_dict_path`（Android only），这里钉住同一判据：
    /// Android + 副本存在 → 副本；Android + 副本不存在 → resources；桌面 → resources。
    ///
    /// 与 `android_dict_path` 同在 `#[cfg(target_os = "android")]` 下：本机（Windows）
    /// 跑不到这条断言，但 CI 的 Android target 会跑；两者必须同步 cfg，否则测试
    /// 在非 Android 上引用一个被 cfg 掉的函数、直接编译失败。
    #[test]
    #[cfg(target_os = "android")]
    fn android_prefers_data_copy_when_it_exists() {
        use super::preferable_dict_path;
        use std::path::PathBuf;

        let resource = PathBuf::from("/apk/ecdict.db");
        let data = PathBuf::from("/data/ecdict.db");
        assert_eq!(
            preferable_dict_path(true, Some(data.clone()), resource.clone()),
            data
        );
        assert_eq!(
            preferable_dict_path(true, None, resource.clone()),
            resource.clone()
        );
        assert_eq!(preferable_dict_path(false, Some(data), resource.clone()), resource);
    }
}
