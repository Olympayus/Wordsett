const CJK_RE = /[㐀-䶿一-鿿㐀-䶿一-鿿豈-﫿]/

export function isChineseQuery(query: string): boolean {
  return CJK_RE.test(query)
}

// 中文搜索行：ECDICT 中英行 + 词频字段（collins 柯林斯星级、frq COCA 词频序，缺失视作 0）
export interface ChineseSearchRow {
  word: string
  translation: string
  collins?: number
  frq?: number
}

// 是否具备任何词频信号（常用词分桶依据）
const hasFrequency = (r: ChineseSearchRow) => (r.collins ?? 0) > 0 || (r.frq ?? 0) > 0
// COCA 词频序：越低越常用；frq=0（不在 COCA 前若干位）视作不提供排序依据 → 排到同桶尾部
const frqKey = (r: ChineseSearchRow) => (r.frq ?? 0) > 0 ? (r.frq ?? 0) : Number.MAX_SAFE_INTEGER

export function rankChineseResults(rows: ChineseSearchRow[], query: string): string[] {
  const q = query.trim()
  if (!q) return []
  return [...new Set(
    rows
      .filter(r => r.translation.includes(q))
      .map(r => ({
        word: r.word,
        idx: r.translation.indexOf(q),
        exact: r.translation.trim() === q,
        freq: hasFrequency(r),
        frq: frqKey(r),
        collins: r.collins ?? 0,
      }))
      .sort((a, b) =>
        (b.exact ? 1 : 0) - (a.exact ? 1 : 0) ||
        Number(b.freq) - Number(a.freq) ||
        a.frq - b.frq ||
        b.collins - a.collins ||
        a.idx - b.idx ||
        a.word.length - b.word.length ||
        a.word.localeCompare(b.word)
      )
      .map(s => s.word)
  )].slice(0, 20)
}