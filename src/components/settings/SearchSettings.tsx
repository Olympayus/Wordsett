import { useSettingsStore, type TitleInfoKey } from '../../stores/settingsStore'
import { Toggle } from '../ui/Toggle'
import Tooltip from '../ui/Tooltip'
import Icon from '../icons'
import { FIELD_TREE, isAncestorOff, type FieldTreeNode } from '../../lib/fieldTree'

// 标题信息开关（v0.5：词条标题行下的信息展示）
const TITLE_ROWS: { key: TitleInfoKey; label: string }[] = [
  { key: 'showCollinsStars',   label: '柯林斯星级' },
  { key: 'showBadges',         label: '词源徽标（牛津3000 · 考试标签）' },
  { key: 'showDomainCategory', label: '领域·范畴' },
  { key: 'showDomainRegion',   label: '地理区域' },
  { key: 'showDomainUsage',    label: '用法域' },
]

// 词典字段覆盖说明（规格 §7.3 悬浮框内容；v0.4.3 补词源相关词）
const TOOLTIP_DICTS: { name: string; lines: string[] }[] = [
  { name: 'ECDICT', lines: ['✓ 音标 ✓ 词性 ✓ 中文释义', '✓ 英文释义 ✓ 词形变化 ✗ 例句', '✗ 词源 ✗ 词源相关词'] },
  { name: 'WordNet', lines: ['✗ 音标 ✓ 词性 ✗ 中文释义', '✓ 英文释义 ✓ 近义词 ✓ 例句', '✗ 词形变化 ✗ 词源 ✓ 词源相关词'] },
]

// v0.5.3 §4.1（第 11 条）：小标题字号 +2（--text-sm 13px → --text-base 15px）并加粗
const SECTION_TITLE: React.CSSProperties = { fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-primary)' }

// 树形开关行：父级行名加粗，子条目装入分块外框；父关 → 后代置灰禁用（Model B，不改存储）
function FieldRow({ node, nested = false }: { node: FieldTreeNode; nested?: boolean }) {
  const displayFields = useSettingsStore(s => s.displayFields)
  const setDisplayField = useSettingsStore(s => s.setDisplayField)
  const ancestorOff = isAncestorOff(node.key, displayFields)
  const effective = !ancestorOff && displayFields[node.key]
  const isParent = !!node.children && node.children.length > 0

  // hover 底按**直接父级**分档：顶层行在设置页白底上，走通用悬停；子行装在 raised 分块外框里
  // （见下方 isParent 那支），共享的 --color-surface-hover（95.0）压上去只剩 0.13 L*、看不出反馈，
  // 故走凹陷档（--color-surface-hover-recessed，离 raised 2.81 L*）。判据与 SquareButton 的
  // tone 同源：父级不是纯白就不套白底那一档。
  const hoverBg = nested ? 'var(--color-surface-hover-recessed)' : 'var(--color-surface-hover)'

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px',
          borderRadius: 'var(--radius-md)',
          transition: 'background-color var(--duration-fast) var(--ease-smooth)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = hoverBg }}
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
          {node.children!.map(c => <FieldRow key={c.key} node={c} nested />)}
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
      <Toggle checked={checked} onChange={onChange} aria-label={`${label}${sub ? `（${sub}）` : ''}开关`} />
    </div>
  )
}

export default function SearchSettings() {
  const titleInfo = useSettingsStore(s => s.titleInfo)
  const setTitleInfo = useSettingsStore(s => s.setTitleInfo)

  return (
    <>
      {/* 词典返回词条（规格 §7.3） */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ ...SECTION_TITLE, marginBottom: '12px' }}>
          词典返回词条
          {/* v0.7.10 §7.4：设置说明并入统一 Tooltip（悬停即时、触摸端点按开合）；
              宽沿用旧说明面板的 320。外层 span 保留旧触发器的对齐与光标样式（Tooltip 宿主是内层 span）。 */}
          <span style={{ display: 'inline-flex', verticalAlign: 'middle', color: 'var(--color-text-tertiary)', cursor: 'help', marginLeft: '4px' }}>
            <Tooltip tapOpen width={320} minWidth={320} content={
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
                  ✗ 表示该词典本身不包含此字段。
                </div>
              </>
            }>
              <Icon name="info" size={16} />
            </Tooltip>
          </span>
        </div>
        {/* 音标/词根（v0.5.3 §4.1 第 12 条）：属标题信息键（写 titleInfo 而非 displayFields），
            键类型不符不能进 FIELD_TREE，故作为兄弟行排在字段树之前；sub「标题行」表示作用界面，
            并随 aria-label 一并播报。放最前是因为它们控制的是搜索页标题行，比下方任一词典
            返回字段都更靠近「这条设置管什么」的第一眼位置。 */}
        <DictRow label="音标" sub="标题行" checked={titleInfo.showPhonetic} onChange={on => setTitleInfo('showPhonetic', on)} />
        <DictRow label="词根" sub="标题行" checked={titleInfo.showWordRoot} onChange={on => setTitleInfo('showWordRoot', on)} />
        {FIELD_TREE.map(node => <FieldRow key={node.key} node={node} />)}
      </div>

      {/* 第 10 条：去掉块顶分割线，改用块间距保持层次 */}
      <div style={{ marginTop: '32px', marginBottom: '24px' }}>
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
    </>
  )
}
