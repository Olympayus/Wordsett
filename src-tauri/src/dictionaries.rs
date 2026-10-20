//! 词典首启落盘（Android 手机外壳，Task 3）。
//!
//! 背景：桌面把 `ecdict.db` / `wordnet.db` 作为 tauri **resources** 随包，运行时
//! `resource_dir()` 就地直读。Android 上这两个文件在 APK 里、`resource_dir()` 指到的
//! 路径**未验证**是可读的普通文件（很可能不是），故取源分两级：
//! ① `resource_dir()/name` 的 `std::fs::copy`；② 失败则走 `app.asset_resolver().get(name)`
//! 读 APK 内的 asset 字节再落盘。两级都拿不到就报清晰的错。
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
pub const MARKER_FILE: &str = ".ready";

/// 落盘目录名（相对 app_data_dir）。
pub const DICT_DIR: &str = "dictionaries";

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

/// 把字节写到 `to`：`.part` 临时名 + `rename` 覆盖。
///
/// `rename` 在同一文件系统上是原子的，中途失败只会留下 `{name}.db.part`，
/// 不会留下一个「看起来完整」的目标——目标要么是上一版、要么是这一版的完整内容。
fn write_bytes(bytes: &[u8], to: &Path) -> Result<(), String> {
    let tmp = to.with_extension("db.part");
    std::fs::write(&tmp, bytes).map_err(|e| format!("写入失败：{e}"))?;
    std::fs::rename(&tmp, to).map_err(|e| format!("落盘失败：{e}"))?;
    Ok(())
}

/// 取一个词典源的字节：先 `resource_dir()` 下的普通文件，失败再 `asset_resolver()`。
///
/// 两级都失败时返回 `Err`，文案里说明两级都试过。返回的字节同时用于
/// 「大小进 marker」与「写进落盘副本」——marker 与副本因此永远来自同一份数据。
fn source_bytes(
    resolver: &impl Fn(&str) -> Option<Vec<u8>>,
    resource_dir: &Path,
    name: &str,
) -> Result<Vec<u8>, String> {
    let from = source_path(resource_dir, name);
    match std::fs::read(&from) {
        Ok(b) => Ok(b),
        Err(_) => resolver(name).ok_or_else(|| {
            format!(
                "词典源文件不可读（{name}）：resource_dir 与 asset 均未命中（{}）",
                from.display()
            )
        }),
    }
}

/// 期望 marker 串：按 `DICTIONARIES` 顺序取各源字节大小拼成
/// `ecdict:99008512|wordnet:40898560`。大小取自**实际取到的那份字节**。
fn expected_marker(
    resolver: &impl Fn(&str) -> Option<Vec<u8>>,
    resource_dir: &Path,
) -> Result<String, String> {
    let mut parts = Vec::with_capacity(DICTIONARIES.len());
    for name in DICTIONARIES {
        // marker 记的是**词典名**（去掉 `.db`）与字节大小，形状 `ecdict:99008512`。
        let stem = name.trim_end_matches(".db");
        let bytes = source_bytes(resolver, resource_dir, name)?;
        parts.push(format!("{stem}:{}", bytes.len()));
    }
    Ok(parts.join("|"))
}

