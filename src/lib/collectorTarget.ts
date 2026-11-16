/**
 * 句子模式的目标词与内容词筛选（v0.7.9 §6.2）。
 *
 * 纯逻辑、无 DOM / 无数据库：分词规则与 Rust `selection::tokens` 逐字一致，
 * 词频由调用方以 `freqOf` 注入（Task 9 的 ecdict 查询），故本文件可以直接单测。
 *
 * 排序口径（设计 §11.3）：按词频**升序**——最罕见/词典未收录的排前面，
 * 默认目标词取其中最低的一个；胶囊顺序在本次抓取内固定，换词不重排。
 */

export interface TargetCandidate {
  word: string
  freq: number
}

/** 句子模式最多给 9 枚数字键胶囊。 */
const MAX_CANDIDATES = 9

/**
 * 固定英文停用词表（冠词 / 代词 / 介词 / 连词 / be 与助动词等常用功能词）。
 * 全部小写，匹配时比较 `toLowerCase()`。
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  // 冠词
  'a', 'an', 'the',
  // 代词
  'i', 'me', 'my', 'mine', 'myself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'they', 'them', 'their', 'theirs', 'themselves',
  'this', 'that', 'these', 'those',
  'who', 'whom', 'whose', 'which', 'what',
  // 介词
  'about', 'above', 'after', 'against', 'as', 'at', 'before', 'below',
  'between', 'by', 'during', 'for', 'from', 'in', 'into', 'of', 'off',
  'on', 'out', 'over', 'through', 'to', 'under', 'until', 'up',
  'with', 'within', 'without',
  // 连词
  'and', 'but', 'or', 'nor', 'so', 'yet', 'because', 'if', 'than', 'while',
  // be 与助动词
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'can', 'could', 'may', 'might', 'must', 'should', 'will', 'would',
  // 其他高频功能词（副词 / 限定词）
  'all', 'any', 'both', 'each', 'few', 'more', 'most', 'much', 'many',
  'no', 'not', 'only', 'other', 'some', 'such', 'very', 'just',
  'again', 'here', 'there', 'when', 'where', 'why', 'how', 'then', 'once',
  'too', 'own', 'same', 'now',
])

/** token 允许的字符：字母、数字、内部 `'` 与 `-`（与 Rust `is_alphanumeric` 同口径）。 */
const TOKEN_SEPARATOR = /[^\p{L}\p{N}'-]+/u
const EDGE_QUOTES_OR_DASHES = /^['-]+|['-]+$/g

/** 选区两端要剥掉的东西：除字母 / 数字 / `'` / `-` 之外的一切（含中英文标点、空白）。 */
const LEADING_NOISE = /^[^\p{L}\p{N}'-]+/u
const TRAILING_NOISE = /[^\p{L}\p{N}'-]+$/u

const PURE_NUMBER = /^\p{N}+$/u

/**
 * 分词：与 Rust `selection::tokens` 同规则——按「非字母数字且非 `'` / `-`」切，
 * 再剥掉每段首尾的 `'` / `-`、丢掉空串。内部的 `'` / `-` 保留（don't / well-known）。
 */
export function tokenize(text: string): string[] {
  const out: string[] = []
  for (const piece of text.split(TOKEN_SEPARATOR)) {
    const word = piece.replace(EDGE_QUOTES_OR_DASHES, '')
    if (word !== '') out.push(word)
  }
  return out
}

/**
 * 单词模式清洗：trim 后只剥**两端**的标点/引号，内部撇号与连字符原样保留。
 * 例：`  “ephemeral,”  ` → `ephemeral`；`don't` / `well-known` 不变。
 */
export function stripWordSelection(raw: string): string {
  return raw.trim().replace(LEADING_NOISE, '').replace(TRAILING_NOISE, '')
}

function isPureNumber(token: string): boolean {
  return PURE_NUMBER.test(token)
}

function isContentWord(token: string): boolean {
  return token.length >= 2 && !isPureNumber(token) && !STOPWORDS.has(token.toLowerCase())
}

/**
 * 内容词候选：
 * 1. 停用词 / 长度 <2 / 纯数字被剔除；
 * 2. 大小写不敏感去重，保留首次出现的形态；
 * 3. 按词频升序（取不到词频 = 未知，排在已知词频之后；显式 0 表示「词典未收录」，
 *    正常参与升序、排最前——Task 9 的查询把无行映射为 0）；
 * 4. 最多 9 个；
 * 5. 过滤后为空 → 退回全部非数字 token（不再套停用词与长度门槛，仍去重、仍 ≤9、仍按词频）。
 */
export function contentCandidates(
  text: string,
  freqOf: (w: string) => number | undefined
): TargetCandidate[] {
  const tokens = tokenize(text)
  const content = tokens.filter(isContentWord)
  const picked = content.length > 0 ? content : tokens.filter(t => !isPureNumber(t))

  const seen = new Set<string>()
  const unique: string[] = []
  for (const word of picked) {
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(word)
  }

  // 排序比较器会多次取同一个词；真实调用链里 freqOf 是 Map 查询，这里缓存一次。
  const memo = new Map<string, number | undefined>()
  const freqLookup = (word: string): number | undefined => {
    if (!memo.has(word)) memo.set(word, freqOf(word))
    return memo.get(word)
  }

  const ranked = unique
    .map(word => ({ word, known: freqLookup(word) }))
    .sort((a, b) => {
      if (a.known === undefined && b.known === undefined) return 0
      if (a.known === undefined) return 1
      if (b.known === undefined) return -1
      return a.known - b.known
    })
    .slice(0, MAX_CANDIDATES)

  return ranked.map(({ word, known }) => ({ word, freq: known ?? 0 }))
}

/** 默认目标词：词频最低的候选；候选为空返回 null（首见者优先，稳定）。 */
export function pickDefaultTarget(candidates: TargetCandidate[]): TargetCandidate | null {
  if (candidates.length === 0) return null
  let best = candidates[0]
  for (const candidate of candidates) {
    if (candidate.freq < best.freq) best = candidate
  }
  return best
}
