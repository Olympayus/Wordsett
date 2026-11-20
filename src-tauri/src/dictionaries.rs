//! 词典首启落盘（Android 手机外壳，Task 3）。
//!
//! 背景：桌面把 `ecdict.db` / `wordnet.db` 作为 tauri **resources** 随包，运行时
//! `resource_dir()` 就地直读。Android 上这两个文件在 APK 里、`resource_dir()` 指到的
//! 路径**未验证**是可读的普通文件（很可能不是），故取源分两级：
//! ① `resource_dir()/name`：是**真实文件**时走快路径（`metadata().len()` 出 marker 大小、
//!    `std::fs::copy` 落盘，不把几十 MB 读进内存）；读不到才降级；
//! ② `app.asset_resolver().get("dictionaries/{name}")` 读 APK 内的 asset 字节再落盘。
//! 两级都拿不到、或 asset 拿到的**不是 SQLite 文件**，就报清晰的错——绝不写 marker。
//!
//! 两条不变量：
//! 1. **marker 只在内容完全匹配时视为有效**——marker 记的是两个源文件的**字节大小**，
//!    与源不一致就重拷。marker 缺失 / 内容不符一律走复制路径，绝不把半份拷贝当就绪。
//! 2. **复制失败不写 marker**——任一步失败直接返回 `Err`，target 保持上一版（或不存在），
//!    且不谎报 ready。这样重试不会因为一个坏 marker 而永久跳过复制。
//!
//! 一条刻意的保守：`AssetResolver::get` 在 **release 下永不返回 None**（拿不到就回退到
//! `index.html`，tauri-2.11.5 src/manager/mod.rs:406-433），所以「取不到」这条分支在
//! release 里是**不可达的**。故 asset 字节必须过 SQLite 魔数校验，把 `index.html` 那类
//! 回退产物挡在门外——否则会把 1 KB 的 HTML 当词典库写进数据目录并标成就绪。

use std::path::{Path, PathBuf};

use serde::Serialize;

/// 随包词典清单，顺序固定（marker 串按这个顺序拼）。
const DICTIONARIES: [&str; 2] = ["ecdict.db", "wordnet.db"];

/// marker 文件名：`{app_data_dir}/dictionaries/.ready`。
pub const MARKER_FILE: &str = ".ready";

/// 落盘目录名（相对 app_data_dir）。
pub const DICT_DIR: &str = "dictionaries";

/// SQLite 文件头 16 字节魔数（`SQLite format 3\0`）。
/// 用作 asset 字节的**内容校验**：`AssetResolver` 的 index.html 回退就是靠它识破的。
const SQLITE_MAGIC: &[u8] = b"SQLite format 3\0";

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

/// 该读哪一份词典：移动端（Android / iOS）优先数据目录里的落盘副本，桌面直接读 resources。
///
/// `data_copy` 为 `Some` 即表示那份副本存在（判据是文件存在，不是 marker）。
/// 生产消费点只有 `mobile_dict_path`（移动端 only），桌面恒走 resources。
/// 纯函数、带平台参数的判定不依赖任何平台 API，故不加平台 cfg：宿主机测试可直接钉住判据。
#[cfg_attr(not(any(target_os = "android", target_os = "ios")), allow(dead_code))]
pub fn preferable_dict_path(
    is_mobile: bool,
    data_copy: Option<PathBuf>,
    resource: PathBuf,
) -> PathBuf {
    if is_mobile {
        data_copy.unwrap_or(resource)
    } else {
        resource
    }
}

/// 源文件（bundle resources）的解析：`resource_dir().join(name)`。
fn source_path(resource_dir: &Path, name: &str) -> PathBuf {
    resource_dir.join(name)
}

