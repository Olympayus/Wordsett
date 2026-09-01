import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSettingsStore, type TitleInfoKey } from '../../stores/settingsStore'
import { Toggle } from '../ui/Toggle'
import Icon from '../icons'
import { tooltipPosition } from '../../lib/tooltipPosition'
import { FIELD_TREE, isAncestorOff, type FieldTreeNode } from '../../lib/fieldTree'

// 标题信息开关（v0.5：词条标题行下的信息展示）
const TITLE_ROWS: { key: TitleInfoKey; label: string }[] = [
  { key: 'showBadges',         label: '词源徽标（柯林斯星级 · 牛津3000 · 考试标签）' },
  { key: 'showPhonetic',       label: '音标' },
  { key: 'showWordRoot',       label: '词根' },
  { key: 'showDomainCategory', label: '领域·范畴' },
  { key: 'showDomainRegion',   label: '地理区域' },
  { key: 'showDomainUsage',    label: '用法域' },
]

// 词典字段覆盖说明（规格 §7.3 悬浮框内容；v0.4.3 补词源相关词）
const TOOLTIP_DICTS: { name: string; lines: string[] }[] = [
  { name: 'ECDICT', lines: ['✓ 音标 ✓ 词性 ✓ 中文释义', '✓ 英文释义 ✓ 词形变化 ✗ 例句', '✗ 词源 ✗ 词源相关词'] },
  { name: 'WordNet', lines: ['✗ 音标 ✓ 词性 ✗ 中文释义', '✓ 英文释义 ✓ 近义词 ✓ 例句', '✗ 词形变化 ✗ 词源 ✓ 词源相关词'] },
]

// 词典开关区的提示内容（v0.4.3 §7：只影响详情数据，建议与语义网络不受影响）
const DICT_SECTION_TOOLTIP = (
  <>
    <div style={{ fontWeight: 'var(--weight-semibold)', marginBottom: '8px', color: 'var(--color-text-primary)' }}>词典开关说明</div>
    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
      <div>切换后仅影响词典详情返回数据（词典标签页不再显示该词典）。</div>
      <div>搜索建议仍可能出现该词典独有的词，点进去可能查无结果。</div>
      <div>语义网络（WordNet 词义网络）不受此开关影响。</div>
    </div>
  </>
)

const SECTION_TITLE: React.CSSProperties = { fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text-primary)' }

// 信息悬浮框：Hover 300ms 显示、100ms 消失（规格 §7.3）；多处以 info 图标触发，独立管理自身状态
function HoverInfo({ content }: { content: ReactNode }) {
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 })
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const infoRef = useRef<HTMLSpanElement>(null)

  const handleEnter = () => {
    clearTimeout(hideTimer.current)
    showTimer.current = setTimeout(() => {
      const rect = infoRef.current?.getBoundingClientRect()
      if (!rect) return
      const panelWidth = 320
      const gap = 8
      const pos = tooltipPosition({ left: rect.left, right: rect.right, top: rect.top }, panelWidth, gap, window.innerWidth)
      setTooltip({ visible: true, x: pos.x, y: pos.y })
    }, 300)
  }
  const handleLeave = () => {
    clearTimeout(showTimer.current)
    hideTimer.current = setTimeout(() => setTooltip(t => ({ ...t, visible: false })), 100)
  }

  return (
    <>
      <span
        ref={infoRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{ display: 'inline-flex', verticalAlign: 'middle', color: 'var(--color-text-tertiary)', cursor: 'help', marginLeft: '4px' }}
      >
        <Icon name="info" size={16} />
      </span>
      {/* 悬浮框：createPortal 到 body，脱离抽屉 transform 容器（§7.3） */}
      {tooltip.visible && createPortal(
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y, zIndex: 'var(--z-toast)',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-overlay)',
          padding: '16px', width: '320px', fontSize: 'var(--text-sm)',
        }}>
          {content}
        </div>,
        document.body
      )}
    </>
  )
}

