import type { WordLocation } from '../types/word'
import { collectedLabel } from './collected'

/**
 * 手机词典详情页底部动作条的动作模型（Task 8）。
 *
 * 底部动作条只有四件要知道的事：这词在不在库（`mode`）、要不要问初始熟悉度
 * （`showFamiliarity`）、能不能合并（`canMerge`）、已收录时该显示哪句归属（`libraryLabel`）。
 * 四件都是**纯函数**，故放这里由 `mobileDictActions.test.ts` 直接钉住——组件只做接线，
 * 判据不落在 JSX 里（同 `lib/mobileSearch.ts` / `lib/mobileWordStrip.ts` 的做法）。
 *
 * 归属文案走 `collectedLabel`（v0.7.5 Task 13 那份按模块分档的文案），与桌面
 * `WorkbenchNavBar`、搜索建议、语义网络**同一份**，不在这里再写一遍「已在工作台」。
 */
export interface DictActionModel {
  /** `add`＝不在库（先选熟悉度再收录）；`collected`＝已在库（只显示归属，仍可合并字段）。 */
  mode: 'add' | 'collected'
  /** 未收录才问初始熟悉度（spec 4.6：已在库的词再问一次是打扰）。 */
  showFamiliarity: boolean
  /** 合并前提是有东西可合并：勾选数 > 0。**两种模式都成立**——库内词合并的是词典字段。 */
  canMerge: boolean
  /** 归属文案（`collectedLabel`），不在库为 null。 */
  libraryLabel: string | null
}

/**
 * `location`（词库索引里查到的模块，null＝不在库）与 `selectedCount`（勾选字段数）
 * → 底部动作条的动作模型。
 *
 * 与桌面 `DictDetailPanel` 的判据同源：桌面把「合并添加」的 disabled 收成
 * `!anySelected || libraryLocation === 'archive'`（储藏库的词没有可见的工作台页面，
 * 合并只会把字段写进一个用户看不见的词条），那条规则**仍归桌面**——手机端不在库时
 * 没有可去的模块，故不在此复述。
 */
export function dictActionModel(
  location: WordLocation | null,
  selectedCount: number
): DictActionModel {
  const libraryLabel = collectedLabel(location)
  return {
    mode: libraryLabel ? 'collected' : 'add',
    showFamiliarity: !libraryLabel,
    canMerge: selectedCount > 0,
    libraryLabel,
  }
}
