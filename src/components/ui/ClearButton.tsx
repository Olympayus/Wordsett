/**
 * 「清除全部输入」键（v0.7.3 §8.1）。三处输入框共用：顶栏搜索框 / Ctrl+F 查找框 / 侧栏筛选框。
 *
 * 图标自绘（与 components/icons 同语言：16 视框、1.4 线宽、圆头），不申请新图标名——
 * 它与「关闭」在语义上是两件事，图标库里那枚 close 留给关闭。
 *
 * `visible` 为假时**保留占位**（`visibility: hidden`）——照 v0.7.2 行尾簇的做法：
 * 输入第一个字符时框内右侧「长出」一枚按钮会让文字宽度跳一下。
 *
 * `Input.tsx` 不加 suffix 能力：它被大量表单复用，加容器会牵动所有调用点；
 * 三处各自包一层相对定位容器即可。
 */
export default function ClearButton({ visible, onClick, label = '清除输入' }: {
  visible: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      tabIndex={visible ? 0 : -1}
      onClick={onClick}
      style={{
        flex: 'none', width: '16px', height: '16px', padding: 0, display: 'grid', placeItems: 'center',
        border: 'none', background: 'transparent', cursor: 'pointer',
        color: 'var(--color-text-tertiary)',
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'color var(--duration-fast) var(--ease-smooth)',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
      </svg>
    </button>
  )
}
