import type { ReactNode } from 'react'

/**
 * 行内编辑触发器（v0.7.3 修补）：**普通模式双击、编者模式单击**进入编辑。
 *
 * 这套属性此前在四处各写一遍（`WordWorkbench` 的行内正文、词性标签、辨析组标题，
 * `PhoneticArea` 的音标），而 `LeafFlow` 的流式单位**漏了**——单位自从短条目改流式多列
 * （d4b1bf9）就不再走 `FieldCard`，于是「双击 / 单击进编辑」连同编辑态的输入框一起消失，
 * ⋯ 菜单里的「编辑」设了 `editingId` 也无处渲染。收成这里一处，单位直接复用它。
 *
 * 其余四处仍各写各的手势与门控（v0.7.10 Task 13 起它们与这里的原生 `title` 一并移除，
 * 本组件的「点击 / 双击编辑」提示改走 `aria-description`）；改动它们不在本次范围内，
 * 但新写可编辑的值请用本组件，不要再抄第五份。
 *
 * 键盘：Enter 与空格都进编辑（与行内正文那份一致；音标那份只认 Enter）。
 * `role="button"` 与 `tabIndex` 是这套模板的一部分——0 透明度或纯视觉的「可点」提示
 * 对键盘用户没有意义，故必须真的可聚焦、可激活。
 *
 * v0.7.7 Task 4（spec §3.8）：手机交互分支读 `touch ? false : editorMode`——`touch` 为真时
 * **单击不进编辑**（单击留给长按菜单），而**双击一律进编辑、不受 `editorMode` 影响**。
 * 桌面不传 `touch`，两个手势仍由 `editorMode` 门控，行为逐字不变。
 */
export default function EditableValue({ editorMode, touch = false, onStartEdit, title, children }: {
  editorMode: boolean
  /** 手机外壳：单击不进编辑；双击由 `touch` 旁路 `editorMode`（spec §3.8）。桌面不传。 */
  touch?: boolean
  onStartEdit: () => void
  /** 缺省按模式给「点击编辑 / 双击编辑」；文案特殊的调用点可覆盖，省略则用缺省。 */
  title?: string
  children: ReactNode
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => !touch && editorMode && onStartEdit()}
      onDoubleClick={() => (touch || !editorMode) && onStartEdit()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStartEdit() } }}
      aria-description={title ?? (editorMode ? '点击编辑' : '双击编辑')}
      style={{ cursor: 'pointer' }}
    >
      {children}
    </span>
  )
}
