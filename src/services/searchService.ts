import { EcdictProvider } from '../providers/ecdict'
import { WordNetProvider } from '../providers/wordnet'
import { useSettingsStore } from '../stores/settingsStore'
import { sortLemmasByRelevance } from '../lib/lemmaSort'
import { rankChineseHits } from '../lib/chineseSearch'
import type { ChineseSearchHit } from '../lib/chineseSearch'
import type { DictionaryEntry } from '../types/dictionary'
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

// 阶段二：精确查询单词详情（按设置中词典开关过滤：关闭的词典不查询、不返回；语义网络不受此开关影响）
export async function lookupWord(word: string): Promise<{ source: string; entries: DictionaryEntry[] }[]> {
  if (!word.trim()) return []
  const normalized = word.toLowerCase().trim()
  const { dictionaries } = useSettingsStore.getState()
  const [ecdictEntries, wordnetEntries] = await Promise.all([
    dictionaries.ecdict ? ecdict.lookup(normalized) : Promise.resolve([] as DictionaryEntry[]),
    dictionaries.wordnet ? wordnet.lookup(normalized) : Promise.resolve([] as DictionaryEntry[]),
  ])
  const results: { source: string; entries: DictionaryEntry[] }[] = []
  if (ecdictEntries.length > 0) results.push({ source: 'ecdict', entries: ecdictEntries })
  if (wordnetEntries.length > 0) results.push({ source: 'wordnet', entries: wordnetEntries })
  return results
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

// 标题信息（徽标/音标/词根/领域）：独立于 dictionaries 开关直查两库
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
