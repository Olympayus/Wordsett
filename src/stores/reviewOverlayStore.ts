import { create } from 'zustand'
import { getWordReviewOverlay, type WordReviewOverlay } from '../db/review'

/**
 * 词级复习叠加层（连错次数 + stability），供词表徽标与词条卡记忆强度消费。
 *
 * 与 categoryStore 的 wordCategoryMap 同一形状——那处的先例证明「全库一次取数、
 * 组件按 wordId 查表」是这个规模的正确做法。
 *
 * 独立 store 而非并进 wordStore：它的刷新时机与词条内容不同（复习评分后要重取，
 * 而词条内容不用）。
 */
interface ReviewOverlayStore {
  overlay: Record<string, WordReviewOverlay>
  loadOverlay: () => Promise<void>
}

export const useReviewOverlayStore = create<ReviewOverlayStore>(set => ({
  overlay: {},
  loadOverlay: async () => {
    const r = await getWordReviewOverlay()
    // 取数失败时静默保留上一次的 overlay：徽标与 chip 是装饰层，
    // 一次读不到不该把上一次的正确数据显示清空，更不该抛进 UI。
    if (r.ok) set({ overlay: r.data })
  },
}))
