import { useEffect } from 'react'
import AppShell from '../components/layout/AppShell'
import { useWordStore } from '../stores/wordStore'
import { useCategoryStore } from '../stores/categoryStore'
import { useReviewOverlayStore } from '../stores/reviewOverlayStore'

export default function IndexPage() {
  const { loadWords } = useWordStore()
  const { loadCategories, loadWordCategoryMap } = useCategoryStore()
  const { loadOverlay } = useReviewOverlayStore()

  useEffect(() => {
    loadWords()
    loadCategories()
    loadWordCategoryMap()
    // 词表徽标与词条卡记忆强度的唯一数据源，与词表本身同批取（v0.6.4）
    loadOverlay()
  }, [loadWords, loadCategories, loadWordCategoryMap, loadOverlay])

  return <AppShell />
}
