import { useCallback, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Icon from '../icons'
import Tooltip from '../ui/Tooltip'
import SquareButton from '../ui/SquareButton'
import CategoryPickerPopover from '../ui/CategoryPickerPopover'
import FamiliarityChoice from './FamiliarityChoice'
import type { InitialFamiliarityChoice } from '../../services/wordService'
import type { DictActionModel } from '../../lib/mobileDictActions'
import { useMobilePopup } from '../../lib/mobilePopups'

/**
 * 手机词典详情页的底部动作条（Task 8，spec §4.5 / §6）。
 *
 * 桌面 `DictDetailPanel` 把「初始熟悉度 / 已选 N 项 / ＋ / 添加至…」排在**顶部** `WorkbenchNavBar`
 * 的右端；手机把它们挪到页面底部固定条上，按拇指可达排列（spec §4.5：「移到页面底部动作条，
 * 按拇指可达排列」）。**动作与桌面逐字同源**：熟悉度三键复用 `FamiliarityChoice`、合并回调与
 * 计数 / 禁用判据由 `DictDetailPanel` 传入、分类下拉复用 `CategoryPickerPopover`——本组件不新造
 * 任何一套判定，只是换了一处落位。
 *
 * 视觉分两层（390dp 竖屏是这台设备的实际宽度，两层的分工就是为它留的）：
 * - **顶面**（`CRUMB_HEIGHT` 34px，**恒在**，只换内容）：
 *   - 工作台 / 储藏库：返回 + 「词典 › 词」面包屑 + 「已选 N 项」+ 右端「添加至…」。
 *   - 搜索路径：**只**留「已选 N 项」+「添加至…」——返回与面包屑画在 `DictDetailPanel` 自己的
 *     顶栏里，底条不重复。
 *   「已选 N 项」两条路径都在（spec §4.5 的动作条清单里它有名字），只是搜索路径下它排在最左。
 * - **主面**（`BAR_HEIGHT` 52px，拇指可达层）：初始熟悉度三键 / 归属文案（左簇）+「＋」合并键。
 *   「已选 N 项」刻意不在这里：390dp 上 278 + 40 + 122 + 8 ≈ 448 > 366，全堆主面会溢出。
 *
 * 顶面**恒渲染**、不条件渲染（`hasCrumb` 只决定里面画什么）：条高因此是常数
 * `CRUMB_HEIGHT + BAR_HEIGHT`，`DictDetailPanel` 的下内距算式不必分两条路径。
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
  const closePicker = useCallback(() => setPickerOpen(false), [])
  // 下拉开着时登记给外壳：安卓返回键先关下拉，而不是把整页词典详情关掉（多退一层）。
  useMobilePopup(pickerOpen, closePicker)
  const anchorRef = useRef<HTMLDivElement>(null)
  // 顶面的内容随路径而变（这一面两条路径都有，故恒渲染、不条件渲染）：
  // - 工作台 / 储藏库（`word` 有值）：返回 + 「词典 › 词」面包屑 + 「已选 N 项」+ 「添加至…」
  // - 搜索路径（`word` 为 undefined）：**只**留「已选 N 项」+「添加至…」——返回与面包屑画在
  //   `DictDetailPanel` 自己的顶栏里（见那里的注释），底条不重复；而「已选」与「添加至…」
  //   必须挪出主面，否则主面在 390dp 上会被挤出屏幕（278 + 40 + 122 + 8 ≈ 448 > 366）。
  const hasCrumb = Boolean(word)
  const barHeight = CRUMB_HEIGHT + BAR_HEIGHT

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
      {/* 顶面：高度恒 34px，`hasCrumb` 只决定**里面画什么**（不条件渲染这一面本身——
          条件渲染会让底条高度在两条路径间变，正文下内距与条高因此要两处同步）。 */}
      <div
        className="flex items-center"
        style={{ height: `${CRUMB_HEIGHT}px`, gap: 8, borderBottom: '1px solid var(--color-border)' }}
      >
        {hasCrumb && (
          <>
            <button type="button" title="返回" aria-label="返回" onClick={onBack} style={iconBtn}>
              <Icon name="arrow-left" size={18} />
            </button>
            <span style={{
              flex: '1 1 auto', minWidth: 0, fontSize: 12, color: 'var(--color-text-tertiary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              词典 › <b style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{word}</b>
            </span>
          </>
        )}
        {/* 「已选 N 项」：勾选后的即时读数，两条路径都在（spec §4.5 的动作条清单）。
            搜索路径下它排最左、把右端顶给「添加至…」；词条页路径下它跟在面包屑后面，
            面包屑吸收余量（`flex: 1 1 auto`），读数与动作键都不缩。 */}
        <span style={{
          flexShrink: 0, fontSize: 11, color: 'var(--color-text-tertiary)',
          whiteSpace: 'nowrap', marginLeft: hasCrumb ? 4 : 0,
        }}>
          已选 <span className="stat-num">{mergeCount}</span> 项
        </span>
        {/* 「添加至…」：仍开 `CategoryPickerPopover`，文案与桌面逐字一致。两条路径都在这一面。 */}
        <div ref={anchorRef} style={{ marginLeft: 'auto' }}>
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

      {/* 主面：初始熟悉度 / 归属（左簇）+「＋」合并键（右端） */}
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

        {/* 「＋」＝原「合并添加 · N 项」：行为逐字不变（不传 categoryId，合并后落默认分类）。
            `size="touch"` 是 `SquareButton` 为手机外壳开的触屏档（32px）。
            `marginLeft: auto` 由外层 span 承担——`SquareButton` 不透传 `style`，与仓库里其他
            需要推开的按钮同一做法（包一层、不侵入组件）。
            **「已选 N 项」不在这里**：它在顶面（两条路径都在，见上），
            主面只留左簇 + 「＋」——390dp 上 278 + 40 + 122 + 8 ≈ 448 > 366，全堆在主面会溢出。 */}
        <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
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
        </span>
      </div>

      {/* 分类下拉：`fixed` 落位，锚点是顶面那枚「添加至…」的容器（见 popoverPosition 的契约）。
          朝上开（`placement="top"`）——锚点在视口下缘，向下没有空间。 */}
      {pickerOpen && (
        <CategoryPickerPopover anchor={anchorRef.current} onClose={closePicker}
          placement="top"
          onPick={categoryId => { closePicker(); onMergeAdd(categoryId) }} />
      )}
    </div>
  )
}
