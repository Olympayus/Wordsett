import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Icon from '../icons'
import Tooltip from '../ui/Tooltip'
import SquareButton from '../ui/SquareButton'
import CategoryPickerPopover from '../ui/CategoryPickerPopover'
import FamiliarityChoice from './FamiliarityChoice'
import type { InitialFamiliarityChoice } from '../../services/wordService'
import type { DictActionModel } from '../../lib/mobileDictActions'

/**
 * 手机词典详情页的底部动作条（Task 8，spec §4.5 / §6）。
 *
 * 桌面 `DictDetailPanel` 把「初始熟悉度 / 已选 N 项 / ＋ / 添加至…」排在**顶部** `WorkbenchNavBar`
 * 的右端；手机把它们挪到页面底部固定条上，按拇指可达排列（spec §4.5：「移到页面底部动作条，
 * 按拇指可达排列」）。**动作与桌面逐字同源**：熟悉度三键复用 `FamiliarityChoice`、合并回调与
 * 计数 / 禁用判据由 `DictDetailPanel` 传入、分类下拉复用 `CategoryPickerPopover`——本组件不新造
 * 任何一套判定，只是换了一处落位。
 *
 * 视觉分两层，为窄屏留出排布余地（390dp 竖屏是这台设备的实际宽度）：
 * - **顶面**（`CRUMB_HEIGHT` 34px，**可选**）：返回 + 「词典 › 词」面包屑 + 右端「添加至…」。
 *   只在**没有手机顶栏**的路径渲染——工作台 / 储藏库的词典详情与词条页共用 `MobileAppBar`；
 *   搜索路径的返回 + 面包屑画在 `DictDetailPanel` 自己的顶栏里，这一面随之不渲染
 *   （两条路径都只有一个返回键、一条面包屑）。
 * - **主面**（`BAR_HEIGHT` 52px，拇指可达的那一层，**恒在**）：初始熟悉度三键 / 归属文案（左簇）
 *   + 已选读数 + 「＋」合并键（右端）。顶面不渲染时，「添加至…」落回这一面的右端，
 *   保证主按钮与「选分类后添加」在任何路径下都成对可达。
 *
 * 条高 = 顶面（可选）+ 主面，`DictDetailPanel` 按同一条算式给内容区垫下内距。
 *
 * - **不吸顶、不滚动**：条是 `position: fixed` 贴视口下缘（不是滚动区内的 sticky）。手机词典
 *   详情与底栏同时常显（spec §4.2「顶栏、词条条、底栏全部常显」，§4.2「键盘弹出时底栏让位给
 *   键盘」），吸在视口下缘的固定条天然盖在 `MobileTabBar` 之上，内容滚动区另垫一段
 *   `paddingBottom` 给正文留出最后一条的可读空间。
 * - **安全区**：高度里含 `env(safe-area-inset-bottom)`，与 `MobileTabBar` / `MobileAppBar` 同一条
 *   理由（`box-sizing: border-box` 下把安全区写进 `paddingBottom` 会把内容盒压小）。
 * - **分类下拉朝上开**（`placement="top"`）：锚点在视口下缘，向下没有空间，`popoverPosition`
 *   会自动翻到对面，这里显式声明意图而不是靠「放不下就翻」的兜底。
 *
 * 视觉只取既有 token，零新色值。蓝只给「已选 / 激活」这类状态（熟悉度三键的选中态），
 * 主操作走 `SquareButton` 的中性底——与桌面返回页同一配方。
 */

/** 主面高度（拇指可达的那一层）。不含安全区——手势条另加（同 `MobileTabBar` 的 `BAR_HEIGHT` 做法）。 */
const BAR_HEIGHT = 52
/** 顶面高度：返回 + 面包屑那一层。 */
const CRUMB_HEIGHT = 34
/** 条内控件高度：与手机顶栏控件同为 32（Task 5 的 CONTROL），命中区由整条高度兜住。 */
const CONTROL = 32

/** 无边框无底色的图标键（返回）：与 `MobileAppBar` 的 `iconBtn` / `MobileSearchPage` 同形同尺寸。 */
const iconBtn: CSSProperties = {
  width: `${CONTROL}px`, height: `${CONTROL}px`, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
  cursor: 'pointer', color: 'var(--color-text-secondary)',
  transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
}

interface Props {
  /** 动作模型（`dictActionModel`）：决定问不问熟悉度、显示归属还是三键、能不能合并。 */
  model: DictActionModel
  /** 返回（搜索 → 词典 → 搜索结果；工作台 / 储藏库 → 词编辑视图）。 */
  onBack: () => void
  /**
   * 面包屑里的词面（「词典 › 词」）。
   *
   * **只在没有手机顶栏时传**（Task 8）：搜索路径的返回 + 面包屑画在 `DictDetailPanel` 自己的
   * 顶栏里（spec §4.5），底条这一面只留动作；工作台 / 储藏库路径与词条页共用 `MobileAppBar`、
   * 没有本面板的顶栏，故面包屑仍在底条顶面。两种路径**不会**出现两条面包屑。
   */
  word?: string
  /** 初始熟悉度（未收录时）：与桌面同一份状态，所有权仍在 `DictDetailPanel`。 */
  familiarity: InitialFamiliarityChoice
  onFamiliarityChange: (v: InitialFamiliarityChoice) => void
  /** 勾选字段数（「已选 N 项」）。 */
  mergeCount: number
  /** 合并禁用判据（桌面同一份：无勾选 或 储藏库的词）。 */
  mergeDisabled: boolean
  /** 合并添加：`categoryId` 是「添加至…」选中的分类，不传＝主按钮（落默认分类）。 */
  onMergeAdd: (categoryId?: string) => void
}

