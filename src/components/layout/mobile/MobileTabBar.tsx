import type { CSSProperties } from 'react'
import { useViewStore } from '../../../stores/viewStore'
import { MOBILE_TABS, tabActive, type MobileTabKey } from '../../../lib/mobileTabs'
import Icon from '../../icons'
import { useDueCount } from '../useDueCount'

/**
 * 手机底栏（Task 5，spec §4.1）：五格常显，顺序与图标照 `MOBILE_TABS`（Task 2）——
 * 与桌面活动栏（`ActivityRail`）的五格一一对应，同一个模块在两个外壳上长一样。
 *
 * 中间那格是搜索，做成**圆形钮**：暖中性面 + 发丝边 + 阴影，靠尺寸与形状表达主入口，
 * 不用品牌蓝（spec §10：普通按钮一律暖中性，蓝只给状态）。圆钮**完整收在栏面内**
 * （用户裁定：不再向上凸起），纵向居中于底栏。
 *
 * 复习格的到期徽标读 `useDueCount()`——与桌面标题栏 `DueBadge`、复习控制台**同一个数**
 * （同一份取数 / 轮询实现，见 `useDueCount.ts`）。徽标为 0 时不出（不出「0 张」占位）。
 *
 * 点击：搜索走 `openSearch()`（它保存来源模块与视图，`closeSearch` 据此回到来源），
 * 其余四格走 `showModule(key)`。
 */

/** 底栏高度（spec §4.1：约 62dp）。不含手势条——手势条由 `paddingBottom` 的安全区另加。 */
const BAR_HEIGHT = 62

/**
 * 搜索圆钮（用户裁定：**不再凸起**，完整形状收在底栏内）：直径 52、纵向居中于 62px 的栏面，
 * 外圈 5px 的 `--color-chrome` 环保留（圆钮与栏面之间的那一圈仍是栏面同色，圆钮读作嵌在栏里）。
 *
 * 环用 `border` 画。Tailwind preflight 的 `box-sizing: border-box` 让 `width/height` 成为
 * **含环**尺寸（内容盒因此是 52 − 2×5 = 42px）——预览页同样是 `border-box` + `width:52px`。
 *
 * 上一版靠 `marginTop: -17`（半径 26，圆心落在栏面上缘）让圆钮探出栏顶 6px；
 * 现在改为 `alignSelf: 'center'`，圆心回到栏面中轴，上下各留 (62 − 52) / 2 = 5px。
 */
const FAB_SIZE = 52
const FAB_RING = 5

/** 普通格：图标 + 下方小字。命中区 44dp 由格子自身高度保证（62px 栏 + 12px 上下内边距）。 */
const cellStyle = (on: boolean): CSSProperties => ({
  flex: '1 1 0', minWidth: 0, height: `${BAR_HEIGHT}px`,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
  border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
  fontFamily: 'var(--font-sans)',
  // 选中态只换**字**与图标的颜色（主色），不换底、不换字重：底栏是导航，蓝 / 主色在这里
  // 表达「你在这里」，符合蓝色收窄规则第 1 条
  color: on ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
  fontSize: 11, lineHeight: 1,
  transition: 'color var(--duration-fast) var(--ease-smooth)',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
})

/** 到期徽标：右上角一枚小胶囊。颜色取暖橙（`--color-accent`）——与桌面 chip 的 t2 档同色，
 *  都是「有积压」这一状态，不用品牌蓝（蓝在本仓只表示选中 / 激活 / 正在编辑）。 */
const badgeStyle: CSSProperties = {
  position: 'absolute', top: 4, right: '50%', transform: 'translateX(12px)',
  minWidth: 15, height: 15, padding: '0 4px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--color-accent)', color: '#FFFFFF',
  borderRadius: 8, fontSize: 10, lineHeight: 1, fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
}

/**
 * 底栏中轴上的搜索圆钮：暖中性面（`surface-raised`）+ 5px 栏面同色环 + 浮层阴影。
 *
 * `alignSelf: 'center'` 让 52px 的圆在 62px 的栏面里纵向居中（父级 `items-stretch` 会把
 * 不写高度的子项拉满，故这里必须显式居中）。**不写负 marginTop**：上一版靠它向上凸出
 * 17px，用户裁定改为完整形状收在底栏内。
 *
 * 阴影取 `--shadow-overlay`（全站唯一的浮层阴影），不新造色值。
 */
const fabStyle: CSSProperties = {
  width: `${FAB_SIZE}px`, height: `${FAB_SIZE}px`, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  alignSelf: 'center',
  borderRadius: '50%',
  // 环与栏面同色（`--color-chrome`）：圆钮压在栏上时，环把两者的缝填掉
  border: `${FAB_RING}px solid var(--color-chrome)`,
  background: 'var(--color-surface-raised)',
  boxShadow: 'var(--shadow-overlay)',
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
  transition: 'background-color var(--duration-fast) var(--ease-smooth)',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
}

export default function MobileTabBar() {
  const activeModule = useViewStore(s => s.activeModule)
  const showModule = useViewStore(s => s.showModule)
  const openSearch = useViewStore(s => s.openSearch)
  const due = useDueCount()

  const click = (key: MobileTabKey) => {
    if (key === 'search') { openSearch(); return }
    showModule(key)
  }

  return (
    <nav
      aria-label="模块"
      className="shrink-0 flex items-stretch"
      style={{
        // **高度含安全区**：`height` 里加上 `env(safe-area-inset-bottom)`，而不是用
        // `paddingBottom`。Tailwind preflight 的 `box-sizing: border-box` 让固定 `height`
        // 成为**含内边距**的尺寸——写 `height: 62px` 再叠 `paddingBottom: 20px`，内容盒
        // 只剩 42px，而格子的 `height: 62px` 照旧，于是格子溢出、压在手势条上（spec §10
        // 明确要求「底栏不压手势条」）。加进 `height` 里则内容盒仍是完整的 62px。
        height: `calc(${BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
        background: 'var(--color-chrome)',
        borderTop: '1px solid var(--color-border)',
        // 圆钮已不凸起，`overflow: visible` 保留为壳层的既有约定（外壳是纵向 flex，不裁子项）
        overflow: 'visible',
      }}
    >
      {MOBILE_TABS.map(tab => {
        const on = tabActive(tab.key, activeModule)
        if (tab.key === 'search') {
          return (
            <button
              key={tab.key}
              type="button"
              title="搜索"
              aria-label="搜索"
              aria-current={on ? 'page' : undefined}
              onClick={() => click(tab.key)}
              style={fabStyle}
            >
              <Icon name="search" size={20} />
            </button>
          )
        }
        return (
          <button
            key={tab.key}
            type="button"
            title={tab.label}
            aria-label={tab.label}
            aria-current={on ? 'page' : undefined}
            onClick={() => click(tab.key)}
            style={{ ...cellStyle(on), position: 'relative' }}
          >
            <Icon name={tab.icon} size={19} />
            <span>{tab.label}</span>
            {tab.key === 'review' && due > 0 && (
              <span style={badgeStyle} aria-label={`${due} 张待复习`}>{due}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
