/**
 * 分类强化页每行的两个数（v0.6.2 条目 10）。
 *
 * `wordCount` 来自 words↔categories 映射；`dueCount` 只数**同时有候选**的词——
 * 后者决定了「点这个分类能出多少题」，是用户勾选时的真正依据。
 * 不新增表、不新增查询：两个输入都是既有的（getAllWordCategoryMap / getCandidates）。
 */
export function aggregateCategoryCounts(
  categories: { id: string; name: string; color: string }[],
  wordCategoryMap: Record<string, string[]>,
  dueWordIds: Set<string>,
): { id: string; name: string; color: string; wordCount: number; dueCount: number }[] {
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
    // 颜色原样带出（v0.6.3 条目 6）：分类强化行的色块要用它，它不参与任何计数
    color: c.color,
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

/**
 * 分类强化页的底部汇总文案（v0.6.2 条目 10）。
 *
 * 抽出来是为了让「口径」两个字可以被断言——本仓库没有组件测试 harness，
 * 模板里的字符串没法在单测里摸到（与 accuracyText / scopeLabel 同一个理由）。
 *
 * 口径必须写在句子里：M 是**已到期**的词数（spec §4.3 的 Σ 待复习数），
 * 而出题走 getAllCandidates（含未到期的熟词），所以 M 可能是 0 而按钮照样可用。
 * 只写「预计可出 0 题」等于对用户许了一个假的承诺；括号里点明「已到期」，
 * 句子就变成真的——0 张到期卡是事实，没试过的词也不与它矛盾。
 */
export function freeScopeSummaryText(
  selectedCategoryIds: string[],
  rows: { id: string; dueCount: number }[],
): string {
  const due = rows
    .filter(r => selectedCategoryIds.includes(r.id))
    .reduce((n, r) => n + r.dueCount, 0)
  return `共选 ${selectedCategoryIds.length} 个分类 · 预计可出（已到期）${due} 题`
}

/**
 * 分类强化页列表里的那一行空态文案（v0.6.2 条目 10）；`null` = **什么都不说**。
 *
 * 三种情形必须分得开，因为用户下一步不同：
 * - 读失败 → 「读不到分类」，先确认词库已打开；
 * - 库里确实没有分类 → 「还没有分类」，去工作台建一个；
 * - 还在读（有分类、也没失败）→ **不说话**。`rows` 初值是 `[]`，单看它等于把「还没读到」
 *   当成「是空的」，会在两次 db 读（其中一次是逐词 EXISTS 扫描）飞完之前先闪一句假话。
 *
 * `hasCategories` 传 `categories.length > 0`（与 effect 里的 `categoryKey !== ''` 同一个值）。
 * 空分类列表只可能是「这个库真没有分类」，与面板自己读没读完无关，所以第二支在飞行中也是真话；
 * 反过来「有分类」是绝大多数情形，那才是必须保持沉默的一支——这正是上一版判据答错的地方：
 * 它的 `categoryKey !== ''` 对每个有分类的库都为真，于是把「还在读」那一支当成了空态。
 *
 * 抽成纯函数与 freeScopeSummaryText 同一个理由：本仓库没有组件测试 harness，
 * 只写在 JSX 里的句子钉不住，而这一处恰恰错过一次。
 */
export function freeScopeEmptyText(hasCategories: boolean, rowsFailed: boolean): string | null {
  if (rowsFailed) {
    // 文案里的「重试」必须落在真有这个控件的地方：这个 effect 只在 kind / categoryKey /
    // leechThreshold 变化时重跑，页面上没有重试按钮，切走范围再切回来（范围标签）才是唯一的再读路径。
    return '读不到分类。先确认词库已打开，切到别的范围再切回来会重读一次；换个范围也能继续练。'
  }
  if (!hasCategories) return '这个库里还没有分类。到工作台建一个，或换个范围继续练。'
  return null
}
