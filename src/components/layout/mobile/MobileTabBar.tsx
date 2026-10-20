import type { CSSProperties } from 'react'
import { useViewStore } from '../../../stores/viewStore'
import { MOBILE_TABS, tabActive, type MobileTabKey } from '../../../lib/mobileTabs'
import Icon from '../../icons'
import { useDueCount } from '../useDueCount'

/**
 * 手机底栏（Task 5，spec §4.1）：五格常显，顺序与图标照 `MOBILE_TABS`（Task 2）——
 * 与桌面活动栏（`ActivityRail`）的五格一一对应，同一个模块在两个外壳上长一样。
 *
 * 中间那格是搜索，做成**凸起的圆钮**：暖中性面 + 发丝边 + 阴影，靠尺寸与位置表达主入口，
 * 不用品牌蓝（spec §10：普通按钮一律暖中性，蓝只给状态）。圆钮向上凸出栏面 6px，
 * 由父级 `overflow: visible` 让它真的探出去（外壳的根是纵向 flex，不裁子项）。
 *
 * 复习格的到期徽标读 `useDueCount()`——与桌面标题栏 `DueBadge`、复习控制台**同一个数**
 * （同一份取数 / 轮询实现，见 `useDueCount.ts`）。徽标为 0 时不出（不出「0 张」占位）。
 *
 * 点击：搜索走 `openSearch()`（它保存来源模块与视图，`closeSearch` 据此回到来源），
 * 其余四格走 `showModule(key)`。
 */

/** 底栏高度（spec §4.1：约 62dp）。不含手势条——手势条由 `paddingBottom` 的安全区另加。 */
const BAR_HEIGHT = 62
/** 凸起的搜索圆钮：直径与凸出栏面的高度。 */
const FAB_SIZE = 46
const FAB_RISE = 6

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

/** 凸起的搜索圆钮：暖中性面（`surface-raised`）+ 发丝边 + 浮层阴影。 */
const fabStyle: CSSProperties = {
  width: `${FAB_SIZE}px`, height: `${FAB_SIZE}px`, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  // 探出栏面：栏高 62，圆钮 46，向上抬 6px 后圆钮顶缘在栏顶之上 6px
  marginTop: -FAB_RISE,
  borderRadius: '50%',
  border: '1px solid var(--color-hairline)',
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
        height: `${BAR_HEIGHT}px`,
        background: 'var(--color-chrome)',
        borderTop: '1px solid var(--color-border)',
        // 手势条（Android 手势导航）之上：底栏高度不含它，故这里补上
        paddingBottom: 'env(safe-area-inset-bottom)',
        // 让搜索圆钮探出栏顶（spec §4.1 的「居中凸起」）
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
