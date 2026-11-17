import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clampMenuPosition } from '../../lib/menuPosition'
import { hasCoarsePointer } from '../../lib/pointer'
import { useMobilePopup } from '../../lib/mobilePopups'

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
}

// 统一悬浮说明：定位 + 样式与语义网络既有 glossPop 一致（spec §4a）
export default function Tooltip({ content, children, width = 300, minWidth, style, click = false, tapOpen = false }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  // 「已被用户显式关掉、指针还没离开触发器」。Esc 与点回触发器都置位，
  // **只由指针进出触发器（mouseEnter / mouseLeave）或再次点开来解除**——
  // 改前是每次 mousemove 都把 Esc 的开关抹掉，于是 Esc 之后光标在图标上挪一下，窗口就自己回来了。
  // 只有开合模式（click，或触摸端的 tapOpen）会置位，纯悬停模式恒为 false，故下面 show 里的判据对它
  // 是死代码。触摸端没挂 hover，下次打开由点按显式置回，故不存在「自己顶回来」。
  const [dismissed, setDismissed] = useState(false)
  const hostRef = useRef<HTMLSpanElement>(null)
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

  // 嵌套 Tooltip：光标落在子级触发器内时（closest 命中 ≠ 自身 currentTarget）不打开，避免双层 portal 叠加
  const showAt = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement | null
    if (t?.closest('[data-tooltip-trigger]') !== e.currentTarget) return
    setPos({ x: e.clientX, y: e.clientY })
  }
  // 指针在触发器内移动：已关掉就不顶回来
  const show = (e: React.MouseEvent) => {
    if (dismissed) return
    showAt(e)
  }
  // 指针离开触发器 = 用户已经移开了，连同「已关掉」的标记一起解除，下次再回来照常打开
  const onLeave = () => {
    setDismissed(false)
    clickPendingRef.current = false
    setPos(null)
  }
  // 聚焦打开：没有鼠标坐标可用，位置取触发器自身的包围盒左下
  const showAtHost = () => {
    const el = hostRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: r.left, y: r.bottom })
  }

  const open = pos !== null

  // 触摸端点按开合时登记返回栈（第 1 条）：安卓返回键先关提示，不穿透到抽屉 / 模块 / 退出。
  // 只登记 tapOpen 这一条路——`click` 模式在触摸端的既有行为不变，也不占用返回键。
  useMobilePopup(tapToggle && open, () => { setDismissed(true); setPos(null) })

  useEffect(() => {
    if (!canToggle || !open) return
    // Esc 与「点外面」都只是「我不看了」：关掉，并同样置 dismissed，
    // 免得指针此刻正停在 ⓘ 上、下一次 mousemove 又把窗口顶回来。
    // 点外面挂在 document 的**捕获**阶段：触发器内部那次 click 会被 stopPropagation 吞在后面，
    // 能在捕获阶段走到这里的必然是外部点击，不会自己把自己关掉。
    // 触摸端的点外同样走 mousedown（触摸结束时浏览器补发的兼容事件），与桌面共用一套监听。
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDismissed(true); setPos(null) } }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (t && hostRef.current?.contains(t)) return
      setDismissed(true)
      setPos(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown, true)
    }
    // 依赖 open 而非 pos：pos 每次 mousemove 都在变，而闭包只用 hostRef，
    // 挂在开窗状态上就够，不必跟着指针位置反复拆装监听。
  }, [canToggle, open])

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
    if (open) {
      setDismissed(true)
      setPos(null)
    } else {
      setDismissed(false)
      showAtHost()
    }
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
      // 重新进入触发器才算「用户又看过来了」；留在原地挪动（mousemove）不算，故只在 enter 里解除 dismissed
      onMouseEnter={coarse ? undefined : e => { setDismissed(false); showAt(e) }}
      onMouseMove={coarse ? undefined : show}
      onMouseLeave={coarse ? undefined : onLeave}
      // focus / blur 是冒泡事件：子元素（本文档的 ⓘ 按钮）聚焦时事件从它冒到宿主，宿主一并跟随。
      // 只有 focus 这一半是「打开」路径、触摸端必须摘掉；blur 仍负责失焦即收，两种指针都挂。
      onFocus={coarse ? undefined : showAtHost}
      onBlur={() => setPos(null)}
      onClick={canToggle ? onClick : undefined}
    >
      {children}
      {open && content && createPortal(
        (() => {
          const p = clampMenuPosition(pos!.x + 14, pos!.y + 16, width, 160)
          return (
            <div style={{
              position: 'fixed', left: p.x, top: p.y, zIndex: 'var(--z-dropdown)',
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
