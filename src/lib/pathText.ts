// src/lib/pathText.ts
/**
 * 路径文案工具（v0.8.0 iOS 导出）。
 *
 * 成功提示只显示文件名：iOS 走 Documents 兜底时返回的是完整沙盒路径，
 * 它又长又不可读；且非 iOS 的 save 返回值可能是用户刚选的目标路径，
 * 提示里保留完整路径仍然有意义（调用点自行决定用不用本函数）。
 */
export function fileNameOnly(path: string): string {
  // 同时按 `/` 与 `\` 切：Windows 路径在 JS 里是单个字符串，
  // 而 iOS / Android 用 `/`。两种分隔符都可能出现在同一条路径的边界上。
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? ''
}
