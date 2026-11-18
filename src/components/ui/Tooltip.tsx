import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { scaleForAnchor } from '../../lib/overlayZoom'
import { placeTooltip, type TooltipPlacement } from '../../lib/tooltipPosition'
import { hasCoarsePointer } from '../../lib/pointer'
import { useMobilePopup } from '../../lib/mobilePopups'

/** 悬停多久才出现：扫过一排图标时不弹窗，停住才给说明（用户要求，v0.7.10 收尾）。 */
const HOVER_DELAY_MS = 400
/** 面板与触发器之间的空隙（视觉像素）。 */
const ANCHOR_GAP = 8

interface Props {
  content: ReactNode
  children: ReactNode
  width?: number
  /**
   * v0.7.10：触发器宿主的额外内联样式。宿主的 `display: inline-flex` 是提示定位的基准，
   * 默认不参与外层布局；图表柱（`StatsMini`）需要 `flex: 1` 才不被压成零宽，
   * 活动栏设置钮需要 `marginTop: auto` 才能继续钉在左下角——这两处由调用点补。
   */
  style?: CSSProperties
  /**
   * v0.7.10：面板最小宽（px），默认不设。`width` 是 maxWidth，气泡按内容收缩；
   * 多行说明面板（设置页 §7.3）沿用旧的固定 320，传 `minWidth` 与 `width` 同值即可钉住。
   * 其余调用点不传，行为不变。
   */
  minWidth?: number
  /**
   * v0.6.3 条目 10：true = 点击开合（并支持 Esc / 点外面关闭），false = 仅悬停。
   * 默认 false 保持既有各调用点（`FreeScopePanel` 的不计分提示、`SemanticNetwork` 的
   * 三处 gloss / 关系说明、`WorkbenchNavBar` 的合并添加等）行为与改前逐字不变。
   * fine pointer 上**聚焦也打开**——只挂 hover 的话键盘用户够不到。
   * v0.7.10：`click` 只在 fine pointer 上生效。触摸端的开合统一收口到 `tapOpen`——
   * 聚焦只是点按的副产物，留着会和点按开合抢着开关；coarse 下也不再保留 `click` 的触摸入口
   * （矩阵：`tapOpen` 为假时不渲染任何触摸打开路径，信息由可见文字承载），
   * 需要触摸提示的调用点在 Task 13 补 `tapOpen`，而不是靠这条旧路径。
   */
  click?: boolean
  /**
   * v0.7.10：触摸端（coarse pointer）的点按开合。默认 false —— 只有声明了它，
   * 触摸端点按才开关（并登记返回栈，Esc / 点外面关闭）；没声明就**没有任何触摸打开路径**，
   * 信息得由可见文字承载（原生 `title` 已全站移除）。
   *
   * fine pointer 上此 prop 不改变任何行为：桌面继续悬停 / 移动 / 聚焦显示。
   * 功能型触发器（合并添加等）不要打开它——点按应当执行动作，而不是先弹说明。
   */
  tapOpen?: boolean
  /**
   * 落点方向（v0.7.10 收尾 2）。默认 `auto`：右侧 → 左侧 → 下方 → 上方，并沿交叉轴居中。
   * 顶部窗口控制键（最小化 / 最大化 / 关闭）显式传 `below`——它们贴着右上角，
   * 向左翻出的面板会盖住相邻按钮，影响操作。
   */
  placement?: TooltipPlacement
}

/**
 * 统一悬浮说明（v0.6.2 spec §4a）：portal 到 body、定位与样式与语义网络既有 glossPop 一致。
 *
 * **落点（v0.7.10 收尾修正）**：贴着触发器的包围盒展开，不再跟着指针坐标（+14/+16）走。
 * 先前那套在窗口边缘会被「按 300×160 估算的面板尺寸」钳出一大截——活动栏左下角的「设置」
 * 尤其明显：面板被推到指针上方一百多像素。现在：
 * - 横向由 `tooltipPosition` 给出（右缘放不下翻到左侧），与既有纯函数同一出处；
 * - 纵向由 `clampTooltipY` 按**渲染后实测的面板高度**收纳（下方放不下翻到上方）；
 * - 面板测量出来之前先 `visibility: hidden` 挂载，量完再显形，不会闪在错误位置。
 */