export default function MobileDictActionBar({
  model, onBack, word, familiarity, onFamiliarityChange, mergeCount, mergeDisabled, onMergeAdd,
}: Props) {
  // 分类下拉的开关与锚点（与桌面 `WorkbenchNavBar` 同一套：浮层 fixed 落位，锚点由它现算）
  const [pickerOpen, setPickerOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  // 主面右端的「添加至…」锚点（顶面不渲染时的那一枚）
  const fallbackAnchorRef = useRef<HTMLDivElement>(null)
  // 顶面（返回 + 面包屑）只在没有手机顶栏的路径渲染；搜索路径的这两件在 `DictDetailPanel` 的顶栏里
  const showCrumbFace = Boolean(word)
  const barHeight = (showCrumbFace ? CRUMB_HEIGHT : 0) + BAR_HEIGHT

  return (
    <div
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 'var(--z-sticky)',
        // 高度含安全区（同 MobileTabBar）：手势条下沿不压内容
        height: `calc(${barHeight}px + env(safe-area-inset-bottom))`,
        display: 'flex', flexDirection: 'column',
        padding: '0 12px env(safe-area-inset-bottom)', boxSizing: 'border-box',
        background: 'var(--color-chrome)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      {/* 顶面：返回 + 「词典 › 词」面包屑。**只在没有手机顶栏的路径出现**——搜索路径的返回与
          面包屑画在 `DictDetailPanel` 自己的顶栏里（见那里的注释），两条路径都不重复。 */}
      {showCrumbFace && (
        <div
          className="flex items-center"
          style={{ height: `${CRUMB_HEIGHT}px`, gap: 8, borderBottom: '1px solid var(--color-border)' }}
        >
          <button type="button" title="返回" aria-label="返回" onClick={onBack} style={iconBtn}>
            <Icon name="arrow-left" size={18} />
          </button>
          <span style={{
            flex: '1 1 auto', minWidth: 0, fontSize: 12, color: 'var(--color-text-tertiary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            词典 › <b style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{word}</b>
          </span>
          {/* 「添加至…」：仍开 `CategoryPickerPopover`，文案与桌面逐字一致。放在顶面右端——
              它是「选一个目的地再添加」的二级动作，与主面的「＋」分开一层，窄屏才排得下。 */}
          <div ref={anchorRef}>
            <SquareButton
              size="touch"
              tone="canvas"
              aria-label="添加至指定分类"
              disabled={mergeDisabled}
              onClick={() => setPickerOpen(o => !o)}
            >
              添加至…
            </SquareButton>
          </div>
        </div>
      )}

      {/* 主面：初始熟悉度 / 归属（左簇）+ 已选读数 + 「＋」合并键（右端） */}
      <div className="flex items-center" style={{ height: `${BAR_HEIGHT}px`, gap: 8, minHeight: 0 }}>
        {/* 初始熟悉度三键：词不在库时出现；已在库则整组换成归属文案（`collectedLabel`）——
            与桌面 `WorkbenchNavBar` 逐字同一约定（三键与那句文案的宽度接近，切词时不左右跳）。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 1 }}>
          {model.showFamiliarity ? (
            <>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}>初始熟悉度</span>
              {/* `touch`（Task 8）：三键提到 44px 命中区（spec §10）。 */}
              <FamiliarityChoice value={familiarity} onChange={onFamiliarityChange} touch />
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{model.libraryLabel}</span>
          )}
        </div>

        {/* 已选读数：**常驻占位**——不占位的话勾选第一项时两颗按钮会左右跳（同桌面理由）。 */}
        <span style={{
          fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap',
          visibility: mergeCount > 0 ? 'visible' : 'hidden',
        }}>
          已选 <span className="stat-num">{mergeCount}</span> 项
        </span>

        {/* 「＋」＝原「合并添加 · N 项」：行为逐字不变（不传 categoryId，合并后落默认分类）。
            `size="touch"` 是 `SquareButton` 为手机外壳开的触屏档（32px，与本条其余控件等高）。
            `marginLeft: auto` 由外层 span 承担——`SquareButton` 不透传 `style`，与仓库里其他
            需要推开的按钮同一做法（包一层、不侵入组件）。 */}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Tooltip content={mergeCount > 0 ? `把已选的 ${mergeCount} 项添加进词条` : '先勾选要添加的词条'} width={260}>
            <SquareButton
              size="touch"
              tone="canvas"
              aria-label="添加已选词条"
              disabled={mergeDisabled}
              onClick={() => onMergeAdd()}
            >
              <Icon name="plus" size={14} />
            </SquareButton>
          </Tooltip>
          {/* 「添加至…」在**没有顶面**的路径（搜索）落回主面右端：顶面那格此时不渲染，
              而这两个动作（主按钮 / 选分类后添加）在任何路径下都必须成对可达。 */}
          {!showCrumbFace && (
            <div ref={fallbackAnchorRef}>
              <SquareButton
                size="touch"
                tone="canvas"
                aria-label="添加至指定分类"
                disabled={mergeDisabled}
                onClick={() => setPickerOpen(o => !o)}
              >
                添加至…
              </SquareButton>
            </div>
          )}
        </span>
      </div>

      {/* 分类下拉：`fixed` 落位，锚点是「添加至…」自己（顶面或主面，见 popoverPosition 的契约）。
          朝上开（`placement="top"`）——锚点在视口下缘，向下没有空间。 */}
      {pickerOpen && (
        <CategoryPickerPopover anchor={(showCrumbFace ? anchorRef : fallbackAnchorRef).current} onClose={() => setPickerOpen(false)}
          placement="top"
          onPick={categoryId => { setPickerOpen(false); onMergeAdd(categoryId) }} />
      )}
    </div>
  )
}