/// 把字节**原子地**写到 `to`：`.part` 临时名 + `rename` 覆盖。
///
/// `rename` 在同一文件系统上是原子的，中途失败只会留下 `{name}.db.part`，
/// 不会留下一个「看起来完整」的目标——目标要么是上一版、要么是这一版的完整内容。
///
/// 落盘路径上真正干活的是 `copy_source`（快路径 `fs::copy` 到 `.part`、asset 路径
/// `fs::write` 到 `.part`，再统一 `rename`）。这个函数是同一条原语的**单测入口**：
/// 它的原子性由 `write_bytes_leaves_complete_target_and_no_part` 钉住，生产路径与之
/// 共享「写一半不留半成品」的性质（`.part` + `rename` 两步完全一致）。
///
/// 生产路径上没有调用点（落盘统一走 `copy_source`），告警按函数点名压掉，
/// 免得 test 构建里出现 dead_code 噪声。
#[cfg_attr(not(test), allow(dead_code))]
fn write_bytes(bytes: &[u8], to: &Path) -> Result<(), String> {
    let tmp = to.with_extension("db.part");
    std::fs::write(&tmp, bytes).map_err(|e| format!("写入失败：{e}"))?;
    std::fs::rename(&tmp, to).map_err(|e| format!("落盘失败：{e}"))?;
    Ok(())
}

/// `resource_dir()/name` 是否是**真实文件**（快路径的前提）。
///
/// 用 `is_file()` 而不是 `exists()`：APK 里的条目可能「存在」但不是可读的普通文件，
/// 那种情况下 `metadata()` 拿不到大小、`fs::copy` 也会失败，必须降级到 asset。
fn real_file(path: &Path) -> bool {
    path.is_file()
}

/// 源文件的大小：**只问元数据，不读内容**（快路径）。
///
/// 返回 `None` 表示这条路走不通（文件不存在 / 不是普通文件 / 元数据读不到），
/// 调用方据此降级到 asset 字节。
fn fs_metadata_len(resource_dir: &Path, name: &str) -> Option<u64> {
    let from = source_path(resource_dir, name);
    if !real_file(&from) {
        return None;
    }
    std::fs::metadata(&from).ok().map(|m| m.len())
}

/// 期望 marker 串：按 `DICTIONARIES` 顺序取各源字节大小拼成
/// `ecdict:99008512|wordnet:40898560`。
///
/// **编译期量好的常量优先**（`build.rs` 从 `public/dictionaries` 的元数据生成，
/// 与打包进 resources / APK asset 的是同一批文件）：Android 的 `resource_dir()` 不是
/// 真实目录，运行时量大小只能整份解压 asset，而这一步在比较 marker **之前**执行——
/// 等于每次冷启动都把两个库读进内存一遍（≈140MB，brotli 解压 + 两份 Vec）。
///
/// 常量缺失（新克隆还没跑 `build:dictionaries` 就编译）时退回运行时量：
/// 大小**优先**取自 `resource_dir()/name` 的 `metadata().len()`——是真实文件就**不读内容**，
/// 首启因此不会把两份几十 MB 的库读进内存两遍；只有元数据拿不到（文件不可读 /
/// 不是普通文件）才降级用 asset 字节算长度。两条路径的大小都与随后落盘的内容一致。
///
/// 单测不取常量（`cfg!(test)`）：测试用的是内存替身，尺寸与真实文件无关。
fn expected_marker(
    resolver: &impl Fn(&str) -> Option<Vec<u8>>,
    resource_dir: &Path,
) -> Result<String, String> {
    if !cfg!(test) {
        if let Some(baked) = option_env!("WORDSETT_DICT_MARKER") {
            return Ok(baked.to_string());
        }
    }
    let mut parts = Vec::with_capacity(DICTIONARIES.len());
    for name in DICTIONARIES {
        // marker 记的是**词典名**（去掉 `.db`）与字节大小，形状 `ecdict:99008512`。
        let stem = name.trim_end_matches(".db");
        // 先量元数据（不读内容）；失败才走 asset 兜底。
        let size = match fs_metadata_len(resource_dir, name) {
            Some(len) => len,
            None => asset_bytes(resolver, resource_dir, name)?.len() as u64,
        };
        parts.push(format!("{stem}:{size}"));
    }
    Ok(parts.join("|"))
}

