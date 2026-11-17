import StatsMini from './StatsMini'
import type { ReviewStats } from './StatsMini'

/**
 * 今日复习概览（桌面右栏）：只摆数据——标题 + 统计图。
 *
 * v0.7.10 §7.7：开始按钮统一到左栏（`StrategyList` 的 `start` 插槽），本组件不再渲染按钮，
 * `onStart` / `canStart` / `startLabel` 三个 props 一并移除。
 *
 * 原先 `canStart` 还兼职「暂无可复习的内容」的早退空态（v0.7.1 起的判据：`deliverable > 0`，
 * 见 `reviewService.getOverview` 的同名字段注释）——那只是「按钮能不能按」这条判据的副产物。
 * 按钮搬到左栏后，「今天没有待复习的词」由左栏按钮的置灰原因承担；右栏的数据展示保持常显
 * （spec §7.7「保留右侧数据展示」），不再整页换成一段空态。
 */
export default function OverviewPanel({ title, stats }: {
  title: string
  stats: ReviewStats
}) {
  return (
    <div className="flex flex-col items-start gap-5 p-8">
      <h2 style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'var(--font-serif)' }}>{title}</h2>
      <StatsMini stats={stats} />
    </div>
  )
}
