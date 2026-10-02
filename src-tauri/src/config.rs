//! 应用配置文件 `shortcuts.json`（00 篇 §4、04 篇 §2.8）。
//!
//! 选 JSON 而非 SQLite 的三条理由（00 §4 原文）：Rust 启动期同步读、不混入词库
//! 导出/备份流、按键值组织零结构变更。本模块是它的**唯一读写方**。
//!
//! 两条不变量：
//! 1. **未知键原样保留**——解析到 `serde_json::Value` 而非强类型结构体，写回时把
//!    已知字段合进原值。v0.8.0 的划-1 会往 `actions.grab_word` 写值，用户若回退到
//!    本版运行，那把键不能消失。
//! 2. **写盘成功才更新内存**——`set_patch` 先写盘、成功了才改缓存，失败时内存里
//!    仍是旧值，界面不会显示一个并不存在的配置。

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{json, Value};

/// 文件名。路径为 `{app_config_dir}/shortcuts.json`（与 tauri-plugin-sql 的
/// `sqlite:wordsett.db` 同一个 BaseDirectory::AppConfig 目录）。
pub const FILE_NAME: &str = "shortcuts.json";

/// 默认配置。加新键就在这里加，`load_or_default` 的归一化会自动给老文件补上。
pub fn defaults() -> Value {
    json!({
        "actions": {},
        "tts":    { "voice": null, "rate": 1.0 },
        "window": { "close_to_tray": true, "close_dialog_seen": false },
        "tray":   { "show_due_count": true },
    })
}

/// 深合并：`patch` 里出现的键盖到 `base` 上，`base` 独有的键原样保留。
/// 对象对对象递归，其余情形（含 `base` 为 null）直接整体替换。
pub fn merge_patch(base: &mut Value, patch: &Value) {
    match (base, patch) {
        (Value::Object(b), Value::Object(p)) => {
            for (k, v) in p {
                merge_patch(b.entry(k.clone()).or_insert(Value::Null), v);
            }
        }
        (b, p) => *b = p.clone(),
    }
}

/// 点分路径取值（`window.close_to_tray`）。路径缺失或类型不符时回退 `fallback`
/// —— 配置是用户可直接编辑的文件，类型不符必须当默认值处理，不能 panic。
pub fn bool_at(v: &Value, path: &str, fallback: bool) -> bool {
    at_path(v, path).and_then(Value::as_bool).unwrap_or(fallback)
}

pub fn f32_at(v: &Value, path: &str, fallback: f32) -> f32 {
    at_path(v, path)
        .and_then(Value::as_f64)
        .map(|n| n as f32)
        .unwrap_or(fallback)
}

pub fn str_at(v: &Value, path: &str) -> Option<String> {
    at_path(v, path).and_then(Value::as_str).map(str::to_string)
}

fn at_path<'a>(v: &'a Value, path: &str) -> Option<&'a Value> {
    path.split('.').fold(Some(v), |acc, k| acc.and_then(|x| x.get(k)))
}

/// 解析失败时的备份落点：取**第一个未占用**的后缀（`.bak` → `.bak.1` → `.bak.2`…）。
/// 绝不覆盖已有备份——连续损坏时第一份往往才是唯一可用的好样本。
pub fn backup_path_for(path: &Path) -> PathBuf {
    let first = PathBuf::from(format!("{}.bak", path.display()));
    if !first.exists() {
        return first;
    }
    let mut n = 1u32;
    loop {
        let cand = PathBuf::from(format!("{}.bak.{n}", path.display()));
        if !cand.exists() {
            return cand;
        }
        n += 1;
    }
}

/// 默认值铺在存档**之下**：存档里缺的键由默认值兜底，存档里多出来的键原样保留。
fn normalize(saved: Value) -> Value {
    let mut out = defaults();
    merge_patch(&mut out, &saved);
    out
}

fn parse(text: &str) -> Option<Value> {
    let v: Value = serde_json::from_str(text).ok()?;
    // 顶层必须是对象。合法 JSON 但结构不对（数组 / 字符串 / 数字）与解析失败同等对待。
    v.is_object().then_some(v)
}

