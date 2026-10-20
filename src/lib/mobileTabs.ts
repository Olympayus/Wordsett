import type { IconName } from '../components/icons'
import type { ActiveModule } from '../stores/viewStore'

/**
 * 移动底栏（Task 2）：五格顺序固定，与桌面活动栏（ActivityRail）图标一致。
 * 搜索是第五个模块（ActiveModule 含 'search'），底栏点亮规则直接比较 key === activeModule。
 */

export type MobileTabKey = 'workbench' | 'archive' | 'search' | 'review' | 'settings'

export interface MobileTab {
  key: MobileTabKey
  icon: IconName
  label: string
}

/** 底栏顺序：工作台 / 储藏库 / 搜索 / 复习 / 设置。 */
export const MOBILE_TABS: MobileTab[] = [
  { key: 'workbench', icon: 'layers', label: '工作台' },
  { key: 'archive', icon: 'box', label: '储藏库' },
  { key: 'search', icon: 'search', label: '搜索' },
  { key: 'review', icon: 'book', label: '复习' },
  { key: 'settings', icon: 'settings', label: '设置' },
]

/** 底栏点亮判据：模块与 tab key 一一对应（search 也是 ActiveModule）。 */
export function tabActive(key: MobileTabKey, activeModule: ActiveModule): boolean {
  return key === activeModule
}
