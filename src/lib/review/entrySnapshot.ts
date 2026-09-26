/**
 * 「完整词条」快照的数据整形（v0.6.2 条目 12）。
 *
 * 工作台的「词性」标签页是一棵
 * `part_of_speech → chinese_definition / english_definition → example_sentence → example`
 * 的树（容器 / 项的划分见 WordWorkbench.tsx:67 的 CONTAINER_FIELD_KEYS 与 :69 的
 * ITEM_FIELD_KEYS）。此处把扁平字段值整成同一形状，供只读渲染。
 *
 * 边界：只收 `part_of_speech` 一个根——短语 / 词形变化 / 词源相关词 / 近义词辨析各自成页，
 * 不在此列。`main` 页的另一个根 `supplementary`（补充）本函数不收：它不带词性值，
 * 硬塞进 PosGroup 会渲染出一个空窗格。
 *
 * 例句不只走 `example_sentence` 容器。真实数据里另有两种形状能直达 `example`：
 *   · `example` 直接挂英释义下——`mergeFields`（wordService.ts:51-61）不校验子键，
 *     wordService.test.ts:43 正是断言这一形状的命名测试；
 *   · `example_sentence` 直接挂词性下（无中间释义）——wordnetParse.ts:98-100 的兜底分支。
 * 旧扁平摘要按 db/review.ts:239-243 在任意深度取 `example_sentence` / `example`，
 * 两种都能显示；只认容器会让新树在例句上反而不是旧摘要的超集。故两种形状都收，
 * 挂载仍按 parentId 精确匹配，不会串到别的释义下。
 */

/** 扁平字段值（`fieldService.getValuesWithKeys` 的返回元素）。 */
export interface SnapshotRow {
  id: string
  /** 字段定义的 key，如 `part_of_speech` */
  key: string
  value: string
  parentId: string | null
  displayOrder: number
}

/** 一条释义（中文 / 英文）与挂在它下面的例句。 */
export interface SnapshotDef {
  /** 释义行的字段值 id，用作 React key */
  id: string
  text: string
  /** 挂在这条释义下的例句。中文释义通常没有。 */
  examples: string[]
}

export interface PosGroup {
  /** 词性父的字段值 id，用作 React key */
  id: string
  /** 词性值，如 `v.` */
  pos: string
  definitions: { zh: SnapshotDef[]; en: SnapshotDef[] }
  /** 直接挂在词性父下的例句（没有中间释义的形状，见 wordnetParse 的兜底分支）。 */
  examples: string[]
}

export function buildPosTree(rows: SnapshotRow[]): PosGroup[] {
  const posRows = rows
    .filter(r => r.key === 'part_of_speech')
    .sort((a, b) => a.displayOrder - b.displayOrder)

  const byOrder = (a: SnapshotRow, b: SnapshotRow) => a.displayOrder - b.displayOrder
  const childrenOf = (parentId: string) => rows.filter(r => r.parentId === parentId).sort(byOrder)

  // 某行下面的例句值。`example_sentence` 是容器，取它下面的 `example` 子项；
  // 容器本身的值不算（那是例句行的标题位，值通常为空）。
  // 无容器的 `example` 直接挂在该行下，同样收。
  const exampleValues = (parentId: string): string[] => childrenOf(parentId).flatMap(r =>
    r.key === 'example'
      ? (r.value !== '' ? [r.value] : [])
      : r.key === 'example_sentence'
        ? childrenOf(r.id).filter(e => e.key === 'example' && e.value !== '').map(e => e.value)
        : [],
  )

  return posRows.map(p => {
    const children = childrenOf(p.id)
    const defs = (key: 'chinese_definition' | 'english_definition'): SnapshotDef[] =>
      children
        .filter(c => c.key === key && c.value !== '')
        .map(c => ({ id: c.id, text: c.value, examples: exampleValues(c.id) }))
    return {
      id: p.id,
      pos: p.value,
      definitions: {
        zh: defs('chinese_definition'),
        en: defs('english_definition'),
      },
      // 直接挂在词性父下的例句：既无释义可挂，也不该被算进任何一条释义。
      examples: exampleValues(p.id),
    }
  })
}
