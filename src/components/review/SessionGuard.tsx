import { useEffect, useRef } from 'react'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useUiStore } from '../../stores/uiStore'
import { useViewStore } from '../../stores/viewStore'
import { answeredCount } from '../../lib/review/nav'
import {
  ARENA_ATTR, clickStaysInArena, leaveMessage, parseIntent, decisionFor, isSessionLive,
} from '../../lib/review/sessionGuard'

/**
 * 答题中的离开守卫（v0.6.2 §5.2）。
 *
 * 只在有会话进行时挂监听。捕获阶段拦截——原始 handler 不会执行，故确认后要自己重放意图。
 * 取消时什么都不做：index / answered / phase 一个都不动。
 */
export default function SessionGuard() {
  const phase = useReviewSessionStore(s => s.phase)
  const sessionStrategy = useReviewSessionStore(s => s.sessionStrategy)
  // 会话进行中＝有会话且不在概览 / 小结态。与 ReviewModule 共用 isSessionLive 一处判据。
  const live = isSessionLive(phase, sessionStrategy)

  // 监听只挂一次，判据从 ref 读实时值——否则每答一题都要拆装一次监听
  const liveRef = useRef(live)
  liveRef.current = live

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null
      // 确认窗（uiStore.confirm）渲染在 AppShell 一层，天然落在 arena 之外；
      // 但它自己没有守卫标记、没有会话意图，故 decisionFor 判成 'ignore' 放行——不会自锁。
      const arena = document.querySelector(`[${ARENA_ATTR}]`)
      // 模态开着时判 'swallow'：区外带标记的控件被吞掉——既不弹第二个窗，也不放行给原 handler。
      // 遮罩层本身无标记，走 'ignore' 正常透传，点它照常关闭确认窗。
      const modalOpen = useUiStore.getState().confirmReq !== null
      // inArena 与 intent 无论会话是否进行都要算——decisionFor 是纯函数，
      // 判定逻辑（含 live / modalOpen 这两条）全在它里面，好处是全部可测。
      const inArena = clickStaysInArena(target, arena)
      const intent = parseIntent(target)
      const decision = decisionFor(liveRef.current, inArena, intent, modalOpen)
      // decisionFor 判成 'confirm' 时 intent 必非空；这里再判一次只是把它落到类型上，
      // 同时保证判定表哪天若改动也不会解引用 null。
      if (!intent || (decision !== 'confirm' && decision !== 'swallow')) return
      e.preventDefault()
      e.stopPropagation()
      // 吞掉即止步：这里不弹窗、不重放、不动任何 store 状态。
      if (decision === 'swallow') return

      const answered = answeredCount(useReviewSessionStore.getState().answered)
      const total = useReviewSessionStore.getState().queue.length
      const { title, message, confirmLabel } = leaveMessage(answered, total - answered)
      void useUiStore.getState().confirm({ title, message, confirmLabel, danger: true }).then(ok => {
        // 取消：原地不动。index / answered / phase 一个都不改——这里唯一的动作是 return。
        // 这条「取消不推进」由人工核对第 1 条直接验证（本仓库没有组件测试 harness），
        // 自动化那一半由 decisionFor 的测试承担：判定非 'confirm' 时根本走不到这里。
        if (!ok) return
        useReviewSessionStore.getState().reset()
        // 重放必须与被点按钮自己的 handler 一致：home 走 showWorkbench（连带复位
        // activeView / dictWord），module 走 showModule，strategy 走 setStrategy。
        if (intent.kind === 'home') {
          useViewStore.getState().showWorkbench()
        } else if (intent.kind === 'module') {
          useViewStore.getState().showModule(intent.value)
        } else {
          useReviewSessionStore.getState().setStrategy(intent.value)
        }
      })
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [])

  return null
}
