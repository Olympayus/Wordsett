/**
 * 安卓返回栈（v0.7.10 Task 4）：手机与平板共用的订阅与动作分发。
 *
 * 从 `MobileShell` 的 `backHandler` 平移而来，逻辑逐字一致——手机行为零变化。平板的
 * 外壳是 `AppShell`（桌面三栏 + 缩放），它没有抽屉与设置子页，故传 `drawerOpen: false`、
 * `settingsSection: null`，那两层永远不会进栈。
 *
 * 「此刻栈里有什么」由**按下那一刻**的 store 现读出来，不缓存成 state：返回键只在安卓上
 * 到达，而这条路径的代价是一次 store 读，远小于「栈与真实状态不同步」这种只在真机上出现的错。
 *
 * 优先级（高 → 低）：动作表 sheet（Plan 2，本版无来源）→ 编辑 → 抽屉 → 词典详情 → 搜索
 * → 复习会话 → 设置子页 → 模块主页 → 词条导航。栈顶在数组第 0 位（`backAction` 只看这一个）。
 *
 * 调用点（`MobileShell` / `AppShell` 的 `android-tablet` 分支）把**外壳自己持有的**瞬时层
 * 状态与关闭动作传进来；其余层（详情 / 搜索 / 复习 / 导航 / 浮层）归本 hook 现读 store。
 * 三个入参与 `actions` 都经 ref 递进稳定闭包，保证按键时读到最新值（订阅只在挂载时发生一次）。
 */

import { useCallback, useEffect, useRef } from 'react'
import { useViewStore } from '../../stores/viewStore'
import { useNavHistoryStore } from '../../stores/navHistoryStore'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useUiStore } from '../../stores/uiStore'
import { backAction, backLayers } from '../../lib/mobileBackStack'
import { exitMobileApp, registerMobileBack } from '../../lib/mobileBackButton'
import { canGoBack } from '../../lib/navHistory'
import { go } from '../../lib/useWorkbenchNavigation'
import { answeredCount } from '../../lib/review/nav'
import { isSessionLive, leaveMessage } from '../../lib/review/sessionGuard'
import { closeTopMobilePopup } from '../../lib/mobilePopups'

/** 外壳自己持有的层的关闭动作（各调用点实现不同：手机接线、平板为空操作）。 */
export interface BackStackActions {
  cancelEdit: () => void
  closeDrawer: () => void
  closeSettingsSub: () => void
}

export interface AndroidBackStackInput {
  /** 词条页正在编辑某个字段（`WordWorkbench` 经 `onEditStateChange` 上报）。 */
  editing: boolean
  drawerOpen: boolean
  /** 设置页正在某个分区子页；`null` = 目录。平板没有子页，恒传 `null`。 */
  settingsSection: string | null
  actions: BackStackActions
}