// 树形开关行：父级行名加粗，子条目装入分块外框；父关 → 后代置灰禁用（Model B，不改存储）
function FieldRow({ node }: { node: FieldTreeNode }) {
  const displayFields = useSettingsStore(s => s.displayFields)
  const setDisplayField = useSettingsStore(s => s.setDisplayField)
  const ancestorOff = isAncestorOff(node.key, displayFields)
  const effective = !ancestorOff && displayFields[node.key]
  const isParent = !!node.children && node.children.length > 0

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px',
          borderRadius: 'var(--radius-md)',
          transition: 'background-color var(--duration-fast) var(--ease-smooth)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{
          fontSize: 'var(--text-sm)',
          fontWeight: isParent ? 'var(--weight-semibold)' : 'var(--weight-regular)',
          color: 'var(--color-text-primary)',
        }}>
          {node.label}
        </span>
        <span style={{ flex: 1 }} />
        <Toggle
          checked={effective}
          disabled={ancestorOff}
          onChange={on => setDisplayField(node.key, on)}
          aria-label={`${node.label}开关`}
        />
      </div>
      {isParent && (
        <div style={{
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
          background: 'var(--color-surface-raised)', padding: '4px 0',
          margin: '4px 0 6px',
        }}>
          {node.children!.map(c => <FieldRow key={c.key} node={c} />)}
        </div>
      )}
    </div>
  )
}

// 词典开关行：与字段行同构（v0.4.3 §7）
function DictRow({ label, sub, checked, onChange }: {
  label: string
  sub?: string
  checked: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px',
        borderRadius: 'var(--radius-md)',
        transition: 'background-color var(--duration-fast) var(--ease-smooth)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>{label}</span>
      {sub && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{sub}</span>}
      <span style={{ flex: 1 }} />
      <Toggle checked={checked} onChange={onChange} aria-label={`${label}开关`} />
    </div>
  )
}

export default function SearchSettings() {
  const dictionaries = useSettingsStore(s => s.dictionaries)
  const setDictionary = useSettingsStore(s => s.setDictionary)
  const titleInfo = useSettingsStore(s => s.titleInfo)
  const setTitleInfo = useSettingsStore(s => s.setTitleInfo)

  return (
    <>
      {/* 词典返回词条（规格 §7.3） */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ ...SECTION_TITLE, marginBottom: '12px' }}>
          词典返回词条
          <HoverInfo content={
            <>
              <div style={{ fontWeight: 'var(--weight-semibold)', marginBottom: '8px', color: 'var(--color-text-primary)' }}>词典字段覆盖说明</div>
              {TOOLTIP_DICTS.map(d => (
                <div key={d.name} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ fontWeight: 'var(--weight-medium)', color: 'var(--color-text-primary)', marginBottom: '4px' }}>{d.name}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                    {d.lines.map(l => <div key={l}>{l}</div>)}
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '8px', fontStyle: 'italic' }}>
                ✗ 表示该词典本身不包含此字段，与您的开关设置无关。
              </div>
            </>
          } />
        </div>
        {FIELD_TREE.map(node => <FieldRow key={node.key} node={node} />)}
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', marginBottom: '24px' }}>
        <div style={{ ...SECTION_TITLE, marginBottom: '12px' }}>标题信息</div>
        {TITLE_ROWS.map(r => (
          <DictRow
            key={r.key}
            label={r.label}
            checked={titleInfo[r.key]}
            onChange={on => setTitleInfo(r.key, on)}
          />
        ))}
      </div>

      {/* 词典（本地词典开关）：置于「词典返回词条」之下 */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', marginBottom: '24px' }}>
        <div style={{ ...SECTION_TITLE, marginBottom: '12px' }}>
          词典
          <HoverInfo content={DICT_SECTION_TOOLTIP} />
        </div>
        <DictRow label="ECDICT" sub="常用英汉词典" checked={dictionaries.ecdict} onChange={on => setDictionary('ecdict', on)} />
        <DictRow label="WordNet" sub="词义网络词典" checked={dictionaries.wordnet} onChange={on => setDictionary('wordnet', on)} />
      </div>
    </>
  )
}
