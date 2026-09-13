import { useWordStore } from '../../stores/wordStore'

// 规格 §4.5：显示「单词总数: n」；收起态字号 10px、padding 8px 4px
export default function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const count = useWordStore(s => s.words.length)
  return (
    <div
      className="shrink-0"
      style={{
        textAlign: 'center',
        padding: collapsed ? '8px 4px' : '8px 12px',
        borderTop: '1px solid var(--color-border)',
        fontSize: collapsed ? '10px' : 'var(--text-xs)',
        color: 'var(--color-text-tertiary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      单词总数:{' '}
      <span className="stat-num">{count}</span>
    </div>
  )
}