export function useAndroidBackStack(input: AndroidBackStackInput): void {
  const { editing, drawerOpen, settingsSection, actions } = input

  // 返回键的 handler 必须**永远读到最新值**（订阅只在挂载时发生一次），故经 ref 递进去。
  const editingRef = useRef(editing)
  useEffect(() => { editingRef.current = editing }, [editing])
  const drawerOpenRef = useRef(drawerOpen)
  useEffect(() => { drawerOpenRef.current = drawerOpen }, [drawerOpen])
  const settingsSectionRef = useRef(settingsSection)
  useEffect(() => { settingsSectionRef.current = settingsSection }, [settingsSection])
  const actionsRef = useRef(actions)
  useEffect(() => { actionsRef.current = actions }, [actions])

  const backHandler = useCallback(() => {
    // 确认框压在最上面：返回键先「取消」它，不穿透到下面的层。
    // 不这么做的话，抽屉开着时弹删除确认，按返回会把**抽屉**关掉而弹窗还在，用户要点两次。
    // `dismissable: false` 的确认（桌面的关窗弹窗）不接返回——那两个按钮都是肯定动作，
    // 系统返回没有安全的默认值，吞掉比瞎猜好。
    const pending = useUiStore.getState().confirmReq
    if (pending) {
      if (pending.dismissable !== false) useUiStore.getState().resolveConfirm(false)
      return
    }
    // 分类分配 / 新建分类这两个弹窗同理：返回键先关它们，不穿透到抽屉 / 模块。
    const ui = useUiStore.getState()
    if (ui.assignWordId || ui.editorTarget) {
      ui.closeModals()
      return
    }
    // 自家浮层（⋯ 菜单 / 分类下拉）：它们的开关在组件局部、只监听 window 的 Escape，
    // 而安卓返回不是 DOM 事件（`mobilePopups` 的模块注释）。不先问这一下，菜单开着
    // 按返回会直接退出应用（层集合为空时），分类下拉开着则会把整页详情关掉。
    if (closeTopMobilePopup()) return
    const view = useViewStore.getState()
    // 「此刻有哪些层」的判据在 `backLayers`（纯函数，单测钉住组合）；这里只供当前状态。
    const layers = backLayers({
      module: view.activeModule,
      view: view.activeView,
      dictWord: view.dictWord,
      editing: !!editingRef.current,
      drawerOpen: drawerOpenRef.current,
      settingsSection: settingsSectionRef.current,
      canBack: canGoBack(useNavHistoryStore.getState().history),
      reviewLive: isSessionLive(useReviewSessionStore.getState().phase, useReviewSessionStore.getState().sessionStrategy),
    })

    const action = backAction(layers)
    switch (action.type) {
      case 'cancelEdit':
        actionsRef.current.cancelEdit()
        return
      case 'closeDrawer':
        actionsRef.current.closeDrawer()
        return
      case 'closeDict':
        // 词典详情的「关闭」按**当前模块**分两个入口，与面板自己的顶栏返回逐字同源：
        // 搜索模块里回搜索结果列表（查询与建议词都还挂着），词条页回词编辑视图。
        // 两个 action 今天实现相同（`expand` 的都是 `activeView:'workbench'` + 清 dictWord），
        // 但名字分开写——将来任一侧变语义时，返回键不会跟着悄悄改道。
        if (view.activeModule === 'search') view.showSearchResults()
        else view.showWorkbenchView()
        return
      case 'closeSearch':
        view.closeSearch()
        return
      case 'closeSettingsSub':
        actionsRef.current.closeSettingsSub()
        return
      case 'goHome':
        // 模块主页（复习概览 / 结算、设置目录）按返回回工作台。**不** reset 复习会话：
        // 结算页离开后会话仍保留，重新开始由结算页自己的按钮负责。
        useViewStore.getState().showWorkbench()
        return
      case 'leaveReview': {
        // 与 `SessionGuard` 同一条确认文案（`leaveMessage`）与同一个 store：桌面点别的模块时
        // 是它拦的，安卓返回键走这里——两条入口对同一个动作给同一句承诺。
        // 确认后：结束本轮并回工作台（返回键没有「原本想去哪」的意图，工作台是应用的主页）。
        const session = useReviewSessionStore.getState()
        const answered = answeredCount(session.answered)
        const message = leaveMessage(answered, session.queue.length - answered)
        void useUiStore.getState().confirm({ ...message, danger: true }).then(ok => {
          if (!ok) return
          useReviewSessionStore.getState().reset()
          useViewStore.getState().showWorkbench()
        })
        return
      }
      case 'closeSheet':
        // 动作表（Plan 2）尚不存在：本版没有任何来源会把 `sheet` 压进栈，走到这里即空操作。
        // 留着这个分支是为了让 `mobileBackStack` 的优先级表先就位，Plan 2 接上时只差一个 setState。
        return
      case 'popModule':
        // 上一个词条的跳转顺序（先切模块 → 再切数据集 → 最后选词）在 `go` 里，与顶栏那枚
        // 返回箭头**同一个函数**——两条路走同一个实现，顺序不可能分家。
        void go('back')
        return
      case 'exit':
        void exitMobileApp()
        return
      default: {
        // 穷尽性守卫：`backAction` 新增动作而这里没接时，这行会编译失败。
        const unhandled: never = action
        void unhandled
        return
      }
    }
  }, [])

  // 订阅用的 ref：`backHandler` 是稳定引用，但订阅发生在挂载那一刻（早于任何按键），
  // 用 ref 把「按下时的最新闭包」递进去，避免把闭包本身存成 state 后漏掉编辑态这类变化。
  const backHandlerRef = useRef(backHandler)
  useEffect(() => { backHandlerRef.current = backHandler }, [backHandler])

  // 挂载时订阅安卓返回键，卸载时退订（`registerMobileBack` 在它的失败路径上返回空操作的退订，
  // 故这里不必判断订阅是否成功）。
  useEffect(() => {
    let unsubscribe: () => void = () => {}
    let cancelled = false
    void registerMobileBack(() => backHandlerRef.current()).then(fn => {
      if (cancelled) { fn(); return }
      unsubscribe = fn
    })
    return () => { cancelled = true; unsubscribe() }
  }, [])
}
