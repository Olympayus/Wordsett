import type { PlatformClass } from './platform'

/**
 * 设置分区目录（Task 9）：桌面与手机**同一份**。
 *
 * 桌面 `SettingsPage` 原先自带一份本地 `SECTIONS`；手机外壳要出目录行，两处各写一份就会在
 * 加分区时漏一边（移动目录少一项、或桌面左栏多一项）。故列表与 key 联合都收在这里，
 * 桌面只是消费它。
 *
 * 「平台权限」按平台过滤的口径也在此：`visibleSettingsSections` 是唯一判据，桌面那侧仍要叠加
 * `accessibility_status` 的 `supported`（Windows 上不支持，即便形态是桌面也不出这一项）。
 */

export type SettingsSectionKey =
  | 'general' | 'search' | 'review' | 'voice'
  | 'category' | 'links' | 'collect' | 'platform' | 'about'

export interface SettingsSection {
  key: SettingsSectionKey
  label: string
}

/** 分区顺序：通用 / 搜索设置 / 复习 / 语音 / 分类管理 / 双向链接 / 划词 / 平台权限 / 关于。 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'general', label: '通用' },
  { key: 'search', label: '搜索设置' },
  { key: 'review', label: '复习' },
  { key: 'voice', label: '语音' },
  { key: 'category', label: '分类管理' },
  { key: 'links', label: '双向链接' },
  { key: 'collect', label: '划词' },
  { key: 'platform', label: '平台权限' },
  { key: 'about', label: '关于' },
]

/**
 * 当前平台可见的分区：
 * - **Android 没有平台权限**（辅助功能那套是 macOS 独有，手机上是空的）。
 * - **Android 也没有划词**（读系统选区只有 Windows / macOS 实现）：手机与平板都剔除。
 *   桌面这侧还要再叠加 `collector_supported`（`SettingsPage` 单独 invoke，不复用
 *   `accessibility_status`——Windows 上后者恒 false，会把 Windows 的划词分区藏掉）。
 *
 * 平板与桌面同判其余项——平板复用桌面外壳，左栏也是这份表。
 */
export function visibleSettingsSections(platform: PlatformClass): SettingsSection[] {
  return SETTINGS_SECTIONS.filter(s => {
    if (s.key === 'collect') return platform === 'desktop'
    return s.key !== 'platform' || platform !== 'android-phone'
  })
}
