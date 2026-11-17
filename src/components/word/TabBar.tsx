import { useRef, useState } from 'react'
import type { TabKey } from '../../lib/tabs'
import { TAB_GROUPS } from '../../lib/tabs'
import { ENTRY_COLUMN_PADDING_X, TAB_ITEM_PADDING_X } from '../../lib/layout'
import { useTouchLongPress } from '../../lib/useTouchLongPress'
import { tabSheetItems } from '../../lib/mobileSheets'
import { useMobilePopup } from '../../lib/mobilePopups'
import ContextMenu from '../ui/ContextMenu'
import MobileActionSheet from '../layout/mobile/MobileActionSheet'
import Icon from '../icons'

interface TabBarProps {
  tabs: TabKey[]
  activeTab: TabKey
  missing: TabKey[]
  onSelect: (t: TabKey) => void
  onAddTab: (t: TabKey) => void
  onDeleteTab: (t: TabKey) => void
  /** 编者模式：页签右端现出一枚 ×（删标签页）。普通模式不渲染——危险动作只在编者视角现形。 */
  editorMode?: boolean
  /**
   * 手机外壳（v0.7.7 Task 8）：长按页签弹底部表删页签，故不渲染编者模式的 ×；
   * 桌面不传，× 与右键菜单逐字保留。
   */
  touch?: boolean
}

// 页签条的底是 --color-surface-sunken（#F5F3ED, L* 95.84）。凹陷面上不能往更暗走——全站
// 凹陷档全挤在 L* 93–96，共享的 --color-surface-hover（#F0F1EE, L* 95.0）压上去只有 0.84 L*、
// hover 几乎看不见（v0.7.2 前这里用字面 #FAF9F6，约 4.5 L*）。凹陷面上只能往更亮一档、朝
// --color-surface 走——那就是 --color-surface-hover-recessed（surface 与 sunken 的 50/50 混合
// #FAF9F6，L* 97.93），离条面 2.08 L*、离白面 2.07 L*，恰在两者中点——看得见，又不至于白得
// 像激活页签。该值现由 tokens.css 统一出（--color-surface-hover-recessed，各处凹陷面共用），
// 此处只引用。别改回 --color-surface-hover。
const TAB_HOVER_BG = 'var(--color-surface-hover-recessed)'  // #FAF9F6

interface TabButtonProps {
  tab: TabKey
  active: boolean
  touch: boolean
  editorMode: boolean
  onSelect: (t: TabKey) => void
  /** 长按成立（仅触屏）：把这一页交给 TabBar 打开底部表。 */
  onLongPress: (t: TabKey) => void
  onOpenContextMenu: (t: TabKey, x: number, y: number) => void
  onDeleteTab: (t: TabKey) => void
}

/**
 * 单个页签（v0.7.7 Task 8，spec §3.1 / §3.9）。
 *
 * 页签是在 `tabs.map` 里产出的，而**hook 不能写在 map 回调里**——故把「一页的长按」收成这个
 * 小组件，每页各挂一份 `useTouchLongPress`（与 Task 7 的 `UnitActivation` 同一做法）。
 * `disabled: !touch` 是桌面分支的唯一门：hook 完全惰性，右键菜单与既有行为逐字保留。
 *
 * 长按成立后浏览器仍会补发一次 click（触屏合成事件）。若不拦，松手那一刻会顺带
 * `onSelect`——用户只是想删这一页，底下的内容却先跳了过去。故与 `FieldCard` 正文同一套
 * 一次性闸门：长按成立时置位，同一元素上的 click 捕获阶段吞掉紧随其后的那一次；
 * 下一次 pointerdown 先复位，正常点击（下一轮）不受影响。
 */
