import { useEffect, useRef } from 'react'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useUiStore } from '../../stores/uiStore'
import { useViewStore, type ActiveModule } from '../../stores/viewStore'
import { answeredCount } from '../../lib/review/nav'
import { ARENA_ATTR, clickStaysInArena, leaveMessage, parseIntent, decisionFor } from '../../lib/review/sessionGuard'

/**
 * 答题中的离开守卫（v0.6.2 §5.2）。
 *
 * 只在有会话进行时挂监听。捕获阶段拦截——原始 handler 不会执行，故确认后要自己重放意图。
 * 取消时什么都不做：index / answered / phase 一个都不动。
 */
export default function SessionGuard() {
  const phase = useReviewSessionStore(s => s.phase)
  const sessionStrategy = useReviewSessionStore(s => s.sessionStrategy)
  // 会话进行中＝有会话且不在概览 / 小结态。与 ReviewModule 的 sessionLive 同一条判据。
  const live = phase !== 'overview' && phase !== 'summary' && sessionStrategy !== null

  // 监听只挂一次，判据从 ref 读实时值——否则每答一题都要拆装一次监听
  const liveRef = useRef(live)
  liveRef.current = live

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null
      // 确认窗（uiStore.confirm）渲染在 AppShell 一层，天然落在 arena 之外；
      // 但它自己没有守卫标记、没有会话意图，故 decisionFor 判成 'ignore' 放行——不会自锁。
      const arena = document.querySelector(`[${ARENA_ATTR}]`)
      // inArena 与 intent 无论会话是否进行都要算——decisionFor 是纯函数，
      // 判定逻辑（含 live 这条）全在它里面，好处是全部可测。
      const inArena = clickStaysInArena(target, arena)
      const intent = parseIntent(target)
      const decision = decisionFor(liveRef.current, inArena, intent)
      // decisionFor 判成 'confirm' 时 intent 必非空；这里再判一次只是把它落到类型上，
      // 同时保证判定表哪天若改动也不会解引用 null。
      if (decision !== 'confirm' || !intent) return   // allow / ignore 都不动状态
      e.preventDefault()
      e.stopPropagation()

      const answered = answeredCount(useReviewSessionStore.getState().answered)
      const total = useReviewSessionStore.getState().queue.length
      const { title, message, confirmLabel } = leaveMessage(answered, total - answered)
      void useUiStore.getState().confirm({ title, message, confirmLabel, danger: true }).then(ok => {
        // 取消：原地不动。index / answered / phase 一个都不改——这里唯一的动作是 return。
        // 这条「取消不推进」由人工核对第 1 条直接验证（本仓库没有组件测试 harness），
        // 自动化那一半由 decisionFor 的测试承担：判定非 'confirm' 时根本走不到这里。
        if (!ok) return
        useReviewSessionStore.getState().reset()
        if (intent.kind === 'module') {
          useViewStore.getState().showModule(intent.value as ActiveModule)
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
