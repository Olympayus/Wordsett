import { domainLabel } from '../lib/domainLabels'

export interface TitleMetaBadges { collins: number; oxford: number; tag: string }
export interface WordRootInfo { class: string; root: string; meaning: string; origin: string }
export interface TitleMeta {
  phonetic: string | null
  badges: TitleMetaBadges | null
  wordRoots: WordRootInfo[]
  domains: { categories: string[]; regions: string[]; usages: string[] }
}

// 与 @tauri-apps/plugin-sql 的 Database.select 同形：T 为整表结果（如 Record<string, any>[]）
export interface SqlDb { select: <T>(sql: string, params?: unknown[]) => Promise<T> }

export async function fetchEcdictTitleMeta(
  db: SqlDb, word: string
): Promise<Pick<TitleMeta, 'phonetic' | 'badges' | 'wordRoots'>> {
  const entries = await db.select<Record<string, any>[]>(
    'SELECT phonetic, collins, oxford, tag FROM entries WHERE word = ?1 LIMIT 1', [word]
  )
  const entry = entries[0]
  const phonetic = entry?.phonetic || null
  const collins = Number(entry?.collins ?? 0)
  const oxford = Number(entry?.oxford ?? 0)
  const tag = entry?.tag || ''
  const badges = (collins > 0 || oxford > 0 || tag) ? { collins, oxford, tag } : null

  const roots = await db.select<Record<string, any>[]>(
    'SELECT class, root, meaning, origin FROM word_roots WHERE word = ?1', [word]
  )
  const wordRoots: WordRootInfo[] = roots.map(r => ({
    class: String(r.class), root: String(r.root), meaning: String(r.meaning),
    origin: r.origin == null ? '' : String(r.origin),
  }))
  return { phonetic, badges, wordRoots }
}

export async function fetchWordnetDomains(db: SqlDb, word: string): Promise<TitleMeta['domains']> {
  const rows = await db.select<Record<string, any>[]>(
    `SELECT wr.rel_type, ws.words
     FROM wn_relations wr
     JOIN wn_words ww ON ww.synset_offset = wr.from_offset AND ww.pos = wr.from_pos
     JOIN wn_synsets ws ON ws.synset_offset = wr.to_offset AND ws.pos = CASE WHEN wr.to_pos = 's' THEN 'a' ELSE wr.to_pos END
     WHERE ww.lemma = ?1 AND wr.rel_type IN (';c',';r',';u')`,
    [word]
  )
  const out: TitleMeta['domains'] = { categories: [], regions: [], usages: [] }
  for (const r of rows) {
    const head = String(r.words ?? '').split('\n')[0].trim()
    if (!head) continue
    const label = domainLabel(head)
    const bucket = r.rel_type === ';c' ? out.categories
      : r.rel_type === ';r' ? out.regions : out.usages
    if (!bucket.includes(label)) bucket.push(label)
  }
  return out
}