export default function Tooltip({ content, children, width = 300, minWidth, style, click = false, tapOpen = false, placement = 'auto' }: Props) {
  const [open, setOpen] = useState(false)
  // 打开那一刻的触发器矩形（视觉坐标，含 bottom——上下方向落点要用）。宿主不移动就不重算——
  // 提示跟着触发器，不跟指针。
  const [anchor, setAnchor] = useState<{ left: number; top: number; right: number; bottom: number } | null>(null)
  // 面板落点；null = 还没量到（面板此时不可见）。
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null)
  const hostRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // 悬停延迟计时器（Ref：不参与渲染，进出触发器时清掉即可）。
  const hoverTimer = useRef<number | null>(null)
  // 「紧随这次 mousedown 的那次 click 只是开窗的收尾，别当成用户要关」。
  // 用 ref 而非 state：两次派发之间隔着的那次 setState 还没落到 DOM 事件上。
  // 只在 fine pointer 的 click 模式里置位——触摸端不走聚焦开窗，莫须有的标记会把首次点按吃掉。
  const clickPendingRef = useRef(false)

  // 指针类型只在挂载时判一次：一个会话内输入设备不会变，matchMedia 也不是 React 状态；
  // 放进 state 初值即可，不必每次 mousemove 重渲染都去问一遍。
  const [coarse] = useState(hasCoarsePointer)
  // 触摸端不挂 hover（点按后浏览器还会补发兼容的 mouseenter / mousemove，挂着会被当成「指针又来了」）；
  // 聚焦打开同样是触摸路径的副作用，只在 fine pointer 上挂。
  // 开合模式按指针分流：fine pointer 只认 `click`（逐字不变），coarse 只认 `tapOpen`——
  // coarse 下 `click` 不提供触摸入口（矩阵要求），也不会被登记进返回栈。
  const tapToggle = coarse && tapOpen
  const canToggle = coarse ? tapToggle : click

  const clearHoverTimer = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }

  const hide = () => {
    clearHoverTimer()
    setPlaced(null)
    setAnchor(null)
    setOpen(false)
  }

  const openAtHost = () => {
    const el = hostRef.current
    if (!el) return
    clearHoverTimer()
    const r = el.getBoundingClientRect()
    setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
    setPlaced(null)
    setOpen(true)
  }

  const onEnter = (e: React.MouseEvent) => {
    // 已经开着（例如键盘聚焦先开、指针随后进来）就不用再排一次。
    if (open) return
    // 嵌套 Tooltip：光标落在子级触发器内时（closest 命中 ≠ 自身 currentTarget）不打开，避免双层 portal 叠加
    const t = e.target as HTMLElement | null
    if (t?.closest('[data-tooltip-trigger]') !== e.currentTarget) return
    clearHoverTimer()
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null
      openAtHost()
    }, HOVER_DELAY_MS)
  }
  // 指针离开触发器 = 用户已经移开了：清掉待触发的计时器并收起，下次再回来照常打开
  const onLeave = () => {
    clickPendingRef.current = false
    hide()
  }

  // 落点（v0.7.10 收尾）：面板挂载后量**真实尺寸**再定位。尺寸不能用 300×160 估算——
  // 贴近窗口下缘时那套估算会把面板往上推一百多像素（活动栏「设置」的旧缺陷）。
  // 方向与居中规则在 `placeTooltip` 里（纯函数、有单测）。
  useLayoutEffect(() => {
    if (!open || !anchor) return
    const panel = panelRef.current
    if (!panel) return
    // getBoundingClientRect 已含 scale(zoom)，量到的就是视觉尺寸，与锚点同一坐标系。
    const r = panel.getBoundingClientRect()
    setPlaced(placeTooltip(
      anchor,
      { width: r.width, height: r.height },
      placement,
      window.innerWidth,
      window.innerHeight,
      ANCHOR_GAP,
    ))
  }, [open, anchor, content, placement])

  // 触摸端点按开合时登记返回栈（第 1 条）：安卓返回键先关提示，不穿透到抽屉 / 模块 / 退出。
  // 只登记 tapOpen 这一条路——`click` 模式在触摸端的既有行为不变，也不占用返回键。
  useMobilePopup(tapToggle && open, hide)

  useEffect(() => {
    if (!canToggle || !open) return
    // Esc 与「点外面」都只是「我不看了」：关掉即可（没有 mousemove 重开路径，不需要额外的抑制标记）。
    // 点外面挂在 document 的**捕获**阶段：触发器内部那次 click 会被 stopPropagation 吞在后面，
    // 能在捕获阶段走到这里的必然是外部点击，不会自己把自己关掉。
    // 触摸端的点外同样走 mousedown（触摸结束时浏览器补发的兼容事件），与桌面共用一套监听。
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (t && hostRef.current?.contains(t)) return
      hide()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown, true)
    }
    // 依赖 open 而非 anchor：anchor 只在打开那一刻取一次，而闭包只用 hostRef，
    // 挂在开窗状态上就够，不必跟着落点反复拆装监听。
  }, [canToggle, open])

  // 卸载时清掉尚未触发的悬停计时器（列表行随时会被滚走 / 换词卸载）。
  useEffect(() => clearHoverTimer, [])

  const onFocus = (e: React.FocusEvent) => {
    if (coarse) return
    // click 模式（fine）保持原样：mousedown→focus 开窗是它「单击一次就开」的收尾机制。
    if (canToggle) { openAtHost(); return }
    // 纯悬停提示给键盘用户留一条路，但**鼠标点击**引起的聚焦不开窗（否则点任何图标按钮
    // 都会顺带弹出一枚提示，和刚弹出的菜单 / 对话框叠在一起）。
    // `:focus-visible` 不可用时（老内核）回落到旧行为：聚焦即开窗。
    const t = e.target as HTMLElement | null
    let keyboardFocus = true
    try { keyboardFocus = t ? t.matches(':focus-visible') : true } catch { /* 选择器不可用 → 当作键盘聚焦 */ }
    if (!keyboardFocus) return
    openAtHost()
  }

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // 点按钮的顺序是 mousedown → focus → click：焦点那次已经把说明窗开出来了，
    // 这次 click 是它的收尾而非「用户要关」——吃掉标记，单击一次就开得出（改前要点两下）。
    // 触摸端不置这个标记（没有聚焦开窗），分支自然走不到。
    if (clickPendingRef.current) {
      clickPendingRef.current = false
      return
    }
    // 其余按开关处理：鼠标的第二下，以及键盘 Enter / 空格（无 mousedown，走不到上一段）
    if (open) hide()
    else openAtHost()
  }

  return (
    <span
      ref={hostRef}
      style={{ display: 'inline-flex', ...style }}
      data-tooltip-trigger
      onMouseDown={click && !coarse ? () => {
        // 焦点若还在触发器之外，这次按下会把焦点挪进来——focus 在 click 之前派发并开窗，
        // 随后的 click 因此只是收尾。焦点已在触发器里则不会再有 focus，这次 click 就是用户按的开关。
        // 触摸端不挂（见 clickPendingRef 的注释）。
        const active = document.activeElement
        clickPendingRef.current = !(hostRef.current?.contains(active ?? null) ?? false)
      } : undefined}
      // 按下功能型图标（纯悬停提示）即收起：用户要动手了，提示不该继续挡着；
      // 也顺带清掉尚未触发的计时器，拖拽手柄按下后不会再半路弹出提示。
      // 开合模式不挂——它的按下正是开窗流程的一部分；触摸端也不挂（点按开合由 tapOpen 管）。
      onPointerDown={!coarse && !canToggle ? () => { clearHoverTimer(); if (open) hide() } : undefined}
      // 重新进入触发器才算「用户又看过来了」；留在原地挪动不算，故只在 enter 里解除 dismissed
      onMouseEnter={coarse ? undefined : onEnter}
      onMouseLeave={coarse ? undefined : onLeave}
      // focus / blur 是冒泡事件：子元素（本文档的 ⓘ 按钮）聚焦时事件从它冒到宿主，宿主一并跟随。
      // 只有 focus 这一半是「打开」路径、触摸端必须摘掉；blur 仍负责失焦即收，两种指针都挂。
      onFocus={coarse ? undefined : onFocus}
      onBlur={() => { clearHoverTimer(); if (open) hide() }}
      onClick={canToggle ? onClick : undefined}
    >
      {children}
      {open && content && createPortal(
        (() => {
          // 平板 zoom（v0.7.10 Task 18）：锚点矩形已是视觉坐标，落点直接可用；
          // 面板脱离缩放子树后按 1:1 渲染，套 scale(zoom) 才与周围同尺寸。
          const scale = scaleForAnchor(hostRef.current)
          return (
            <div ref={panelRef} role="tooltip" style={{
              // 层级（v0.7.10 修复）：portal 到 body 后必须压在宿主层之上。
              // 手机抽屉 / 模态是 `--z-modal`（40），信息型提示取 modal + 1；
              // 页内查找条是 5000 这个孤例（它在 body 顶层），提示必须再高一档，
              // 否则翻到左侧的「关闭查找」提示会被查找条本身盖住。
              // 提示是瞬态层，压过对话框不会遮挡用户操作（按下 / 离开即收起）。
              position: 'fixed',
              // 测量出来之前不可见：否则会先闪在 (0,0) 再跳到落点。
              left: placed ? placed.x : 0,
              top: placed ? placed.y : 0,
              visibility: placed ? 'visible' : 'hidden',
              zIndex: 5001,
              ...(scale ? { transform: scale.transform, transformOrigin: scale.transformOrigin } : null),
              maxWidth: width, minWidth, padding: '8px 12px',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-overlay)',
              fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
            }}>
              {content}
            </div>
          )
        })(),
        document.body
      )}
    </span>
  )
}
