use std::path::Path;

fn main() {
  // 词典的期望 marker（`ecdict:99008512|wordnet:40898560`）在**编译期**量好。
  //
  // 运行时量它在 Android 上要整份解压 asset：Android 的 `resource_dir()` 不是真实目录
  // （Tauri 直接返回 `asset://localhost/`），`metadata().len()` 永远拿不到，只能走
  // `AssetResolver`——它会把 brotli 压缩的整份词典解到内存里。而 `expected_marker`
  // 在比较 marker **之前**就要算，于是每次冷启动都会把两个库读一遍（≈140MB）。
  // 量一次写进 env，运行时只读 `.ready` 里那行文本。
  //
  // 文件缺失（新克隆还没跑 `npm run build:dictionaries`）时不导出，运行时退回旧路径：
  // 那条路在桌面上是元数据（不读内容），在 Android 第一版构建上仍可用。
  let root = Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("../public/dictionaries");
  let mut parts = Vec::new();
  for name in ["ecdict.db", "wordnet.db"] {
    let path = root.join(name);
    println!("cargo:rerun-if-changed={}", path.display());
    match std::fs::metadata(&path) {
      Ok(m) => parts.push(format!("{}:{}", name.trim_end_matches(".db"), m.len())),
      Err(_) => {
        parts.clear();
        break;
      }
    }
  }
  if parts.len() == 2 {
    println!("cargo:rustc-env=WORDSETT_DICT_MARKER={}", parts.join("|"));
  }
  tauri_build::build()
}
