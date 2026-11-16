import CheckBox from '../components/ui/CheckBox'
import PosTag from '../components/ui/PosTag'
import { FIELD_LABEL_STYLE } from '../lib/labelStyle'
import { selectionState } from '../lib/dictPlan'
import { leafKeys, type DefinitionGroup } from '../lib/collectorTree'

/**
 * 小窗的释义勾选树（v0.7.9 spec §5.3）——只呈现词性组与直属中 / 英释义：
 *
 *   组行：三态勾选框 + 词性标签（`PosTag`）+「N 个义项」
 *   叶子行：勾选框 + C1 标签（中文释义 / 英文释义）+ 值 + 义号
 *
 * 模型（分组、键、义号）全部来自 Task 10 的 `lib/collectorTree`，本组件不重算序号：
 * 勾选键必须与 `collectorMergeInputs` 的路径键逐字一致，否则收录的内容会错位。
 *
 * 三态与「点组行翻整棵子树」复用 `lib/dictPlan` 的 `selectionState` /
 * `toggleSubtreeSelection`（后者在父组件里读 `selected` 后调用）——与返回页同一套判据，
 * 区别只在 `allKeys` 传的是本树（过滤后）的叶子键。**集合里只存叶子键**：父键混进来会让
 * 「部分选中」永远推不出来（见 `toggleSubtreeSelection` 的注释）。
 */
interface Props {
  groups: DefinitionGroup[]
  selected: Set<string>
  onToggle: (key: string) => void
  /**
   * 句子模式「整句归入哪个释义」的强制选中项（Task 13 消费）：该叶子恒为选中且
   * 不可取消——例句必须有父级。父组件同时会把该键并进 `selected`，故组的三态
   * 判据（`selectionState`）读到的仍是同一份集合，不会出现「勾选框勾着、集合里没有」。
   */
  forcedKey?: string | null
}

export function CollectorTree({ groups, selected, onToggle, forcedKey }: Props) {
  // 防御：Task 10 的模型理论上不给空组，但一个没有叶子的组画出来只有一枚点不动的勾选框
  // 和「0 个义项」——过滤掉比让它出现在小窗里更安全（控制器 T10 结转裁定）。
  const visible = groups.filter(g => g.leaves.length > 0)
  const allKeys = leafKeys(visible)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {visible.map(group => {
        const state = selectionState(selected, allKeys, group.key)
        return (
          <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckBox
                checked={state === 'all'}
                indeterminate={state === 'partial'}
                onChange={() => onToggle(group.key)}
                label={`${group.pos || '该词性'} 全部义项`}
              />
              <PosTag value={group.pos} size="sm" />
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
                {group.leaves.length} 个义项
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '24px' }}>
              {group.leaves.map(leaf => {
                const forced = leaf.key === forcedKey
                return (
                  <div key={leaf.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: 1.55 }}>
                    <span style={{ display: 'inline-flex', flexShrink: 0, paddingTop: '2px' }}>
                      <CheckBox
                        checked={selected.has(leaf.key) || forced}
                        disabled={forced}
                        onChange={() => onToggle(leaf.key)}
                        label={`${leaf.label} ${leaf.number ?? ''}`}
                      />
                    </span>
                    <span style={{ ...FIELD_LABEL_STYLE, flexShrink: 0, paddingTop: '4px', whiteSpace: 'nowrap' }}>
                      {leaf.label}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: '13px', color: 'var(--color-text-primary)', overflowWrap: 'anywhere' }}>
                      {leaf.value}
                    </span>
                    <span style={{
                      flexShrink: 0, paddingTop: '3px', fontSize: '11.5px',
                      color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums',
                    }}>
                      {leaf.number}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
