import { getDb } from '../db/connection'
import {
  aggregateBacklinks, linkTargets, normalizeLinkTarget,
  type Backlink, type BacklinkRow,
} from '../lib/links'

/**
 * 反链扫描（v0.7.5 任务 6）。
 *
 * 两道过滤：SQL 先按「值里出现过 `[[` 或 `{{`」粗筛（LIKE 只是**包含**判断，
 * 不解析标记，故残缺标记也会被捞出来），再在 JS 里用 `linkTargets` 精筛目标、
 * 用 `normalizeLinkTarget` 比对（与保存校验、点击跳转同一条归一化）。
 *
 * **不要**为此建索引 / FTS / 新表（任务书明确 YAGNI）：词库是几千条规模，
 * 这条全表扫 + 两次 join 是毫秒级；真正的成本大头是逐行解析，而那本来就要做。
 */
const SQL_BACKLINK_CANDIDATES = `
  SELECT fv.word_id AS wordId, w.lemma AS lemma, fd.name AS fieldName, fv.value AS value
    FROM field_values fv
    JOIN words w ON w.id = fv.word_id
    JOIN field_definitions fd ON fd.id = fv.field_id
   WHERE fv.value LIKE '%[[%' OR fv.value LIKE '%{{%'
`

interface BacklinkCandidate {
  wordId: string
  lemma: string
  fieldName: string
  value: string | null
}

/**
 * 取全库中指向 `targetLemma` 的反链，按「来源词 × 字段」聚合。
 *
 * 同一条 value 里出现两次目标就算两行（`linkTargets` 不去重，这里按次 push）——
 * 「他在辨析里两次引用了这个词」与「只引用一次」在脚注上应显示为 `×2`。
 * 字段名取 `field_definitions.name`（用户看到的名字），不是渲染层的 `rowTitle`。
 */
export async function getBacklinks(targetLemma: string): Promise<Backlink[]> {
  let candidates: BacklinkCandidate[]
  try {
    candidates = await getDb().select<BacklinkCandidate[]>(SQL_BACKLINK_CANDIDATES)
  } catch (e) {
    // 读失败是环境问题（库未初始化 / IO），脚注没有可画的来源，静默退化为空；
    // 控制台留一行便于定位，不把错误抛进组件的 effect（会变成未处理的 rejection）。
    console.error('getBacklinks failed:', e)
    return []
  }

  const target = normalizeLinkTarget(targetLemma)
  const hits: BacklinkRow[] = []
  for (const row of candidates) {
    for (const token of linkTargets(row.value ?? '')) {
      if (normalizeLinkTarget(token.target) === target) {
        hits.push({ sourceWordId: row.wordId, sourceLemma: row.lemma, fieldName: row.fieldName })
      }
    }
  }
  return aggregateBacklinks(hits, targetLemma)
}
