import { useEffect, useState } from 'react'
import { useMobilePopup } from '../../lib/mobilePopups'
import { shouldSkipContextMenu } from '../../lib/contextMenu'
import { usePlatformClass } from '../../lib/usePlatform'
import ContextMenu from './ContextMenu'

interface TextMenuState {
  x: number
  y: number
  target: HTMLInputElement | HTMLTextAreaElement
  hasSelection: boolean
}

// 全局右键处理（v0.4.3 §3）：
// - 任何位置右键都禁止浏览器默认菜单（custom 菜单已在各自 onContextMenu 打开，不受影响）；
// - 文本输入框/文本域右键弹出自定义「复制/粘贴」菜单（复用 ContextMenu 样式）；
// - 非输入区右键无效果。
// v0.8.0 Task 12：移动形态（Android / iOS）的输入框**放行系统菜单**——WKWebView 里
// 粘贴菜单是系统能力，自绘菜单替代不了；桌面行为逐字不变（判据见 `lib/contextMenu.ts`）。
// 挂载在 App 根，生命周期与应用一致；关闭由 ContextMenu 内部的点外/Esc/滚动/缩放监听负责。
export default function TextContextMenu() {
  const [menu, setMenu] = useState<TextMenuState | null>(null)
  const platform = usePlatformClass()

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? null
      // 移动形态的输入框不拦：交给系统粘贴菜单（此时也不弹自绘菜单）。
      if (shouldSkipContextMenu(platform, tag)) return
      e.preventDefault()
      const editable = (e.target as HTMLElement | null)?.closest?.('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null
      if (editable) {
        const start = editable.selectionStart ?? 0
        const end = editable.selectionEnd ?? 0
        setMenu({ x: e.clientX, y: e.clientY, target: editable, hasSelection: end > start })
      } else {
        setMenu(null)
      }
    }
    window.addEventListener('contextmenu', onContextMenu, true)
    return () => window.removeEventListener('contextmenu', onContextMenu, true)
  }, [platform])

  const close = () => setMenu(null)

  // 文本菜单开着时登记给外壳：安卓返回键先关菜单，而不是把整个页面退掉。
  useMobilePopup(menu !== null, close)

  const handleCopy = async () => {
    if (!menu) return
    const el = menu.target
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const text = el.value.slice(start, end)
    try {
      if (text) await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('复制失败:', err)
    }
    close()
  }

  const handlePaste = async () => {
    if (!menu) return
    const el = menu.target
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch (err) {
      console.error('读取剪贴板失败:', err)
      close()
      return
    }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    el.focus()
    // setRangeText 直接替换选区；再派发 input 事件让 React 受控组件同步
    el.setRangeText(text, start, end, 'end')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    close()
  }

  if (!menu) return null

  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      items={[
        { key: 'copy', label: '复制', disabled: !menu.hasSelection, onSelect: handleCopy },
        { key: 'paste', label: '粘贴', onSelect: handlePaste },
      ]}
      onClose={close}
    />
  )
}
