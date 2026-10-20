import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useSettingsStore } from '../../stores/settingsStore'
import { useViewStore } from '../../stores/viewStore'
import { getStrategyCounts, REVIEW_DEFAULTS } from '../../services/reviewService'

/** Android 判定（Task 5）：Android 没有托盘命令，`update_tray_badge` 在它上面不存在。 */
const IS_ANDROID = /Android/i.test(navigator.userAgent)

/**
 * 今日到期数 + 托盘上报（Task 5 从 `DueBadge.tsx` 抽出的取数与轮询）。
 *
 * 两个消费点：桌面标题栏的 `DueBadge`（`showDueBadge` 关掉时它不渲染，但托盘数字照报）
 * 与手机底栏的复习格徽标（无 `showDueBadge` 开关，恒显）。取数口径与刷新时机在两个消费点
 * 之间必须一致，故整段原样搬过来、一处实现。
 *
 * 取数：与控制台空闲态那个「n 张待复习」**同一个数**——两边都读 getStrategyCounts().today
 * （getOverview().total 就是它），故必然同值。每分钟轮询一次。
 *
 * v0.6.3 打磨改了口径：这个数现在是**到期熟词的积压量**，只过字段掩码，
 * 不再经本轮组卷——因此它不受「队列上限」截断（那是单轮的出题上限），也不受两道内容闸门
 * 影响。早先它读本轮组卷后的队列长度，于是到期积压 45、上限 30 时会印 30，
 * 与「今天到底积压了多少」不是一回事。
 * 代价（有意接受）：积压超过队列上限时，做完一轮这个数不会归零，剩下的留到下一轮。
 * 另一面：新词不计入这个数（新卡没有 due_at），所以「今天只有新词可学」时它是 0
 * ——控制台的「新词: n」仍然照报。
 * **复习页的空态不再看这个数**（v0.7.1 起看 getOverview().deliverable）：
 * 这里不报，不等于那页没题可出。
 *
 * 参数：today 只由到期集与 allowListen 决定，**与四个设置项都无关**，故这里不再订阅
 * 任何复习设置（早先订阅是为了与控台同口径，现在两边同一个数、口径不会再分家），
 * 只在取数时非反应式地读一次当前设置——将来若 today 用上某个设置，口径自然跟用户设置走。
 * 成本：固定三条只读 SQL（到期集 + 字段掩码 + 薄弱卡），不随额度变化、不写库。
 * 第三条是 getStrategyCounts 顺带算的 weak（本处不用）——它同时服务控台的「薄弱词: n」，
 * 故不为了省这一条而在 db 层拆出第二份掩码判定。
 * 依赖里带 activeModule：离开复习模块时补取一次，做完一整轮退出复习模块，
 * 数字立刻重新取数；不带的话只能等下一次轮询，那个数最坏要在屏上滞留一分钟。
 *
 * 托盘：托盘菜单第二项与 tooltip 用的是**同一个数**（v0.7.0 §4.8），故无条件上报——
 * `showDueBadge` 只闸住**标题栏**那个数，关掉标题栏徽标不该让托盘数字也停更。
 * **Android 上整条跳过**：那是 Rust 侧的托盘命令（`tray.rs`，`desktop` 单实例插件），
 * Android 没有托盘也没有这个命令，调它只会抛一次 unhandled rejection（每 60s 一次，
 * 外加每次窗口 show）。判据与 `lib/usePlatform.ts` 逐字一致。
 */
export function useDueCount(): number {
  const show = useSettingsStore(s => s.review.showDueBadge)
  const activeModule = useViewStore(s => s.activeModule)
  const [count, setCount] = useState(0)

  useEffect(() => {
    let alive = true
    const refresh = async () => {
      const { review } = useSettingsStore.getState()
      const n = (await getStrategyCounts({ ...REVIEW_DEFAULTS, ...review })).today
      if (alive && show) setCount(n)
      // 托盘上报：只在非 Android 执行（Android 没有 `update_tray_badge` 这个命令）。
      if (alive && !IS_ANDROID) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('update_tray_badge', { remaining: n })
      }
    }
    refresh()
    const timer = setInterval(refresh, 60_000)

    // 窗口 show / hide 时 Rust 会发这个事件：隐藏后 webview 定时器可能被节流，
    // 光靠 60s 轮询会让托盘数字停在隐藏前那一刻。收到就补刷一次。
    const unlisten = listen('main-window-shown', () => { void refresh() })

    return () => {
      alive = false
      clearInterval(timer)
      void unlisten.then(f => f())
    }
  }, [show, activeModule])

  return count
}
