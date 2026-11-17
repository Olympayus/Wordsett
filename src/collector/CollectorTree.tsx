import CheckBox from '../components/ui/CheckBox'
import FlowRow from '../components/entry/FlowRow'
import SenseFlow from '../components/entry/SenseFlow'
import type { SenseGroup } from '../components/entry/SenseFlow'
import { leafForm } from '../lib/fieldKind'
import { selectionState } from '../lib/dictPlan'
import { leafKeys, type DefinitionGroup } from '../lib/collectorTree'

/**
 * 小窗的释义勾选树（v0.7.9 spec §5.3）——只呈现词性组与直属中 / 英释义，
 * 排版**与主窗词典返回页一致**（DictDetailCard 的 v0.7.4 正文流），不另起一套旧样式：
 *
 *   组头：衬线斜体词性（run-in 头）+「中 N · 英 M」计数 + 2px 横线 + 三态勾选框
 *   行：  FlowRow——连续义号槽 + 正文（英文释义衬线，中文释义正文字体）+ 行尾勾选框
 *
 * 折行时续行与首行**同一条左缘**（FlowRow 的编号槽是悬挂缩进的锚点，正文不因标签列
 * 被额外推右）——先前「勾选框 + 中文释义/英文释义标签 + 值 + 义号」的四栏行是旧格式，
 * 标签列会把值挤成窄列、折行看起来缩进一大截，已弃用。
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
  // 和「中 0 · 英 0」——过滤掉比让它出现在小窗里更安全（控制器 T10 结转裁定）。
  const visible = groups.filter(g => g.leaves.length > 0)
  const allKeys = leafKeys(visible)

  const senseGroups: SenseGroup[] = visible.map(group => {
    const state = selectionState(selected, allKeys, group.key)
    const zh = group.leaves.filter(leaf => leaf.label === '中文释义').length
    const counts = `中 ${zh} · 英 ${group.leaves.length - zh}`
    return {
      // 组头照抄返回页的自绘头（DictDetailCard）：衬线斜体词性 + 计数 + 2px 横线，
      // 勾选框落在横线之后——小窗与返回页的「一行里勾整组」是同一个位置。
      head: (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: '10px',
          paddingLeft: '11px', lineHeight: '27px',
        }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '16px', fontWeight: 600 }}>
            {group.pos || '该词性'}
          </span>
          <span className="stat-num" style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
            {counts}
          </span>
          <span style={{ flex: 1, borderTop: '2px solid var(--color-border)', transform: 'translateY(-3px)' }} />
          <span style={{ display: 'inline-flex', alignSelf: 'center' }}>
            <CheckBox
              checked={state !== 'none'}
              indeterminate={state === 'partial'}
              label={`${group.pos || '该词性'} 全部义项`}
              onChange={() => onToggle(group.key)}
            />
          </span>
        </div>
      ),
      items: group.leaves.map(leaf => {
        const forced = leaf.key === forcedKey
        // 正文样式问 `leafForm`（与返回页同一判据）：英文释义走衬线 15px/26px，
        // 中文释义是普通正文。勾选键与显示形态无关，仍是 `leaf.key`。
        const content = leafForm(leaf.field.key) === 'english-def'
          ? (
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: '15px', lineHeight: '26px', color: 'var(--ink-1)' }}>
              {leaf.value}
            </span>
          )
          : leaf.value
        return (
          <FlowRow
            key={leaf.key}
            no={leaf.number ?? undefined}
            end={(
              // 归属释义（v0.7.9 用户实测修订）：必须保持选中（例句要有父级），且要
              // 一眼看出「整句挂在这一条释义下」——勾选框用 `locked`（满填选中 + 品牌
              // 淡晕，与普通勾选框拉开身份），再在行尾配一枚「例句」小标签说明它的
              // 特殊含义。`disabled` 的降透明外观会读成「没选中」，已弃用。
              forced ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    title="例句将归入此释义"
                    style={{
                      fontSize: '10.5px', fontWeight: 600, lineHeight: '16px',
                      color: 'var(--color-brand)', background: 'var(--color-brand-soft)',
                      borderRadius: 'var(--radius-full)', padding: '0 6px', whiteSpace: 'nowrap',
                    }}
                  >
                    例句
                  </span>
                  <CheckBox
                    checked
                    locked
                    label={`${leaf.label} ${leaf.number ?? ''}（例句将归入此释义）`}
                    onChange={() => onToggle(leaf.key)}
                  />
                </span>
              ) : (
                <CheckBox
                  checked={selected.has(leaf.key)}
                  label={`${leaf.label} ${leaf.number ?? ''}`}
                  onChange={() => onToggle(leaf.key)}
                />
              )
            )}
          >
            {content}
          </FlowRow>
        )
      }),
    }
  })

  return <SenseFlow groups={senseGroups} />
}
