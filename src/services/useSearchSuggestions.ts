import { useEffect, useState } from 'react'
import { searchLemmas, searchChinese } from './searchService'
import { isChineseQuery } from '../lib/chineseSearch'

/** 防抖时长（原 `TopBar` 内联的 300ms）：两处输入框共用同一份，不各写一个数字。 */
export const SEARCH_DEBOUNCE_MS = 300

/**
 * 搜索建议取数（Task 7 从 `TopBar.tsx` 抽出）：300ms 防抖、中文查询分流、
 * 输入法合成期（`isComposing`）守卫、中文释义（`zhGlosses`）取数。
 *
 * 桌面 `TopBar` 与手机 `MobileSearchPage` 共用这一份——两个界面的建议必须来自同一条路径，
 * 各写一遍的话「中文查询带释义、英文查询不带」这类细节迟早分家。
 *
 * 返回值里 `isComposing` 与 `setComposing` 是给输入框的 `onCompositionStart/End` 用的：
 * 合成期**不搜索**（中文输入法逐键上屏会让每敲一个字母都打一次词典），
 * `compositionend` 会把 `isComposing` 翻回 false、本 hook 的 effect 随之重跑并补上最后一次搜索。
 *
 * `failed` 是「这次取数抛了异常」的标志位：`console.error` 后静默（建议词保持上一次的结果，
 * 不把列表清空），是否出错误条由调用方决定——桌面 `TopBar` 有错误条，手机页没有对应条目。
 * 它在查询清空与取数成功两处复位，不会把上一次的失败带到下一次查询。
 */
export function useSearchSuggestions(query: string): {
  suggestions: string[]
  glosses: Record<string, string>
  isComposing: boolean
  setComposing: (v: boolean) => void
  failed: boolean
} {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [glosses, setGlosses] = useState<Record<string, string>>({})
  const [isComposing, setComposing] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([])
      setGlosses({})
      setFailed(false)
      return
    }
    if (isComposing) return  // 输入法合成中不搜索，compositionend 会触发本 effect 重跑
    const timer = setTimeout(async () => {
      try {
        // 中文路径取 hits（单词 + 释义）；英文路径仅单词。分开取而非共用三元：
        // TS 不会在 if(isChineseQuery) 内收窄 ChineseSearchHit[] | string[] 联合
        let words: string[]
        let nextGlosses: Record<string, string>
        if (isChineseQuery(query)) {
          const hits = await searchChinese(query)
          words = hits.map(h => h.word)
          nextGlosses = Object.fromEntries(hits.map(h => [h.word, h.translation] as const))
        } else {
          words = await searchLemmas(query)
          nextGlosses = {}
        }
        setSuggestions(words)
        setGlosses(nextGlosses)
        setFailed(false)
      } catch (e) {
        console.error('Search failed:', e)
        setFailed(true)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, isComposing])

  return { suggestions, glosses, isComposing, setComposing, failed }
}
