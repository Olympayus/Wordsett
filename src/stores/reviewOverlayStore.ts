import { create } from 'zustand'
import { getWordReviewOverlay, getStrategyCounts, type WordReviewOverlay } from '../db/review'
import { useSettingsStore } from './settingsStore'

/**
 * 词级复习叠加层（连错次数 + stability），供词表徽标与词条卡记忆强度消费；
 * 外加今日「到期且可出题」的**词 id 集合**，供侧栏四视图（Plan B）筛选。
 *
 * 与 categoryStore 的 wordCategoryMap 同一形状——那处的先例证明「全库一次取数、
 * 组件按 wordId 查表」是这个规模的正确做法。
 *
 * 独立 store 而非并进 wordStore：它的刷新时机与词条内容不同（复习评分后要重取，
 * 而词条内容不用）。同理也不订阅 settingsStore 的 leechThreshold——阈值只在取数
 * 时非反应式地读一次（取数由复习动作显式触发，阈值改了随下一次取数自然生效）。
 * 注意这个「不重新耦合」的理由只针对 wordStore，与 settingsStore 没有这层顾虑。
 */
interface ReviewOverlayStore {
  overlay: Record<string, WordReviewOverlay>
  /** 今日「到期且可出题」的词 id 集合——侧栏复习到期视图的数据源，与复习控制台同源。 */
  dueWordIds: Set<string>
  loadOverlay: () => Promise<void>
}

export const useReviewOverlayStore = create<ReviewOverlayStore>(set => ({
  overlay: {},
  dueWordIds: new Set<string>(),
  loadOverlay: async () => {
    // 窗口与阈值与 reviewService.getStrategyCounts 用的是同一组值：
    // 七日回顾窗口 + 设置页的 Leech 阈值。
    const leechThreshold = useSettingsStore.getState().review.leechThreshold
    const [ov, counts] = await Promise.all([
      getWordReviewOverlay(),
      getStrategyCounts({ leechThreshold, recentWindowMs: 7 * 86_400_000, now: Date.now() }),
    ])
    // 取数失败时静默保留上一次的 overlay / 词 id 集合：徽标与 chip 是装饰层，
    // 一次读不到不该把上一次的正确数据显示清空，更不该抛进 UI。两路各自回退。
    if (ov.ok || counts.ok) {
      set(s => ({
        overlay: ov.ok ? ov.data : s.overlay,
        dueWordIds: counts.ok ? new Set(counts.data.todayWordIds) : s.dueWordIds,
      }))
    }
  },
}))
