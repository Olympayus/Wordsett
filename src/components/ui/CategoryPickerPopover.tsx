import { useMemo } from 'react'
import { useCategoryStore } from '../../stores/categoryStore'
import { useUiStore } from '../../stores/uiStore'
import Icon from '../icons'

/**
 * 分类下拉浮层（v0.6.5 §4.6）。侧栏批量条的「加入分类 / 从分类移除」与词典返回页的「＋」
 * 共用同一枚组件——两处的选项集合与语义完全相同，各写一份会漂。
 *
 * 不设「未分类」项：不加入任何分类就是归类为空，那是「从分类移除」的语义。
 * 一个分类都没有时给空态 + 「新建分类」，点它只开分类编辑器，**不接着执行原动作**——
 * 避免「建完分类后要不要继续」这种半途状态。
 *
 * 定位契约：调用方必须把自己包在 `position: relative` 的容器里，面板按该容器的边定位，
 * 不动 onPick / onClose / align 三者的名字与语义。`placement` 是本组件自己的一条附加开关，
 * 默认 'bottom'（面板落在容器下沿，词典返回页的顶栏「＋」正是这个方向）；
 * 侧栏批量条贴侧栏底部、而祖先 AppShell 的 <aside> 带 overflow: hidden，
 * 向下会被裁掉，所以它显式传 'top'。
 *
 * 全屏透明遮罩用 position: fixed：它只负责捕获外部点击，不需要跟着容器走，
 * 且这样才不会被祖先的 overflow 裁掉（面板本身仍受祖先裁剪）。
 *
 * 每项末尾带**该分类现有词数**（§4.6）：从 wordCategoryMap 反向数，不另开一次查询——
 * 那张表本来就是「词 → 分类 id 列表」，反向聚合即成员数，且与设置页那一列同源同口径。
 */
export default function CategoryPickerPopover({ onPick, onClose, align = 'right', placement = 'bottom' }: {
  onPick: (categoryId: string) => void
  onClose: () => void
  align?: 'left' | 'right'
  placement?: 'bottom' | 'top'
}) {
  const categories = useCategoryStore(s => s.categories)
  const wordCategoryMap = useCategoryStore(s => s.wordCategoryMap)
  const openEditor = useUiStore(s => s.openEditor)

  // 「分类 → 成员词数」：wordCategoryMap 反向聚合。一次遍历建完整张表（而非在 map 里
  // 每行扫一遍全表——那是 O(词数 × 分类数)），键用 Set 保证一个词在同一个分类下
  // 重复登记也只算一个；本仓不产生重复行，Set 只是让这个数上界正确。
  const memberCounts = useMemo(() => {
    const counts = new Map<string, Set<string>>()
    for (const [wordId, catIds] of Object.entries(wordCategoryMap)) {
      for (const cid of catIds) {
        let set = counts.get(cid)
        if (!set) { set = new Set(); counts.set(cid, set) }
        set.add(wordId)
      }
    }
    return new Map([...counts].map(([cid, set]) => [cid, set.size]))
  }, [wordCategoryMap])

  return (
    <>
      {/* 点外面关闭：全屏透明遮罩，fixed + 独立 z-index（比面板低一层）。
          面板是它的兄弟节点而非子节点，所以点面板本身不会冒泡到这里；点面板外任意处则命中遮罩。
          用 fixed 而非 absolute：遮罩只负责捕获点击、不需要跟着定位容器走，
          且这样才不会被祖先的 overflow 裁掉（面板本身仍受祖先裁剪）。 */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dropdown)' }}
        onClick={onClose}
      />
      <div
        role="menu"
        style={{
          position: 'absolute',
          zIndex: 'calc(var(--z-dropdown) + 1)',
          ...(placement === 'bottom' ? { top: 'calc(100% + 4px)' } : { bottom: 'calc(100% + 4px)' }),
          ...(align === 'left' ? { left: 0 } : { right: 0 }),
          // 横向也会被裁：面板在本组件所在的定位容器里，而那个容器（以及祖先
          // AppShell 的 <aside>，overflow: hidden）不宽于视口。收起态侧栏的内容宽约
          // 104–224px，220px 的定宽面板会丢掉右边缘——正好是分类名尾部所在。
          // 收窄到 maxWidth: 100% 后，面板变成「能用多宽就多宽，名字省略号收尾」，
          // 测量-free（不引 portal、不量坐标），窄容器下依然读得下去。
          // boxSizing: border-box 必需：默认 content-box 下 padding/border 会把它顶出容器。
          // 代价是**调用方的定位容器有多宽，面板就只有多宽**，窄容器上分类名会被省略号截短
          // （本组件无能为力，只能保证读得下去）；要足宽请把容器给足 minWidth，见词典返回页两处。
          maxWidth: '100%', boxSizing: 'border-box',
          // 纵向同理，且这次必须自己收口：分类数无上限，而面板所在的祖先
          // （AppShell 的 <aside> / 词典返回页的 <main>）都带 overflow: hidden，超出部分
          // 不是被裁掉就是滚不到——侧栏那条（placement='top'）尤其明显。
          // maxHeight 取 60vh：半个多屏，够放下二三十个分类，同时给祖先的裁剪留出余量。
          maxHeight: '60vh', overflowY: 'auto',
          width: '220px', padding: '6px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-overlay)',
        }}
      >
        {categories.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', padding: '6px 9px' }}>
            还没有分类
          </div>
        ) : categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            role="menuitem"
            onClick={() => onPick(cat.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '9px', width: '100%',
              padding: '7px 9px', border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cat.name}
            </span>
            {/* 词数是行内的补充读数，不是统计量：走三级灰 + 与正文同字号，不套 .stat-num
                （那套等宽+主色+半粗是给统计数字的，见 index.css）。名可省略，数不省略。 */}
            <span style={{ flexShrink: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {memberCounts.get(cat.id) ?? 0}
            </span>
          </button>
        ))}
        <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 6px' }} />
        <button
          type="button"
          onClick={() => { onClose(); openEditor(null, null) }}
          style={{
            display: 'flex', alignItems: 'center', gap: '9px', width: '100%',
            padding: '7px 9px', border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <span style={{ width: 10, textAlign: 'center' }}><Icon name="plus" size={10} /></span>
          新建分类
        </button>
      </div>
    </>
  )
}
