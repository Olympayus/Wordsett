import type { DictionaryProvider } from './types'
import type { DictionaryEntry } from '../types/dictionary'
import { buildEcdictFields } from '../lib/ecdictParse'
import { getCachedDb } from './dbCache'
import { resolveDictPath, toSqliteUrl } from './dictPath'

const dbPath = resolveDictPath('ecdict.db')

export class EcdictProvider implements DictionaryProvider {
  readonly name = 'ecdict'

  async searchLemmas(query: string): Promise<string[]> {
    if (!query.trim()) return []
    const db = await getCachedDb(toSqliteUrl(await dbPath))
    const q = `${query.toLowerCase().trim()}%`
    // 仅返回 entries 中存在详情的词：lemma.json 含 entries 缺失的孤儿词（如 applejacks），
    // 直接 LIKE 会把它们送进建议列表但点进去查无结果（v0.4.3 §2）
    const rows = await db.select<{ word: string }[]>(
      'SELECT word FROM lemmas WHERE word LIKE ?1 AND EXISTS (SELECT 1 FROM entries WHERE entries.word = lemmas.word) LIMIT 20',
      [q]
    )
    return rows.map(r => r.word)
  }

  async lookup(word: string): Promise<DictionaryEntry[]> {
    if (!word.trim()) return []
    const normalized = word.toLowerCase().trim()
    const db = await getCachedDb(toSqliteUrl(await dbPath))
    const rows = await db.select<Record<string, any>[]>(
      'SELECT * FROM entries WHERE word = ?1 LIMIT 1',
      [normalized]
    )
    if (rows.length === 0) return []

    const entry = rows[0]
    const fields = buildEcdictFields({
      word: entry.word,
      translation: entry.translation ?? null,
      definition: entry.definition ?? null,
      phonetic: entry.phonetic ?? null,
      exchange: entry.exchange ?? null,
    })
    return [{
      word: entry.word,
      normalizedWord: normalized,
      source: 'ecdict',
      fields,
    }]
  }

  async searchByChinese(query: string): Promise<Array<{ word: string; translation: string; collins: number; frq: number }>> {
    if (!query.trim()) return []
    const db = await getCachedDb(toSqliteUrl(await dbPath))
    const q = `%${query.trim()}%`
    // v0.4.4：多取词频列；SQL 内先按常用度粗排再 LIMIT，避免常用词被插入序截断丢掉（各取数上限放宽到 300）
    const rows = await db.select<{ word: string; translation: string; collins: number; frq: number }[]>(
      'SELECT word, translation, collins, frq FROM entries WHERE translation LIKE ?1 ORDER BY collins DESC, frq ASC LIMIT 300',
      [q]
    )
    return rows
  }
}