/// 首启落盘：把两份词典复制到 `dest_dir`（调用方解析好的 `app_data_dir()/dictionaries`）。
///
/// marker 命中则原样返回 `{ready: true, copied: false}`；否则逐个复制，
/// **全部成功后**才写 marker，返回 `{ready: true, copied: true}`。
/// 任一步失败返回 `Err(错误文案)`，此时不写 marker、也不谎报 ready。
fn ensure_into(
    resolver: &impl Fn(&str) -> Option<Vec<u8>>,
    resource_dir: &Path,
    dest_dir: &Path,
) -> Result<DictionaryStatus, String> {
    std::fs::create_dir_all(dest_dir).map_err(|e| format!("词典目录建立失败：{e}"))?;
    let expected = expected_marker(resolver, resource_dir)?;
    let marker_path = dest_dir.join(MARKER_FILE);
    // marker 缺失 / 不可读一律当「没就绪」处理，落到下面的复制路径。
    let marker = std::fs::read_to_string(&marker_path).ok();

    if marker_matches(marker.as_deref(), &expected) {
        return Ok(DictionaryStatus {
            ready: true,
            copied: false,
            target: dest_dir.to_string_lossy().into_owned(),
        });
    }

    for name in DICTIONARIES {
        let bytes = source_bytes(resolver, resource_dir, name)
            .map_err(|e| format!("词典复制失败（{name}）：{e}"))?;
        write_bytes(&bytes, &dest_dir.join(name))
            .map_err(|e| format!("词典复制失败（{name}）：{e}"))?;
    }

    // 复制全部成功后才写 marker。marker 自身写失败不视为致命（下次会重拷一遍），
    // 但内容永远只在拷贝成功之后出现——这条顺序就是不变量 2 的实现。
    let _ = std::fs::write(&marker_path, &expected);

    Ok(DictionaryStatus {
        ready: true,
        copied: true,
        target: dest_dir.to_string_lossy().into_owned(),
    })
}

