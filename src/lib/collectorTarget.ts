/**
 * 句子模式的目标词与内容词筛选（v0.7.9 §6.2）。
 *
 * 纯逻辑、无 DOM / 无数据库：分词规则与 Rust `selection::tokens` 逐字一致，
 * 词频由调用方以 `freqOf` 注入（Task 9 的 ecdict 查询），故本文件可以直接单测。
 *
 * 排序口径（设计 §11.3）：按词频**升序**，未知词频以哨兵 `Number.POSITIVE_INFINITY`
 * 表示、因此排在所有已知词频之后；显式数字（含 0）正常参与升序，0 = 已知最罕见。
 * 默认目标词取词频最低的一个，与同一排序口径一致；胶囊顺序在本次抓取内固定，换词不重排。
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

/**
 * 选区两端要剥掉的东西：除字母 / 数字之外的**一切**（中英文标点、空白、引号、连字符）。
 * 与 `tokenize()` / Rust `tokens()` 的边缘规则对齐：`'ephemeral'` → `ephemeral`；
 * 只剥两端，故内部的撇号与连字符不受影响（don't / well-known）。
 */
const LEADING_NOISE = /^[^\p{L}\p{N}]+/u
const TRAILING_NOISE = /[^\p{L}\p{N}]+$/u

const PURE_NUMBER = /^\p{N}+$/u

/** 词频未知的哨兵值：类型仍是 `number`，数值上排在所有已知词频之后。 */
const UNKNOWN_FREQ = Number.POSITIVE_INFINITY

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
 * 单词模式清洗：trim 后剥掉**两端**的所有标点 / 引号 / 连字符，内部撇号与连字符原样保留。
 * 例：`  “ephemeral,”  ` → `ephemeral`；`'ephemeral'` → `ephemeral`；
 * `don't` / `well-known` 不变。
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
 * 3. 按词频升序：显式数字正常参与（0 = 已知最罕见，排最前）；`freqOf` 返回
 *    `undefined` 表示词频未知，输出为 `Number.POSITIVE_INFINITY`，排在所有已知词频之后
 *    （Task 9 对无行词不返回数字，故实际查询失败的词自然落到末尾）；
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
    .map(word => ({ word, freq: freqLookup(word) ?? UNKNOWN_FREQ }))
    .sort((a, b) => (a.freq === b.freq ? 0 : a.freq - b.freq))
    .slice(0, MAX_CANDIDATES)

  return ranked
}

/**
 * 默认目标词：词频最低的候选；候选为空返回 null（同频时首见者优先，稳定）。
 * 未知词频以 `Number.POSITIVE_INFINITY` 表示，故只要存在已知词频的候选，
 * 默认目标就一定不是「排序垫底」的未知词——与 `contentCandidates` 的顺序一致。
 */
export function pickDefaultTarget(candidates: TargetCandidate[]): TargetCandidate | null {
  if (candidates.length === 0) return null
  let best = candidates[0]
  for (const candidate of candidates) {
    if (candidate.freq < best.freq) best = candidate
  }
  return best
}
