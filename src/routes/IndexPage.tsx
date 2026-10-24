import { useEffect } from 'react'
import AppShell from '../components/layout/AppShell'
import MobileShell from '../components/layout/mobile/MobileShell'
import { MobileBootstrapGate } from '../components/layout/mobile/MobileBootstrapGate'
import { useWordStore } from '../stores/wordStore'
import { useCategoryStore } from '../stores/categoryStore'
import { useReviewOverlayStore } from '../stores/reviewOverlayStore'
import { usePlatformClass } from '../lib/usePlatform'
import { usesMobileShell } from '../lib/platform'

export default function IndexPage() {
  const { loadWords } = useWordStore()
  const { loadCategories, loadWordCategoryMap } = useCategoryStore()
  const loadOverlay = useReviewOverlayStore(s => s.loadOverlay)
  // 设备形态（Android 手机外壳，Task 4）：初值在首次渲染前解析好，故首帧就挂对外壳，
  // 不会因为晚一帧判定而先闪一帧桌面布局。
  const platform = usePlatformClass()

  useEffect(() => {
    loadWords()
    loadCategories()
    loadWordCategoryMap()
    // 词表徽标与词条卡记忆强度的唯一数据源，与词表本身同批取（v0.6.4）
    loadOverlay()
  }, [loadWords, loadCategories, loadWordCategoryMap, loadOverlay])

  // 桌面直接挂 `AppShell`；Android（手机与平板）都要先过词典首启 gate——APK 内的词典是
  // asset，不是可读的普通文件，必须先复制到应用数据目录。平板今天复用 `AppShell`，
  // 但少了这层 gate 它连词典库都打不开（`resource_dir()` 在 Android 上不是真实目录）。
  if (platform !== 'desktop') {
    return (
      <MobileBootstrapGate>
        {usesMobileShell(platform) ? <MobileShell /> : <AppShell />}
      </MobileBootstrapGate>
    )
  }
  return <AppShell />
}
