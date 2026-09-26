/**
 * 「完整词条」快照的数据整形（v0.6.2 条目 12）。
 *
 * 工作台的「词性」标签页是一棵
 * `part_of_speech → chinese_definition / english_definition → example_sentence → example`
 * 的树（roots 见 src/lib/tabs.ts:6 的 TAB_GROUPS.main；容器 / 项的划分见
 * WordWorkbench.tsx:67 的 CONTAINER_FIELD_KEYS 与 :69 的 ITEM_FIELD_KEYS）。
 * 此处把扁平字段值整成同一形状，供只读渲染。
 *
 * 边界：只收 `main` 标签页的两个根——短语 / 词形变化 / 词源相关词 / 近义词辨析不出现。
 * 例句挂在英文释义之下，故随该条释义一并入列（spec §4.6「中/英释义编号项与例句」）。
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
  /** 挂在这条释义下的例句（`example_sentence → example`）。中文释义通常没有。 */
  examples: string[]
}

export interface PosGroup {
  /** 词性父的字段值 id，用作 React key */
  id: string
  /** 词性值，如 `v.` */
  pos: string
  definitions: { zh: SnapshotDef[]; en: SnapshotDef[] }
}

/** `main` 标签页的根（src/lib/tabs.ts:6）。只有这两个是「词性」标签页的内容。 */
const MAIN_ROOTS = new Set(['part_of_speech', 'supplementary'])

export function buildPosTree(rows: SnapshotRow[]): PosGroup[] {
  const posRows = rows
    .filter(r => r.key === 'part_of_speech')
    .sort((a, b) => a.displayOrder - b.displayOrder)

  // 儿子查一次，供各词性父共用
  const childrenOf = (parentId: string) =>
    rows.filter(r => r.parentId === parentId).sort((a, b) => a.displayOrder - b.displayOrder)

  // 例句挂在英文释义之下（`example_sentence` 是容器，`example` 是项）。
  // 空例句与空容器不入列——与释义同一条「空值不入列」规则。
  const examplesOf = (defId: string): string[] =>
    rows
      .filter(r => r.parentId === defId && r.key === 'example_sentence')
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .flatMap(s => rows
        .filter(r => r.parentId === s.id && r.key === 'example' && r.value !== '')
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(r => r.value))

  return posRows.map(p => {
    const children = childrenOf(p.id)
    const defs = (key: 'chinese_definition' | 'english_definition'): SnapshotDef[] =>
      children
        .filter(c => c.key === key && c.value !== '')
        .map(c => ({ id: c.id, text: c.value, examples: key === 'english_definition' ? examplesOf(c.id) : [] }))
    return {
      id: p.id,
      pos: p.value,
      definitions: {
        zh: defs('chinese_definition'),
        en: defs('english_definition'),
      },
    }
  })
}

export { MAIN_ROOTS }