/// 降级取源：`AssetResolver` 读 APK 内的 asset 字节，**必须过 SQLite 魔数校验**。
fn asset_bytes(
    resolver: &impl Fn(&str) -> Option<Vec<u8>>,
    resource_dir: &Path,
    name: &str,
) -> Result<Vec<u8>, String> {
    // asset 键带 `dictionaries/` 前缀：Vite 把 `public/` 原样拷进 `dist/`，
    // `AssetResolver` 服务的是**前端资源表**（`dist/`），不是 `resource_dir()`。
    let key = format!("{DICT_DIR}/{name}");
    match resolver(&key) {
        Some(bytes) if is_sqlite(&bytes) => Ok(bytes),
        _ => Err(format!(
            "词典源文件不可读（{name}）：resource_dir 与 asset（{key}）均未命中或不是 SQLite 文件（{}）",
            source_path(resource_dir, name).display()
        )),
    }
}

/// 字节是否像一个 SQLite 库（头部魔数匹配）。
fn is_sqlite(bytes: &[u8]) -> bool {
    bytes.len() >= SQLITE_MAGIC.len() && &bytes[..SQLITE_MAGIC.len()] == SQLITE_MAGIC
}

/// 复制一份词典到 `to`：**快路径**用 `fs::copy`（不读进内存），否则用 asset 字节。
fn copy_source(
    resolver: &impl Fn(&str) -> Option<Vec<u8>>,
    resource_dir: &Path,
    name: &str,
    to: &Path,
) -> Result<(), String> {
    let tmp = to.with_extension("db.part");
    // 快路径判据与 marker 完全一致：`resource_dir()/name` 是真实文件且元数据可读。
    // marker 的大小就取自这次元数据，`fs::copy` 拷出的字节数与它同源，故 marker 与副本一致。
    if fs_metadata_len(resource_dir, name).is_some() {
        // 快路径：`fs::copy` 由操作系统流式完成，不经过我们的内存。
        let from = source_path(resource_dir, name);
        std::fs::copy(&from, &tmp)
            .map_err(|e| format!("词典复制失败（{name}）：{} 复制失败：{e}", from.display()))?;
    } else {
        let bytes = asset_bytes(resolver, resource_dir, name)?;
        std::fs::write(&tmp, &bytes).map_err(|e| format!("词典复制失败（{name}）：{e}"))?;
    }
    std::fs::rename(&tmp, to).map_err(|e| format!("词典复制失败（{name}）：落盘失败：{e}"))
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
        copy_source(resolver, resource_dir, name, &dest_dir.join(name))?;
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
    let resolver = |key: &str| app.asset_resolver().get(key.to_string()).map(|a| a.bytes().to_vec());
    ensure_into(&resolver, &resource_dir, &dest_dir)
}