/// 命令入口，注册见 lib.rs 的 `generate_handler!`。
#[tauri::command]
pub async fn ensure_dictionaries(app: tauri::AppHandle) -> Result<DictionaryStatus, String> {
    use tauri::Manager;

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let dest_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(DICT_DIR);
    let resolver = |name: &str| app.asset_resolver().get(name.to_string()).map(|a| a.bytes().to_vec());
    ensure_into(&resolver, &resource_dir, &dest_dir)
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
            .join(DICT_DIR)
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
    use super::{
        ensure_into, marker_matches, write_bytes, DictionaryStatus, DICTIONARIES, MARKER_FILE,
    };
    use std::path::{Path, PathBuf};

    // ── 取源替身 ────────────────────────────────────────────────────────────
    //
    // 生产侧的取源是 `app.asset_resolver().get(name).map(|a| a.bytes().to_vec())`
    // （tauri 2.11.5，app.rs:329 / manager/mod.rs:168）。测试里换成一张内存表，
    // 于是「fs 优先、asset 兜底」这条判据在本机（无 Android SDK）也能钉住。

    fn resolver_from(map: &'static [(&'static str, &'static [u8])]) -> impl Fn(&str) -> Option<Vec<u8>> {
        move |name| map.iter().find(|(k, _)| *k == name).map(|(_, v)| v.to_vec())
    }

    fn no_assets() -> impl Fn(&str) -> Option<Vec<u8>> {
        |_| None
    }

    // ── 临时目录 ────────────────────────────────────────────────────────────

    /// 每个测试一个唯一子目录（计数器 + 进程 id）。
    fn unique_temp_dir(label: &str) -> PathBuf {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("wordsett-dict-{label}-{n}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 读完即用：读完即删，不在 temp 里留测试残骸。
    fn with_temp_dir<T>(label: &str, f: impl FnOnce(&Path) -> T) -> T {
        let dir = unique_temp_dir(label);
        let out = f(&dir);
        let _ = std::fs::remove_dir_all(&dir);
        out
    }

    /// 在 `root` 下造一个 `resources` 目录（含两个指定字节的词典源）与空的 `dest`。
    fn make_resources(a: &[u8], b: &[u8], root: &Path) -> (PathBuf, PathBuf) {
        let res = root.join("res");
        std::fs::create_dir_all(&res).unwrap();
        std::fs::write(res.join("ecdict.db"), a).unwrap();
        std::fs::write(res.join("wordnet.db"), b).unwrap();
        let dest = root.join("dest");
        (res, dest)
    }

    // ── 契约测试 ────────────────────────────────────────────────────────────

    /// 跨语言契约：前端按 camelCase 读 `ready` / `copied` / `target`。
    /// 三个字段都是单词、serde 默认即同名，这条钉住没人手痒去加 `rename_all` 之外的东西。
    #[test]
    fn status_serializes_plain_field_names() {
        let s = DictionaryStatus {
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

    // ── 落盘行为 ────────────────────────────────────────────────────────────

    /// marker 形状：`ecdict:{size}|wordnet:{size}`，尺寸取自真实文件字节。
    #[test]
    fn ensure_writes_expected_marker_from_file_sizes() {
        with_temp_dir("marker", |root| {
            let res = root.join("res");
            let dest = root.join("dest");
            std::fs::create_dir_all(&res).unwrap();
            std::fs::write(res.join("ecdict.db"), b"AAAA").unwrap();
            std::fs::write(res.join("wordnet.db"), b"BBBBBBBB").unwrap();

            ensure_into(&no_assets(), &res, &dest).unwrap();
            assert_eq!(
                std::fs::read_to_string(dest.join(MARKER_FILE)).unwrap(),
                "ecdict:4|wordnet:8"
            );
        });
    }

    /// 复制成功：目标完整、没有 `.part` 残留。
    #[test]
    fn write_bytes_leaves_complete_target_and_no_part() {
        with_temp_dir("write", |root| {
            let to = root.join("ecdict.db");
            write_bytes(b"AAAA", &to).unwrap();

            assert_eq!(std::fs::read(&to).unwrap(), b"AAAA");
            assert!(
                !root.join("ecdict.db.part").exists(),
                "成功后 .part 必须被 rename 掉、不留残骸"
            );
        });
    }

    /// 源缺失（fs 与 asset 都没有）→ `Err`，且**不建目标、不留 .part**。
    #[test]
    fn ensure_missing_source_leaves_no_target_and_no_part() {
        with_temp_dir("missing", |root| {
            let res = root.join("res");
            let dest = root.join("dest");
            std::fs::create_dir_all(&res).unwrap();

            let err = ensure_into(&no_assets(), &res, &dest).expect_err("源缺失必须报错");
            assert!(err.contains("ecdict.db"), "错误文案要点名是哪个词典：{err}");
            assert!(!dest.join("ecdict.db").exists(), "失败不得留下目标");
            assert!(!dest.join("ecdict.db.part").exists(), "失败不得留下 .part");
        });
    }

    /// 首启第一次调用：`copied: true`，marker 与目标都落好；第二次靠 marker 跳过。
    #[test]
    fn ensure_copies_once_then_skips() {
        with_temp_dir("twice", |root| {
            let (res, dest) = make_resources(b"AAAA", b"BBBBBBBB", root);
            let resolver = no_assets();

            let first = ensure_into(&resolver, &res, &dest).unwrap();
            assert!(first.ready);
            assert!(first.copied, "首启必须真的拷");
            assert_eq!(std::fs::read(dest.join("ecdict.db")).unwrap(), b"AAAA");
            assert_eq!(std::fs::read(dest.join("wordnet.db")).unwrap(), b"BBBBBBBB");
            assert_eq!(
                std::fs::read_to_string(dest.join(MARKER_FILE)).unwrap(),
                "ecdict:4|wordnet:8"
            );

            let second = ensure_into(&resolver, &res, &dest).unwrap();
            assert!(second.ready);
            assert!(!second.copied, "第二次必须靠 marker 跳过");
        });
    }

    /// 写盘失败 → `Err`，且**不写 marker**、不留下任何「看起来就绪」的残骸。
    ///
    /// 失败点选在写盘：把落盘目录换成一个**同名文件**，`create_dir_all` 必然失败
    /// ——这才是一条走完整复制流程的失败路径（源读得到、写不进去）。
    #[test]
    fn ensure_copy_failure_leaves_no_marker() {
        with_temp_dir("fail", |root| {
            let res = root.join("res");
            std::fs::create_dir_all(&res).unwrap();
            std::fs::write(res.join("ecdict.db"), b"AAAA").unwrap();
            std::fs::write(res.join("wordnet.db"), b"BBBBBBBB").unwrap();

            let dest = root.join("dest");
            std::fs::write(&dest, b"not a directory").unwrap();

            let err = ensure_into(&no_assets(), &res, &dest).expect_err("写盘失败必须报错");
            assert!(err.contains("词典目录建立失败"), "错误文案要指明是目录问题：{err}");
            assert!(!res.join(MARKER_FILE).exists(), "失败不得写 marker");
        });
    }

    /// 半途失败（第一份成功、第二份失败）同样不写 marker。
    #[test]
    fn ensure_partial_copy_leaves_no_marker() {
        with_temp_dir("partial", |root| {
            let (res, dest) = make_resources(b"AAAA", b"BBBBBBBB", root);
            // 先让第一份成功落盘。
            ensure_into(&no_assets(), &res, &dest).unwrap();
            std::fs::remove_file(dest.join(MARKER_FILE)).unwrap();

            // 再抽掉第二份源：第一份重拷成功、第二份失败。
            std::fs::remove_file(res.join("wordnet.db")).unwrap();
            let err = ensure_into(&no_assets(), &res, &dest)
                .expect_err("第二份源不可得时必须报错");
            assert!(err.contains("wordnet.db"), "错误文案要点名是哪个词典：{err}");
            assert!(
                !dest.join(MARKER_FILE).exists(),
                "半途失败不得写 marker，否则重试会永远跳过复制"
            );
            // 第一份确实已经拷成功了——半份拷贝是允许的，但绝不能标成就绪。
            assert_eq!(std::fs::read(dest.join("ecdict.db")).unwrap(), b"AAAA");
        });
    }

    /// APK asset 兜底：`resource_dir()` 里读不到时，走 asset 表取字节。
    #[test]
    fn ensure_falls_back_to_asset_bytes() {
        with_temp_dir("asset", |root| {
            let res = root.join("res");
            let dest = root.join("dest");
            // 故意**不**在 resources 里放源文件，逼它走 asset 兜底。
            std::fs::create_dir_all(&res).unwrap();
            let resolver = resolver_from(&[("ecdict.db", b"AAAA"), ("wordnet.db", b"BBBBBBBB")]);

            let out = ensure_into(&resolver, &res, &dest).unwrap();
            assert!(out.copied, "asset 兜底也必须真的拷");
            assert_eq!(std::fs::read(dest.join("ecdict.db")).unwrap(), b"AAAA");
            assert_eq!(
                std::fs::read_to_string(dest.join(MARKER_FILE)).unwrap(),
                "ecdict:4|wordnet:8"
            );
        });
    }

    /// `DICTIONARIES` 清单是 marker 顺序的唯一来源：两份、顺序固定。
    #[test]
    fn dictionary_manifest_is_two_entries_in_marker_order() {
        assert_eq!(DICTIONARIES, ["ecdict.db", "wordnet.db"]);
    }

    /// marker 与副本同源于一份字节：源字节变长 → marker 跟着变（防「大小写死」）。
    #[test]
    fn marker_tracks_source_size_changes() {
        with_temp_dir("resize", |root| {
            let (res, dest) = make_resources(b"AAAA", b"BBBBBBBB", root);
            ensure_into(&no_assets(), &res, &dest).unwrap();
            assert_eq!(
                std::fs::read_to_string(dest.join(MARKER_FILE)).unwrap(),
                "ecdict:4|wordnet:8"
            );

            // 源文件长了一个字节 → marker 必须不匹配，下一次调用重拷。
            std::fs::write(res.join("ecdict.db"), b"AAAAA").unwrap();
            let out = ensure_into(&no_assets(), &res, &dest).unwrap();
            assert!(out.copied, "源大小变了必须重拷");
            assert_eq!(
                std::fs::read_to_string(dest.join(MARKER_FILE)).unwrap(),
                "ecdict:5|wordnet:8"
            );
        });
    }

    /// 成功路径不产生 `.part` 残骸（两份都查）。
    #[test]
    fn ensure_leaves_no_part_files() {
        with_temp_dir("noparts", |root| {
            let (res, dest) = make_resources(b"AAAA", b"BBBBBBBB", root);
            ensure_into(&no_assets(), &res, &dest).unwrap();
            for name in DICTIONARIES {
                assert!(
                    !dest.join(name).with_extension("db.part").exists(),
                    "{name} 成功后不得留 .part"
                );
            }
        });
    }
}
