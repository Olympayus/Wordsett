const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/

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

// 释义分隔符：匹配到的查询词若紧跟这些字符（或结尾），视为「独立义项」匹配；
// 反之查询词是更长复合词的前缀（如「有趣的事件」里的「有趣」），匹配质量更低。
const GLOSS_TERMINATORS = new Set([',', '，', ';', '；', '、', ' ', '\\'])

function isStandaloneGloss(translation: string, idx: number, qLen: number): boolean {
  const after = translation[idx + qLen]
  return after === undefined || GLOSS_TERMINATORS.has(after)
}

export function rankChineseResults(rows: ChineseSearchRow[], query: string): string[] {
  const q = query.trim()
  if (!q) return []
  return [...new Set(
    rows
      .filter(r => r.translation.includes(q))
      .map(r => {
        const idx = r.translation.indexOf(q)
        return {
          word: r.word,
          idx,
          exact: r.translation.trim() === q,
          standalone: isStandaloneGloss(r.translation, idx, q.length),
          freq: hasFrequency(r),
          frq: frqKey(r),
          collins: r.collins ?? 0,
        }
      })
      .sort((a, b) =>
        (b.exact ? 1 : 0) - (a.exact ? 1 : 0) ||
        (b.standalone ? 1 : 0) - (a.standalone ? 1 : 0) ||
        (b.freq ? 1 : 0) - (a.freq ? 1 : 0) ||
        a.frq - b.frq ||
        b.collins - a.collins ||
        a.idx - b.idx ||
        a.word.length - b.word.length ||
        a.word.localeCompare(b.word)
      )
      .map(s => s.word)
  )].slice(0, 20)
}
