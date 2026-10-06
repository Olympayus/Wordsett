import { EcdictProvider } from '../providers/ecdict'
import { WordNetProvider } from '../providers/wordnet'
import { sortLemmasByRelevance } from '../lib/lemmaSort'
import { rankChineseHits } from '../lib/chineseSearch'
import type { ChineseSearchHit } from '../lib/chineseSearch'
import type { DictionaryField } from '../types/dictionary'
import { mergeSources } from '../lib/dictMerge'
import type { RelatedWords } from '../providers/wordnet'
import { getCachedDb } from '../providers/dbCache'
import { resolveDictPath, toSqliteUrl } from '../providers/dictPath'
import { fetchEcdictTitleMeta, fetchWordnetDomains, type TitleMeta } from '../providers/titleMeta'

const ecdict = new EcdictProvider()
const wordnet = new WordNetProvider()

// 阶段一：模糊匹配返回单词建议
export async function searchLemmas(query: string): Promise<string[]> {
  if (!query.trim()) return []
  const [ecdictResults, wordnetResults] = await Promise.all([
    ecdict.searchLemmas(query),
    wordnet.searchLemmas(query),
  ])
  const seen = new Set<string>()
  const deduped = [...ecdictResults, ...wordnetResults].filter(w => {
    if (seen.has(w)) return false
    seen.add(w)
    return true
  })
  return sortLemmasByRelevance(query, deduped).slice(0, 20)
}

// 阶段二：精确查询单词详情。
// 两个词典的结果在**服务层**合流成一棵按词性分组的字段树——返回形状里不再有「来源」，
// 分区自此只存在于每个节点上的来源小标记。空数组＝两个词典都没查到（界面走「未找到」态）。
export async function lookupWord(word: string): Promise<DictionaryField[]> {
  if (!word.trim()) return []
  const normalized = word.toLowerCase().trim()
  const [ecdictEntries, wordnetEntries] = await Promise.all([
    ecdict.lookup(normalized),
    wordnet.lookup(normalized),
  ])
  return mergeSources([...ecdictEntries, ...wordnetEntries])
}

// 阶段一·中文：查询 ECDICT 中文释义，返回匹配的英文单词 + 首个命中行释义（供下拉补显）
export async function searchChinese(query: string): Promise<ChineseSearchHit[]> {
  if (!query.trim()) return []
  const rows = await ecdict.searchByChinese(query)
  return rankChineseHits(rows, query)
}

// 阶段三·语义网络：WordNet 关系网络（上位词路径 + 同义/上位/下位/反义/整体·部分分组）
export async function relatedWords(word: string): Promise<RelatedWords> {
  return wordnet.relatedWords(word)
}

// 标题信息（徽标/音标/词根/领域）：直查两库——合并结果页已无逐源门控（dictionaries 开关随设置页删除）
export async function lookupTitleMeta(word: string): Promise<TitleMeta> {
  if (!word.trim()) {
    return { phonetic: null, badges: null, wordRoots: [], domains: { categories: [], regions: [], usages: [] } }
  }
  const normalized = word.toLowerCase().trim()
  const [ecdb, wndb] = await Promise.all([
    getCachedDb(toSqliteUrl(await resolveDictPath('ecdict.db'))),
    getCachedDb(toSqliteUrl(await resolveDictPath('wordnet.db'))),
  ])
  const [ec, domains] = await Promise.all([
    fetchEcdictTitleMeta(ecdb, normalized),
    fetchWordnetDomains(wndb, normalized),
  ])
  return { ...ec, domains }
}
