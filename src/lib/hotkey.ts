/**
 * 划词热键的纯函数层（v0.7.9 Task 16）：键盘事件 → accelerator、accelerator → 键帽文案。
 *
 * accelerator 的形状以 Rust `shortcut::validate`（`src-tauri/src/shortcut.rs`）为准：
 * 修饰键 + 恰好一个主键、`+` 分隔。这里的白名单与那边逐项对齐——前端放行一个
 * Rust 不认的键，用户按下后只会拿到一条校验错误，录制控件却看起来「什么也没发生」。
 *
 * 修饰键固定顺序 `Control | Alt | Shift | Super`：同一组键在设置页与配置文件里
 * 永远是同一种写法，重启后读回来不会因为顺序不同而被当成「另一个键」。
 */

/** 平台默认热键（与 Rust `shortcut::default_accelerator` 同一组值）。 */
export const GRAB_WORD_DEFAULT_WINDOWS = 'Alt+KeyW'
export const GRAB_WORD_DEFAULT_MACOS = 'Option+KeyW'

/** 纯修饰键的 `KeyboardEvent.code`。按下它们本身不构成组合键，只用于录制态实时预览。 */
const MODIFIER_CODES = new Set([
  'ControlLeft', 'ControlRight',
  'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight',
  'MetaLeft', 'MetaRight',
])

/** 旧浏览器 / 合成事件可能只给 `key` 不给 `code`；两处都认。 */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

/**
 * 具名主键白名单：与 Rust `shortcut.rs` 的 `NAMED_KEYS` 逐项对齐，只是改用
 * `KeyboardEvent.code` 的书写（`BracketLeft` 而不是 `BRACKETLEFT`）。
 *
 * `Escape` 在 Rust 白名单里（配置文件可以写），但录制态里它是「取消」，
 * 永远不会由 `eventToAccelerator` 产出——见下方专门的分支。
 */
const NAMED_KEYS = new Set([
  // 标点
  'Backquote', 'Backslash', 'BracketLeft', 'BracketRight', 'Comma',
  'Equal', 'Minus', 'Period', 'Quote', 'Semicolon', 'Slash',
  // 编辑 / 导航
  'Backspace', 'CapsLock', 'Enter', 'Space', 'Tab', 'Delete', 'End', 'Home',
  'Insert', 'PageDown', 'PageUp', 'PrintScreen', 'ScrollLock', 'Pause',
  'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'NumLock',
  // 小键盘（数字键 Numpad0..9 由形状规则覆盖）
  'NumpadAdd', 'NumpadDecimal', 'NumpadDivide', 'NumpadEnter', 'NumpadEqual',
  'NumpadMultiply', 'NumpadSubtract',
  // 媒体 / 音量
  'AudioVolumeDown', 'AudioVolumeUp', 'AudioVolumeMute',
  'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
  'MediaTrackNext', 'MediaTrackPrev', 'MediaTrackPrevious',
  'MediaNextTrack', 'MediaPrevTrack',
])

/** 纯修饰键 keydown（Control / Shift / Alt / Meta 单独按下）。 */
export function isModifierKeyEvent(e: Pick<KeyboardEvent, 'code' | 'key'>): boolean {
  return MODIFIER_CODES.has(e.code) || MODIFIER_KEYS.has(e.key)
}

/** 主键形状：`Key[A-Z]`、`Digit[0-9]`、`Numpad[0-9]`、`F1..F24` 或具名白名单。 */
function isSupportedMainKey(code: string): boolean {
  if (/^Key[A-Z]$/.test(code)) return true
  if (/^Digit[0-9]$/.test(code)) return true
  if (/^Numpad[0-9]$/.test(code)) return true
  // 只认规范写法 F1..F24：F01 / F0 之类解析器不收。
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return true
  return NAMED_KEYS.has(code)
}

/**
 * `KeyboardEvent` → accelerator。以下情形返回 `null`：
 * 无修饰键、纯修饰键、`Escape`（录制态里是取消）、以及白名单之外的主键。
 */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  if (isModifierKeyEvent(e)) return null
  if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) return null
  // 录制态的 Esc 是「取消」，不能同时成为一个热键的主键。
  if (e.code === 'Escape') return null
  if (!isSupportedMainKey(e.code)) return null

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  parts.push(e.code)
  return parts.join('+')
}

/**
 * accelerator → 键帽文字。**纯展示**：去掉 `Key` / `Digit` 前缀让键帽只写 `W` / `1`，
 * 其余（`Option` / `F5` / `Numpad0` / `Super`）原样保留。
 */
export function formatAccelerator(accel: string): string[] {
  return accel
    .split('+')
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => {
      if (/^Key[A-Z]$/.test(token)) return token.slice(3)
      if (/^Digit[0-9]$/.test(token)) return token.slice(5)
      return token
    })
}
