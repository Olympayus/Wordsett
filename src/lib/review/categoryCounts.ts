/**
 * 分类强化页每行的两个数（v0.6.2 条目 10）。
 *
 * `wordCount` 来自 words↔categories 映射；`dueCount` 只数**同时有候选**的词——
 * 后者决定了「点这个分类能出多少题」，是用户勾选时的真正依据。
 * 不新增表、不新增查询：两个输入都是既有的（getAllWordCategoryMap / getCandidates）。
 */
export function aggregateCategoryCounts(
  categories: { id: string; name: string }[],
  wordCategoryMap: Record<string, string[]>,
  dueWordIds: Set<string>,
): { id: string; name: string; wordCount: number; dueCount: number }[] {
  const wordCount = new Map<string, number>()
  const dueCount = new Map<string, number>()
  for (const [wordId, catIds] of Object.entries(wordCategoryMap)) {
    for (const id of catIds) {
      wordCount.set(id, (wordCount.get(id) ?? 0) + 1)
      if (dueWordIds.has(wordId)) dueCount.set(id, (dueCount.get(id) ?? 0) + 1)
    }
  }
  return categories.map(c => ({
    id: c.id,
    name: c.name,
    wordCount: wordCount.get(c.id) ?? 0,
    dueCount: dueCount.get(c.id) ?? 0,
  }))
}

/**
 * 从候选里挑出属于任一所选分类的那些（spec §8.1）。空选区返回空数组——「没选」不等于「全选」。
 *
 * 并集落在 wordId 这一层：先把候选池过一遍，每个词最多留一次，所以同属多个所选分类的词
 * 只会出一道卡（若按 (wordId × category) 展开就会重复，那是重复卡而不是并集）。
 * 结果保持候选池的原有顺序，下游 buildQueue 的排序因此不受这里影响。
 *
 * 抽成纯函数是为了能脱离 db 断言：调用方要读的映射（getAllWordCategoryMap）跨两张表，
 * 而这层选择本身只有六行——与 scopeLabel / correctCount 同样的取纯函数做单测的路子。
 */
export function selectByCategories(
  candidateWordIds: string[],
  categoryIds: string[],
  wordCategoryMap: Record<string, string[]>,
): string[] {
  if (categoryIds.length === 0) return []
  const wanted = new Set(categoryIds)
  return candidateWordIds.filter(wordId => (wordCategoryMap[wordId] ?? []).some(c => wanted.has(c)))
}

/**
 * 「开始练习」能不能点（v0.6.2 条目 10，Review Focus 3）。
 *
 * 分类强化下**一个分类都没勾**时必须禁用：否则 handleFreeStart 会拿空 scope 去组卷，
 * 得到一个空队列，然后弹「本轮没有可出的题」——那句文案说的是「词条缺内容」，
 * 与真实原因（用户还没选）不符，用户会去工作台白找一圈。
 * 其余范围（随机 / 今日 / 薄弱词）没有这个前置。
 */
export function canStartFreeScope(kind: 'category' | 'random' | 'today' | 'weak', categoryIds: string[]): boolean {
  if (kind !== 'category') return true
  return categoryIds.length > 0
}