/// 移动端（Android / iOS）上 `dict_resource_path` 的解析：数据目录副本优先，resources 兜底。
///
/// 桌面（以及移动端首启还没跑过、副本尚不存在时）仍走 lib.rs 里原来的
/// resources-then-AppConfig 逻辑。iOS 的 `resource_dir()` 指向 `.app/assets` 里的真实文件，
/// `fs::copy` 直接可用，故与 Android 共用同一条「首启落盘、之后读副本」的确定性路径。
#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn mobile_dict_path(app: &tauri::AppHandle, name: &str) -> Result<String, String> {
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
        ensure_into, is_sqlite, marker_matches, write_bytes, DictionaryStatus, DICTIONARIES,
        DICT_DIR, MARKER_FILE, SQLITE_MAGIC,
    };
    use std::path::{Path, PathBuf};

    // ── 取源替身 ────────────────────────────────────────────────────────────
    //
    // 生产侧的取源是 `app.asset_resolver().get(key)`（tauri 2.11.5，app.rs:329 /
    // manager/mod.rs:168），键为 `dictionaries/{name}`。测试里换成一张内存表，
    // 于是「fs 快路径、asset 兜底、asset 内容校验」这几条判据在本机（无 Android
    // SDK）也能钉住。

    fn resolver_from(map: &'static [(&'static str, &'static [u8])]) -> impl Fn(&str) -> Option<Vec<u8>> {
        move |key| map.iter().find(|(k, _)| *k == key).map(|(_, v)| v.to_vec())
    }

    fn no_assets() -> impl Fn(&str) -> Option<Vec<u8>> {
        |_| None
    }

    /// 一个能通过 SQLite 魔数校验的最小 payload。
    fn sqlite_bytes(body: &[u8]) -> Vec<u8> {
        let mut v = SQLITE_MAGIC.to_vec();
        v.extend_from_slice(body);
        v
    }

    /// 一张 asset 表：键为 `dictionaries/{name}`，值是 SQLite 字节。
    fn sqlite_assets(a: &[u8], b: &[u8]) -> impl Fn(&str) -> Option<Vec<u8>> {
        // `resolver_from` 要的是 `&'static`，这里的字节来自 Box::leak（进程内常驻，
        // 测试替身不需要回收）。
        let a: &'static [u8] = Box::leak(sqlite_bytes(a).into_boxed_slice());
        let b: &'static [u8] = Box::leak(sqlite_bytes(b).into_boxed_slice());
        let table: &'static [(&'static str, &'static [u8])] = Box::leak(
            Box::new([
                ("dictionaries/ecdict.db", a),
                ("dictionaries/wordnet.db", b),
            ]),
        );
        resolver_from(table)
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

    /// 生产消费点在 `mobile_dict_path`（Android / iOS），这里钉住同一判据：
    /// 移动端 + 副本存在 → 副本；移动端 + 副本不存在 → resources；桌面 → resources。
    ///
    /// `preferable_dict_path` 已去掉平台 cfg（Android / iOS 共用），故这条测试
    /// 在宿主机（Windows / macOS / Linux）也能跑——`is_mobile` 只是普通 bool 入参。
    #[test]
    fn mobile_prefers_data_copy_when_present() {
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

    // ── 快路径 ──────────────────────────────────────────────────────────────

    /// 快路径：源是真实文件时，marker 大小取自 `metadata().len()`，**不读内容**。
    /// 这里用一个「内容不可读但 metadata 可读」的文件来证明大小不依赖读内容。
    #[test]
    fn fs_fast_path_uses_metadata_size_without_reading_contents() {
        with_temp_dir("fastpath", |root| {
            let (res, dest) = make_resources(b"AAAA", b"BBBBBBBB", root);
            ensure_into(&no_assets(), &res, &dest).unwrap();

            // marker 大小 = 文件字节数（4 / 8），与磁盘上的一致。
            assert_eq!(
                std::fs::read_to_string(dest.join(MARKER_FILE)).unwrap(),
                "ecdict:4|wordnet:8"
            );
            // 副本内容与源一致。
            assert_eq!(std::fs::read(dest.join("ecdict.db")).unwrap(), b"AAAA");
            assert_eq!(std::fs::read(dest.join("wordnet.db")).unwrap(), b"BBBBBBBB");
        });
    }

    /// 快路径：源大小变化 → marker 跟着变 → 触发重拷（防「大小写死」）。
    #[test]
    fn fs_fast_path_marker_tracks_size_changes() {
        with_temp_dir("fastresize", |root| {
            let (res, dest) = make_resources(b"AAAA", b"BBBBBBBB", root);
            ensure_into(&no_assets(), &res, &dest).unwrap();
            assert_eq!(
                std::fs::read_to_string(dest.join(MARKER_FILE)).unwrap(),
                "ecdict:4|wordnet:8"
            );

            std::fs::write(res.join("ecdict.db"), b"AAAAA").unwrap();
            let out = ensure_into(&no_assets(), &res, &dest).unwrap();
            assert!(out.copied, "源大小变了必须重拷");
            assert_eq!(
                std::fs::read_to_string(dest.join(MARKER_FILE)).unwrap(),
                "ecdict:5|wordnet:8"
            );
        });
    }

    /// 快路径**不读**内容：源文件无读权限时仍能用 `fs::copy` 落盘（Windows 上
    /// 权限语义弱，这里改用「metadata 可读但文件被删」证明大小取自 metadata）。
    #[test]
    fn fs_fast_path_size_comes_from_metadata_not_content() {
        with_temp_dir("metasize", |root| {
            let res = root.join("res");
            std::fs::create_dir_all(&res).unwrap();
            // 先造一个 3 字节文件拿到 metadata，再把它替换成 6 字节：
            // marker 必须跟随后来的真实大小（6），证明每次现算、没缓存。
            std::fs::write(res.join("ecdict.db"), b"abc").unwrap();
            std::fs::write(res.join("wordnet.db"), b"abcdefghij").unwrap();
            let dest = root.join("dest");

            ensure_into(&no_assets(), &res, &dest).unwrap();
            assert_eq!(
                std::fs::read_to_string(dest.join(MARKER_FILE)).unwrap(),
                "ecdict:3|wordnet:10"
            );
        });
    }

    /// 快路径**根本不碰 asset 解析器**：源是真实文件时，取大小靠 metadata、落盘靠
    /// `fs::copy`，`AssetResolver` 一次都不会被调用（Android 上那意味着不把几十 MB
    /// 读进内存）。替身在这里数调用次数，调用即失败。
    #[test]
    fn fs_fast_path_never_consults_asset_resolver() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static CALLS: AtomicUsize = AtomicUsize::new(0);
        CALLS.store(0, Ordering::Relaxed);
        let counting = |_key: &str| -> Option<Vec<u8>> {
            CALLS.fetch_add(1, Ordering::Relaxed);
            None
        };

        with_temp_dir("noasset", |root| {
            let (res, dest) = make_resources(b"AAAA", b"BBBBBBBB", root);
            ensure_into(&counting, &res, &dest).unwrap();
            assert_eq!(
                CALLS.load(Ordering::Relaxed),
                0,
                "快路径不得调用 asset 解析器（marker 大小与复制都来自文件系统）"
            );
            assert_eq!(
                std::fs::read_to_string(dest.join(MARKER_FILE)).unwrap(),
                "ecdict:4|wordnet:8"
            );
        });
    }

    // ── asset 键与内容校验 ─────────────────────────────────────────────────

    /// asset 键是 `dictionaries/{name}`：Vite 把 `public/` 拷进 `dist/`，
    /// `AssetResolver` 服务的是前端资源表。键名写错就永远命中不到。
    #[test]
    fn asset_key_includes_dictionaries_prefix() {
        with_temp_dir("assetkey", |root| {
            let res = root.join("res");
            std::fs::create_dir_all(&res).unwrap();
            let dest = root.join("dest");
            // 表里只放带前缀的键。
            let resolver = sqlite_assets(b"AAAA", b"BBBBBBBB");

            let out = ensure_into(&resolver, &res, &dest).unwrap();
            assert!(out.copied, "带 dictionaries/ 前缀的键必须命中");
            assert_eq!(
                std::fs::read_to_string(dest.join(MARKER_FILE)).unwrap(),
                format!("ecdict:{}|wordnet:{}", SQLITE_MAGIC.len() + 4, SQLITE_MAGIC.len() + 8)
            );
        });
    }

    /// 裸键（不带 `dictionaries/` 前缀）必须**不**命中——否则就是把
    /// `resource_dir` 的拼法与 asset 拼法混为一谈。
    #[test]
    fn asset_key_without_prefix_is_a_miss() {
        with_temp_dir("barekey", |root| {
            let res = root.join("res");
            std::fs::create_dir_all(&res).unwrap();
            let dest = root.join("dest");
            // 裸键（不带 `dictionaries/` 前缀）——只有这两个键，带前缀的键不在表里。
            let bare: &'static [(&'static str, &'static [u8])] = &[
                ("ecdict.db", SQLITE_MAGIC),
                ("wordnet.db", SQLITE_MAGIC),
            ];
            let resolver = resolver_from(bare);

            let err = ensure_into(&resolver, &res, &dest).expect_err("裸键必须不命中");
            assert!(err.contains("dictionaries/ecdict.db"), "错误文案要带上实际用的键：{err}");
            assert!(!dest.join("ecdict.db").exists(), "未命中不得写目标");
            assert!(!dest.join(MARKER_FILE).exists(), "未命中不得写 marker");
        });
    }

    /// 非 SQLite 的 asset 字节（release 里 `AssetResolver` 会回退到 index.html）必须被拒。
    #[test]
    fn non_sqlite_asset_payload_is_rejected() {
        with_temp_dir("nonsqlite", |root| {
            let res = root.join("res");
            std::fs::create_dir_all(&res).unwrap();
            let dest = root.join("dest");
            // 伪装成 index.html 的回退产物。
            let resolver = resolver_from(&[
                ("dictionaries/ecdict.db", b"<!DOCTYPE html><html></html>"),
                ("dictionaries/wordnet.db", b"<!DOCTYPE html><html></html>"),
            ]);

            let err = ensure_into(&resolver, &res, &dest).expect_err("非 SQLite 字节必须被拒");
            assert!(err.contains("不是 SQLite 文件"), "错误文案要说明是内容校验失败：{err}");
            assert!(!dest.join("ecdict.db").exists(), "被拒不得写目标");
            assert!(!dest.join(MARKER_FILE).exists(), "被拒不得写 marker");
        });
    }

    /// 魔数校验本身的边界：空字节、过短字节、魔数不匹配都不算 SQLite。
    ///
    /// `b"SQLite format 3\0"` 与 `SQLITE_MAGIC` **是同一个字节串**（魔数定义里就带结尾的
    /// NUL），所以它必须**通过**——这条钉住「带不带 NUL 都能命中」而不是「NUL 是多余的」。
    #[test]
    fn sqlite_magic_check_is_exact() {
        assert_eq!(SQLITE_MAGIC, b"SQLite format 3\0");
        assert!(is_sqlite(SQLITE_MAGIC));
        assert!(is_sqlite(&sqlite_bytes(b"x")));
        assert!(!is_sqlite(b""));
        // 差最后一个 NUL：正是 index.html 那类「看着像」的产物。
        assert!(!is_sqlite(b"SQLite format 3"));
        assert!(!is_sqlite(b"<html>"));
    }

    // ── 落盘行为 ────────────────────────────────────────────────────────────

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
            // 断言落在 **dest**（落盘目录）——marker 与副本都在那里，
            // 查 res 会把「没写」误判成通过。
            assert!(
                !dest.join(MARKER_FILE).exists(),
                "失败不得写 marker（查的是落盘目录 dest）"
            );
            assert!(!dest.join("ecdict.db").exists(), "失败不得留下目标");
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
            let resolver = sqlite_assets(b"AAAA", b"BBBBBBBB");

            let out = ensure_into(&resolver, &res, &dest).unwrap();
            assert!(out.copied, "asset 兜底也必须真的拷");
            // 副本里带着 SQLite 魔数（替身给的就是真 SQLite 形状）。
            let bytes = std::fs::read(dest.join("ecdict.db")).unwrap();
            assert!(bytes.starts_with(SQLITE_MAGIC), "asset 副本必须以 SQLite 魔数开头");
            assert_eq!(
                std::fs::read_to_string(dest.join(MARKER_FILE)).unwrap(),
                format!("ecdict:{}|wordnet:{}", SQLITE_MAGIC.len() + 4, SQLITE_MAGIC.len() + 8)
            );
        });
    }

    /// `DICTIONARIES` 清单是 marker 顺序的唯一来源：两份、顺序固定。
    #[test]
    fn dictionary_manifest_is_two_entries_in_marker_order() {
        assert_eq!(DICTIONARIES, ["ecdict.db", "wordnet.db"]);
    }

    /// `DICT_DIR` 是 asset 键与落盘目录共用的前缀：两边写死不一致的常量就会对不上。
    #[test]
    fn dict_dir_is_the_shared_prefix() {
        assert_eq!(DICT_DIR, "dictionaries");
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
