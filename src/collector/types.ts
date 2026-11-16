/**
 * 划词小窗的跨语言契约（v0.7.9，spec §7）。
 *
 * `GrabOutcome` 的字段名由 Rust 侧的 `#[serde(rename_all = "camelCase")]` 决定
 * （`src-tauri/src/grab.rs`），**改名即破坏契约**——事件 `collector-grab` 的载荷与
 * 握手命令 `collector_ready()` 的返回值都是它。
 *
 * 本文件只放类型：collector 目录下的组件都从这里取，不各自复刻一份形状。
 */

/** 读取选区的失败类目。与 Rust `SelectionError::kind()` / `"too_long"` 一一对应。 */
export type GrabErrorKind = 'empty' | 'unsupported' | 'denied' | 'timeout' | 'too_long' | 'os'

/** 一次抓取的结果（spec §7）。 */
export interface GrabOutcome {
  /** 抓取代际：`grabId` 不大于已见值的投递一律丢弃（spec §5.1-1）。 */
  grabId: number
  mode: 'word' | 'sentence' | 'error'
  text: string
  tokens: number
  error: { kind: GrabErrorKind; detail: string } | null
}

/**
 * 查询词所在模块（v0.7.5 起词库分工作区 / 储藏库）。不在库为 `null`。
 * 小窗的「已在库」态按它分档；真正的判定走 `lib/collected` 的 `libraryLocationIn`。
 */
export type LibraryLocation = 'workspace' | 'archive' | null