function TabButton({
  tab, active, touch, editorMode, onSelect, onLongPress, onOpenContextMenu, onDeleteTab,
}: TabButtonProps) {
  const swallowClickRef = useRef(false)
  const { handlers } = useTouchLongPress(() => {
    swallowClickRef.current = true
    onLongPress(tab)
  }, { disabled: !touch })
  const label = TAB_GROUPS[tab].label

  return (
    // 外层 span 承载 ×：标签是 <button>，× 也是 <button>，两者平级（不嵌套交互元素）。
    // × 绝对定位在页签右内边距里，仅编者模式（且非触屏）渲染——手机上改由长按底部表承担。
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-end' }}>
      <button
        type="button"
        {...handlers}
        onPointerDownCapture={() => { swallowClickRef.current = false }}
        onClickCapture={e => {
          if (!swallowClickRef.current) return
          swallowClickRef.current = false
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={() => onSelect(tab)}
        onContextMenu={e => {
          // 触屏：拦下系统菜单后不再走桌面右键菜单（同一件事已由长按底部表承担）。
          e.preventDefault()
          if (touch) return
          onOpenContextMenu(tab, e.clientX, e.clientY)
        }}
        onMouseEnter={e => { if (!active) { e.currentTarget.style.background = TAB_HOVER_BG; e.currentTarget.style.color = 'var(--color-text-primary)' } }}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' } }}
        style={{
          position: 'relative', padding: TAB_ITEM_PADDING_X, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
          borderRadius: '8px 8px 0 0', zIndex: 1, border: 'none', fontFamily: 'var(--font-sans)',
          background: active ? 'var(--color-surface)' : 'transparent',
          color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          fontWeight: active ? 600 : 400,
          ...(active ? { border: '1px solid var(--color-border)', borderBottom: 'none', marginBottom: -2 } : {}),
        }}
      >
        {label}
      </button>
      {editorMode && !touch && (
        <button
          type="button"
          aria-label={`删除「${label}」标签页`}
          onClick={() => onDeleteTab(tab)}
          style={{
            position: 'absolute', right: 1, top: 1, zIndex: 2,
            width: 12, height: 12, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
            transition: 'color var(--duration-fast) var(--ease-smooth)',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
        >
          <Icon name="close" size={10} />
        </button>
      )}
    </span>
  )
}

export default function TabBar({ tabs, activeTab, missing, onSelect, onAddTab, onDeleteTab, editorMode = false, touch = false }: TabBarProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [ctx, setCtx] = useState<{ tab: TabKey; x: number; y: number } | null>(null)
  // 长按弹表的目标页签（v0.7.7 Task 8）。只在触屏下可能置位；关表三条路径都要清。
  const [sheetTab, setSheetTab] = useState<TabKey | null>(null)

  // 「＋」下拉开着时登记给外壳：安卓返回键先关下拉，而不是切模块 / 退应用。
  useMobilePopup(addOpen, () => setAddOpen(false))

  return (
    // 条面底 = --color-surface-sunken：**刻意偏离设计稿**——设计稿 .tabs 用 --paper（showcase-v2:172），
    // 而 --paper = #F9F8F5 正是我们的 --color-canvas；两页（此处与词典返回页 DictDetailPanel）都走 sunken。
    // 分支基线时 sunken 是更暗的一档（#EFECE5），条面确实凹陷，v0.7.2 的新档位只是压缩了这一步、
    // 未撤销意图——勿改回 canvas，否则白页签落白页、hover 的凹陷值（TAB_HOVER_BG）也失去依据。
    // 左右内边距由滚动区与「＋」各自持有（左 24 在滚动区 padding、右 24 在「＋」的 marginRight）：
    // 条面本身不再持左右内边距，调用方**决定条面铺多宽**——手机外壳把本组件放在内容列**之外**
    // （条面因此贯穿整个横向范围），桌面仍放在内容列里（宽度与内容列一致，内容左缘仍是 24px 那条线）。
    // 2px 底线画成 `inset` 内阴影而不是 border：内阴影落在内容区最后 2px 上，活动页签的底色
    // 把它盖住（「页签压住分割线」的既有观感），横向滚动容器也不会为它留出一条独立的边。
    <div style={{
      display: 'flex', alignItems: 'flex-end', position: 'relative',
      background: 'var(--color-surface-sunken)',
      boxShadow: 'inset 0 -2px 0 var(--color-border-strong)',
    }}>
      {/* 页签滚动区：页签多到一屏放不下时左右滑动（用户裁定）。「＋」在滚动区之外常驻右端，
          不随页签一起滚走；分区不改变桌面几何——滚动区右缘原本就截止在「＋」之前。 */}
      <div style={{
        flex: '1 1 auto', minWidth: 0,
        display: 'flex', alignItems: 'flex-end', gap: 3,
        padding: `4px 0 0 ${ENTRY_COLUMN_PADDING_X}px`,
        overflowX: 'auto', overflowY: 'hidden',
        touchAction: 'pan-x', WebkitOverflowScrolling: 'touch',
      }}>
      {tabs.map(t => (
        <TabButton
          key={t}
          tab={t}
          active={t === activeTab}
          touch={touch}
          editorMode={editorMode}
          onSelect={onSelect}
          onLongPress={setSheetTab}
          onOpenContextMenu={(tab, x, y) => setCtx({ tab, x, y })}
          onDeleteTab={onDeleteTab}
        />
      ))}
      </div>

      <div style={{ position: 'relative', marginLeft: 8, marginBottom: 5, marginRight: ENTRY_COLUMN_PADDING_X, flexShrink: 0 }}>
        <button
          type="button" aria-label="添加标签页"
          onClick={() => setAddOpen(v => !v)}
          onMouseEnter={e => { e.currentTarget.style.background = TAB_HOVER_BG; e.currentTarget.style.color = 'var(--color-text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          style={{
            width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 17, fontWeight: 600,
            lineHeight: 1, fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          +
        </button>

        {addOpen && (
          <>
            {/* 点空白处关闭下拉（遮罩高于标签 z 1，低于下拉浮层 z-dropdown） */}
            <div className="fixed inset-0" style={{ zIndex: 2 }} onClick={() => setAddOpen(false)} />
            <div
              style={{
                position: 'absolute', right: 0, top: 'calc(100% + 4px)', minWidth: 120, padding: 4,
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 6, boxShadow: 'var(--shadow-overlay)', zIndex: 'var(--z-dropdown)',
              }}
            >
              {missing.length === 0 && <div style={{ padding: '6px 10px', fontSize: 13, color: 'var(--color-text-tertiary)' }}>无可添加的标签页</div>}
              {missing.map(t => (
                <button
                  key={t} type="button"
                  onClick={() => { setAddOpen(false); onAddTab(t) }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer', fontSize: 13, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
                >
                  {TAB_GROUPS[t].label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 标签页右键菜单（桌面）：打开 / 删除。触屏不走到这里（长按走下方底部表）。 */}
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            { key: 'open', label: '打开', onSelect: () => onSelect(ctx.tab) },
            { key: 'delete', label: '删除', danger: true, onSelect: () => onDeleteTab(ctx.tab) },
          ]}
        />
      )}

      {/* 页签长按底部表（v0.7.7 Task 8）。`MobileActionSheet` 不自行关闭——三条路径
          （选删除 / 点取消 / 点遮罩）都必须在这里清 `sheetTab`，否则表会留在屏幕上。
          选中删除后沿用 `onDeleteTab` 既有确认流程（表先关，确认框随后出现）。 */}
      {sheetTab && (
        <MobileActionSheet
          open
          title={TAB_GROUPS[sheetTab].label}
          items={tabSheetItems()}
          onPick={key => {
            if (key === 'delete' && sheetTab) onDeleteTab(sheetTab)
            setSheetTab(null)
          }}
          onCancel={() => setSheetTab(null)}
        />
      )}
    </div>
  )
}
