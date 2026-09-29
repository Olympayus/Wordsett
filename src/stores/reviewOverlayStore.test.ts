import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useReviewOverlayStore } from './reviewOverlayStore'
import { useSettingsStore } from './settingsStore'
import { isListenEnabled } from '../lib/review/ttsGate'
import * as reviewDb from '../db/review'

vi.mock('../db/review', () => ({
  getWordReviewOverlay: vi.fn(),
  getStrategyCounts: vi.fn(),
}))

// ttsGate 的探测在 node 环境下永远是「不可用」，直接断言 false 等于把「恒为关」也钉死，
// 钉不出接线。改成打桩：下面两个用例一个给 true 一个给 false，两条都过才说明
// store 真读了 isListenEnabled() 并原样往下传（写死任一个值都会红）。
vi.mock('../lib/review/ttsGate', () => ({ isListenEnabled: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  useReviewOverlayStore.setState({ overlay: {}, dueWordIds: new Set<string>() })
  useSettingsStore.setState({ review: { ...useSettingsStore.getState().review, leechThreshold: 4 } })
  vi.mocked(isListenEnabled).mockReturnValue(true)   // 默认按「TTS 可用」打桩
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
  })

  it('听辨门控跟着 ttsGate 走：TTS 可用时放行 listen 卡，与控制台同一批词', async () => {
    // 评审 Important #1：不传这个参数时，dueWordIds 就是控制台 today 的**真子集**——
    // 只有 listen 一张到期卡的词，TTS 可用时控制台数得到、侧栏进不来，
    // 于是「侧栏说 32、进去 28」（spec §4.4 要避免的分家）。故必须原样透传。
    vi.mocked(reviewDb.getWordReviewOverlay).mockResolvedValue({ ok: true, data: {} })
    vi.mocked(reviewDb.getStrategyCounts).mockResolvedValue({
      ok: true, data: { today: 1, todayWordIds: ['wl'], weak: 0 },
    })

    await useReviewOverlayStore.getState().loadOverlay()
    expect(isListenEnabled).toHaveBeenCalled()
    expect(vi.mocked(reviewDb.getStrategyCounts).mock.calls[0][0].allowListen).toBe(true)
  })

  it('听辨门控为关时同样如实透传，不被本 store 改写', async () => {
    // 另一侧：这条钉的是「没有写死 true」。两条一起过，才证明值是读来的而非常量。
    vi.mocked(isListenEnabled).mockReturnValue(false)
    vi.mocked(reviewDb.getWordReviewOverlay).mockResolvedValue({ ok: true, data: {} })
    vi.mocked(reviewDb.getStrategyCounts).mockResolvedValue({
      ok: true, data: { today: 0, todayWordIds: [], weak: 0 },
    })

    await useReviewOverlayStore.getState().loadOverlay()
    expect(vi.mocked(reviewDb.getStrategyCounts).mock.calls[0][0].allowListen).toBe(false)
  })

  // 同一个门控值必须**同时**喂两路。只喂计数那一路时，TTS 可用机上「只有一张 listen 卡
  // 且已评分」的词在控制台的 today 里数得到、在 chip / 直方图的读数里却像那张卡不存在
  // （回落冷启动档、落档 0）——两处对同一个词说法不一。倒着传（overlay 拿 true、
  // 计数拿 false）也会造成同样的分家，故两侧都断。
  it('同一个门控值同时透传给 overlay 与计数：TTS 可用时两侧都是 true', async () => {
    vi.mocked(reviewDb.getWordReviewOverlay).mockResolvedValue({ ok: true, data: {} })
    vi.mocked(reviewDb.getStrategyCounts).mockResolvedValue({
      ok: true, data: { today: 1, todayWordIds: ['wl'], weak: 0 },
    })

    await useReviewOverlayStore.getState().loadOverlay()
    // 签名是 (h?, opts?)：第二个实参才是 opts，别被 undefined 骗了。
    expect(vi.mocked(reviewDb.getWordReviewOverlay).mock.calls[0][1]).toEqual({ allowListen: true })
    expect(vi.mocked(reviewDb.getStrategyCounts).mock.calls[0][0].allowListen).toBe(true)
  })

  it('同一个门控值同时透传给 overlay 与计数：TTS 不可用时两侧都是 false', async () => {
    vi.mocked(isListenEnabled).mockReturnValue(false)
    vi.mocked(reviewDb.getWordReviewOverlay).mockResolvedValue({ ok: true, data: {} })
    vi.mocked(reviewDb.getStrategyCounts).mockResolvedValue({
      ok: true, data: { today: 0, todayWordIds: [], weak: 0 },
    })

    await useReviewOverlayStore.getState().loadOverlay()
    expect(vi.mocked(reviewDb.getWordReviewOverlay).mock.calls[0][1]).toEqual({ allowListen: false })
    expect(vi.mocked(reviewDb.getStrategyCounts).mock.calls[0][0].allowListen).toBe(false)
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
