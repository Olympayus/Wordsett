import type { DictionaryProvider } from './types'
import type { DictionaryEntry, DictionaryField } from '../types/dictionary'
import { getCachedDb } from './dbCache'
import { buildWordnetFields } from '../lib/wordnetParse'
import { resolveDictPath, toSqliteUrl } from './dictPath'
import { RELATED_LABEL } from '../lib/wordnetRelations'

const dbPath = resolveDictPath('wordnet.db')

export interface RelatedGroup {
  words: string[]
  definition?: string
}

export interface RelatedWords {
  path: string[]
  groups: Record<'synonyms' | 'hypernyms' | 'hyponyms' | 'antonyms' | 'partWhole' | 'similarTo' | 'alsoSee' | 'derivatives' | 'entailments' | 'causes' | 'pertainyms' | 'attributes' | 'verbGroups', RelatedGroup[]>
}

const emptyGroups = {
  synonyms: [], hypernyms: [], hyponyms: [], antonyms: [], partWhole: [],
  similarTo: [], alsoSee: [], derivatives: [], entailments: [], causes: [],
  pertainyms: [], attributes: [], verbGroups: [],
}

export class WordNetProvider implements DictionaryProvider {
  readonly name = 'wordnet'

  async searchLemmas(query: string): Promise<string[]> {
    if (!query.trim()) return []
    const db = await getCachedDb(toSqliteUrl(await dbPath))
    const q = `${query.toLowerCase().trim()}%`
    const rows = await db.select<{ lemma: string }[]>(
      'SELECT DISTINCT lemma FROM wn_words WHERE lemma LIKE ?1 LIMIT 20',
      [q]
    )
    return rows.map(r => r.lemma)
  }

  async lookup(word: string): Promise<DictionaryEntry[]> {
    if (!word.trim()) return []
    const normalized = word.toLowerCase().trim()
    const db = await getCachedDb(toSqliteUrl(await dbPath))

    // Query all synsets for this word, joining on composite PK (synset_offset, pos)
    const rows = await db.select<Record<string, any>[]>(
      `SELECT ws.synset_offset, ws.pos, ws.definition, ws.examples, ws.words
       FROM wn_words ww
       JOIN wn_synsets ws ON ww.synset_offset = ws.synset_offset AND ww.pos = ws.pos
       WHERE ww.lemma = ?1
       ORDER BY ws.synset_offset`,
      [normalized]
    )

    if (rows.length === 0) return []

    const synsets = rows.map(row => ({
      pos: row.pos,
      definition: row.definition ?? '',
      examples: row.examples ?? null,
      words: row.words ?? null,
    }))
    const fields = buildWordnetFields(word, synsets)

    // 派生词（+ derivationally related form）：解析目标 synset 词，作为可勾选的 derivatives 容器
    const derivRels = await db.select<{ to_offset: number; to_pos: string }[]>(
      'SELECT DISTINCT to_offset, to_pos FROM wn_relations WHERE from_offset IN (SELECT synset_offset FROM wn_words WHERE lemma = ?1) AND rel_type = ?2',
      [normalized, '+']
    )
    if (derivRels.length) {
      const items: DictionaryField[] = []
      for (const r of derivRels) {
        const target = await db.select<{ words: string | null }[]>(
          'SELECT words FROM wn_synsets WHERE synset_offset = ?1 AND pos = ?2', [r.to_offset, r.to_pos]
        )
        if (target.length === 0) continue
        for (const line of (target[0].words ?? '').split('\n')) {
          const t = line.trim().toLowerCase()
          if (t && t !== normalized) items.push({ key: 'derivatives_item', value: t })
        }
      }
      const seenDeriv = new Set<string>()
      const dedup = items.filter(i => { if (seenDeriv.has(i.value)) return false; seenDeriv.add(i.value); return true })
      if (dedup.length) fields.push({ key: 'derivatives', value: '', children: dedup })
    }

    return [{
      word,
      normalizedWord: normalized,
      source: 'wordnet',
      fields,
    }]
  }

  async relatedWords(word: string): Promise<RelatedWords> {
    const empty = () => ({ path: [], groups: { ...emptyGroups } })
    if (!word.trim()) return empty()
    const normalized = word.toLowerCase().trim()
    const db = await getCachedDb(toSqliteUrl(await dbPath))

    // 1) word → 所属 synsets
    const synsetRows = await db.select<{ synset_offset: number; pos: string }[]>(
      'SELECT synset_offset, pos FROM wn_words WHERE lemma = ?1', [normalized]
    )
    if (synsetRows.length === 0) return empty()

    // 2) 解析每个 synset 的目标 synset 词（去重）
    const resolve = async (off: number, pos: string): Promise<RelatedGroup | null> => {
      // wn_synsets 将所有形容词（含卫星 s）统一存为 'a'，指针 to_pos 可能为 's'，查询时归一化
      const qPos = pos === 's' ? 'a' : pos
      const rows = await db.select<{ words: string | null; definition: string | null }[]>(
        'SELECT words, definition FROM wn_synsets WHERE synset_offset = ?1 AND pos = ?2', [off, qPos]
      )
      if (rows.length === 0) return null
      const ws = (rows[0].words ?? '').split('\n').map(w => w.trim().toLowerCase()).filter(Boolean)
      return { words: ws, definition: rows[0].definition ?? undefined }
    }

    const groups: Record<string, RelatedGroup[]> = { ...emptyGroups }
    const seen = new Set<string>()

    for (const s of synsetRows) {
      // 同义词：同 synset 内排除自身
      const syn = await resolve(s.synset_offset, s.pos)
      if (syn) {
        const others = syn.words.filter(w => w !== normalized)
        if (others.length) groups.synonyms.push({ ...syn, words: others })
      }
      // 关系指针
      const rels = await db.select<{ rel_type: string; to_offset: number; to_pos: string }[]>(
        'SELECT rel_type, to_offset, to_pos FROM wn_relations WHERE from_offset = ?1 AND from_pos = ?2',
        [s.synset_offset, s.pos]
      )
      for (const r of rels) {
        const label = RELATED_LABEL[r.rel_type]
        if (!label) continue
        const key = `${label}:${r.to_offset}`
        if (seen.has(key)) continue
        seen.add(key)
        const target = await resolve(r.to_offset, r.to_pos)
        if (target) groups[label].push(target)
      }
    }

    // 3) 上位词链（深度上限 4）：从 word 的第一个 synset 沿 @ 上溯
    const path: string[] = []
    const chain = new Set<number>()
    let cur = synsetRows[0]
    for (let i = 0; i < 4; i++) {
      const rels = await db.select<{ to_offset: number; to_pos: string }[]>(
        'SELECT to_offset, to_pos FROM wn_relations WHERE from_offset = ?1 AND from_pos = ?2 AND rel_type = ?3 LIMIT 1',
        [cur.synset_offset, cur.pos, '@']
      )
      if (rels.length === 0) break
      const t = rels[0]
      if (chain.has(t.to_offset)) break
      chain.add(t.to_offset)
      const tg = await resolve(t.to_offset, t.to_pos)
      if (!tg || tg.words.length === 0) break
      path.unshift(tg.words[0])
      cur = { synset_offset: t.to_offset, pos: t.to_pos }
    }
    path.push(normalized)

    return { path, groups }
  }
}
