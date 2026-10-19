import { useEffect, useState } from 'react'
import { getLinkStats, type LinkStatBucket, type LinkStatRow, type LinkStats } from '../../services/linkService'
import { useLinkJump } from '../../lib/linkJump'
import { LINK_LIST_HEIGHT } from '../../lib/layout'
import type { LinkKind, LinkToken } from '../../lib/links'
import SectionHeading from './SectionHeading'

/**
 * 设置页「双向链接」分区（v0.7.5 任务 7）。
 *
 * 两个口径各一列：`{{ }}` 去词典、`[[ ]]` 去词库。统计与列表都只看**源词**
 * （谁写了这条链接）——用户明确决定的，不看被跳转的目标。因此点击行时直接把
 * 源词当作跳转目标交给 `useLinkJump`：`{{ }}` 列用 `kind: 'dict'`（在词典里打开
 * 这个源词），`[[ ]]` 列用 `kind: 'library'`（跳到它在工作区 / 储藏库里的页面）。
 *
 * 两个列表固定高度、各自滚动：链接条数随词库增长，交给内容撑高会把设置页整页
 * 拉长（见 `LINK_LIST_HEIGHT` 的注释）。
 */

const COLUMNS: {
  kind: LinkKind
  title: string
  marker: string
  syntax: string
  destination: string
}[] = [
  {
    kind: 'dict',
    title: '词典链接',
    marker: '{{ }}',
    syntax: '{{词}}',
    destination: '词典中的该词',
  },
  {
    kind: 'library',
    title: '词库链接',
    marker: '[[ ]]',
    syntax: '[[词]]',
    destination: '词库中的该词',
  },
]

/** 右侧读数：标签走三级灰，数字走 `.stat-num`（与分类计数同一套格式）。 */
function Readout({ label, value }: { label: string; value: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span className="stat-num" style={{ fontSize: 'var(--text-sm)' }}>{value ?? '—'}</span>
    </div>
  )
}

function StatRow({ row, kind, onJump }: {
  row: LinkStatRow
  kind: LinkKind
  onJump: (token: LinkToken) => Promise<void>
}) {
  const label = kind === 'dict' ? '词典链接' : '词库链接'
  return (
    <button
      type="button"
      title={`${row.lemma}：${row.count} 条${label}`}
      aria-label={`${row.lemma}，${row.count} 条${label}`}
      onClick={() => { void onJump({ target: row.lemma, kind }) }}
      // 行悬停在 raised 面上：走凹陷档（--color-surface-hover 压上去只差 0.13 L*，
      // 看不出来），与 SearchSettings 里嵌套字段行的判据相同。
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover-recessed)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      style={{
        width: '100%', display: 'flex', alignItems: 'baseline', gap: '8px',
        padding: '5px 12px', border: 'none', background: 'transparent',
        cursor: 'pointer', textAlign: 'left',
        fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
        transition: 'background-color var(--duration-fast) var(--ease-smooth)',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.lemma}
      </span>
      <span className="stat-num" style={{ fontSize: 'var(--text-xs)', flexShrink: 0 }}>{row.count}</span>
    </button>
  )
}

function LinkColumn({ column, bucket, onJump }: {
  column: typeof COLUMNS[number]
  bucket: LinkStatBucket | null
  onJump: (token: LinkToken) => Promise<void>
}) {
  return (
    <section aria-label={column.title} style={{ flex: '1 1 280px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <SectionHeading>
          {column.title}
          <span style={{
            marginLeft: '6px', fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-regular)',
            color: 'var(--color-text-tertiary)',
          }}>{column.marker}</span>
        </SectionHeading>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
          <Readout label="拥有该链接的词数" value={bucket?.wordCount ?? null} />
          <Readout label="链接总条数" value={bucket?.linkCount ?? null} />
        </div>
      </div>

      <div style={{
        fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)',
        lineHeight: 1.6, marginBottom: '8px',
      }}>
        <div>写法 {column.syntax}，点击链接跳到{column.destination}。</div>
        <div>统计与列表只看写了这类链接的源词。</div>
      </div>

      <div style={{
        height: LINK_LIST_HEIGHT, overflowY: 'auto',
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
        background: 'var(--color-surface-raised)', padding: '4px 0',
      }}>
        {bucket === null || bucket.rows.length === 0
          ? (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', padding: '8px 12px' }}>
                {bucket === null ? '统计中…' : '暂无链接'}
              </div>
            )
          : bucket.rows.map(row => (
              <StatRow key={row.wordId} row={row} kind={column.kind} onJump={onJump} />
            ))}
      </div>
    </section>
  )
}

export default function LinkSettings() {
  const [stats, setStats] = useState<LinkStats | null>(null)
  const jump = useLinkJump()

  useEffect(() => {
    let alive = true
    // `getLinkStats` 自己吞掉读库错误（返回空统计），故这里没有失败分支；
    // alive 守卫只防组件在查询返回前被切走时对已卸载组件 setState。
    void getLinkStats().then(s => { if (alive) setStats(s) })
    return () => { alive = false }
  }, [])

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '24px' }}>
      {COLUMNS.map(column => (
        <LinkColumn
          key={column.kind}
          column={column}
          bucket={stats ? stats[column.kind] : null}
          onJump={jump}
        />
      ))}
    </div>
  )
}
