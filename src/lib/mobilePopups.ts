import { useEffect, useRef } from 'react'

/**
 * 手机外壳的「自家浮层」登记处（返回栈第 1 条：关闭动作表 / 弹窗 / 键盘，spec §5.5）。
 *
 * 安卓返回键由 Tauri 的 `back-button` 事件递到 `MobileShell`，**不是** DOM 的 Escape，
 * 所以只看 `useUiStore.confirmReq` / `assignWordId` / `editorTarget` 还不够：⋯ 菜单
 * （`ContextMenu`）与分类下拉（`CategoryPickerPopover`）的开关状态都在组件局部，
 * 外壳看不见。它们只监听 window 上的 Escape —— 那条路在安卓上根本不会触发。
 *
 * 于是浮层打开时把「关掉自己」登记进来，返回键先问这里：有浮层就关浮层，不往下穿透。
 * 不把开关状态抬到外壳，是因为分类下拉挂在 `DictDetailPanel` → `MobileDictActionBar`
 * 两层之下（两条路径各一处），抬上去要在三处传同一份 state；而 ⋯ 菜单的锚点是顶栏私事。
 *
 * 后进先出：同一时刻理论上只有一层浮层，登记顺序按打开先后即可。
 */
let closers: Array<{ close: () => void }> = []

/** 登记一个「关掉这层浮层」的回调，返回注销函数（组件卸载或浮层关闭时调用）。 */
export function registerMobilePopup(close: () => void): () => void {
  const entry = { close }
  closers.push(entry)
  return () => { closers = closers.filter(e => e !== entry) }
}

/**
 * 关掉最上面那层浮层。返回是否真的关了一层——
 * 外壳据此判定这次返回已经被吃掉，不再继续走抽屉 / 模块 / 退出的优先级表。
 *
 * **先出栈再关**：关的动作是 React 的 setState，注销要等重渲染后的 effect 清理才发生；
 * 期间连按两次返回的话，第二次会再关同一个浮层、而不是退到下一层。
 * 组件自己的注销（同一次状态落定后）碰到已被移除的项是空操作，不会误删别人。
 */
export function closeTopMobilePopup(): boolean {
  const entry = closers.pop()
  if (!entry) return false
  entry.close()
  return true
}

/** 仅供测试：清空登记表，避免用例之间互相影响。 */
export function resetMobilePopups(): void {
  closers = []
}

/**
 * 浮层组件的接线点：`open` 为真期间登记，关闭或卸载时注销。
 *
 * `close` 经 ref 读取——调用点大多传内联箭头，若把它放进依赖数组，每次渲染都会
 * 注销再登记，浮层开着时的一次无关重渲染会把堆栈顺序搅乱。ref 在 effect 里同步，
 * 不必在渲染期写 ref。
 */
export function useMobilePopup(open: boolean, close: () => void): void {
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close })
  useEffect(() => {
    if (!open) return
    return registerMobilePopup(() => closeRef.current())
  }, [open])
}
