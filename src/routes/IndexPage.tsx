import { useEffect } from 'react'
import AppShell from '../components/layout/AppShell'
import MobileShell from '../components/layout/mobile/MobileShell'
import { MobileBootstrapGate } from '../components/layout/mobile/MobileBootstrapGate'
import { useWordStore } from '../stores/wordStore'
import { useCategoryStore } from '../stores/categoryStore'
import { useReviewOverlayStore } from '../stores/reviewOverlayStore'
import { usePlatformClass, useTabletLayout } from '../lib/usePlatform'
import { isMobileOS, usesMobileShell, usesTabletLayout } from '../lib/platform'
import { applyScreenOrientation } from '../lib/mobileBackButton'

export default function IndexPage() {
  const { loadWords } = useWordStore()
  const { loadCategories, loadWordCategoryMap } = useCategoryStore()
  const loadOverlay = useReviewOverlayStore(s => s.loadOverlay)
  // 设备形态（Android 手机外壳，Task 4）：初值在首次渲染前解析好，故首帧就挂对外壳，
  // 不会因为晚一帧判定而先闪一帧桌面布局。
  const platform = usePlatformClass()
  // 移动端（Android / iOS）：手机外壳与首启 gate 都按这一类判；平板另走缩放宿主。
  const mobileOS = isMobileOS(platform)
  const tablet = usesTabletLayout(platform)
  // 平板缩放（v0.7.8 / v0.8.0）：非平板恒为 1，故下面的宿主只在平板档时挂。
  const { zoom } = useTabletLayout()

  useEffect(() => {
    loadWords()
    loadCategories()
    loadWordCategoryMap()
    // 词表徽标与词条卡记忆强度的唯一数据源，与词表本身同批取（v0.6.4）
    loadOverlay()
  }, [loadWords, loadCategories, loadWordCategoryMap, loadOverlay])

  // 方向锁定（v0.7.8）：手机竖屏、平板横屏、桌面不锁（`orientationFor`）。挂载时按形态锁一次。
  // 此前这次调用挂在 `MobileShell` 里，平板复用 `AppShell` 后那条路径不再经过它，故上移到
  // 外壳分发的唯一入口——**全仓只保留这一处**。失败由 `applyScreenOrientation` 自己吞掉。
  useEffect(() => {
    if (mobileOS) applyScreenOrientation(platform)
  }, [platform, mobileOS])

  // Android / iOS 都要过词典首启 gate——APK 内的词典是 asset，不是可读的普通文件，
  // 必须先复制到应用数据目录。平板复用 `AppShell`，但少了这层 gate 它连词典库都打不开
  // （`resource_dir()` 在移动端不是真实目录）。
  if (mobileOS) {
    return (
      <MobileBootstrapGate>
        {usesMobileShell(platform)
          ? <MobileShell />
          : tablet
            // 平板：桌面三栏整体缩放。`width` / `height` 必须**同时**补偿——`zoom` 缩的是
            // 布局尺寸，只补宽度会让内容在纵向上缩成一截、底下留一条空白。
            ? (
              // 高度走 `ws-tablet-host` 类（v0.8.0 终审 R7）：`100dvh` 不可用的引擎退回
              // `100vh`，缩放量经 CSS 自定义属性传入（见 `index.css`）。
              <div
                className="ws-tablet-host"
                style={{ zoom, width: `calc(100vw / ${zoom})`, ['--ws-tablet-zoom' as any]: zoom }}
              >
                <AppShell tablet />
              </div>
            )
            : <AppShell />}
      </MobileBootstrapGate>
    )
  }
  return <AppShell />
}
