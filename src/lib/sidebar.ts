import type { WordWithPreview } from '../types/word'
import type { Category } from '../types/category'

export type SidebarMode = 'alphabet' | 'category'

export const SIDEBAR_EXPANDED_WIDTH = 300

/**
 * 展开态一行的估算高度（v0.7.2：76 → 49）。
 *
 * 逐项相加：上下内边距 12（6 + 6）+ 词头一行 19.5（15px × 1.3）+ 行间距 2 + 行 2 一行。
 * 行 2 那一行的高度**随内容而异**，不是单一个数：它是 `align-items: flex-start` 的两栏——
 * 左栏文字（音标/词性 11.5px × 1.3 = 14.95；挂了分隔点则 12px × 1.3 = 15.6）与
 * 右栏分类胶囊（固定 `height: 16px`）。故行 2 = max(文字, 胶囊)：
 *   · 无胶囊、无分隔点 → max(14.95, 0) = 14.95 → 整行 ≈ 48.5
 *   · 有胶囊          → max(文字, 16) = 16     → 整行 ≈ 49.5
 * 本常量取近中值 49；虚拟列表的 `measureElement` 会对每行实测，亚像素残差由它兜住。
 *
 * 设计稿的 44px 到不了：扣掉 12 的内边距与 2 的行距只剩 34 摊给两行文字，而词头
 * 15px/1.3 一行就 19.5。故取设计文档 line 301 的 §7 逃生舱（「44px 是紧的，不合适就停在
 * 48–52」）。
 *
 * **虚拟列表的估算高度必须引用它**——估算值一旦与真实行高分家，滚动条与 scrollToIndex
 * 的吸附位置会一路漂。
 */
export const SIDEBAR_ROW_HEIGHT = 49
export const SIDEBAR_ROW_PADDING = '6px 12px'
/** 收起态行高（未改） */
export const SIDEBAR_ROW_HEIGHT_COLLAPSED = 32

export interface LetterGroup {
  letter: string
  words: WordWithPreview[]
}

// 字母模式：按首字母分组，A-Z 排序；非字母按原字符（数字等）
export function groupByLetter(words: WordWithPreview[]): LetterGroup[] {
  const map = new Map<string, WordWithPreview[]>()
  for (const w of words) {
    const letter = w.lemma.trim().charAt(0).toUpperCase() || '#'
    if (!map.has(letter)) map.set(letter, [])
    map.get(letter)!.push(w)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, list]) => ({ letter, words: list }))
}

export interface CategoryGroup {
  category: Category | null   // null = 未分类
  words: WordWithPreview[]
}

// 分类模式：有词的分类一组（多分类词在各组重复引用），无分类置底部；空分类组不返回
export function groupByCategory(
  words: WordWithPreview[],
  wordCategoryMap: Record<string, string[]>,
  categories: Category[],
): CategoryGroup[] {
  const groups: CategoryGroup[] = categories.map(c => ({ category: c, words: [] }))
  const uncategorized: WordWithPreview[] = []
  for (const w of words) {
    const ids = wordCategoryMap[w.id] || []
    if (ids.length === 0) { uncategorized.push(w); continue }
    for (const id of ids) {
      const g = groups.find(g => g.category?.id === id)
      if (g) g.words.push(w)
    }
  }
  const nonEmpty = groups.filter(g => g.words.length > 0)
  if (uncategorized.length > 0) nonEmpty.push({ category: null, words: uncategorized })
  return nonEmpty
}

// 收起态单词两侧的固定 chrome（镜像布局全链：WordList 滚动容器 padding + WordListItem 收起态样式）：
// 字母模式：容器 padding 16 + 项 padding 20 + 编织线 3 + gap 20 + 色圈(≤3) 27 = 86px
// 分类模式：容器 padding 16 + 项 padding 16 + 编织线 3 + gap 10 = 45px（居中单词名，无色圈）
export const COLLAPSED_CHROME_ALPHABET = 86
export const COLLAPSED_CHROME_CATEGORY = 45

// D1：收起宽度 = clamp(最长单词渲染宽度 + 实际 chrome, 120px, 240px)
export function fitCollapsedWidth(maxWordWidthPx: number, chromePx: number): number {
  return Math.min(240, Math.max(120, maxWordWidthPx + chromePx))
}

// 解析收起态单词名的实际渲染字体（computed font），canvas measureText 必须与 DOM 渲染用同一字体，
// 避免手工拼 CSS 变量串被 canvas 解析失败而静默回退默认字体导致测量偏小。
export function resolveSidebarWordFont(): string {
  if (typeof document === 'undefined') return '600 13px serif'
  const probe = document.createElement('span')
  probe.style.position = 'fixed'
  probe.style.visibility = 'hidden'
  probe.style.left = '-9999px'
  probe.style.fontFamily = 'var(--font-serif)'
  probe.style.fontSize = 'var(--text-sm)'
  probe.style.fontWeight = 'var(--weight-semibold)'
  document.body.appendChild(probe)
  const font = getComputedStyle(probe).font
  probe.remove()
  return font
}

// 用 canvas measureText 测量一组单词的最宽渲染宽度（浏览器环境）
export function measureMaxWordWidth(lemmas: string[], font: string): number {
  if (typeof document === 'undefined') return 0
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return 0
  ctx.font = font
  let max = 0
  for (const lemma of lemmas) max = Math.max(max, ctx.measureText(lemma).width)
  return max
}
