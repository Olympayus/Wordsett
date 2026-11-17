import type { CSSProperties } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { scrimDismisses } from '../../lib/confirmDialog'

/**
 * 手机形态的脚键（v0.7.10 Task 17）：44dp、等分、发丝分隔。
 * 取值与 `MobileActionSheet` 的底栏同一份配方（`footerButtonStyle`）——底部表上
 * 「取消」永远在这一行，确认 / 危险动作换的是颜色与字重，不是形状。
 */
function sheetFooterButtonStyle(divider: boolean, color: string, weight = 400): CSSProperties {
  return {
    flex: '1 1 0', minWidth: 0, height: 44, padding: '0 12px',
    appearance: 'none', border: 'none',
    borderLeft: divider ? '1px solid var(--color-border)' : 'none',
    background: 'transparent', color, fontSize: 15, fontWeight: weight,
    fontFamily: 'var(--font-sans)', cursor: 'pointer', whiteSpace: 'nowrap',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  }
}

interface Props {
  /**
   * `mobile`（v0.7.10 Task 17）：底部表容器 + 44dp 按钮 + 手势条安全区。
   * **只有手机外壳传**——平板保持居中弹窗（规格 §7.4 / §7.5：弹窗留在 zoom 子树内）；
   * 默认 `desktop`，既有调用点的 DOM 与样式逐字不变。
   */
  variant?: 'desktop' | 'mobile'
}

export default function ConfirmDialog({ variant = 'desktop' }: Props) {
  const req = useUiStore(s => s.confirmReq)
  const resolveConfirm = useUiStore(s => s.resolveConfirm)
  if (!req) return null

  const danger = req.danger ?? false
  const confirmLabel = req.confirmLabel ?? (req.alertMode ? '确定' : '删除')

  if (variant === 'mobile') {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
          background: 'var(--color-scrim)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }}
        onClick={() => { if (scrimDismisses(req.dismissable)) resolveConfirm(false) }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={req.title}
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', background: 'var(--color-surface)',
            borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
            boxShadow: 'var(--shadow-overlay)',
            // 手势条安全区：与 `MobileActionSheet` 同一条理由——底栏不压在系统手势上。
            paddingBottom: 'env(safe-area-inset-bottom)',
            fontFamily: 'var(--font-sans)', overflow: 'hidden',
          }}
        >
          <div style={{ padding: '20px 16px 18px' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
              {req.title}
            </div>
            {/* pre-line 与桌面同义（v0.7.5）：链接校验的多条错误按 `\n` 分行。 */}
            <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
              {req.message}
            </div>
          </div>
          <div style={{ display: 'flex', borderTop: '1px solid var(--color-border)' }}>
            {!req.alertMode && (
              <button
                type="button"
                onClick={() => resolveConfirm(false)}
                style={sheetFooterButtonStyle(false, 'var(--color-text-secondary)')}
              >
                {req.cancelLabel ?? '取消'}
              </button>
            )}
            <button
              type="button"
              onClick={() => resolveConfirm(true)}
              style={sheetFooterButtonStyle(
                !req.alertMode,
                danger ? 'var(--color-danger)' : 'var(--color-text-primary)',
                600,
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
        background: 'var(--color-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => { if (scrimDismisses(req.dismissable)) resolveConfirm(false) }}
    >
      <div
        style={{
          width: 360, maxWidth: '90vw', background: 'var(--color-surface)', borderRadius: 10,
          boxShadow: 'var(--shadow-overlay)', padding: '18px', fontFamily: 'var(--font-sans)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>
          {req.title}
        </div>
        {/* pre-line（v0.7.5）：链接校验等多条错误用 `\n` 分行（linkErrorText），普通文本流
            会把换行折成空格，几条提示挤成一行。保留换行、其余空白照常折叠。 */}
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 16, whiteSpace: 'pre-line' }}>
          {req.message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {!req.alertMode && (
            <button
              type="button"
              onClick={() => resolveConfirm(false)}
              style={{
                padding: '6px 14px', border: '1px solid var(--color-border)', borderRadius: 6,
                background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {req.cancelLabel ?? '取消'}
            </button>
          )}
          <button
            type="button"
            onClick={() => resolveConfirm(true)}
            style={{
              padding: '6px 14px', borderRadius: 6,
              // v0.7.2 §6 规则 2：肯定动作不再是品牌蓝实底——非危险走中性配方
              // （浅暖灰底 + 1px 深描边，与 Button/SquareButton 同一语言）；
              // 危险动作用 --color-danger（§6 规则 3 的对错/危险色），白字保留。
              border: danger ? 'none' : '1px solid var(--color-hairline)',
              background: danger ? 'var(--color-danger)' : 'var(--color-border)',
              color: danger ? 'var(--color-surface)' : 'var(--color-text-primary)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
