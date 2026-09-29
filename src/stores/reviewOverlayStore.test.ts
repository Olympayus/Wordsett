import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useReviewOverlayStore } from './reviewOverlayStore'
import { useSettingsStore } from './settingsStore'
import * as reviewDb from '../db/review'

vi.mock('../db/review', () => ({
  getWordReviewOverlay: vi.fn(),
  getStrategyCounts: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  useReviewOverlayStore.setState({ overlay: {}, dueWordIds: new Set<string>() })
  useSettingsStore.setState({ review: { ...useSettingsStore.getState().review, leechThreshold: 4 } })
})

describe('reviewOverlayStore.loadOverlay', () => {
  it('同时取 overlay 与到期词 id 集合——四视图与 chip 的数据源同点刷新', async () => {
    vi.mocked(reviewDb.getWordReviewOverlay).mockResolvedValue({
      ok: true, data: { w1: { maxLapses: 0, weakestStability: 3, familiarity: 1 } },
    })
    vi.mocked(reviewDb.getStrategyCounts).mockResolvedValue({
      ok: true, data: { today: 2, todayWordIds: ['w1', 'w2'], weak: 0 },
    })

    await useReviewOverlayStore.getState().loadOverlay()

    const s = useReviewOverlayStore.getState()
    expect(Object.keys(s.overlay)).toEqual(['w1'])
    expect([...s.dueWordIds].sort()).toEqual(['w1', 'w2'])
  })

  it('Leech 阈值与七日窗口取当前设置值', async () => {
    // 阈值读设置页——与 reviewService 走的是同一组值。钉住传参，省得将来有人把它写死。
    useSettingsStore.setState({ review: { ...useSettingsStore.getState().review, leechThreshold: 7 } })
    vi.mocked(reviewDb.getWordReviewOverlay).mockResolvedValue({ ok: true, data: {} })
    vi.mocked(reviewDb.getStrategyCounts).mockResolvedValue({
      ok: true, data: { today: 0, todayWordIds: [], weak: 0 },
    })

    await useReviewOverlayStore.getState().loadOverlay()

    expect(reviewDb.getStrategyCounts).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(reviewDb.getStrategyCounts).mock.calls[0][0]
    expect(arg.leechThreshold).toBe(7)
    expect(arg.recentWindowMs).toBe(7 * 86_400_000)
    // 听辨门控本 store 不探（那是 reviewService 的活，单一事实源）：字段缺省即关，
    // db 层按 `opts.allowListen === true` 判读，行为与 reviewService 传 false 时一致。
    expect(arg.allowListen).toBeUndefined()
  })

  it('取数失败时保留上一次的值，不清空', async () => {
    // 先成功取一次，让两个字段都有值。
    vi.mocked(reviewDb.getWordReviewOverlay).mockResolvedValue({
      ok: true, data: { w9: { maxLapses: 2, weakestStability: 4, familiarity: 2 } },
    })
    vi.mocked(reviewDb.getStrategyCounts).mockResolvedValue({
      ok: true, data: { today: 1, todayWordIds: ['w9'], weak: 1 },
    })
    await useReviewOverlayStore.getState().loadOverlay()

    // 再失败：徽标与 chip 是装饰层，一次读不到不该把上一次的正确数据抹掉。
    vi.mocked(reviewDb.getWordReviewOverlay).mockResolvedValue({ ok: false, error: 'boom' })
    vi.mocked(reviewDb.getStrategyCounts).mockResolvedValue({ ok: false, error: 'boom' })
    await useReviewOverlayStore.getState().loadOverlay()

    const s = useReviewOverlayStore.getState()
    expect(Object.keys(s.overlay)).toEqual(['w9'])
    expect([...s.dueWordIds]).toEqual(['w9'])
  })

  it('计数读失败时只保留 overlay，词 id 集合仍按上一次的值', async () => {
    // 两路取数各自独立回退：一路挂掉不该连累另一路。
    vi.mocked(reviewDb.getWordReviewOverlay).mockResolvedValue({
      ok: true, data: { w9: { maxLapses: 0, weakestStability: 4, familiarity: 1 } },
    })
    vi.mocked(reviewDb.getStrategyCounts).mockResolvedValue({
      ok: true, data: { today: 1, todayWordIds: ['w9'], weak: 0 },
    })
    await useReviewOverlayStore.getState().loadOverlay()

    vi.mocked(reviewDb.getWordReviewOverlay).mockResolvedValue({
      ok: true, data: { w8: { maxLapses: 0, weakestStability: 6, familiarity: 1 } },
    })
    vi.mocked(reviewDb.getStrategyCounts).mockResolvedValue({ ok: false, error: 'boom' })
    await useReviewOverlayStore.getState().loadOverlay()

    const s = useReviewOverlayStore.getState()
    expect(Object.keys(s.overlay)).toEqual(['w8'])
    expect([...s.dueWordIds]).toEqual(['w9'])
  })
})