/// 读配置。文件缺失 → 写默认值；内容无法解析或顶层非对象 → 备份 + 默认值。
pub fn load_or_default(dir: &Path) -> Value {
    let path = dir.join(FILE_NAME);

    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => {
            let d = defaults();
            let _ = write_atomic(&path, &d);
            return d;
        }
    };

    match parse(&text) {
        Some(v) => normalize(v),
        None => {
            let bak = backup_path_for(&path);
            if let Err(e) = std::fs::rename(&path, &bak) {
                eprintln!("[config] 备份 {} 失败：{e}", path.display());
            }
            eprintln!(
                "[config] {} 无法解析，已备份为 {}，改用默认值",
                path.display(),
                bak.display()
            );
            let d = defaults();
            let _ = write_atomic(&path, &d);
            d
        }
    }
}

/// 原子写：先写同名 `.tmp` 再 rename 覆盖。`fs::rename` 在 Windows 上会替换已存在的目标。
fn write_atomic(path: &Path, value: &Value) -> Result<(), String> {
    let tmp = PathBuf::from(format!("{}.tmp", path.display()));
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// 内存缓存。启动期同步读一次，此后 `get` 不再碰磁盘。
static CACHE: Mutex<Option<Value>> = Mutex::new(None);
static CONFIG_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

/// 启动期调用一次：读盘、归一化、记下路径。
pub fn init(dir: &Path) -> Value {
    let v = load_or_default(dir);
    if let Ok(mut c) = CACHE.lock() {
        *c = Some(v.clone());
    }
    if let Ok(mut p) = CONFIG_PATH.lock() {
        *p = Some(dir.join(FILE_NAME));
    }
    v
}

/// 当前配置。`init` 之前调用返回默认值（命令在 setup 之后才可能被前端调到，实际不会发生）。
pub fn get() -> Value {
    CACHE
        .lock()
        .ok()
        .and_then(|c| c.clone())
        .unwrap_or_else(defaults)
}

/// 深合并 `patch` → 写盘 → 成功才更新内存 → 返回合并后的完整配置。
pub fn set_patch(patch: Value) -> Result<Value, String> {
    let mut next = get();
    merge_patch(&mut next, &patch);

    let path = CONFIG_PATH
        .lock()
        .map_err(|_| "配置路径锁中毒".to_string())?
        .clone()
        .ok_or_else(|| "配置尚未初始化".to_string())?;

    write_atomic(&path, &next)?;

    if let Ok(mut c) = CACHE.lock() {
        *c = Some(next.clone());
    }
    Ok(next)
}

#[tauri::command]
pub fn get_config() -> Value {
    get()
}

#[tauri::command]
pub fn set_config(patch: Value) -> Result<Value, String> {
    set_patch(patch)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    /// 每个测试一个独立目录，避免并行跑测试时互相踩。
    struct TempDir(std::path::PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let p = std::env::temp_dir().join(format!(
                "wordsett-cfg-test-{}-{}",
                std::process::id(),
                tag
            ));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).expect("建临时目录");
            Self(p)
        }
        fn path(&self) -> &std::path::Path {
            &self.0
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn defaults_are_the_documented_shape() {
        let d = defaults();
        assert_eq!(bool_at(&d, "window.close_to_tray", false), true);
        assert_eq!(bool_at(&d, "window.close_dialog_seen", true), false);
        assert_eq!(bool_at(&d, "tray.show_due_count", false), true);
        assert_eq!(f32_at(&d, "tts.rate", 0.0), 1.0);
        assert_eq!(str_at(&d, "tts.voice"), None);
        assert!(d["actions"].is_object());
    }

    #[test]
    fn merge_patch_keeps_unknown_keys() {
        let mut base = json!({ "actions": { "grab_word": "Alt+KeyW" }, "tts": { "voice": null, "rate": 1.0 } });
        merge_patch(&mut base, &json!({ "tray": { "show_due_count": false } }));
        assert_eq!(base["actions"]["grab_word"], "Alt+KeyW", "未知键必须原样保留");
        assert_eq!(base["tray"]["show_due_count"], false);
    }

    #[test]
    fn merge_patch_is_deep_not_shallow() {
        let mut base = json!({ "tts": { "voice": null, "rate": 1.0 } });
        merge_patch(&mut base, &json!({ "tts": { "voice": "Microsoft Zira Desktop" } }));
        assert_eq!(base["tts"]["voice"], "Microsoft Zira Desktop");
        assert_eq!(base["tts"]["rate"], 1.0, "深合并不许把同级的 rate 抹成默认");
    }

    /// Review Focus 1：类型不符的值回退到默认，不是 panic、也不当作真值。
    #[test]
    fn type_mismatch_falls_back_to_default() {
        let v = json!({ "window": { "close_to_tray": "yes" }, "tts": { "rate": "fast" } });
        assert_eq!(bool_at(&v, "window.close_to_tray", true), true);
        assert_eq!(f32_at(&v, "tts.rate", 1.0), 1.0);
        assert_eq!(bool_at(&v, "nope.missing", false), false);
    }

    #[test]
    fn missing_file_is_created_with_defaults() {
        let d = TempDir::new("missing");
        let v = load_or_default(d.path());
        assert_eq!(bool_at(&v, "window.close_to_tray", false), true);
        assert!(d.path().join(FILE_NAME).exists(), "缺失时必须写出默认文件");
    }

    #[test]
    fn corrupt_file_is_backed_up_and_original_kept() {
        let d = TempDir::new("corrupt");
        let p = d.path().join(FILE_NAME);
        fs::write(&p, "{ 这不是 JSON").unwrap();

        let v = load_or_default(d.path());
        assert_eq!(bool_at(&v, "window.close_to_tray", false), true, "回退默认值");

        let bak = d.path().join(format!("{FILE_NAME}.bak"));
        assert!(bak.exists(), "必须留下备份");
        assert_eq!(fs::read_to_string(&bak).unwrap(), "{ 这不是 JSON");
        // 原路径被默认值重写，下次启动不再走损坏分支
        assert!(serde_json::from_str::<serde_json::Value>(&fs::read_to_string(&p).unwrap()).is_ok());
    }

    /// Review Focus 2：合法 JSON 但不是对象（数组 / 字符串 / 空文件）同样按损坏处理。
    #[test]
    fn non_object_json_is_treated_as_corrupt() {
        for (tag, body) in [("array", "[1,2,3]"), ("string", "\"hello\""), ("empty", "")] {
            let d = TempDir::new(tag);
            fs::write(d.path().join(FILE_NAME), body).unwrap();
            let v = load_or_default(d.path());
            assert_eq!(bool_at(&v, "tray.show_due_count", false), true, "{tag} 应回退默认");
            assert!(
                d.path().join(format!("{FILE_NAME}.bak")).exists(),
                "{tag} 应留下备份"
            );
        }
    }

    #[test]
    fn second_corruption_does_not_clobber_first_backup() {
        let d = TempDir::new("twice");
        let p = d.path().join(FILE_NAME);

        fs::write(&p, "first-bad").unwrap();
        load_or_default(d.path());
        fs::write(&p, "second-bad").unwrap();
        load_or_default(d.path());

        assert_eq!(fs::read_to_string(d.path().join(format!("{FILE_NAME}.bak"))).unwrap(), "first-bad");
        assert_eq!(
            fs::read_to_string(d.path().join(format!("{FILE_NAME}.bak.1"))).unwrap(),
            "second-bad"
        );
    }

    #[test]
    fn backup_path_skips_taken_suffixes() {
        let d = TempDir::new("suffix");
        let p = d.path().join(FILE_NAME);
        assert!(backup_path_for(&p).ends_with(format!("{FILE_NAME}.bak")));
        fs::write(d.path().join(format!("{FILE_NAME}.bak")), "x").unwrap();
        assert!(backup_path_for(&p).ends_with(format!("{FILE_NAME}.bak.1")));
        fs::write(d.path().join(format!("{FILE_NAME}.bak.1")), "x").unwrap();
        assert!(backup_path_for(&p).ends_with(format!("{FILE_NAME}.bak.2")));
    }

    #[test]
    fn atomic_write_leaves_no_tmp_file() {
        let d = TempDir::new("atomic");
        let p = d.path().join(FILE_NAME);
        write_atomic(&p, &json!({ "a": 1 })).expect("写盘");
        assert!(p.exists());
        assert!(!d.path().join(format!("{FILE_NAME}.tmp")).exists(), "临时文件必须已被 rename 掉");
    }
}