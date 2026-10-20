import { getDb } from '../db/connection'
import {
  aggregateBacklinks, linkTargets, normalizeLinkTarget, linkableField, stripLinks,
  type Backlink, type BacklinkRow, type LinkKind,
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
 *
 * 任务 7 的 `getLinkStats` 复用同一次粗筛：统计与反链看的是同一批候选行，
 * 各写一条 SQL 只会让「LIKE 条件」有两个出处。
 */
const SQL_BACKLINK_CANDIDATES = `
  SELECT fv.word_id AS wordId, w.lemma AS lemma,
         fd.name AS fieldName, fd.key AS fieldKey,
         pv.value AS parentValue, pfd.key AS parentFieldKey,
         fv.value AS value
    FROM field_values fv
    JOIN words w ON w.id = fv.word_id
    JOIN field_definitions fd ON fd.id = fv.field_id
    LEFT JOIN field_values pv ON pv.id = fv.parent_id
    LEFT JOIN field_definitions pfd ON pfd.id = pv.field_id
   WHERE fv.value LIKE '%[[%' OR fv.value LIKE '%{{%'
`

interface BacklinkCandidate {
  wordId: string
  lemma: string
  fieldName: string
  fieldKey: string
  /** 父行（辨析组）的值；非子项为 null。 */
  parentValue: string | null
  parentFieldKey: string | null
  value: string | null
}

/**
 * 取全部含链接标记的候选行；读失败是环境问题（库未初始化 / IO），返回 `null` 让
 * 调用方退化为空结果。控制台留一行便于定位，不把错误抛进组件的 effect
 * （会变成未处理的 rejection）。
 */
async function scanLinkCandidates(): Promise<BacklinkCandidate[] | null> {
  try {
    const rows = await getDb().select<BacklinkCandidate[]>(SQL_BACKLINK_CANDIDATES)
    // 结构字段（词性 / 音标 / 词根 / 词根项 / 初始熟悉度）不可链接：保存校验与渲染都不认
    // 其中的标记，反链与设置页统计也必须用**同一个** `linkableField` 判据，否则用户
    // 在词根里随手写的一对括号会凭空出现在反链脚注与「链接总条数」里。
    return rows.filter(r => linkableField(r.fieldKey))
  } catch (e) {
    console.error('link scan failed:', e)
    return null
  }
}

/**
 * 反链脚注里「字段」那一段的文案。
 *
 * 辨析组（`synonym_discrimination_group`）及其子项沿用 `rowTitle` 的规则：组行印**组描述**
 * （组行自己的 value），子项印父组行的 value；`stripLinks` 与 `rowTitle` 同一处理（标题
 * 是纯文本）。回落到 `field_definitions.name` 只在组描述为空时发生。
 *
 * 这不是装饰：按字段名印的话所有辨析组都叫「近义词辨析组」，两个不同组的同名目标会被
 * `aggregateBacklinks` 以 `sourceWordId + fieldName` 聚成一行 `×N`，把「两组各引一次」
 * 显示成「同组引两次」。
 */
function backlinkFieldLabel(row: BacklinkCandidate): string {
  const groupValue = row.fieldKey === 'synonym_discrimination_group'
    ? row.value
    : row.parentFieldKey === 'synonym_discrimination_group'
      ? row.parentValue
      : null
  const label = groupValue === null ? '' : stripLinks(groupValue).trim()
  return label || row.fieldName
}

/**
 * 取全库中指向 `targetLemma` 的反链，按「来源词 × 字段」聚合。
 *
 * 同一条 value 里出现两次目标就算两行（`linkTargets` 不去重，这里按次 push）——
 * 「他在辨析里两次引用了这个词」与「只引用一次」在脚注上应显示为 `×2`。
 * 字段名一般取 `field_definitions.name`（用户看到的名字）；辨析组及其子项例外，走
 * `backlinkFieldLabel` 取组描述（与渲染层 `rowTitle` 同一条规则）。
 */
export async function getBacklinks(targetLemma: string): Promise<Backlink[]> {
  const candidates = await scanLinkCandidates()
  if (!candidates) return []

  const target = normalizeLinkTarget(targetLemma)
  const hits: BacklinkRow[] = []
  for (const row of candidates) {
    for (const token of linkTargets(row.value ?? '')) {
      if (normalizeLinkTarget(token.target) === target) {
        hits.push({ sourceWordId: row.wordId, sourceLemma: row.lemma, fieldName: backlinkFieldLabel(row) })
      }
    }
  }
  return aggregateBacklinks(hits, targetLemma)
}

/** 统计列表的一行：**源词**（写了链接的词）与它自己该种链接的条数。 */
export interface LinkStatRow {
  wordId: string
  lemma: string
  count: number
}

/** 单个标记口径的统计。`wordCount` 是去重后的源词数，`linkCount` 是出现次数（不去重）。 */
export interface LinkStatBucket {
  wordCount: number
  linkCount: number
  rows: LinkStatRow[]
}

/** 设置页「双向链接」分区一次扫描产出的两个口径。 */
export interface LinkStats {
  dict: LinkStatBucket
  library: LinkStatBucket
}

function emptyStats(): LinkStats {
  return {
    dict: { wordCount: 0, linkCount: 0, rows: [] },
    library: { wordCount: 0, linkCount: 0, rows: [] },
  }
}

/**
 * 全库链接统计（v0.7.5 任务 7）：一次扫描同时产出 `{{ }}` 与 `[[ ]]` 两个口径。
 *
 * 口径是**源词**（谁写了这条链接），不是被跳转的目标——用户明确决定的。
 * `wordCount` = 去重后的源词数（与行数相等），`linkCount` = 标记出现次数
 * （同一个词写两遍算两条，与行里的 `count` 同源）。
 *
 * 行序：条数降序 → 词面升序 → wordId。SQL 没有 ORDER BY，若不在这里显式排序，
 * 列表顺序会随查询计划漂。
 */
export async function getLinkStats(): Promise<LinkStats> {
  const candidates = await scanLinkCandidates()
  if (!candidates) return emptyStats()

  const buckets: Record<LinkKind, Map<string, LinkStatRow>> = {
    dict: new Map(),
    library: new Map(),
  }
  const linkCounts: Record<LinkKind, number> = { dict: 0, library: 0 }

  for (const row of candidates) {
    for (const token of linkTargets(row.value ?? '')) {
      linkCounts[token.kind] += 1
      const bucket = buckets[token.kind]
      const hit = bucket.get(row.wordId)
      if (hit) hit.count += 1
      else bucket.set(row.wordId, { wordId: row.wordId, lemma: row.lemma, count: 1 })
    }
  }

  const finish = (kind: LinkKind): LinkStatBucket => {
    const rows = [...buckets[kind].values()].sort((a, b) =>
      b.count - a.count
      || normalizeLinkTarget(a.lemma).localeCompare(normalizeLinkTarget(b.lemma))
      || a.wordId.localeCompare(b.wordId))
    return { wordCount: rows.length, linkCount: linkCounts[kind], rows }
  }

  return { dict: finish('dict'), library: finish('library') }
}
